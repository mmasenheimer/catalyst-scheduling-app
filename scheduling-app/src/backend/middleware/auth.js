"use strict";
const { verifyToken } = require("../utils/auth");

// Validates the Bearer token and attaches the verified identity to req.user.
// Everything downstream must read identity from here — never from the request
// body or query string, which the client controls.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      staffId: payload.staffId ?? null,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
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
