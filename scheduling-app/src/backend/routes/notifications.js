"use strict";
const router = require("express").Router();
const Notification = require("../models/Notification");

// GET /api/notifications
// Filtered by the requesting user so a client only receives what it may see,
// instead of downloading everyone's notifications and hiding them in the UI.
// Identity comes from query params (?role=&staffId=) for now; once real auth
// lands this should read a verified identity from the session/token instead.
//   manager  → everything except 'approval' notifications
//   employee → 'all' broadcasts + any addressed to their staffId
//   (no role given → everything, for legacy/unauthenticated callers)

router.get("/", async (req, res) => {
  try {
    const { role, staffId } = req.query;
    let filter = {};
    if (role === "manager") {
      filter = { type: { $ne: "approval" } };
    } else if (role === "employee" && staffId != null) {
      filter = { $or: [{ recipients: "all" }, { recipients: Number(staffId) }] };
    }
    res.json(await Notification.find(filter).sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications

router.post("/", async (req, res) => {
  try {
    const { type, title, message, from, recipients, requestId } = req.body;
    const notif = await Notification.create({ type, title, message, from, recipients, requestId });
    res.status(201).json(notif);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id
// Used for markRead (and could carry other field changes later).

router.patch("/:id", async (req, res) => {
  try {
    const { read } = req.body;
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { read },
      { new: true },
    );
    if (!notif) return res.status(404).json({ error: "Not found" });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id

router.delete("/:id", async (req, res) => {
  try {
    const notif = await Notification.findByIdAndDelete(req.params.id);
    if (!notif) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
