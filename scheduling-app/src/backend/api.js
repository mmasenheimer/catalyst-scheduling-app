"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
const { requireAuth } = require("./middleware/auth");

// Public — logging in is how you get a session in the first place.
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
