"use strict";
const router = require("express").Router();
const Event = require("../models/Event");
const Schedule = require("../models/Schedule");
const { createWithNextId } = require("../utils/sequentialId");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");
const { notifyEventAssigned, notifyEventUnassigned } = require("../utils/notify");

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

    // Anyone picked while creating it is being assigned right now, same as if
    // they'd been dragged onto the event afterwards.
    await notifyEventAssigned(event, event.assignedStaff);

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

    // Loaded once when anything needs to know the event's present state. Skipped
    // entirely otherwise, because a resize drag sends a debounced PATCH of just
    // start/end and shouldn't pay for a read it has no use for.
    const needsCurrent =
      repeating !== undefined || days !== undefined || assignedStaff !== undefined;
    const current = needsCurrent ? await Event.findById(req.params.id).lean() : null;
    if (needsCurrent && !current) return res.status(404).json({ error: "Not found" });

    // Check the state the event would end up in, not just what was sent — a
    // PATCH can flip `repeating` on without touching `days`, or add a date
    // without touching `repeating`, and either can create the conflict.
    if (repeating !== undefined || days !== undefined) {
      const nextRepeating = repeating !== undefined ? repeating : current.repeating;
      const nextDays = days !== undefined ? days : current.days;
      if (repeatConflict(nextRepeating, nextDays)) {
        return res.status(400).json({ error: REPEAT_NEEDS_ONE_DATE });
      }
    }

    // Who changed. Diffed rather than taken from the payload: the client sends
    // the whole roster for the event every time, so without comparing, every
    // unrelated edit would re-notify everybody already on it.
    const was = current?.assignedStaff ?? [];
    const now = assignedStaff ?? [];
    const newlyAssigned = assignedStaff === undefined ? [] : now.filter(id => !was.includes(id));
    const newlyUnassigned = assignedStaff === undefined ? [] : was.filter(id => !now.includes(id));

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

    // Sent after the write, and describing the event as it now stands — so the
    // date and hours in the message are the ones the person is actually being
    // asked to work, even if this same PATCH moved them.
    await notifyEventAssigned(event, newlyAssigned);
    await notifyEventUnassigned(event, newlyUnassigned);

    res.json(event);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/events/:id
//
// Saved days carry a snapshot copy of that day's events alongside the staff
// snapshot. Nothing renders from it — the editors always derive events live — but
// it isn't inert either: the approval flow and event creation both read it and
// write it straight back to preserve it. So a deleted event's copy would be
// round-tripped forever, and any future reader of the snapshot (a report, an
// export) would resurrect an event that no longer exists.
router.delete("/:id", requireManager, async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId)) {
      return res.status(400).json({ error: "Invalid event id" });
    }

    const event = await Event.findByIdAndDelete(eventId);
    if (!event) return res.status(404).json({ error: "Not found" });

    // Deleting an event takes everybody off it at once, which is the one form of
    // unassignment nothing else would announce — the event is gone, so there's no
    // later edit to diff against.
    await notifyEventUnassigned(event, event.assignedStaff, "cancelled");

    // Snapshot entries are serialised events, so they carry `id`, not `_id`.
    const schedules = await Schedule.updateMany(
      { "events.id": eventId },
      { $pull: { events: { id: eventId } } },
    );

    res.json({ ok: true, schedulesCleaned: schedules.modifiedCount });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
