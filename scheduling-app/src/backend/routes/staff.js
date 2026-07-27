"use strict";
const router = require("express").Router();
const Staff = require("../models/Staff");
const User = require("../models/User");
const Event = require("../models/Event");
const { createWithNextId } = require("../utils/sequentialId");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

// GET /api/staff
// This fetches every staff member at once
router.get("/", async (req, res) => {
  try {
    res.json(await Staff.find().sort({ _id: 1 }));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// GET /api/staff/:id
// Fetches a single person by id

router.get("/:id", async (req, res) => {
  try {
    const person = await Staff.findById(req.params.id);
    if (!person) return res.status(404).json({ error: "Not found" });
    res.json(person);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/staff/:id
// This updates specidic fields on a staff member - shift times, desk times, or weekly hour limit

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek } =
      req.body;
    const person = await Staff.findByIdAndUpdate(
      req.params.id,
      { shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek },
      { new: true, runValidators: true },
    );
    if (!person) return res.status(404).json({ error: "Not found" });
    res.json(person);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// POST /api/staff
// Adds a new employee to the roster. _id is a plain Number (not a Mongo
// ObjectId) so we assign the next one ourselves.

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek } =
      req.body;
    const person = await createWithNextId(Staff, {
      name,
      shiftStart,
      shiftEnd,
      deskStart: deskStart ?? null,
      deskEnd: deskEnd ?? null,
      maxHoursPerWeek: maxHoursPerWeek ?? null,
    });
    res.status(201).json(person);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/staff/:id
// Removes an employee from the roster.

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (Number.isNaN(staffId)) return res.status(400).json({ error: "Invalid staff id" });

    // Revoke the login before removing the roster entry. Doing it in this order
    // is fail-secure: if the second step fails, the person has already lost
    // access rather than keeping a working account. requireAuth re-checks the
    // account on every request, so this also kills any active session.
    const account = await User.deleteOne({ staffId });

    const person = await Staff.findByIdAndDelete(staffId);
    if (!person) return res.status(404).json({ error: "Not found" });

    // Drop them from any event they were assigned to. Without this their id
    // lingers in assignedStaff forever, and a departed employee keeps counting
    // toward each event's staffNeeded — so events look filled when they aren't.
    const events = await Event.updateMany(
      { assignedStaff: staffId },
      { $pull: { assignedStaff: staffId } },
    );

    res.json({
      ok: true,
      accountRemoved: account.deletedCount > 0,
      eventsUnassigned: events.modifiedCount,
    });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
