import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  FaUsers,
  FaUserShield,
  FaUserTie,
  FaUser,
  FaCheckCircle,
  FaTimesCircle,
  FaSyncAlt,
  FaSave,
  FaArrowLeft,
  FaKey,
  FaEnvelope,
  FaTrashAlt,
} from "react-icons/fa";

import { useNavigate } from "react-router-dom";

import AdminLayout from "../AdminLayout/AdminLayout";

import "./AdminUsers.css";


const API_URL = (
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");


const AdminUsers = () => {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState("");

  const [actionMessage, setActionMessage] =
    useState("");

  const [savingUserId, setSavingUserId] =
    useState(null);

  const [
    credentialEmail,
    setCredentialEmail,
  ] = useState("");

  const [
    credentialPassword,
    setCredentialPassword,
  ] = useState("");

  const [
    credentialRole,
    setCredentialRole,
  ] = useState("co_admin");

  const [
    credentialSaving,
    setCredentialSaving,
  ] = useState(false);


  const currentUserId =
    localStorage.getItem(
      "tfortech_user_id"
    );

  const currentUserRole =
    localStorage.getItem(
      "tfortech_user_role"
    );

  const normalizedCurrentRole =
    String(
      currentUserRole || ""
    )
      .toLowerCase()
      .trim();


  const clearLoginSession = () => {
    localStorage.removeItem(
      "tfortech_logged_in"
    );

    localStorage.removeItem(
      "tfortech_access_token"
    );

    localStorage.removeItem(
      "tfortech_token_type"
    );

    localStorage.removeItem(
      "tfortech_user_id"
    );

    localStorage.removeItem(
      "tfortech_user_name"
    );

    localStorage.removeItem(
      "tfortech_user_email"
    );

    localStorage.removeItem(
      "tfortech_user_phone"
    );

    localStorage.removeItem(
      "tfortech_user_role"
    );

    localStorage.removeItem(
      "tfortech_remember_me"
    );
  };


  const fetchUsers = useCallback(
    async (showRefresh = false) => {
      const loggedIn =
        localStorage.getItem(
          "tfortech_logged_in"
        );

      const token =
        localStorage.getItem(
          "tfortech_access_token"
        );

      if (
        loggedIn !== "true" ||
        !token
      ) {
        navigate("/login");
        return;
      }

      if (
        normalizedCurrentRole !==
        "admin"
      ) {
        navigate("/");
        return;
      }

      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");
        setActionMessage("");

        const response = await fetch(
          `${API_URL}/api/auth/admin/users`,
          {
            method: "GET",

            headers: {
              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },
          }
        );

        if (
          response.status === 401
        ) {
          clearLoginSession();

          navigate("/login");

          return;
        }

        if (
          response.status === 403
        ) {
          setError(
            "You do not have permission to manage users."
          );

          return;
        }

        if (!response.ok) {
          throw new Error(
            "Failed to load users."
          );
        }

        const data =
          await response.json();

        setUsers(
          Array.isArray(data)
            ? data
            : []
        );
      } catch (err) {
        console.error(
          "Admin users error:",
          err
        );

        setError(
          err.message ||
            "Failed to load users."
        );
      } finally {
        setLoading(false);

        setRefreshing(false);
      }
    },
    [
      navigate,
      normalizedCurrentRole,
    ]
  );


  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);


  const updateUserRole = async (
    userId,
    newRole
  ) => {
    const token =
      localStorage.getItem(
        "tfortech_access_token"
      );

    if (!token) {
      navigate("/login");
      return;
    }

    if (
      normalizedCurrentRole !==
      "admin"
    ) {
      setError(
        "You do not have permission to change user roles."
      );

      return;
    }

    if (
      userId === currentUserId
    ) {
      setActionMessage(
        "You cannot change your own role."
      );

      return;
    }

    try {
      setSavingUserId(userId);

      setError("");

      setActionMessage("");

      const response = await fetch(
        `${API_URL}/api/auth/admin/users/${userId}/role`,
        {
          method: "PUT",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            role: newRole,
          }),
        }
      );

      if (
        response.status === 401
      ) {
        clearLoginSession();

        navigate("/login");

        return;
      }

      if (
        response.status === 403
      ) {
        setError(
          "You do not have permission to change user roles."
        );

        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Failed to update user role."
        );
      }

      const updatedUser =
        data;

      setUsers(
        (currentUsers) =>
          currentUsers.map(
            (user) =>
              user.id === userId
                ? updatedUser
                : user
          )
      );

      setActionMessage(
        `Role updated successfully for ${updatedUser.full_name}.`
      );
    } catch (err) {
      console.error(
        "Role update error:",
        err
      );

      setError(
        err.message ||
          "Failed to update user role."
      );
    } finally {
      setSavingUserId(null);
    }
  };


  const updateUserStatus = async (
    userId,
    currentStatus
  ) => {
    const token =
      localStorage.getItem(
        "tfortech_access_token"
      );

    if (!token) {
      navigate("/login");
      return;
    }

    if (
      normalizedCurrentRole !==
      "admin"
    ) {
      setError(
        "You do not have permission to change account status."
      );

      return;
    }

    if (
      userId === currentUserId
    ) {
      setActionMessage(
        "You cannot disable your own account."
      );

      return;
    }

    const nextStatus =
      !Boolean(currentStatus);

    try {
      setSavingUserId(userId);

      setError("");

      setActionMessage("");

      const response = await fetch(
        `${API_URL}/api/auth/admin/users/${userId}/status?is_active=${nextStatus}`,
        {
          method: "PUT",

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      if (
        response.status === 401
      ) {
        clearLoginSession();

        navigate("/login");

        return;
      }

      if (
        response.status === 403
      ) {
        setError(
          "You do not have permission to change account status."
        );

        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Failed to update account status."
        );
      }

      const updatedUser =
        data;

      setUsers(
        (currentUsers) =>
          currentUsers.map(
            (user) =>
              user.id === userId
                ? updatedUser
                : user
          )
      );

      setActionMessage(
        `${updatedUser.full_name} is now ${
          updatedUser.is_active
            ? "active"
            : "inactive"
        }.`
      );
    } catch (err) {
      console.error(
        "Status update error:",
        err
      );

      setError(
        err.message ||
          "Failed to update account status."
      );
    } finally {
      setSavingUserId(null);
    }
  };


  const deleteUser = async (
    userId,
    userName
  ) => {
    const token =
      localStorage.getItem(
        "tfortech_access_token"
      );

    if (!token) {
      navigate("/login");
      return;
    }

    if (
      normalizedCurrentRole !==
      "admin"
    ) {
      setError(
        "You do not have permission to delete users."
      );

      return;
    }

    if (
      userId === currentUserId
    ) {
      setActionMessage(
        "You cannot delete your own account."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${userName || "this user"} permanently? This cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSavingUserId(userId);

      setError("");

      setActionMessage("");

      const response = await fetch(
        `${API_URL}/api/auth/admin/users/${userId}`,
        {
          method: "DELETE",

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      if (
        response.status === 401
      ) {
        clearLoginSession();

        navigate("/login");

        return;
      }

      if (
        response.status === 403
      ) {
        setError(
          "You do not have permission to delete users."
        );

        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Failed to delete user."
        );
      }

      setUsers(
        (currentUsers) =>
          currentUsers.filter(
            (user) =>
              user.id !== userId
          )
      );

      setActionMessage(
        `${userName || "User"} has been deleted.`
      );
    } catch (err) {
      console.error(
        "Delete user error:",
        err
      );

      setError(
        err.message ||
          "Failed to delete user."
      );
    } finally {
      setSavingUserId(null);
    }
  };


  const updateUserRoleByCredentials =
    async () => {
      const token =
        localStorage.getItem(
          "tfortech_access_token"
        );

      if (!token) {
        navigate("/login");
        return;
      }

      if (
        normalizedCurrentRole !==
        "admin"
      ) {
        setError(
          "You do not have permission to assign administrative roles."
        );

        return;
      }

      const normalizedEmail =
        credentialEmail
          .trim()
          .toLowerCase();

      const providedPassword =
        credentialPassword;

      if (!normalizedEmail) {
        setError(
          "Please enter the user's email address."
        );

        return;
      }

      if (!providedPassword) {
        setError(
          "Please enter the user's password."
        );

        return;
      }

      if (
        !["admin", "co_admin"].includes(
          credentialRole
        )
      ) {
        setError(
          "Please select Admin or Co Admin."
        );

        return;
      }

      if (
        normalizedEmail ===
        String(
          localStorage.getItem(
            "tfortech_user_email"
          ) || ""
        )
          .trim()
          .toLowerCase()
      ) {
        setError(
          "You cannot change your own role through this form."
        );

        return;
      }

      try {
        setCredentialSaving(true);

        setError("");

        setActionMessage("");

        const response = await fetch(
          `${API_URL}/api/auth/admin/users/role-by-credentials`,
          {
            method: "PUT",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              email: normalizedEmail,

              password:
                providedPassword,

              role: credentialRole,
            }),
          }
        );

        const data =
          await response.json();

        if (
          response.status === 403
        ) {
          setError(
            data?.detail ||
              "You do not have permission to assign administrative roles."
          );

          return;
        }

        if (
          response.status === 401
        ) {
          setError(
            data?.detail ||
              "Unable to verify the provided email and password. Please check the credentials or log in again if your admin session has expired."
          );

          return;
        }

        if (!response.ok) {
          throw new Error(
            data?.detail ||
              "Failed to update user role."
          );
        }

        const updatedUser =
          data?.user;

        if (!updatedUser) {
          throw new Error(
            "User role was updated, but the updated user information was not returned."
          );
        }

        setUsers(
          (currentUsers) =>
            currentUsers.map(
              (user) =>
                user.id ===
                updatedUser.id
                  ? updatedUser
                  : user
            )
        );

        setActionMessage(
          `Role updated successfully for ${updatedUser.full_name}.`
        );

        setCredentialEmail("");

        setCredentialPassword("");

        setCredentialRole(
          "co_admin"
        );
      } catch (err) {
        console.error(
          "Credential role update error:",
          err
        );

        setError(
          err.message ||
            "Failed to update user role."
        );
      } finally {
        setCredentialSaving(false);

        setCredentialPassword("");
      }
    };


  const getRoleLabel = (role) => {
    const normalized =
      String(role || "")
        .toLowerCase()
        .trim();

    if (
      normalized === "admin"
    ) {
      return "Admin";
    }

    if (
      normalized === "co_admin"
    ) {
      return "Co Admin";
    }

    return "Customer";
  };


  const getRoleIcon = (role) => {
    const normalized =
      String(role || "")
        .toLowerCase()
        .trim();

    if (
      normalized === "admin"
    ) {
      return <FaUserShield />;
    }

    if (
      normalized === "co_admin"
    ) {
      return <FaUserTie />;
    }

    return <FaUser />;
  };


  const getRoleClass = (role) => {
    const normalized =
      String(role || "")
        .toLowerCase()
        .trim();

    if (
      normalized === "admin"
    ) {
      return "admin";
    }

    if (
      normalized === "co_admin"
    ) {
      return "co-admin";
    }

    return "customer";
  };


  const totalUsers =
    users.length;

  const activeUsers =
    users.filter(
      (user) =>
        user.is_active !== false
    ).length;

  const coAdmins =
    users.filter(
      (user) =>
        String(
          user.role || ""
        )
          .toLowerCase()
          .trim() ===
        "co_admin"
    ).length;

  const adminUsers =
    users.filter(
      (user) =>
        String(
          user.role || ""
        )
          .toLowerCase()
          .trim() ===
        "admin"
    ).length;


  if (loading) {
    return (
      <AdminLayout>
        <div className="admin-users-page">
          <div className="admin-users-loading">
            <FaSyncAlt className="admin-users-loading-icon" />

            <h2>
              Loading Users
            </h2>

            <p>
              Please wait while we load
              the user management data.
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }


  return (
    <AdminLayout>
      <div className="admin-users-page">

        {/* =================================================
            TOP BAR
        ================================================= */}

        <div className="admin-users-topbar">
          <div className="admin-users-heading">
            <button
              type="button"
              className="admin-users-back-button"
              onClick={() =>
                navigate("/admin")
              }
            >
              <FaArrowLeft />
            </button>

            <div>
              <span className="admin-users-label">
                USER MANAGEMENT
              </span>

              <h1>
                Admin Members
              </h1>

              <p>
                Manage customer accounts and
                assign administrative roles.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="admin-users-refresh-button"
            onClick={() =>
              fetchUsers(true)
            }
            disabled={refreshing}
          >
            <FaSyncAlt
              className={
                refreshing
                  ? "admin-users-spin"
                  : ""
              }
            />

            <span>
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </span>
          </button>
        </div>


        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <section className="admin-users-summary-grid">

          <div className="admin-users-summary-card">
            <div className="admin-users-summary-icon total">
              <FaUsers />
            </div>

            <div>
              <span>
                Total Users
              </span>

              <strong>
                {totalUsers}
              </strong>
            </div>
          </div>


          <div className="admin-users-summary-card">
            <div className="admin-users-summary-icon active">
              <FaCheckCircle />
            </div>

            <div>
              <span>
                Active Users
              </span>

              <strong>
                {activeUsers}
              </strong>
            </div>
          </div>


          <div className="admin-users-summary-card">
            <div className="admin-users-summary-icon co-admin">
              <FaUserTie />
            </div>

            <div>
              <span>
                Co Admins
              </span>

              <strong>
                {coAdmins}
              </strong>
            </div>
          </div>


          <div className="admin-users-summary-card">
            <div className="admin-users-summary-icon admin">
              <FaUserShield />
            </div>

            <div>
              <span>
                Admins
              </span>

              <strong>
                {adminUsers}
              </strong>
            </div>
          </div>

        </section>


        {/* =================================================
            ASSIGN ADMIN / CO ADMIN BY CREDENTIALS
        ================================================= */}

        <section className="admin-users-credentials-card">

          <div className="admin-users-card-heading">
            <div>
              <h2>
                Add Admin / Co Admin
              </h2>

              <p>
                Enter the existing user's email and
                password to verify the account and
                assign an administrative role.
              </p>
            </div>

            <div className="admin-users-access-note">
              <FaUserShield />

              <span>
                Only Admin can assign these roles.
              </span>
            </div>
          </div>


          <div className="admin-users-credentials-form">

            <div className="admin-users-form-group">

              <label htmlFor="admin-user-email">
                <FaEnvelope />
                User Email
              </label>

              <input
                id="admin-user-email"
                type="email"
                value={credentialEmail}
                onChange={(event) =>
                  setCredentialEmail(
                    event.target.value
                  )
                }
                placeholder="Enter existing user's email"
                autoComplete="off"
                disabled={credentialSaving}
              />

            </div>


            <div className="admin-users-form-group">

              <label htmlFor="admin-user-password">
                <FaKey />
                User Password
              </label>

              <input
                id="admin-user-password"
                type="password"
                value={credentialPassword}
                onChange={(event) =>
                  setCredentialPassword(
                    event.target.value
                  )
                }
                placeholder="Enter existing user's password"
                autoComplete="new-password"
                disabled={credentialSaving}
              />

            </div>


            <div className="admin-users-form-group">

              <label htmlFor="admin-user-role">
                <FaUserShield />
                Assign Role
              </label>

              <select
                id="admin-user-role"
                value={credentialRole}
                onChange={(event) =>
                  setCredentialRole(
                    event.target.value
                  )
                }
                disabled={credentialSaving}
              >
                <option value="co_admin">
                  Co Admin
                </option>

                <option value="admin">
                  Admin
                </option>
              </select>

            </div>


            <div className="admin-users-credentials-actions">

              <button
                type="button"
                className="admin-users-credentials-button"
                onClick={
                  updateUserRoleByCredentials
                }
                disabled={
                  credentialSaving
                }
              >
                {credentialSaving ? (
                  <>
                    <FaSyncAlt className="admin-users-spin" />

                    <span>
                      Verifying...
                    </span>
                  </>
                ) : (
                  <>
                    <FaSave />

                    <span>
                      Assign Role
                    </span>
                  </>
                )}
              </button>

            </div>

          </div>

        </section>


        {/* =================================================
            MESSAGES
        ================================================= */}

        {error && (
          <div className="admin-users-error">

            <FaTimesCircle />

            <div>
              <strong>
                Something went wrong
              </strong>

              <p>
                {error}
              </p>
            </div>

          </div>
        )}


        {actionMessage && (
          <div className="admin-users-success">

            <FaCheckCircle />

            <span>
              {actionMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setActionMessage("")
              }
            >
              ×
            </button>

          </div>
        )}


        {/* =================================================
            USERS TABLE
        ================================================= */}

        <section className="admin-users-card">

          <div className="admin-users-card-heading">

            <div>
              <h2>
                All Users
              </h2>

              <p>
                Assign roles and manage account
                status from here.
              </p>
            </div>

            <div className="admin-users-access-note">

              <FaUserShield />

              <span>
                Only Admin can manage
                these permissions.
              </span>

            </div>

          </div>


          {users.length === 0 ? (

            <div className="admin-users-empty">

              <FaUsers />

              <h3>
                No Users Found
              </h3>

              <p>
                Registered users will appear
                here.
              </p>

            </div>

          ) : (

            <div className="admin-users-table-wrapper">

              <table className="admin-users-table">

                <thead>
                  <tr>
                    <th>
                      User
                    </th>

                    <th>
                      Contact
                    </th>

                    <th>
                      Current Role
                    </th>

                    <th>
                      Change Role
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Account
                    </th>
                  </tr>
                </thead>


                <tbody>

                  {users.map(
                    (user) => {
                      const isCurrentUser =
                        user.id ===
                        currentUserId;

                      const isSaving =
                        savingUserId ===
                        user.id;

                      return (
                        <tr
                          key={user.id}
                        >

                          <td>

                            <div className="admin-users-user-cell">

                              <div className="admin-users-avatar">

                                {String(
                                  user.full_name ||
                                    "U"
                                )
                                  .charAt(0)
                                  .toUpperCase()}

                              </div>


                              <div className="admin-users-user-info">

                                <strong>
                                  {
                                    user.full_name ||
                                    "User"
                                  }
                                </strong>

                                {isCurrentUser && (
                                  <span className="admin-users-you-badge">
                                    You
                                  </span>
                                )}

                              </div>

                            </div>

                          </td>


                          <td>

                            <div className="admin-users-contact">

                              <span>
                                {
                                  user.email
                                }
                              </span>

                              <small>
                                {
                                  user.phone ||
                                  "No phone"
                                }
                              </small>

                            </div>

                          </td>


                          <td>

                            <span
                              className={`admin-users-role-badge ${getRoleClass(
                                user.role
                              )}`}
                            >

                              {getRoleIcon(
                                user.role
                              )}

                              <span>
                                {getRoleLabel(
                                  user.role
                                )}
                              </span>

                            </span>

                          </td>


                          <td>

                            {isCurrentUser ? (

                              <span className="admin-users-protected-text">
                                Your role
                              </span>

                            ) : (

                              <div className="admin-users-role-control">

                                <select
                                  value={
                                    user.role ||
                                    "customer"
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateUserRole(
                                      user.id,
                                      event.target.value
                                    )
                                  }
                                  disabled={
                                    isSaving
                                  }
                                >

                                  <option value="customer">
                                    Customer
                                  </option>

                                  <option value="co_admin">
                                    Co Admin
                                  </option>

                                  <option value="admin">
                                    Admin
                                  </option>

                                </select>


                                {isSaving && (
                                  <FaSyncAlt className="admin-users-spin admin-users-save-icon" />
                                )}

                              </div>

                            )}

                          </td>


                          <td>

                            <span
                              className={`admin-users-status-badge ${
                                user.is_active !==
                                false
                                  ? "active"
                                  : "inactive"
                              }`}
                            >

                              {user.is_active !==
                              false ? (

                                <FaCheckCircle />

                              ) : (

                                <FaTimesCircle />

                              )}

                              <span>
                                {user.is_active !==
                                false
                                  ? "Active"
                                  : "Inactive"}
                              </span>

                            </span>

                          </td>


                          <td>

                            {isCurrentUser ? (

                              <span className="admin-users-protected-text">
                                Protected
                              </span>

                            ) : (

                              <button
                                type="button"
                                className={`admin-users-status-button ${
                                  user.is_active !==
                                  false
                                    ? "disable"
                                    : "enable"
                                }`}
                                onClick={() =>
                                  updateUserStatus(
                                    user.id,
                                    user.is_active
                                  )
                                }
                                disabled={
                                  isSaving
                                }
                              >

                                {isSaving ? (

                                  <FaSyncAlt className="admin-users-spin" />

                                ) : user.is_active !==
                                  false ? (

                                  <>
                                    <FaTimesCircle />
                                    Disable
                                  </>

                                ) : (

                                  <>
                                    <FaCheckCircle />
                                    Enable
                                  </>

                                )}

                              </button>

                            )}

                            {!isCurrentUser && (

                              <button
                                type="button"
                                className="admin-users-delete-button"
                                onClick={() =>
                                  deleteUser(
                                    user.id,
                                    user.full_name ||
                                      user.email
                                  )
                                }
                                disabled={
                                  isSaving
                                }
                                title="Delete user"
                              >

                                <FaTrashAlt />
                                Delete

                              </button>

                            )}

                          </td>

                        </tr>
                      );
                    }
                  )}

                </tbody>

              </table>

            </div>

          )}

        </section>


        {/* =================================================
            ROLE INFORMATION
        ================================================= */}

        <section className="admin-users-role-info">

          <div className="admin-users-role-info-header">

            <FaUserShield />

            <div>

              <h2>
                Access Levels
              </h2>

              <p>
                Current role permissions in your
                TFORTECH admin system.
              </p>

            </div>

          </div>


          <div className="admin-users-role-info-grid">

            <div className="admin-users-role-info-card admin">

              <div className="admin-users-role-info-icon">
                <FaUserShield />
              </div>

              <div>

                <h3>
                  Admin
                </h3>

                <p>
                  Complete website and Admin
                  Dashboard access, including user,
                  theme, Hero, reviews, WhatsApp,
                  products and orders management.
                </p>

              </div>

            </div>


            <div className="admin-users-role-info-card co-admin">

              <div className="admin-users-role-info-icon">
                <FaUserTie />
              </div>

              <div>

                <h3>
                  Co Admin
                </h3>

                <p>
                  Complete normal customer-facing
                  website access, plus Admin Products
                  and Admin Orders access.
                </p>

              </div>

            </div>


            <div className="admin-users-role-info-card customer">

              <div className="admin-users-role-info-icon">
                <FaUser />
              </div>

              <div>

                <h3>
                  Customer
                </h3>

                <p>
                  Normal customer-facing website
                  access without Admin Dashboard
                  permissions.
                </p>

              </div>

            </div>

          </div>


          <div className="admin-users-role-info-footer">

            <FaSave />

            <span>
              Role changes are saved directly to
              the user account in MongoDB.
            </span>

          </div>

        </section>

      </div>
    </AdminLayout>
  );
};


export default AdminUsers;
