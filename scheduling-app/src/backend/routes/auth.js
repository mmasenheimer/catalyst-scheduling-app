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

    // Identical response for "no such user" and "wrong password", and the same
    // amount of work either way, so neither the body nor the timing reveals
    // which usernames exist.
    //
    // The comparison is deliberately not short-circuited behind `!user`: doing
    // that skipped bcrypt entirely for an unknown account, which made the reply
    // arrive fast enough to distinguish the two cases. verifyPassword now
    // compares against a dummy hash when there is nothing real to check, so this
    // has to actually call it.
    const passwordOk = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordOk) {
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
    // Either identifier. `staffId` is the natural key for an employee and is
    // what Manage Staff sends; `username` exists because managers have no
    // staffId at all, so keying on it alone left manager accounts with no way
    // back once their owner had set a password — reset refused them for want of
    // a staffId, and re-provisioning refused them as an active username.
    const { staffId, username } = req.body;
    if (staffId == null && !username) {
      return res.status(400).json({ error: "staffId or username is required" });
    }

    const user = staffId != null
      ? await User.findOne({ staffId })
      : await User.findOne({ username: normUsername(username) });
    if (!user) {
      return res.status(404).json({
        error: staffId != null
          ? "No account exists for that staff member yet"
          : "No account with that username",
      });
    }

    // Resetting yourself is a trap rather than a feature. It bumps
    // tokenVersion, so the session making the request dies on its very next
    // call — if anything goes wrong between the response and reading the
    // temporary password out of it, the account is locked harder than before.
    // Anyone able to make this request is already signed in and therefore knows
    // their password, so the change-password flow is both safer and correct.
    if (String(user._id) === req.user.id) {
      return res.status(400).json({
        error: "Use Change Password to change your own — a reset would sign you out first.",
      });
    }

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
