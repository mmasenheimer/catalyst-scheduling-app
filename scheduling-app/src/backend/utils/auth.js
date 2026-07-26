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

function verifyPassword(plain, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
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
