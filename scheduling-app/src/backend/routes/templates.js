"use strict";
const router = require("express").Router();
const Template = require("../models/Template");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");
const { updateWithVersion } = require("../utils/optimisticUpdate");
const {
  validateTemplateShape, validateTemplateDays, validateScheduleStaff,
} = require("../utils/validate");

// GET /api/templates

router.get("/", async (req, res) => {
  try {
    res.json(await Template.find().sort({ createdAt: 1 }));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// POST /api/templates

router.post("/", requireManager, async (req, res) => {
  try {
    const { type, name, description, day, days, staff } = req.body;

    // `days` and `staff` are Mixed, so the schema checks neither. A weekly
    // template with no days saved happily and then rendered as "This template
    // has no days" — indistinguishable from a real one until you opened it.
    const shapeError = validateTemplateShape({ type, days, staff });
    if (shapeError) return res.status(400).json({ error: shapeError });

    const template = await Template.create({ type, name, description, day, days, staff });
    res.status(201).json(template);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/templates/:id

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { name, description, days, staff, expectedVersion } = req.body;

    // Only what was actually sent: a PATCH that just renames a template must not
    // have to resend its whole week, and `undefined` here means "leave alone".
    if (days !== undefined) {
      const daysError = validateTemplateDays(days);
      if (daysError) return res.status(400).json({ error: daysError });
    }
    if (staff !== undefined) {
      const staffError = validateScheduleStaff(staff);
      if (staffError) return res.status(400).json({ error: staffError });
    }

    // Only fields actually sent, so a rename does not blank the week.
    const changes = {};
    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;
    if (days !== undefined) changes.days = days;
    if (staff !== undefined) changes.staff = staff;

    const { doc, conflict, currentVersion } = await updateWithVersion(
      Template, { _id: req.params.id }, changes, expectedVersion,
    );
    if (conflict) {
      return res.status(409).json({
        error: "This template was changed by someone else while you were editing.",
        currentVersion,
      });
    }
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/templates/:id

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/templates — remove all

router.delete("/", requireManager, async (req, res) => {
  try {
    await Template.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
