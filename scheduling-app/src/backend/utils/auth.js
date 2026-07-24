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

// Returns false rather than throwing when the account has no password yet
// (status 'invited'), so callers can treat it as a normal failed login.
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
      email: user.email,
      name: user.name,
    },
    SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

// Throws on an invalid or expired token — callers should catch.
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// One-time invite/reset tokens: the raw value goes to the user (link or code),
// only its hash is stored, so a leaked DB can't be used to claim accounts.
function generateInviteToken() {
  const raw = crypto.randomBytes(24).toString("hex");
  return { raw, hash: hashInviteToken(raw) };
}

function hashInviteToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateInviteToken,
  hashInviteToken,
};
