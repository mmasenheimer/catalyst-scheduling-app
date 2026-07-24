"use strict";
const router = require("express").Router();
const Request = require("../models/Request");

// GET /api/requests
// The manager needs every request (to approve/deny); an employee only needs
// the ones they're involved in (as requester or target) to show status on
// their own notifications. Identity comes from query params for now; move to
// a verified session/token identity once real auth lands.

router.get("/", async (req, res) => {
  try {
    const { role, staffId } = req.query;
    let filter = {};
    if (role === "employee" && staffId != null) {
      const id = Number(staffId);
      filter = { $or: [{ staffId: id }, { targetStaffId: id }] };
    }
    res.json(await Request.find(filter).sort({ createdAt: -1 }));
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
