"use strict";
const router = require("express").Router();
const Request = require("../models/Request");

// GET /api/requests

router.get("/", async (req, res) => {
  try {
    res.json(await Request.find().sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests

router.post("/", async (req, res) => {
  try {
    const { type, staffId, staffName, targetStaffId, targetName, date, dayLabel, note } = req.body;
    const request = await Request.create({
      type, staffId, staffName, targetStaffId, targetName, date, dayLabel, note,
    });
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id
// Used to move a request from pending → approved/denied.

router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const request = await Request.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!request) return res.status(404).json({ error: "Not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
