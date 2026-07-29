"use strict";
const router = require("express").Router();
const Event = require("../models/Event");
const { createWithNextId } = require("../utils/sequentialId");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

// A repeating event recurs on the weekday of each date in `days`, so listing
// several dates would silently create a multi-day recurrence — and since staff
// are assigned per-event rather than per-occurrence, there'd be no way to say
// who works which one. Weekly repetition is therefore restricted to a single
// date; use separate events for separate weekdays.
const REPEAT_NEEDS_ONE_DATE = "A repeating event can only have one date. Create separate events for other days.";

function repeatConflict(repeating, days) {
  return repeating === true && Array.isArray(days) && days.length > 1;
}

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
    if (repeatConflict(repeating, days)) {
      return res.status(400).json({ error: REPEAT_NEEDS_ONE_DATE });
    }
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

    // Check the state the event would end up in, not just what was sent — a
    // PATCH can flip `repeating` on without touching `days`, or add a date
    // without touching `repeating`, and either can create the conflict.
    if (repeating !== undefined || days !== undefined) {
      const current = await Event.findById(req.params.id).lean();
      if (!current) return res.status(404).json({ error: "Not found" });
      const nextRepeating = repeating !== undefined ? repeating : current.repeating;
      const nextDays = days !== undefined ? days : current.days;
      if (repeatConflict(nextRepeating, nextDays)) {
        return res.status(400).json({ error: REPEAT_NEEDS_ONE_DATE });
      }
    }

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
