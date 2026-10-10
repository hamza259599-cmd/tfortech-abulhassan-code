"""
Per-section admin permissions for TForTech.

Until now there were three fixed roles:

    admin      -> everything
    co_admin   -> Products and Orders only
    customer   -> no admin access

That is still exactly how it behaves out of the box. What this module
adds is the ability to give one co_admin a different set of sections --
say Blog and Reviews but not Products -- by storing a ``permissions``
list on their user document in MongoDB.

    admin                      -> always every section, cannot be limited
    co_admin with permissions  -> exactly the sections in that list
    co_admin without           -> Products and Orders, as before
    customer                   -> nothing

Every admin route checks this on the server, so hiding a link in the
sidebar is a convenience, not the thing keeping anyone out.

This module deliberately imports only ``security`` and ``database`` --
never ``auth`` -- so that ``auth`` can import it without a circular
import.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from database import users_collection
from security import decode_access_token


# =========================================================
# SECTIONS
# =========================================================

# key -> label shown in the admin UI
SECTIONS = [
    ("dashboard", "Dashboard"),
    ("products", "Products"),
    ("orders", "Orders"),
    ("hero", "Hero Section"),
    ("reviews", "Reviews"),
    ("whatsapp", "WhatsApp"),
    ("theme", "Theme"),
    ("header_footer", "Header & Footer"),
    ("blog", "Blogging"),
]

SECTION_KEYS = [key for key, _ in SECTIONS]

# What each role gets when no explicit permission list is stored.
# co_admin keeps exactly the access it has today.
ROLE_DEFAULTS = {
    "admin": SECTION_KEYS,
    "co_admin": ["products", "orders"],
    "customer": [],
}


def get_user_role(user):
    """Return the user's role, lowercased."""

    return str(
        user.get(
            "role",
            "customer",
        )
    ).lower().strip()


def get_user_permissions(user):
    """
    Return the sections this user may open.

    An admin always gets everything. For anyone else an explicit
    ``permissions`` list wins; without one they fall back to the
    defaults for their role.
    """

    role = get_user_role(user)

    if role == "admin":
        return list(SECTION_KEYS)

    stored = user.get("permissions")

    if isinstance(stored, list):
        return [p for p in stored if p in SECTION_KEYS]

    return list(
        ROLE_DEFAULTS.get(
            role,
            [],
        )
    )


def user_can(user, section):
    """True when this user may open that section."""

    return section in get_user_permissions(user)


# =========================================================
# AUTHENTICATION
# =========================================================

# Same token handling as auth.get_current_user. It is repeated here
# rather than imported so this module stays free of a circular import.

security = HTTPBearer()


def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Resolve the signed-in user from the JWT token."""

    payload = decode_access_token(credentials.credentials)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    try:
        from bson import ObjectId

        object_id = ObjectId(user_id)

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in authentication token.",
        )

    existing_user = users_collection.find_one(
        {
            "_id": object_id,
        }
    )

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )

    if not bool(
        existing_user.get(
            "is_active",
            True,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled.",
        )

    return existing_user


# =========================================================
# DEPENDENCIES
# =========================================================

def require_section(section):
    """
    Build a dependency that allows only users holding ``section``.

    Used as:  current_admin=Depends(require_section("blog"))
    """

    def dependency(user=Depends(current_user)):
        if not user_can(user, section):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this section.",
            )

        return user

    return dependency


def require_admin(user=Depends(current_user)):
    """Allow only the main admin. Permissions cannot grant this."""

    if get_user_role(user) != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )

    return user


# =========================================================
# ROUTES
# =========================================================

router = APIRouter(
    prefix="/api/auth",
    tags=["Access"],
)


class PermissionsUpdate(BaseModel):
    permissions: list[str]


@router.get("/access/sections")
def list_sections(
    user=Depends(current_user),
):
    """The full list of sections, for building the admin UI."""

    return {
        "sections": [
            {
                "key": key,
                "label": label,
            }
            for key, label in SECTIONS
        ],
    }


@router.get("/access/me")
def my_access(
    user=Depends(current_user),
):
    """What the signed-in user may open."""

    role = get_user_role(user)

    return {
        "role": role,
        "is_admin": role == "admin",
        "permissions": get_user_permissions(user),
    }


@router.get("/access/users")
def list_users_with_access(
    current_admin=Depends(require_admin),
):
    """
    Every account with the sections it can open. Admin only.

    The existing /admin/users endpoint is left untouched; this one adds
    the permission fields the Section Access page needs.
    """

    people = []

    for user in users_collection.find().sort("created_at", -1):
        people.append(
            {
                "id": str(user["_id"]),
                "full_name": str(user.get("full_name", "") or ""),
                "email": str(user.get("email", "") or ""),
                "role": get_user_role(user),
                "is_active": bool(user.get("is_active", True)),
                "permissions": get_user_permissions(user),
                "is_custom": isinstance(user.get("permissions"), list),
            }
        )

    return {
        "users": people,
        "sections": [
            {
                "key": key,
                "label": label,
            }
            for key, label in SECTIONS
        ],
    }


@router.get("/admin/users/{user_id}/permissions")
def read_user_permissions(
    user_id: str,
    current_admin=Depends(require_admin),
):
    """Read one user's sections. Admin only."""

    target = _find_user(user_id)

    return {
        "id": str(target["_id"]),
        "role": get_user_role(target),
        "permissions": get_user_permissions(target),
        "is_custom": isinstance(
            target.get("permissions"),
            list,
        ),
    }


@router.put("/admin/users/{user_id}/permissions")
def update_user_permissions(
    user_id: str,
    body: PermissionsUpdate,
    current_admin=Depends(require_admin),
):
    """
    Set one user's sections. Admin only.

    An admin's own access cannot be narrowed, so changing permissions
    on an admin account is refused rather than silently ignored.
    """

    target = _find_user(user_id)

    if get_user_role(target) == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An Admin always has every section. Change the role to Co Admin first.",
        )

    cleaned = [p for p in body.permissions if p in SECTION_KEYS]

    users_collection.update_one(
        {
            "_id": target["_id"],
        },
        {
            "$set": {
                "permissions": cleaned,
            },
        },
    )

    return {
        "id": str(target["_id"]),
        "role": get_user_role(target),
        "permissions": cleaned,
        "is_custom": True,
    }


@router.delete("/admin/users/{user_id}/permissions")
def clear_user_permissions(
    user_id: str,
    current_admin=Depends(require_admin),
):
    """Drop the custom list so the user falls back to their role default."""

    target = _find_user(user_id)

    users_collection.update_one(
        {
            "_id": target["_id"],
        },
        {
            "$unset": {
                "permissions": "",
            },
        },
    )

    refreshed = users_collection.find_one(
        {
            "_id": target["_id"],
        }
    )

    return {
        "id": str(target["_id"]),
        "role": get_user_role(refreshed),
        "permissions": get_user_permissions(refreshed),
        "is_custom": False,
    }


def _find_user(user_id):
    try:
        from bson import ObjectId

        object_id = ObjectId(user_id)

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID.",
        )

    target = users_collection.find_one(
        {
            "_id": object_id,
        }
    )

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return target
