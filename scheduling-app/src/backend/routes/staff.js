"use strict";
const router = require("express").Router();
const Staff = require("../models/Staff");

// GET /api/staff
// This fetches every staff member at once
router.get("/", async (req, res) => {
  try {
    res.json(await Staff.find().sort({ _id: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/staff/:id
// This updates specidic fields on a staff member - shift times, desk times, or weekly hour limit

router.patch("/:id", async (req, res) => {
  try {
    const { shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek } =
      req.body;
    const person = await Staff.findByIdAndUpdate(
      req.params.id,
      { shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek },
      { new: true },
    );
    if (!person) return res.status(404).json({ error: "Not found" });
    res.json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/staff
// Adds a new employee to the roster. _id is a plain Number (not a Mongo
// ObjectId) so we assign the next one ourselves.

router.post("/", async (req, res) => {
  try {
    const { name, shiftStart, shiftEnd, deskStart, deskEnd, maxHoursPerWeek } =
      req.body;
    const last = await Staff.findOne().sort({ _id: -1 });
    const nextId = (last?._id ?? 0) + 1;
    const person = await Staff.create({
      _id: nextId,
      name,
      shiftStart,
      shiftEnd,
      deskStart: deskStart ?? null,
      deskEnd: deskEnd ?? null,
      maxHoursPerWeek: maxHoursPerWeek ?? null,
    });
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/:id
// Removes an employee from the roster.

router.delete("/:id", async (req, res) => {
  try {
    const person = await Staff.findByIdAndDelete(req.params.id);
    if (!person) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
