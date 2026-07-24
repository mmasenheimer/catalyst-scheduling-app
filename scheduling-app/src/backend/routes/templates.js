"use strict";
const router = require("express").Router();
const Template = require("../models/Template");
const { requireManager } = require("../middleware/auth");

// GET /api/templates

router.get("/", async (req, res) => {
  try {
    res.json(await Template.find().sort({ createdAt: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates

router.post("/", requireManager, async (req, res) => {
  try {
    const { type, name, description, day, days, staff } = req.body;
    const template = await Template.create({ type, name, description, day, days, staff });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/templates/:id

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { name, description, days, staff } = req.body;
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { name, description, days, staff },
      { new: true },
    );
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates — remove all

router.delete("/", requireManager, async (req, res) => {
  try {
    await Template.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
