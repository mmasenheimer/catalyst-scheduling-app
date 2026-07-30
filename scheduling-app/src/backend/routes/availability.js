"use strict";
const router = require("express").Router();
const Availability = require("../models/Availability");
const Staff = require("../models/Staff");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");
const { validateAvailabilityDays, validateNote } = require("../utils/validate");

// Parse :staffId once, up front. Without this a non-numeric id reaches Mongoose
// and surfaces as a cast error, which reads like a server fault rather than a bad
// request. Also stops `Number("abc")` → NaN from being compared in canAccessStaff.
function parseStaffId(req, res, next) {
  const staffId = Number(req.params.staffId);
  if (!Number.isInteger(staffId) || staffId < 1) {
    return res.status(400).json({ error: "Invalid staff id" });
  }
  req.staffId = staffId;
  next();
}

// An employee may only read/write their own availability; a manager may touch
// anyone's. Used by the :staffId routes below.
function canAccessStaff(req, res, next) {
  if (req.user.role === "manager") return next();
  if (req.staffId === req.user.staffId) return next();
  return res.status(403).json({ error: "Cannot access another staff member's availability" });
}

// GET /api/availability
// Fetches every staff member's submitted availability — used by the manager view.

router.get("/", requireManager, async (req, res) => {
  try {
    res.json(await Availability.find());
  } catch (err) {
    sendWriteError(res, err);
  }
});

// GET /api/availability/:staffId
// Fetches one staff member's submitted availability (e.g. to prefill their grid).

router.get("/:staffId", parseStaffId, canAccessStaff, async (req, res) => {
  try {
    const avail = await Availability.findOne({ staffId: req.staffId });
    if (!avail) return res.status(404).json({ error: "Not found" });
    res.json(avail);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PUT /api/availability/:staffId
// Submits (or replaces) a staff member's weekly availability template.
//
// Validated rather than trusted, for two reasons this route is unusual in:
// it's the one write an ordinary employee can make to shared data, and its output
// is the auto-generator's primary input. Bad numbers here don't throw — they make
// every availability comparison quietly evaluate false, so the generator produces
// a plausible-looking schedule built on nonsense. See utils/validate.js.
router.put("/:staffId", parseStaffId, canAccessStaff, async (req, res) => {
  try {
    const { days, note } = req.body;

    // An upsert keyed on staffId will happily create a record for somebody who
    // doesn't exist, and nothing would ever clean it up — the roster is the only
    // thing that knows who's real.
    const exists = await Staff.exists({ _id: req.staffId });
    if (!exists) {
      return res.status(404).json({ error: "No such staff member" });
    }

    if (days === undefined) {
      return res.status(400).json({ error: "days is required" });
    }
    const daysError = validateAvailabilityDays(days);
    if (daysError) return res.status(400).json({ error: daysError });

    const noteError = validateNote(note);
    if (noteError) return res.status(400).json({ error: noteError });

    const avail = await Availability.findOneAndUpdate(
      { staffId: req.staffId },
      { staffId: req.staffId, days, note: note ?? "", submittedAt: new Date() },
      { upsert: true, new: true, runValidators: true },
    );
    res.json(avail);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
