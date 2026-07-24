"use strict";
const router = require("express").Router();
const User = require("../models/User");
const { verifyPassword, signToken } = require("../utils/auth");
const { requireAuth } = require("../middleware/auth");

// POST /api/auth/login  { email, password } → { token, user }
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });

    // Deliberately identical response for "no such account", "account not set
    // up yet", and "wrong password", so this endpoint can't be used to
    // enumerate which emails exist.
    if (!user || user.status !== "active" || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me → { user }
// Lets the frontend restore a session on refresh from a stored token.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account no longer exists" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Failed to load account" });
  }
});

module.exports = router;
