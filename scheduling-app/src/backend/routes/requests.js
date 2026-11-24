"use strict";
const router = require("express").Router();
const Request = require("../models/Request");
const Schedule = require("../models/Schedule");
const Staff = require("../models/Staff");
const { sendWriteError } = require("../utils/respond");
const { unknownStaffIds } = require("../utils/roster");
const { validateDateString } = require("../utils/validate");
const {
  notifyRequestSubmitted, notifyPeerAccepted, notifyPeerDeclined, notifyRequestWithdrawn,
  notifyPickupClaimed,
} = require("../utils/notify");

// ── Shift board helpers ──────────────────────────────────────────────────────

// YYYY-MM-DD for a Date in the server's local time.
const ymd = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Yesterday rather than today, so a server running in UTC doesn't refuse a
// same-day post made in the evening west of Greenwich. The board itself hides
// past days; this only stops posts and pickups for days long gone.
function earliestBoardDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

const overlaps = (a, b) => a.start < b.end && a.end > b.start;

// A person's shifts on a date, from the saved day. A day nobody has saved yet
// has no shifts to clash with, so it reads as empty.
async function shiftsOn(date, staffId) {
  const day = await Schedule.findOne({ date }).lean();
  const row = (day?.staff ?? []).find(p => p?.id === staffId);
  return Array.isArray(row?.shifts) ? row.shifts : [];
}

// Hours a person is scheduled for in the Monday–Sunday week containing `date`,
// counting saved days only.
async function weekHours(date, staffId) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const monday = new Date(day);
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const days = await Schedule.find({ date: { $gte: ymd(monday), $lte: ymd(sunday) } }).lean();
  let total = 0;
  for (const row of days) {
    const person = (row.staff ?? []).find(p => p?.id === staffId);
    for (const sh of person?.shifts ?? []) total += Number(sh.end) - Number(sh.start);
  }
  return total;
}

// GET /api/requests
// The manager needs every request (to approve/deny); an employee gets the ones
// they're involved in (as requester or target), based on the verified identity
// on the session token — plus every open post on the shift board, which is
// meant for everyone to see.

