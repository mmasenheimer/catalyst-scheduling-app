"use strict";
const router = require("express").Router();
const Request = require("../models/Request");
const { sendWriteError } = require("../utils/respond");
const {
  notifyRequestSubmitted, notifyPeerAccepted, notifyPeerDeclined, notifyRequestWithdrawn,
} = require("../utils/notify");

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
    const {
      type, staffId, staffName, targetStaffId, targetName, date, dayLabel, note,
      requesterShifts, targetShifts,
    } = req.body;
    // An employee may only file requests as themselves.
    if (req.user.role !== "manager" && staffId !== req.user.staffId) {
      return res.status(403).json({ error: "Cannot submit a request for another staff member" });
    }
    // The starting state is derived from the request, never taken from the
    // client: a request that names a coworker has to clear that coworker first,
    // while a drop-shift request goes straight to the manager.
    const status = targetStaffId != null ? "pending_peer" : "pending";

    // Kept as sent: this is a record of what the two people saw and agreed to,
    // not an authority claim. A requester who faked it would only break their own
    // request, since approval compares it against the live schedule and refuses
    // on any mismatch.
    const snapshot = shifts =>
      Array.isArray(shifts)
        ? shifts
            .filter(s => s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)))
            .map(s => ({ start: Number(s.start), end: Number(s.end) }))
        : undefined;

    const request = await Request.create({
      type, status, staffId, staffName, targetStaffId, targetName, date, dayLabel, note,
      requesterShifts: snapshot(requesterShifts),
      targetShifts: snapshot(targetShifts),
    });

    // Announced from here rather than by the client: this notification is
    // addressed to someone else and carries the requestId that drives the
    // Accept/Approve buttons, so its wording can't be left to the submitter.
    await notifyRequestSubmitted(request);

    res.status(201).json(request);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/requests/:id
// Three distinct transitions live here, each with its own authority:
//
//   pending_peer → pending | declined       the named coworker accepts or declines
//   pending      → approved | denied        the manager decides
//   pending_peer
//   or pending   → withdrawn                the person who asked takes it back
//
// All are written as a precondition inside the update query rather than a
// read-then-write, so they're atomic — two clients acting at the same moment
// can't both succeed. That matters most for the manager leg, because approving
// a 'cover' request appends the requester's shifts to the target and applying
// it twice would double-book them.
//
// Withdrawal is allowed from either waiting state because nothing has touched the
// schedule yet — the change only happens on manager approval. Once a request is
// decided it's terminal, so there's nothing left to take back.

const MANAGER_DECISIONS = ["approved", "denied"];
const PEER_DECISIONS = ["pending", "declined"]; // 'pending' == the peer accepted
const WITHDRAWN = "withdrawn";
const WAITING_STATES = ["pending_peer", "pending"];

router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const isWithdrawal = status === WITHDRAWN;
    const isManagerDecision = MANAGER_DECISIONS.includes(status);
    const isPeerDecision = PEER_DECISIONS.includes(status);

    if (!isManagerDecision && !isPeerDecision && !isWithdrawal) {
      const all = [...PEER_DECISIONS, ...MANAGER_DECISIONS, WITHDRAWN].join(", ");
      return res.status(400).json({ error: `status must be one of: ${all}` });
    }

    let filter;
    if (isWithdrawal) {
      // Matching on staffId authorizes and guards in one query: only the person
      // who raised the request can withdraw it, and only while it's still
      // waiting on somebody. A manager has no staffId, so this never matches for
      // them — they deny rather than withdraw.
      filter = {
        _id: req.params.id,
        status: { $in: WAITING_STATES },
        staffId: req.user?.staffId ?? null,
      };
    } else if (isManagerDecision) {
      if (req.user?.role !== "manager") {
        return res.status(403).json({ error: "Manager access required" });
      }
      filter = { _id: req.params.id, status: "pending" };
    } else {
      // Matching on targetStaffId does the authorization and the state guard in
      // the same query: only the coworker the request actually names can accept
      // or decline it, and only while it's still waiting on them.
      filter = {
        _id: req.params.id,
        status: "pending_peer",
        targetStaffId: req.user?.staffId ?? null,
      };
    }

    // Captured before the update, because a withdrawal needs to know who was
    // waiting on it in order to tell the right people it's off.
    const before = isWithdrawal ? await Request.findById(req.params.id).lean() : null;

    const request = await Request.findOneAndUpdate(
      filter,
      { status },
      { new: true, runValidators: true },
    );

    if (!request) {
      // Nothing matched — work out why, so the caller knows whether to retry,
      // refresh, or give up.
      const existing = await Request.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });

      if (isPeerDecision && existing.status === "pending_peer") {
        return res.status(403).json({ error: "This request wasn't sent to you" });
      }
      if (isWithdrawal && WAITING_STATES.includes(existing.status)) {
        return res.status(403).json({ error: "You can only withdraw your own request" });
      }
      return res.status(409).json({
        error: `This request was already ${existing.status}.`,
        status: existing.status,
      });
    }

    // The peer leg is announced here for the same reason as submission: the
    // coworker acting is an employee, and the notification it produces is what
    // puts the request on the manager's desk with an Approve button. The
    // manager's own decision still notifies from the client, where it stays
    // ordered behind the schedule mutation it describes.
    if (isPeerDecision) {
      if (status === "pending") await notifyPeerAccepted(request);
      else await notifyPeerDeclined(request);
    }

    // Whoever was waiting on it needs to know it's off — the coworker staring at
    // an Accept button, or the manager holding it for approval.
    if (isWithdrawal) await notifyRequestWithdrawn(request, before?.status);

    res.json(request);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
