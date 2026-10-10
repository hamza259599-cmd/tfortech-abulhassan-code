/*
  Admin -> Section Access.

  Lists every account and lets the Admin tick which admin sections a
  Co Admin may open. Only an Admin can reach this page, and the server
  checks that too.
*/

import { useCallback, useEffect, useState } from "react";

import AdminLayout from "../AdminLayout/AdminLayout";
import { SECTIONS, ROLE_DEFAULTS } from "../../access";

import "./AdminPermissions.css";

const API_URL = (
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export default function AdminPermissions() {
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState({});
  const [custom, setCustom] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [savingId, setSavingId] = useState(null);

  const token = localStorage.getItem("tfortech_access_token");

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/access/users`, {
        headers: headers(),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Only an Admin can open this page."
            : "Could not load users."
        );
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : data.users || [];

      setUsers(list);

      // Start each row from what that account can open today.
      const start = {};
      const isCustom = {};

      for (const u of list) {
        const role = String(u.role || "customer").toLowerCase();
        start[u.id] = Array.isArray(u.permissions)
          ? u.permissions
          : ROLE_DEFAULTS[role] || [];
        isCustom[u.id] = Array.isArray(u.permissions);
      }

      setPicked(start);
      setCustom(isCustom);
    } catch (e) {
      setError(e.message);
    }

    setLoading(false);
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (userId, key) =>
    setPicked((old) => {
      const current = old[userId] || [];
      return {
        ...old,
        [userId]: current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
      };
    });

  const save = async (user) => {
    setSavingId(user.id);
    setError("");
    setSaved("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/admin/users/${user.id}/permissions`,
        {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({
            permissions: picked[user.id] || [],
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Could not save.");
      }

      setCustom((old) => ({ ...old, [user.id]: true }));
      setSaved(`Saved for ${user.full_name || user.email}`);
      setTimeout(() => setSaved(""), 3500);
    } catch (e) {
      setError(e.message);
    }

    setSavingId(null);
  };

  const reset = async (user) => {
    setSavingId(user.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/auth/admin/users/${user.id}/permissions`,
        {
          method: "DELETE",
          headers: headers(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || "Could not reset.");
      }

      setPicked((old) => ({ ...old, [user.id]: data.permissions || [] }));
      setCustom((old) => ({ ...old, [user.id]: false }));
      setSaved(`Reset to the Co Admin default`);
      setTimeout(() => setSaved(""), 3500);
    } catch (e) {
      setError(e.message);
    }

    setSavingId(null);
  };

  const roleBadge = (role) => {
    const r = String(role || "customer").toLowerCase();
    if (r === "admin") return <span className="perm-badge admin">Admin</span>;
    if (r === "co_admin") return <span className="perm-badge co">Co Admin</span>;
    return <span className="perm-badge customer">Customer</span>;
  };

  const coAdmins = users.filter(
    (u) => String(u.role || "").toLowerCase() === "co_admin"
  );
  const others = users.filter(
    (u) => String(u.role || "").toLowerCase() !== "co_admin"
  );

  return (
    <AdminLayout>
      <main className="perm-page">
        <h1>Section Access</h1>
        <p>Choose exactly which admin sections each Co Admin can open.</p>

        <div className="perm-note">
          An <strong>Admin</strong> always has every section and cannot be
          limited here. A <strong>Co Admin</strong> gets only the sections you
          tick below; one who has never been given a list keeps Products and
          Orders, as before. The server checks this on every request, so an
          unticked section is blocked, not just hidden.
        </div>

        {error && <div className="perm-status err">{error}</div>}
        {saved && <div className="perm-status ok">{saved}</div>}

        <div className="perm-card">
          <h2>Co Admins ({coAdmins.length})</h2>
          <p className="perm-sub">
            Tick the sections, then Save. Changes apply the next time that
            person loads the admin panel.
          </p>

          {loading && <p>Loading…</p>}

          {!loading && coAdmins.length === 0 && (
            <p className="perm-sub">
              No Co Admins yet. Change someone's role to Co Admin on the Admin
              Members page first, then come back here.
            </p>
          )}

          {coAdmins.map((u) => (
            <div key={u.id}>
              <div className="perm-user">
                <div className="who">
                  <strong>{u.full_name || "(no name)"}</strong>
                  {roleBadge(u.role)}
                  <div>
                    {u.email}
                    {custom[u.id] ? " · custom access" : " · default access"}
                  </div>
                </div>
              </div>

              <div className="perm-grid">
                {SECTIONS.map((s) => (
                  <label className="perm-item" key={s.key}>
                    <input
                      type="checkbox"
                      checked={(picked[u.id] || []).includes(s.key)}
                      onChange={() => toggle(u.id, s.key)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>

              <button
                onClick={() => save(u)}
                disabled={savingId === u.id}
              >
                {savingId === u.id ? "Saving…" : "Save access"}
              </button>

              {custom[u.id] && (
                <button
                  className="ghost"
                  onClick={() => reset(u)}
                  disabled={savingId === u.id}
                >
                  Reset to default
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="perm-card">
          <h2>Everyone else ({others.length})</h2>
          <p className="perm-sub">
            Admins always have full access; Customers have none. Change a role
            on the Admin Members page to give someone section access.
          </p>

          {others.map((u) => (
            <div className="perm-user" key={u.id}>
              <div className="who">
                <strong>{u.full_name || "(no name)"}</strong>
                {roleBadge(u.role)}
                <div>{u.email}</div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AdminLayout>
  );
}
