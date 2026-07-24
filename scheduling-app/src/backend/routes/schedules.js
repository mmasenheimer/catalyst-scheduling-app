"use strict";
const router = require("express").Router();
const Schedule = require("../models/Schedule");
const { requireManager } = require("../middleware/auth");

// GET /api/schedules/:date
// This runs when the frontend loads a day's schedule

router.get("/:date", async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ date: req.params.date });

    if (!schedule) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schedules/:date
// Runs when the manager clicks Finalize, and also whenever the day
// auto-unfinalizes itself after an edit (finalized: false in that case).

router.put("/:date", requireManager, async (req, res) => {
  try {
    const { staff, events, finalized } = req.body;
    const schedule = await Schedule.findOneAndUpdate(
      // FindOneAndUpdate searches for:
      // Document with that date
      // If found, updates it with the new staff/events/timestamp
      // If not found, makes it from scratch, which is the upsert: true
      { date: req.params.date },
      { staff, events, finalized: finalized ?? true, finalizedAt: new Date() },
      { upsert: true, new: true },
    );

    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
