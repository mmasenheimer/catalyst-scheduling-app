"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
// Security headers. crossOriginResourcePolicy is relaxed because the frontend
// is served from a different origin than the API; helmet's same-origin default
// would block those responses outright.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
const { requireAuth } = require("./middleware/auth");

// Throttle credential guessing, in two layers. Both count only failures, so
// logging in and out normally is never penalised.
//
// Per-account first: keyed on the username being attempted, so one person
// mistyping their password can't lock anyone else out. A purely IP-based limit
// would do exactly that — everyone on the same office network, or behind a
// reverse proxy, shares one bucket.
const perAccountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: req => String(req.body?.username ?? "").toLowerCase().trim() || "unknown",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many failed attempts for this account. Try again in a few minutes." },
});

// Then a looser per-IP cap, to stop one source hammering many accounts.
//
// NOTE: behind a reverse proxy every request appears to come from the proxy's
// IP. Set `app.set("trust proxy", 1)` when deploying behind nginx so this keys
// off the real client address.
const perIpLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many failed attempts from this location. Try again later." },
});

// Public — logging in is how you get a session in the first place.
app.use("/api/auth/login", perAccountLoginLimiter, perIpLoginLimiter);
app.use("/api/auth", require("./routes/auth"));

// Everything below requires a valid session. Individual routes add
// requireManager on top for manager-only actions.
app.use("/api/staff", requireAuth, require("./routes/staff"));
app.use("/api/schedules", requireAuth, require("./routes/schedules"));
app.use("/api/events", requireAuth, require("./routes/events"));
app.use("/api/availability", requireAuth, require("./routes/availability"));
app.use("/api/templates", requireAuth, require("./routes/templates"));
app.use("/api/notifications", requireAuth, require("./routes/notifications"));
app.use("/api/requests", requireAuth, require("./routes/requests"));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

db.connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`REST API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

module.exports = app;
