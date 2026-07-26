"use strict";
const router = require("express").Router();
const Notification = require("../models/Notification");
const { sendWriteError } = require("../utils/respond");

// GET /api/notifications
// Filtered by the *verified* identity on the session token, so a client only
// ever receives what it may see (not filtered client-side in the UI).
//   manager  → everything except 'approval' notifications
//   employee → 'all' broadcasts + any addressed to their staffId

router.get("/", async (req, res) => {
  try {
    const { role, staffId } = req.user;
    const filter =
      role === "manager"
        ? { type: { $ne: "approval" } }
        : { $or: [{ recipients: "all" }, { recipients: staffId }] };
    res.json(await Notification.find(filter).sort({ createdAt: -1 }));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// POST /api/notifications

router.post("/", async (req, res) => {
  try {
    const { type, title, message, from, recipients, requestId } = req.body;
    const notif = await Notification.create({ type, title, message, from, recipients, requestId });
    res.status(201).json(notif);
  } catch (err) {
    sendWriteError(res, err);
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
      { new: true, runValidators: true },
    );
    if (!notif) return res.status(404).json({ error: "Not found" });
    res.json(notif);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/notifications/:id

router.delete("/:id", async (req, res) => {
  try {
    const notif = await Notification.findByIdAndDelete(req.params.id);
    if (!notif) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