router.get("/", async (req, res) => {
  try {
    const { role, staffId } = req.user;
    const filter =
      role === "manager"
        ? {}
        : { $or: [{ staffId }, { targetStaffId: staffId }, { type: "pickup", status: "open" }] };
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
      requesterShifts, targetShifts, requesterShift, targetShift,
    } = req.body;
    // An employee may only file requests as themselves.
    if (req.user.role !== "manager" && staffId !== req.user.staffId) {
      return res.status(403).json({ error: "Cannot submit a request for another staff member" });
    }

    // A shift board post. Goes straight onto the board as 'open' — nobody is
    // named yet, so there's nobody to notify until someone picks it up.
    if (type === "pickup") {
      if (req.user.staffId == null || staffId !== req.user.staffId) {
        return res.status(403).json({ error: "Only an employee can post their own shift" });
      }
      const dateError = validateDateString(date);
      if (dateError) return res.status(400).json({ error: dateError });
      if (date < earliestBoardDate()) {
        return res.status(400).json({ error: "That day has already passed" });
      }
      const start = Number(requesterShift?.start);
      const end = Number(requesterShift?.end);
      const onGrid = n => Number.isFinite(n) && Number.isInteger(n * 2);
      if (!onGrid(start) || !onGrid(end) || start >= end) {
        return res.status(400).json({ error: "Pick a start and end on the half hour, start before end" });
      }
      const range = { start, end };

      // Posting the same hours twice would let two people claim one shift.
      const mine = await Request.find({
        type: "pickup", staffId, date, status: { $in: ["open", "pending"] },
      }).lean();
      if (mine.some(r => r.requesterShift && overlaps(r.requesterShift, range))) {
        return res.status(409).json({ error: "You've already posted those hours" });
      }

      const isShift = s => s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end));
      const request = await Request.create({
        type, status: "open", staffId, staffName: req.user.name, date, dayLabel,
        requesterShift: range,
        requesterShifts: Array.isArray(requesterShifts)
          ? requesterShifts.filter(isShift).map(sh => ({ start: Number(sh.start), end: Number(sh.end) }))
          : undefined,
      });
      return res.status(201).json(request);
    }

    // Nobody can cover for themselves or swap with themselves — there is no
    // meaningful result, and the approval path assumes the two are different
    // people. Both its branches strip the shift from the requester and then add
    // it to the target; when those are the same person, the first assignment
    // wins and the second never runs. A self-targeted cover therefore *deletes*
    // the shift, and a self-targeted swap naming two of your own shifts leaves
    // one duplicated and the other gone.
    //
    // Refused here rather than resolved downstream because there is no correct
    // answer to compute: the request is meaningless, not ambiguous. The UI never
    // offers it (the candidate list excludes anyone already working that day),
    // so this closes a hand-crafted request rather than an ordinary mistake.
    if (targetStaffId != null && targetStaffId === staffId) {
      return res.status(400).json({
        error: "You can't ask yourself to cover or swap a shift.",
      });
    }

    // Both people have to actually be on the roster.
    //
    // A `pending_peer` request can only be advanced or declined by the named
    // target — the transition carries `targetStaffId: req.user.staffId` inside
    // its update filter. Name somebody who does not exist and nobody can ever
    // satisfy that, so the request waits forever: invisible to the manager
    // because it never reaches their queue, and inexplicable to the requester.
    // Withdrawal still works, so it is recoverable, but only if they notice.
    //
    // `staffId` is checked too. An employee's own id comes from their verified
    // session, but a manager may file on somebody's behalf, and that id is
    // taken from the body.
    const missing = await unknownStaffIds([staffId, targetStaffId]);
    if (missing.length) {
      return res.status(400).json({
        error: `No staff member with id ${missing.join(", ")}`,
      });
    }
    // The starting state is derived from the request, never taken from the
    // client: a request that names a coworker has to clear that coworker first,
    // while a drop-shift request goes straight to the manager.
    const status = targetStaffId != null ? "pending_peer" : "pending";

    // Kept as sent: this is a record of what the two people saw and agreed to,
    // not an authority claim. A requester who faked it would only break their own
    // request, since approval compares it against the live schedule and refuses
    // on any mismatch.
    const isShift = s =>
      s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end));
    const one = s => (isShift(s) ? { start: Number(s.start), end: Number(s.end) } : undefined);
    const snapshot = shifts =>
      Array.isArray(shifts) ? shifts.filter(isShift).map(one) : undefined;

    const request = await Request.create({
      type, status, staffId, staffName, targetStaffId, targetName, date, dayLabel, note,
      requesterShifts: snapshot(requesterShifts),
      targetShifts: snapshot(targetShifts),
      // The one shift changing hands. Only meaningful for cover/swap — a drop
      // gives up the whole day, so it's ignored there even if sent.
      requesterShift: type === "time_off" ? undefined : one(requesterShift),
      targetShift: type === "time_off" ? undefined : one(targetShift),
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

// POST /api/requests/:id/claim
// Pick up a shift from the board. The precondition lives in the update filter,
// so two people clicking at once can't both get it: whoever's update lands first
// moves it to 'pending', and the other matches nothing.

router.post("/:id/claim", async (req, res) => {
  try {
    const me = req.user.staffId;
    if (me == null) {
      return res.status(403).json({ error: "Only employees can pick up shifts" });
    }
    const post = await Request.findById(req.params.id).lean();
    if (!post || post.type !== "pickup") return res.status(404).json({ error: "Not found" });
    if (post.staffId === me) {
      return res.status(400).json({ error: "You can't pick up your own shift" });
    }
    if (post.status !== "open") {
      return res.status(409).json({ error: "Someone already picked this shift up", status: post.status });
    }
    if (post.date < earliestBoardDate()) {
      return res.status(400).json({ error: "That day has already passed" });
    }

    // Can't take hours you're already working.
    const range = post.requesterShift;
    const clash = (await shiftsOn(post.date, me)).find(sh => overlaps(sh, range));
    if (clash) {
      return res.status(409).json({ error: "You're already working during those hours" });
    }

    const request = await Request.findOneAndUpdate(
      { _id: req.params.id, type: "pickup", status: "open", staffId: { $ne: me } },
      { status: "pending", targetStaffId: me, targetName: req.user.name },
      { new: true, runValidators: true },
    );
    if (!request) {
      return res.status(409).json({ error: "Someone already picked this shift up" });
    }

    // Allowed over the weekly limit — the manager decides — but they're told.
    let overLimit = null;
    const person = await Staff.findById(me).lean();
    if (person?.maxHoursPerWeek != null) {
      const hours = (await weekHours(post.date, me)) + (range.end - range.start);
      if (hours > person.maxHoursPerWeek) {
        overLimit = { hours: Math.round(hours * 10) / 10, cap: person.maxHoursPerWeek };
      }
    }

    await notifyPickupClaimed(request, overLimit);
    res.json(request);
  } catch (err) {
    sendWriteError(res, err);
  }
});

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
      //
      // A shift board post is the exception: it can only come down while it's
      // still 'open'. Once someone has picked it up it's the manager's call.
      filter = {
        _id: req.params.id,
        staffId: req.user?.staffId ?? null,
        $or: [
          { type: { $ne: "pickup" }, status: { $in: WAITING_STATES } },
          { type: "pickup", status: "open" },
        ],
      };
    } else if (isManagerDecision) {
      if (req.user?.role !== "manager") {
        return res.status(403).json({ error: "Manager access required" });
      }
      filter = { _id: req.params.id, status: "pending" };

      // A denied pickup goes back on the board for someone else — the denial
      // was about who'd take it, not about the poster giving it up.
      if (status === "denied") {
        const reopened = await Request.findOneAndUpdate(
          { _id: req.params.id, status: "pending", type: "pickup" },
          { status: "open", targetStaffId: null, targetName: null },
          { new: true, runValidators: true },
        );
        if (reopened) return res.json(reopened);
      }
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
      if (isWithdrawal && existing.type === "pickup" && existing.status === "pending"
        && existing.staffId === req.user?.staffId) {
        return res.status(409).json({
          error: "Someone already picked this shift up — it's with the manager now.",
          status: existing.status,
        });
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
