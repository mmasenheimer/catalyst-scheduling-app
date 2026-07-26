"use strict";
const router = require("express").Router();
const Availability = require("../models/Availability");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

// An employee may only read/write their own availability; a manager may touch
// anyone's. Used by the :staffId routes below.
function canAccessStaff(req, res, next) {
  if (req.user.role === "manager") return next();
  if (Number(req.params.staffId) === req.user.staffId) return next();
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

router.get("/:staffId", canAccessStaff, async (req, res) => {
  try {
    const avail = await Availability.findOne({ staffId: req.params.staffId });
    if (!avail) return res.status(404).json({ error: "Not found" });
    res.json(avail);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PUT /api/availability/:staffId
// Submits (or replaces) a staff member's weekly availability template.

router.put("/:staffId", canAccessStaff, async (req, res) => {
  try {
    const { days, note } = req.body;
    const avail = await Availability.findOneAndUpdate(
      { staffId: req.params.staffId },
      { staffId: req.params.staffId, days, note, submittedAt: new Date() },
      { upsert: true, new: true, runValidators: true },
    );
    res.json(avail);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
