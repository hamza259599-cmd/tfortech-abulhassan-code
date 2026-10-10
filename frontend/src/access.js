/*
  Per-section admin permissions.

  An Admin always has every section. A Co Admin has exactly the sections
  the Admin ticked for them on /admin/permissions; a Co Admin who has
  never been given a custom list keeps Products and Orders, which is what
  Co Admin has always meant here.

  The server checks the same thing on every admin request, so what this
  file does is keep the sidebar and the routes tidy -- it is not what
  keeps anyone out.
*/

const API_URL = (
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const STORAGE_KEY = "tfortech_user_permissions";

// Must match SECTIONS in backend/access.py
export const SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders" },
  { key: "hero", label: "Hero Section" },
  { key: "reviews", label: "Reviews" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "theme", label: "Theme" },
  { key: "header_footer", label: "Header & Footer" },
  { key: "blog", label: "Blogging" },
];

export const ROLE_DEFAULTS = {
  admin: SECTIONS.map((s) => s.key),
  co_admin: ["products", "orders"],
  customer: [],
};

export function getRole() {
  return String(
    localStorage.getItem("tfortech_user_role") || "customer"
  )
    .toLowerCase()
    .trim();
}

export function isAdmin() {
  return getRole() === "admin";
}

export function getPermissions() {
  const role = getRole();

  if (role === "admin") {
    return ROLE_DEFAULTS.admin;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored)) {
      return stored;
    }
  } catch (e) {
    // fall through to the role default
  }

  return ROLE_DEFAULTS[role] || [];
}

export function setPermissions(list) {
  try {
    if (Array.isArray(list)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // storage can be unavailable; the server still enforces access
  }
}

export function can(section) {
  if (isAdmin()) return true;
  return getPermissions().includes(section);
}

export function canOpenAdminPanel() {
  return isAdmin() || getPermissions().length > 0;
}

/*
  Ask the server what this account may open and remember the answer.
  Called right after login, and again when the admin panel loads, so a
  permission the Admin changed takes effect without signing out.
*/
export async function refreshPermissions() {
  const token = localStorage.getItem("tfortech_access_token");
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/api/auth/access/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data && Array.isArray(data.permissions)) {
      setPermissions(data.permissions);
      if (data.role) {
        localStorage.setItem("tfortech_user_role", data.role);
      }
      return data;
    }
  } catch (e) {
    // offline or the backend is asleep; keep whatever we had
  }

  return null;
}

export function clearPermissions() {
  setPermissions(null);
}
