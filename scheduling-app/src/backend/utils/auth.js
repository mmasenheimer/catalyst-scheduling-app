"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const DEV_SECRET = "catalyst-dev-only-insecure-secret";
const SECRET = process.env.JWT_SECRET || DEV_SECRET;
const TOKEN_TTL = process.env.JWT_TTL || "12h";
const SALT_ROUNDS = 10;

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  console.warn(
    "[auth] JWT_SECRET not set — falling back to an insecure dev secret. " +
      "Set JWT_SECRET in .env before deploying.",
  );
}

function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Something valid to compare against when there is no real hash, so the "no
// such account" path costs the same as the "wrong password" one.
//
// Generated at startup rather than hardcoded, so it always uses the current
// SALT_ROUNDS — a pasted-in constant would silently stop matching the real cost
// the day that value changed, quietly reopening the gap this exists to close.
// Random content, so no password can ever match it. Costs one bcrypt hash at
// boot, once.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), SALT_ROUNDS);

/**
 * Verify a password, taking the same time whether or not the account exists.
 *
 * Returning early on a missing hash — which this used to do — makes an unknown
 * username measurably faster than a known one, because bcrypt never runs. That
 * turns login into an oracle for which usernames are real: measured at 50ms
 * versus 132ms before this change. The response bodies were already identical;
 * it was the work that gave it away.
 *
 * The comparison therefore always runs, and the result is discarded when there
 * was nothing genuine to compare against. The `&&` afterwards is a plain
 * boolean operation, so it adds no measurable time of its own.
 */
function verifyPassword(plain, hash) {
  const present = typeof hash === "string" && hash.length > 0;
  return bcrypt
    .compare(String(plain ?? ""), present ? hash : DUMMY_HASH)
    .then(matches => present && matches);
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      staffId: user.staffId ?? null,
      username: user.username,
      name: user.name,
      // Session generation — compared against the account's current
      // tokenVersion on every request so old tokens die on a password change.
      tv: user.tokenVersion ?? 0,
    },
    SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

// Throws on an invalid or expired token — callers should catch.
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// A short, human-typeable temporary password (e.g. "7QK4-P2MX") that the
// manager hands to a new employee. 32-char alphabet with no ambiguous glyphs
// (no I/O/0/1); 256 is a multiple of 32, so no modulo bias. The employee is
// forced to replace it on first login (mustChangePassword), so it's one-time.
function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n) =>
    Array.from(crypto.randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join("");
  return `${pick(4)}-${pick(4)}`;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateTempPassword,
};
