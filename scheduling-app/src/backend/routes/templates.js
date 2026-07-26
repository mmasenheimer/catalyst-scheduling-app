"use strict";
const router = require("express").Router();
const Template = require("../models/Template");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

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
    const template = await Template.create({ type, name, description, day, days, staff });
    res.status(201).json(template);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/templates/:id

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { name, description, days, staff } = req.body;
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { name, description, days, staff },
      { new: true, runValidators: true },
    );
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json(template);
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
