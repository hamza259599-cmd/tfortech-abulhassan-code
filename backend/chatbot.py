import json
import os
import time
import urllib.error
import urllib.request
from typing import List

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from database import products_collection, db


# ============================================================
# TFORTECH - AI CHATBOT ROUTER (Google Gemini, free tier)
# ============================================================

router = APIRouter(
    prefix="/api/chat",
    tags=["AI Chatbot"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

MAX_HISTORY = 12
MAX_MESSAGE_CHARS = 1000
MAX_PRODUCTS_IN_CONTEXT = 200

STORE_INFO = """
Store name: T For Tech (TforTech) - website tfortech.store
Tagline: Tech You Can Trust
Business: new, used and refurbished laptops, accessories, repair and upgrade services in Pakistan.
Physical shop: Shop #93, 4th Floor, Hafeez Center, Gulberg III, Lahore, 54660, Pakistan.
Delivery: across Pakistan.
Currency: PKR (Pakistani Rupees).
""".strip()


# ============================================================
# SIMPLE PRODUCT CACHE (avoid a DB hit on every message)
# ============================================================

_catalog_cache = {"text": "", "loaded_at": 0.0}
CATALOG_TTL_SECONDS = 300


def _format_price(value) -> str:
    try:
        return f"PKR {int(float(value)):,}"
    except (TypeError, ValueError):
        return "Price on request"


def _build_catalog_text() -> str:
    now = time.time()

    if (
        _catalog_cache["text"]
        and now - _catalog_cache["loaded_at"] < CATALOG_TTL_SECONDS
    ):
        return _catalog_cache["text"]

    lines = []

    try:
        cursor = (
            products_collection
            .find(
                {},
                {
                    "name": 1,
                    "price": 1,
                    "category": 1,
                    "condition": 1,
                    "stock": 1,
                    "shortDescription": 1,
                    "specifications": 1,
                },
            )
            .sort("createdAt", -1)
            .limit(MAX_PRODUCTS_IN_CONTEXT)
        )

        for product in cursor:
            specs = product.get("specifications") or {}
            spec_text = ""

            if isinstance(specs, dict) and specs:
                spec_text = "; ".join(
                    f"{key}: {value}"
                    for key, value in list(specs.items())[:8]
                    if value not in (None, "")
                )

            stock = product.get("stock", 0)

            try:
                in_stock = int(stock) > 0
            except (TypeError, ValueError):
                in_stock = False

            line = (
                f"- [{product.get('name', 'Product')}]"
                f"(/products/{product['_id']}) | "
                f"{_format_price(product.get('price'))} | "
                f"Category: {product.get('category', '-')} | "
                f"Condition: {product.get('condition') or '-'} | "
                f"{'In stock' if in_stock else 'Out of stock'}"
            )

            short = (product.get("shortDescription") or "").strip()

            if short:
                line += f" | {short[:160]}"

            if spec_text:
                line += f" | Specs: {spec_text[:300]}"

            lines.append(line)

    except PyMongoError as error:
        print(f"Chatbot catalog load error: {error}")

    text = "\n".join(lines) if lines else "(No products are listed right now.)"

    _catalog_cache["text"] = text
    _catalog_cache["loaded_at"] = now

    return text


def _get_whatsapp_number() -> str:
    try:
        settings = db["whatsapp_settings"].find_one({}) or {}
        return (
            settings.get("floating_phone")
            or settings.get("order_phone")
            or ""
        )
    except PyMongoError:
        return ""


def _system_prompt() -> str:
    whatsapp = _get_whatsapp_number()
    whatsapp_line = (
        f"WhatsApp for orders/support: {whatsapp}"
        if whatsapp
        else "For orders/support, customers can use the WhatsApp button on the website."
    )

    return f"""
You are the friendly AI shopping assistant of T For Tech, a laptop and tech store in Pakistan.

{STORE_INFO}
{whatsapp_line}

Rules:
- Reply in the same language the customer uses (English, Urdu, or Roman Urdu).
- Keep answers short and helpful (2-6 sentences, or a short list).
- Only recommend products from the catalog below. Never invent products, prices, stock or specs.
- When you mention a product, link it in markdown exactly as given, e.g. [Name](/products/ID).
- If nothing in the catalog fits, say so politely and suggest contacting the store on WhatsApp.
- Help customers choose by asking about budget and use (study, office, gaming, editing, programming).
- For ordering: add to cart and checkout on the website, or contact via WhatsApp.
- Do not make promises about warranty, discounts or delivery times unless stated here; tell them to confirm on WhatsApp.
- Stay on topic (tech, laptops, the store). Politely decline unrelated requests.

Current product catalog:
{_build_catalog_text()}
""".strip()


# ============================================================
# SCHEMAS
# ============================================================

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1)


# ============================================================
# GEMINI CALL
# ============================================================

def _call_gemini(messages: List[ChatMessage]) -> str:
    contents = [
        {
            "role": "model" if message.role == "assistant" else "user",
            "parts": [{"text": message.content[:MAX_MESSAGE_CHARS]}],
        }
        for message in messages[-MAX_HISTORY:]
    ]

    # Gemini requires the conversation to start with a user turn.
    while contents and contents[0]["role"] != "user":
        contents.pop(0)

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please type a message.",
        )

    payload = {
        "systemInstruction": {"parts": [{"text": _system_prompt()}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 800,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "ignore")[:500]
        print(f"Gemini HTTP error {error.code}: {body}")

        if error.code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Assistant is busy right now. Please try again in a minute.",
            )

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant is unavailable right now.",
        )
    except Exception as error:  # network / timeout
        print(f"Gemini request failed: {error}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant is unavailable right now.",
        )

    try:
        parts = data["candidates"][0]["content"]["parts"]
        reply = "".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, TypeError):
        reply = ""

    return reply or "Sorry, I couldn't answer that. Please contact us on WhatsApp."


# ============================================================
# ROUTES
# ============================================================

@router.get("/status")
def chat_status():
    return {
        "success": True,
        "enabled": bool(GEMINI_API_KEY),
    }


@router.post("/")
def chat(request: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant is not configured yet.",
        )

    reply = _call_gemini(request.messages)

    return {
        "success": True,
        "reply": reply,
    }
