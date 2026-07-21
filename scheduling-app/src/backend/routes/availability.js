"use strict";
const router = require("express").Router();
const Availability = require("../models/Availability");

// GET /api/availability
// Fetches every staff member's submitted availability — used by the manager view.

router.get("/", async (req, res) => {
  try {
    res.json(await Availability.find());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/availability/:staffId
// Fetches one staff member's submitted availability (e.g. to prefill their grid).

router.get("/:staffId", async (req, res) => {
  try {
    const avail = await Availability.findOne({ staffId: req.params.staffId });
    if (!avail) return res.status(404).json({ error: "Not found" });
    res.json(avail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/availability/:staffId
// Submits (or replaces) a staff member's weekly availability template.

router.put("/:staffId", async (req, res) => {
  try {
    const { days, note } = req.body;
    const avail = await Availability.findOneAndUpdate(
      { staffId: req.params.staffId },
      { staffId: req.params.staffId, days, note, submittedAt: new Date() },
      { upsert: true, new: true },
    );
    res.json(avail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
