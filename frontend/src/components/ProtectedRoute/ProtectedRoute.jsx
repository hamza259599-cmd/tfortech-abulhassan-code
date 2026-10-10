import React from "react";
import { Navigate } from "react-router-dom";

import { can, canOpenAdminPanel } from "../../access";

const ProtectedRoute = ({
  children,
  adminOnly = false,
  allowedRoles = null,
  section = null,
}) => {
  const isLoggedIn =
    localStorage.getItem("tfortech_logged_in") === "true";

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const userRole =
    String(
      localStorage.getItem("tfortech_user_role") || "customer"
    )
      .toLowerCase()
      .trim();

  if (adminOnly) {
    const hasAdminAccess =
      userRole === "admin" ||
      userRole === "co_admin";

    if (!hasAdminAccess) {
      return <Navigate to="/" replace />;
    }
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(userRole)
  ) {
    return <Navigate to="/" replace />;
  }

  /*
    A Co Admin only reaches a section the Admin granted them. An Admin
    passes every check. The backend refuses the same requests, so this
    just avoids showing a page that would fail anyway.
  */
  if (section && !can(section)) {
    return (
      <Navigate
        to={canOpenAdminPanel() ? "/admin/products" : "/"}
        replace
      />
    );
  }

  return children;
};

export default ProtectedRoute;
