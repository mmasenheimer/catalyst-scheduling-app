"use strict";
const { verifyToken } = require("../utils/auth");
const User = require("../models/User");

// The only endpoints an account with a pending forced password change may use —
// exactly what's needed to complete that change (plus restoring the session so
// the client can route them to the change-password screen). Everything else is
// blocked, so a manager-issued temporary password can't be used as a working
// credential for the rest of the API. Matched against the full original path,
// so this doesn't depend on where each router happens to be mounted.
const PASSWORD_CHANGE_EXEMPT = new Set([
  "/api/auth/change-password",
  "/api/auth/me",
]);

// Validates the Bearer token, confirms the account still exists, and attaches
// the verified identity to req.user. Everything downstream must read identity
// from here — never from the request body or query string, which the client
// controls.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  try {
    // A signed token only proves the session was issued at some point — it says
    // nothing about whether the account still exists. Re-checking on every
    // request means removing a staff member cuts off their active session
    // immediately, instead of leaving it usable until the token expires.
    // (Costs one indexed _id lookup per authenticated request.)
    const user = await User.findById(payload.sub)
      .select("role staffId username name mustChangePassword tokenVersion")
      .lean();

    if (!user) return res.status(401).json({ error: "Account no longer exists" });

    // Reject tokens issued before the account's most recent password change.
    // `?? 0` keeps accounts and tokens predating this field working, so adding
    // it doesn't force everyone to re-login.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Session ended — your password was changed" });
    }

    // Read role/staffId from the database rather than the token, so a token
    // issued before a role change can't carry outdated privileges.
    req.user = {
      id: String(user._id),
      role: user.role,
      staffId: user.staffId ?? null,
      username: user.username,
      name: user.name,
      mustChangePassword: !!user.mustChangePassword,
    };

    // Enforce the forced password change here rather than trusting the client
    // to route around it. Fail-secure: any route added later is gated by
    // default until it's explicitly exempted above.
    if (req.user.mustChangePassword) {
      const path = req.originalUrl.split("?")[0].replace(/\/+$/, "") || "/";
      if (!PASSWORD_CHANGE_EXEMPT.has(path)) {
        return res.status(403).json({
          error: "Set your own password before using the app",
          mustChangePassword: true,
        });
      }
    }

    next();
  } catch (err) {
    // A malformed `sub` claim fails to cast to an ObjectId — treat that as a
    // bad session, not a server fault.
    if (err.name === "CastError") {
      return res.status(401).json({ error: "Invalid session" });
    }
    console.error("Auth lookup failed:", err.message);
    return res.status(500).json({ error: "Could not verify session" });
  }
}

// Must be used after requireAuth.
function requireManager(req, res, next) {
  if (req.user?.role !== "manager") {
    return res.status(403).json({ error: "Manager access required" });
  }
  next();
}

module.exports = { requireAuth, requireManager };
