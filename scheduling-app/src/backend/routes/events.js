"use strict";
const router = require("express").Router();
const Event = require("../models/Event");
const { createWithNextId } = require("../utils/sequentialId");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

// GET /api/events

router.get("/", async (req, res) => {
  try {
    res.json(await Event.find().sort({ _id: 1 }));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// POST /api/events

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, type, start, end, staffNeeded, assignedStaff, notes, days, repeating, repeatFrom, repeatUntil } = req.body;
    const event = await createWithNextId(Event, { name, type, start, end, staffNeeded, assignedStaff, notes, days, repeating, repeatFrom, repeatUntil });
    res.status(201).json(event);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/events/:id

router.patch("/:id", requireManager, async (req, res) => {
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
      repeatFrom,
      repeatUntil,
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
        repeatFrom,
        repeatUntil,
      },
      { new: true, runValidators: true },
    );

    if (!event) return res.status(404).json({ error: "Not found " });
    res.json(event);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/events/:id

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
