import hashlib
import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth import get_current_product_order_admin, get_user_role
from config import (
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME,
)


router = APIRouter(
    prefix="/api/uploads",
    tags=["Uploads"],
)


# Co admins manage products only. Hero and blogs are main admin sections.
FOLDER_ROLES = {
    "products": {"admin", "co_admin"},
    "hero": {"admin"},
    "blogs": {"admin"},
}


class UploadSignatureRequest(BaseModel):
    folder: str


# ============================================================
# CLOUDINARY UPLOAD SIGNATURE
#
# Files go straight from the browser to Cloudinary, so they
# never hit the Vercel request size limit. The API secret stays
# here: the browser only receives a short-lived signature.
# ============================================================

@router.post("/signature")
def create_upload_signature(
    request: UploadSignatureRequest,
    current_admin=Depends(
        get_current_product_order_admin
    ),
):
    allowed_roles = FOLDER_ROLES.get(
        request.folder
    )

    if allowed_roles is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid upload folder.",
        )

    if get_user_role(current_admin) not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot upload files to this section.",
        )

    if not (
        CLOUDINARY_CLOUD_NAME
        and CLOUDINARY_API_KEY
        and CLOUDINARY_API_SECRET
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image uploads are not configured yet.",
        )

    folder = f"tfortech/{request.folder}"
    timestamp = int(time.time())

    signature = hashlib.sha1(
        (
            f"folder={folder}&timestamp={timestamp}"
            f"{CLOUDINARY_API_SECRET}"
        ).encode("utf-8")
    ).hexdigest()

    return {
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "api_key": CLOUDINARY_API_KEY,
        "folder": folder,
        "timestamp": timestamp,
        "signature": signature,
    }
