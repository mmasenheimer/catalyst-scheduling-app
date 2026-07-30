"use strict";
const router = require("express").Router();
const Staff = require("../models/Staff");
const User = require("../models/User");
const Event = require("../models/Event");
const Availability = require("../models/Availability");
const Request = require("../models/Request");
const Notification = require("../models/Notification");
const Schedule = require("../models/Schedule");
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
// Removes an employee from the roster and everything keyed to their numeric id.
//
// The cascade isn't optional tidiness. Every other collection references a
// person by that bare number, so anything left behind belongs to whoever holds
// the id next. Ids are no longer reused (see utils/sequentialId.js), which closes
// that door from the other side too — but leftovers would still show a departed
// employee in the manager's request list, keep their availability feeding the
// schedule generator, and strand any request waiting on them.
//
// Not a transaction: Mongo needs a replica set for that, and these steps are
// individually idempotent, so re-running the delete finishes a partial cleanup.
// The response reports each step so a partial failure is visible rather than
// silently assumed complete.
router.delete("/:id", requireManager, async (req, res) => {
  try {
    const staffId = Number(req.params.id);
    if (!Number.isInteger(staffId)) {
      return res.status(400).json({ error: "Invalid staff id" });
    }

    // Revoke the login first. Fail-secure: if a later step fails, the person has
    // already lost access rather than keeping a working account. requireAuth
    // re-checks the account on every request, so this kills live sessions too.
    const account = await User.deleteOne({ staffId });

    const person = await Staff.findByIdAndDelete(staffId);

    // Availability feeds the auto-generator, so a departed employee's would keep
    // shaping generated schedules.
    const availability = await Availability.deleteOne({ staffId });

    // Events: without this their id lingers in assignedStaff forever and keeps
    // counting toward staffNeeded, so events look filled when they aren't.
    const events = await Event.updateMany(
      { assignedStaff: staffId },
      { $pull: { assignedStaff: staffId } },
    );

    // Requests still waiting on somebody can never be resolved once one party is
    // gone — a cover request aimed at them would sit at pending_peer forever.
    // Decided requests are left alone as a record of what happened.
    const requests = await Request.deleteMany({
      status: { $in: ["pending_peer", "pending"] },
      $or: [{ staffId }, { targetStaffId: staffId }],
    });

    // Notifications are addressed to a list, so remove them from it rather than
    // deleting rows outright — a notice sent to two people must survive for the
    // other one. Rows addressed to nobody else are then dropped.
    const notifPulled = await Notification.updateMany(
      { recipients: staffId },
      { $pull: { recipients: staffId } },
    );
    const notifDropped = await Notification.deleteMany({ recipients: { $size: 0 } });

    // Saved day snapshots embed a copy of each person. Readers already ignore ids
    // that aren't on the live roster, but leaving them means the publish diff can
    // still generate a change notice addressed to somebody who no longer exists.
    const schedules = await Schedule.updateMany(
      { $or: [{ "staff.id": staffId }, { "lastPublishedStaff.id": staffId }] },
      { $pull: { staff: { id: staffId }, lastPublishedStaff: { id: staffId } } },
    );

    const result = {
      ok: !!person,
      accountRemoved: account.deletedCount > 0,
      availabilityRemoved: availability.deletedCount > 0,
      eventsUnassigned: events.modifiedCount,
      pendingRequestsRemoved: requests.deletedCount,
      notificationsUpdated: notifPulled.modifiedCount,
      notificationsRemoved: notifDropped.deletedCount,
      schedulesCleaned: schedules.modifiedCount,
    };

    // Cleanup still ran, so a repeat call can finish an interrupted delete — but
    // the caller should know the roster entry wasn't there to remove.
    if (!person) {
      return res.status(404).json({ error: "Not found", ...result });
    }
    res.json(result);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
