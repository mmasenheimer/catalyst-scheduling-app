"use strict";
const router = require("express").Router();
const Event = require("../models/Event");
const { createWithNextId } = require("../utils/sequentialId");

// GET /api/events

router.get("/", async (req, res) => {
  try {
    res.json(await Event.find().sort({ _id: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events

router.post("/", async (req, res) => {
  try {
    const { name, type, start, end, staffNeeded, assignedStaff, notes, days, repeating } = req.body;
    const event = await createWithNextId(Event, { name, type, start, end, staffNeeded, assignedStaff, notes, days, repeating });
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/events/:id

router.patch("/:id", async (req, res) => {
  try {
    const {
      name,
      type,
      start,
      end,
      staffNeeded,
      assignedStaff,
      notes,
      days,
      repeating,
    } = req.body;
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      {
        name,
        type,
        start,
        end,
        staffNeeded,
        assignedStaff,
        notes,
        days,
        repeating,
      },
      { new: true },
    );

    if (!event) return res.status(404).json({ error: "Not found " });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:id

router.delete("/:id", async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
