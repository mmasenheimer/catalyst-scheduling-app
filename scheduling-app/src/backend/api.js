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
app.use("/api/staff", require("./routes/staff"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/events", require("./routes/events"));
app.use("/api/availability", require("./routes/availability"));
app.use("/api/templates", require("./routes/templates"));

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
