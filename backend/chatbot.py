import json
import os
import re
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

# Free fallback (no API key needed) used when GEMINI_API_KEY is not set
FREE_AI_URL = os.getenv("FREE_AI_URL", "https://text.pollinations.ai/openai").strip()
FREE_AI_MODEL = os.getenv("FREE_AI_MODEL", "openai").strip()

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
Real human agents (WhatsApp/call): +92 321 4902699 and +92 303 3424333.
Complaints email: mhdee.technology@gmail.com
""".strip()


# ============================================================
# SIMPLE PRODUCT CACHE (avoid a DB hit on every message)
# ============================================================

_catalog_cache = {"text": "", "loaded_at": 0.0}
CATALOG_TTL_SECONDS = 60


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


# ============================================================
# WHOLE WEBSITE DATA (auto refreshed, never breaks the chat)
# ============================================================

_site_cache = {"text": "", "loaded_at": 0.0}
SITE_TTL_SECONDS = 60

SITE_PAGES = """
Website pages (use these links when helpful):
- All products: /products
- Categories (HP, Dell, Lenovo, MacBook): /categories
- Blog: /blogging
- Customer reviews: /reviews
- About us: /about
- Contact: /contact
- Cart: /cart, Checkout: /checkout, Wishlist: /wishlist
- My orders: /orders, My account: /account, Login: /login, Register: /register
""".strip()


def _clean(value, limit=200) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def _site_section_categories() -> str:
    counts = {}
    for product in products_collection.find({}, {"category": 1}).limit(5000):
        name = _clean(product.get("category"), 40) or "Other"
        counts[name] = counts.get(name, 0) + 1
    if not counts:
        return ""
    items = ", ".join(f"{name} ({count})" for name, count in sorted(counts.items()))
    return f"Product categories (number of products): {items}"


def _site_section_blogs() -> str:
    blogs = (
        db["blogs"]
        .find(
            {"is_published": True},
            {"title": 1, "excerpt": 1, "category": 1},
        )
        .sort([("published_at", -1), ("created_at", -1)])
        .limit(15)
    )
    lines = []
    for blog in blogs:
        title = _clean(blog.get("title"), 120)
        if not title:
            continue
        line = f"- [{title}](/blogging/{blog['_id']})"
        excerpt = _clean(blog.get("excerpt"), 160)
        if excerpt:
            line += f" | {excerpt}"
        lines.append(line)
    if not lines:
        return ""
    return "Latest blog posts:\n" + "\n".join(lines)


def _site_section_reviews() -> str:
    reviews = list(
        db["customer_reviews"]
        .find(
            {"is_active": {"$ne": False}},
            {"customer_name": 1, "review_text": 1, "rating": 1},
        )
        .limit(200)
    )
    if not reviews:
        return ""
    ratings = []
    for review in reviews:
        try:
            ratings.append(float(review.get("rating", 5)))
        except (TypeError, ValueError):
            pass
    average = sum(ratings) / len(ratings) if ratings else 0
    lines = [
        f"Customer reviews: {len(reviews)} reviews, average rating "
        f"{average:.1f}/5 (see /reviews)."
    ]
    for review in reviews[:3]:
        text = _clean(review.get("review_text"), 140)
        if text:
            lines.append(f'- {_clean(review.get("customer_name"), 40)}: "{text}"')
    return "\n".join(lines)


def _site_section_header_footer() -> str:
    settings = db["header_footer_settings"].find_one({}) or {}
    lines = []

    header = settings.get("header") or {}
    for key in ("announcement_text_1", "announcement_text_2"):
        text = _clean(header.get(key), 150)
        if text:
            lines.append(f"Announcement: {text}")

    footer = settings.get("footer") or {}
    description = _clean(footer.get("description"), 250)
    if description:
        lines.append(f"About the store: {description}")

    delivery = footer.get("delivery") or settings.get("delivery") or {}
    for item in (delivery.get("items") or [])[:6]:
        if isinstance(item, dict):
            title = _clean(item.get("title"), 60)
            detail = _clean(item.get("description"), 120)
            if title:
                lines.append(f"Service: {title}" + (f" - {detail}" if detail else ""))

    social = settings.get("social_links") or footer.get("social_links") or {}
    if isinstance(social, dict):
        links = [
            f"{name.title()}: {_clean(url, 150)}"
            for name, url in social.items()
            if isinstance(url, str) and url.startswith("http")
        ]
        if links:
            lines.append("Social media: " + ", ".join(links))

    return "\n".join(lines)


def _site_section_hero() -> str:
    hero = db["hero_settings"].find_one({}) or {}
    title = _clean(hero.get("title"), 150)
    description = _clean(hero.get("description"), 250)
    if not title and not description:
        return ""
    return f"Homepage headline: {title}. {description}".strip()


def _build_site_text() -> str:
    now = time.time()

    if (
        _site_cache["text"]
        and now - _site_cache["loaded_at"] < SITE_TTL_SECONDS
    ):
        return _site_cache["text"]

    sections = [SITE_PAGES]

    for builder in (
        _site_section_hero,
        _site_section_header_footer,
        _site_section_categories,
        _site_section_blogs,
        _site_section_reviews,
    ):
        try:
            text = builder()
            if text:
                sections.append(text)
        except Exception as error:  # one bad section never breaks the chat
            print(f"Chatbot site data error in {builder.__name__}: {error}")

    text = "\n\n".join(sections)

    _site_cache["text"] = text
    _site_cache["loaded_at"] = now

    return text


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
- Reply in the same language AND script the customer uses. If they write Roman Urdu (Urdu in English letters, e.g. "laptop chahiye"), reply in Roman Urdu using English letters only, never Urdu script. Use Urdu script only if the customer writes in Urdu script.
- Keep answers short and helpful (2-6 sentences, or a short list).
- Only recommend products from the catalog below. Never invent products, prices, stock or specs.
- When you mention a product, link it in markdown exactly as given, e.g. [Name](/products/ID).
- If nothing in the catalog fits, say so politely and suggest contacting the store on WhatsApp.
- Help customers choose by asking about budget and use (study, office, gaming, editing, programming).
- For ordering: add to cart and checkout on the website, or contact via WhatsApp.
- Do not make promises about warranty, discounts or delivery times unless stated here; tell them to confirm on WhatsApp.
- Stay on topic (tech, laptops, the store). Politely decline unrelated requests.
- If the customer wants a real person/agent/human, give both agent numbers and tell them to tap the green "Agent" buttons at the bottom of this chat to open WhatsApp.
- If the customer has a complaint, apologise briefly and tell them to tap the red "Complaint" button at the bottom of this chat, fill the form and send it via Gmail (or email mhdee.technology@gmail.com directly).
- Use the website information below to answer questions about pages, blog posts, reviews, services and announcements. Link pages and blog posts using the exact links given.
- Never use markdown tables or headings; use plain sentences or short bullet lists.

Current product catalog:
{_build_catalog_text()}

Website information:
{_build_site_text()}
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
# FREE AI CALL (fallback, no key)
# ============================================================

URDU_SCRIPT = re.compile(r"[\u0600-\u06FF]")


def _latin_hint(history: list) -> None:
    """Free model tends to answer Roman Urdu in Urdu script; nudge it."""
    if (
        history
        and history[-1]["role"] == "user"
        and not URDU_SCRIPT.search(history[-1]["content"])
    ):
        history[-1]["content"] += (
            "\n\n(Answer using English letters only. If I wrote Roman Urdu, "
            "reply in Roman Urdu, never in Urdu script.)"
        )


def _call_free_ai(messages: List[ChatMessage]) -> str:
    history = [{"role": "system", "content": _system_prompt()}]

    for message in messages[-MAX_HISTORY:]:
        history.append(
            {
                "role": message.role,
                "content": message.content[:MAX_MESSAGE_CHARS],
            }
        )

    _latin_hint(history)

    payload = {
        "model": FREE_AI_MODEL,
        "messages": history,
        "private": True,
    }

    request = urllib.request.Request(
        FREE_AI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "tfortech-chatbot/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as error:
        print(f"Free AI request failed: {error}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Assistant is busy right now. Please try again in a moment.",
        )

    try:
        reply = (data["choices"][0]["message"]["content"] or "").strip()
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
        "enabled": True,
        "provider": "gemini" if GEMINI_API_KEY else "free",
    }


@router.post("/")
def chat(request: ChatRequest):
    if GEMINI_API_KEY:
        reply = _call_gemini(request.messages)
    else:
        reply = _call_free_ai(request.messages)

    return {
        "success": True,
        "reply": reply,
    }
