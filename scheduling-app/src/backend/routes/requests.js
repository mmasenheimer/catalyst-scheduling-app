"use strict";
const router = require("express").Router();
const Request = require("../models/Request");
const { requireManager } = require("../middleware/auth");

// GET /api/requests
// The manager needs every request (to approve/deny); an employee only gets the
// ones they're involved in (as requester or target), based on the verified
// identity on the session token.

router.get("/", async (req, res) => {
  try {
    const { role, staffId } = req.user;
    const filter =
      role === "manager"
        ? {}
        : { $or: [{ staffId }, { targetStaffId: staffId }] };
    res.json(await Request.find(filter).sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests

router.post("/", async (req, res) => {
  try {
    const { type, staffId, staffName, targetStaffId, targetName, date, dayLabel, note } = req.body;
    // An employee may only file requests as themselves.
    if (req.user.role !== "manager" && staffId !== req.user.staffId) {
      return res.status(403).json({ error: "Cannot submit a request for another staff member" });
    }
    const request = await Request.create({
      type, staffId, staffName, targetStaffId, targetName, date, dayLabel, note,
    });
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id
// Used to move a request from pending → approved/denied. Manager only.

router.patch("/:id", requireManager, async (req, res) => {
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
