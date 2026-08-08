"use strict";
const router = require("express").Router();
const Notification = require("../models/Notification");
const { sendWriteError } = require("../utils/respond");
const { addressedToFilter, isAddressedTo } = require("../utils/notificationAccess");


// GET /api/notifications
// Filtered by the *verified* identity on the session token, so a client only
// ever receives what it may see (not filtered client-side in the UI).
// Most recent first, capped. The client polls this every 45 seconds and renders
// the whole thing, so an uncapped read means the payload grows forever while the
// request rate stays flat — measured at ~1 MB per poll after three months at this
// database's own rate.
//
// 200 is roughly a week of the manager's traffic, who receives the most by far.
// Nobody scrolls a notification list back further than that; anything older is
// history, and the TTL on `createdAt` removes it at 90 days regardless.
//
// The unread badge counts what this returns, so a viewer with more than 200
// unread would see the count plateau. That needs a genuinely abandoned account —
// the realistic worst case is the badge under-reporting on a list nobody has
// opened in a month.
const LIST_LIMIT = 200;

router.get("/", async (req, res) => {
  try {
    const list = await Notification.find(addressedToFilter(req.user))
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT);
    res.json(list);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// POST /api/notifications
//
// Only two things a client legitimately raises on its own: an employee telling
// the manager something (availability submitted), and the manager telling staff
// something. Everything else in the app — the whole request pipeline, schedule
// change notices — is generated server-side, because those notifications are
// addressed to other people and carry a requestId that drives Approve/Deny
// buttons. Before this was enforced, any employee could POST a notification to
// the manager, sign it with anyone's name, and attach a real requestId, putting
// words of their choosing above a live Approve button.
//
// Hence:
//   • `from` is always the authenticated caller — never taken from the body
//   • `requestId` is refused outright (see utils/notify.js, the only writer)
//   • employees may address the manager and nobody else
//   • only a manager may address individuals or broadcast to everyone
const ALLOWED_TYPES = new Set([
  "coverage", "shift_change", "shift_removed", "new_event",
  "event_assigned", "event_unassigned",
  "alert", "approval", "availability",
]);
const MAX_TITLE = 120;
const MAX_MESSAGE = 2000;

router.post("/", async (req, res) => {
  try {
    const { type, title, message, recipients, requestId } = req.body;
    const isManager = req.user.role === "manager";

    if (requestId != null) {
      return res.status(400).json({
        error: "requestId is set by the server, not by the client",
      });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({
        error: `type must be one of: ${[...ALLOWED_TYPES].join(", ")}`,
      });
    }
    if (!title || !String(title).trim() || !message || !String(message).trim()) {
      return res.status(400).json({ error: "title and message are required" });
    }
    if (String(title).length > MAX_TITLE || String(message).length > MAX_MESSAGE) {
      return res.status(400).json({ error: "title or message is too long" });
    }

    // Normalise and authorize the audience.
    let audience;
    if (recipients === "manager") {
      audience = "manager";
    } else if (recipients === "all") {
      if (!isManager) {
        return res.status(403).json({ error: "Only a manager can notify everyone" });
      }
      audience = "all";
    } else if (Array.isArray(recipients)) {
      if (!isManager) {
        return res.status(403).json({
          error: "Employees can only send notifications to the manager",
        });
      }
      const ids = recipients.map(Number);
      if (ids.length === 0 || ids.some(n => !Number.isInteger(n))) {
        return res.status(400).json({ error: "recipients must be staff ids" });
      }
      audience = ids;
    } else {
      return res.status(400).json({
        error: "recipients must be 'manager', 'all', or an array of staff ids",
      });
    }

    const notif = await Notification.create({
      type,
      title: String(title).trim(),
      message: String(message).trim(),
      // Identity comes from the session, so a notification can't be signed with
      // somebody else's name.
      from: req.user.name,
      recipients: audience,
    });
    res.status(201).json(notif);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/notifications/:id
// Used for markRead. Only the addressee may touch it — without this check any
// employee could mark the manager's pending-approval cards as read.
router.patch("/:id", async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Not found" });
    if (!isAddressedTo(notif, req.user)) {
      return res.status(403).json({ error: "That notification isn't yours" });
    }

    // Only `read` is a client-settable field; the rest of a notification is
    // written once by whoever raised it.
    notif.read = !!req.body.read;
    await notif.save();
    res.json(notif);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// DELETE /api/notifications/:id
// Dismiss. Same ownership rule — otherwise one employee could delete another's
// notifications, or the manager's.
router.delete("/:id", async (req, res) => {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Not found" });
    if (!isAddressedTo(notif, req.user)) {
      return res.status(403).json({ error: "That notification isn't yours" });
    }

    await notif.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
