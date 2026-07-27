"use strict";
const router = require("express").Router();
const User = require("../models/User");
const {
  verifyPassword, signToken, hashPassword, generateTempPassword,
} = require("../utils/auth");
const { requireAuth, requireManager } = require("../middleware/auth");

const MIN_PASSWORD_LENGTH = 8;

function normUsername(username) {
  return String(username || "").toLowerCase().trim();
}

// POST /api/auth/login  { username, password } → { token, user }
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username: normUsername(username) });

    // Identical response for "no such user" and "wrong password" so this can't
    // be used to probe which usernames exist.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // A valid login still returns mustChangePassword on the user; the frontend
    // routes them to the change-password screen before letting them in.
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/provision  (manager only)
// Creates (or re-provisions) an employee account with a generated temporary
// password, returned ONCE for the manager to hand off. The account must change
// its password on first login.
//   body: { username, name, staffId?, role? }
router.post("/provision", requireAuth, requireManager, async (req, res) => {
  try {
    const username = normUsername(req.body.username);
    const { name, staffId = null, role = "employee" } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Username and name are required" });
    }
    if (/\s/.test(username)) {
      return res.status(400).json({ error: "Username can't contain spaces" });
    }

    const existing = await User.findOne({ username });
    if (existing && !existing.mustChangePassword) {
      return res.status(409).json({ error: "That username is already taken by an active account" });
    }

    // Don't let a second account attach to a staff member who already has one —
    // /auth/reset looks accounts up by staffId and would otherwise pick between
    // them arbitrarily. (The partial unique index backs this up at the DB level;
    // this check just produces a clearer error.)
    if (staffId != null) {
      const clash = await User.findOne({ staffId, ...(existing ? { _id: { $ne: existing._id } } : {}) });
      if (clash) {
        return res.status(409).json({
          error: `That staff member already has an account (${clash.username})`,
        });
      }
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const user = existing
      ? Object.assign(existing, {
          name, staffId, role, passwordHash, mustChangePassword: true,
          // Re-provisioning replaces the password, so retire any old session.
          tokenVersion: (existing.tokenVersion ?? 0) + 1,
        })
      : new User({ username, name, staffId, role, passwordHash, mustChangePassword: true });
    await user.save();

    // tempPassword is returned here and nowhere else.
    res.status(201).json({ username: user.username, tempPassword, user });
  } catch (err) {
    console.error("Provision failed:", err.message);
    res.status(500).json({ error: "Could not create the account" });
  }
});

// POST /api/auth/reset  (manager only)
// Resets an existing employee's account to a new temporary password and forces
// a change on next login — the "forgot my password" path, since there's no
// email. Keyed by staffId (what Manage Staff has on hand).
//   body: { staffId }
router.post("/reset", requireAuth, requireManager, async (req, res) => {
  try {
    const { staffId } = req.body;
    if (staffId == null) return res.status(400).json({ error: "staffId is required" });

    const user = await User.findOne({ staffId });
    if (!user) return res.status(404).json({ error: "No account exists for that staff member yet" });

    const tempPassword = generateTempPassword();
    user.passwordHash = await hashPassword(tempPassword);
    user.mustChangePassword = true;
    // Kill any session this account currently has — the whole point of a reset
    // is to cut off access, which a stateless JWT wouldn't otherwise do until
    // it expired.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    res.json({ username: user.username, tempPassword, user });
  } catch (err) {
    console.error("Reset failed:", err.message);
    res.status(500).json({ error: "Could not reset the password" });
  }
});

// POST /api/auth/change-password  (any authenticated user)
// Sets a new password and clears mustChangePassword. Used for the forced
// first-login change and for voluntary changes later. The valid session token
// is the proof of identity, so no current password is required.
//   body: { newPassword }
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account no longer exists" });

    // A voluntary change must prove the current password, so someone who walks
    // up to an unattended logged-in browser can't lock the owner out of their
    // account. The forced first-login change is exempt: they just typed the
    // temporary password to get here, so re-entering it adds friction without
    // closing any gap.
    if (!user.mustChangePassword) {
      const { currentPassword } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ error: "Enter your current password" });
      }
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    // Invalidate every previously-issued token for this account...
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    // ...then hand back a fresh one, so changing your password signs out your
    // *other* sessions without signing you out of the one you just used.
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error("Change password failed:", err.message);
    res.status(500).json({ error: "Could not update password" });
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
