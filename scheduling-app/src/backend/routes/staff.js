"use strict";
const router = require("express").Router();
const Staff = require("../models/Staff");
const User = require("../models/User");
const Event = require("../models/Event");
const Availability = require("../models/Availability");
const Request = require("../models/Request");
const Notification = require("../models/Notification");
const Schedule = require("../models/Schedule");
const Template = require("../models/Template");
const { createWithNextId } = require("../utils/sequentialId");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

// Every key a week template's `days` map can use. See the delete cascade below.
const DAY_KEYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// GET /api/staff
// This fetches every staff member at once
router.get("/", async (req, res) => {
  try {
    res.json(await Staff.find().sort({ _id: 1 }));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/staff/:id
// This updates specific fields on a staff member - their name, shift times,
// desk/VR times, or weekly hour limit

const MAX_NAME_LENGTH = 60;

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { shiftStart, shiftEnd, deskStart, deskEnd, vrStart, vrEnd, maxHoursPerWeek } =
      req.body;
    const update = { shiftStart, shiftEnd, deskStart, deskEnd, vrStart, vrEnd, maxHoursPerWeek };

    let name;
    if ("name" in req.body) {
      name = String(req.body.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "Name can't be empty" });
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
      }
      // Case-insensitive, so "jamie t." can't sit beside "Jamie T.".
      const clash = await Staff.findOne({ _id: { $ne: Number(req.params.id) }, name })
        .collation({ locale: "en", strength: 2 })
        .lean();
      if (clash) return res.status(409).json({ error: "Someone on the roster already has that name" });
      update.name = name;
    }

    const person = await Staff.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!person) return res.status(404).json({ error: "Not found" });

    // Their login carries a display name too (the sidebar, edit stamps). Keep it
    // in step, so a rename shows everywhere rather than only on the roster.
    if (name) await User.updateOne({ staffId: person._id }, { $set: { name } });

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
    const { name, shiftStart, shiftEnd, deskStart, deskEnd, vrStart, vrEnd, maxHoursPerWeek } =
      req.body;
    const person = await createWithNextId(Staff, {
      name,
      shiftStart,
      shiftEnd,
      deskStart: deskStart ?? null,
      deskEnd: deskEnd ?? null,
      vrStart: vrStart ?? null,
      vrEnd: vrEnd ?? null,
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

    // Templates embed the same staff snapshot as a Schedule, in two shapes:
    // a day template holds `staff`, a week template holds `days.{Day}.staff`.
    // Applying a template rebuilds the day from the live roster and ignores ids
    // that aren't on it, so a leftover here can't put a departed employee back on
    // a real schedule — but the preview reads the snapshot directly, so the
    // manager would see them with shifts and the day headcount would count them.
    //
    // `days` is Mixed, so `$pull` can't reach into it with a wildcard and the day
    // keys have to be named. This list is every weekday rather than the six the
    // studio opens: a template written before the Saturday change, or by any
    // future code, must still be cleaned. Naming a key that isn't there is a
    // no-op, so covering all seven costs nothing.
    //
    // Duplicated from the frontend's WEEK_DAY_NAMES because the backend is
    // CommonJS and can't import that ESM module — the same split as the hour
    // constants in utils/validate.js.
    const templates = await Template.updateMany(
      {
        $or: [
          { "staff.id": staffId },
          ...DAY_KEYS.map((d) => ({ [`days.${d}.staff.id`]: staffId })),
        ],
      },
      {
        $pull: {
          staff: { id: staffId },
          ...Object.fromEntries(
            DAY_KEYS.map((d) => [`days.${d}.staff`, { id: staffId }]),
          ),
        },
        // Bump the version so a manager who already had this template open can't
        // save it back with the deleted person still in it — their write carries
        // the version they loaded and now conflicts instead of silently undoing
        // this cleanup.
        $inc: { version: 1 },
      },
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
      templatesCleaned: templates.modifiedCount,
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
