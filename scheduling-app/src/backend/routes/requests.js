"use strict";
const router = require("express").Router();
const Request = require("../models/Request");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

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
    sendWriteError(res, err);
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
    sendWriteError(res, err);
  }
});

// PATCH /api/requests/:id
// Used to move a request from pending → approved/denied. Manager only.

const DECISIONS = ["approved", "denied"];

router.patch("/:id", requireManager, async (req, res) => {
  try {
    const { status } = req.body;
    if (!DECISIONS.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${DECISIONS.join(", ")}` });
    }

    // Only a pending request can be decided, and the check lives in the query
    // so it's atomic — two managers clicking Approve at the same moment can't
    // both succeed. This matters because approving a 'cover' request appends
    // the requester's shifts to the target, so applying it twice double-books
    // them. The client guards this too, but the client can be bypassed.
    const request = await Request.findOneAndUpdate(
      { _id: req.params.id, status: "pending" },
      { status },
      { new: true, runValidators: true },
    );

    if (!request) {
      // Distinguish "no such request" from "already decided" so the caller
      // knows whether to retry or refresh.
      const existing = await Request.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      return res.status(409).json({
        error: `This request was already ${existing.status}.`,
        status: existing.status,
      });
    }

    res.json(request);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
