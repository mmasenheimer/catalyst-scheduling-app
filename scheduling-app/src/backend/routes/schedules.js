"use strict";
const router = require("express").Router();
const Schedule = require("../models/Schedule");
const Notification = require("../models/Notification");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");
const {
  formatDayLabel, diffStaffShifts, describeChange, messageFromDetails,
} = require("../utils/scheduleDiff");

// Publishing a whole week ("Finalize All") sends seven separate requests in
// quick succession. Rather than seven notifications per person, changes landing
// inside this window fold into the person's existing unread notification.
const MERGE_WINDOW_MS = 5 * 60 * 1000;

// Losing a shift isn't the same news as having one moved, so the two are kept
// apart. The notification's chip is driven by its `type`, and a single card can
// only carry one label — merging a removal into a "Shift Change" card would file
// a cancelled shift under a heading that doesn't describe it.
//
// Scoped by title as well as type, because the cover/swap approval flow also
// uses 'shift_change' and its notifications must not absorb these lines.
const BUCKETS = {
  removed: { type: "shift_removed", title: "Shift Removed" },
  other:   { type: "shift_change",  title: "Schedule Updated" },
};
const bucketFor = kind => (kind === "removed" ? BUCKETS.removed : BUCKETS.other);

async function notifyScheduleChanges(date, beforeStaff, afterStaff) {
  const changes = diffStaffShifts(beforeStaff, afterStaff);
  if (changes.length === 0) return;

  const dayLabel = formatDayLabel(date);
  const since = new Date(Date.now() - MERGE_WINDOW_MS);
  const isThisDay = line => line.startsWith(`${dayLabel}:`);

  for (const change of changes) {
    const detail = describeChange(change, dayLabel);
    const bucket = bucketFor(change.kind);
    const other = bucket === BUCKETS.removed ? BUCKETS.other : BUCKETS.removed;

    // A shift moved and then removed inside the same window would otherwise leave
    // both statements standing in different cards, which contradict each other.
    // The newer one wins, so strip this day from the bucket it isn't going in.
    const stale = await Notification.findOne({
      type: other.type,
      title: other.title,
      recipients: change.staffId,
      read: false,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });
    if (stale) {
      const kept = (stale.details ?? []).filter(d => !isThisDay(d));
      if (kept.length === 0) {
        await stale.deleteOne();
      } else if (kept.length !== (stale.details ?? []).length) {
        stale.details = kept;
        stale.message = messageFromDetails(kept);
        await stale.save();
      }
    }

    const existing = await Notification.findOne({
      type: bucket.type,
      title: bucket.title,
      recipients: change.staffId,
      read: false,
      createdAt: { $gte: since },
    }).sort({ createdAt: -1 });

    if (existing) {
      // Replacing an earlier line for the same day keeps repeated edits to one
      // day from stacking up duplicates.
      const details = [...(existing.details ?? []).filter(d => !isThisDay(d)), detail];
      existing.details = details;
      existing.message = messageFromDetails(details);
      existing.createdAt = new Date();
      await existing.save();
    } else {
      await Notification.create({
        type: bucket.type,
        title: bucket.title,
        message: messageFromDetails([detail]),
        details: [detail],
        from: "Manager",
        recipients: [change.staffId],
      });
    }
  }
}

// GET /api/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD
// Bulk-fetch saved schedules across a date range, so a view spanning many days
// (a month calendar, a week strip) needs one request instead of one per day.
// Declared before /:date — a bare "/" can't match that param route anyway, but
// keeping the specific-to-general order explicit avoids future surprises.
router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    }
    // `date` is a YYYY-MM-DD string, which sorts lexicographically the same way
    // it sorts chronologically, so a plain string range works here.
    const schedules = await Schedule.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 });
    res.json(schedules);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// GET /api/schedules/:date
// This runs when the frontend loads a day's schedule

router.get("/:date", async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ date: req.params.date });

    if (!schedule) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(schedule);
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PUT /api/schedules/:date
// Runs when the manager clicks Finalize, and also whenever the day
// auto-unfinalizes itself after an edit (finalized: false in that case).
//
// Concurrency: a save replaces the entire day, so two clients writing the same
// date don't merge — the later one discards everything the earlier one did. The
// client therefore sends `expectedVersion`, the version it loaded, and the write
// only lands if that's still current. Otherwise it's a 409 carrying the current
// version, and the client can tell the manager rather than losing their work.
//
// Omitting `expectedVersion` skips the check. That's for callers that genuinely
// mean "overwrite whatever is there", and it keeps older clients working.

router.put("/:date", requireManager, async (req, res) => {
  try {
    const { staff, events, finalized, suppressNotify, expectedVersion } = req.body;
    const date = req.params.date;
    const isPublishing = finalized ?? true;

    // Read the previously published snapshot before we overwrite it.
    const previous = await Schedule.findOne({ date }).lean();

    const update = {
      $set: { staff, events, finalized: isPublishing, finalizedAt: new Date() },
      $inc: { version: 1 },
    };
    // Publishing sets the new baseline that future changes are measured against.
    //
    // Not when the caller suppressed notifications, though. `suppressNotify` means
    // "don't announce this change" — it does not mean "consider it announced".
    // Advancing the baseline anyway made the change permanently invisible: an
    // approved cover request removes the requester's shift with suppressNotify
    // set (the approval sends its own message instead), and that write used to
    // record them as having no shift in lastPublishedStaff. Every later Finalize
    // then compared empty against empty, found nothing, and stayed silent — so a
    // subsequent manual deletion was never reported to anyone.
    //
    // Leaving the baseline alone keeps the change pending until a save that
    // genuinely publishes it, which is the one that should carry the news.
    if (isPublishing && !suppressNotify) update.$set.lastPublishedStaff = staff;

    const checkVersion = Number.isInteger(expectedVersion);
    const filter = { date };
    if (checkVersion) {
      // Rows written before `version` existed have no such field, and Mongo won't
      // match a missing field against 0 — so spell both out or every save against
      // existing data would report a phantom conflict.
      filter.$and = [
        expectedVersion === 0
          ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
          : { version: expectedVersion },
      ];
    }

    let schedule;
    try {
      schedule = await Schedule.findOneAndUpdate(filter, update, {
        // Upsert stays on: a day being scheduled for the first time has no row
        // yet. With the version guard, a concurrent create instead collides on
        // the unique `date` index, which is caught below as the conflict it is.
        upsert: true,
        new: true,
        runValidators: true,
      });
    } catch (err) {
      // The filter didn't match, so the upsert tried to insert and collided with
      // the unique `date` index. That means the row exists at a version we didn't
      // expect — the same lost race as the null case below, reached by a
      // different route, so it gets the same answer.
      if (err?.code === 11000 && checkVersion) {
        const now = await Schedule.findOne({ date }).lean();
        return res.status(409).json({
          error: "This day was changed by someone else while you were editing.",
          currentVersion: now?.version ?? 0,
        });
      }
      throw err;
    }

    if (!schedule) {
      // The date exists but at a different version — somebody saved in between.
      const now = await Schedule.findOne({ date }).lean();
      return res.status(409).json({
        error: "This day was changed by someone else while you were editing.",
        currentVersion: now?.version ?? 0,
      });
    }

    // Tell affected employees what changed about *their* shifts. Only fires on
    // publish, and only when this day was published before — the first publish
    // establishes the schedule rather than changing it, so it shouldn't notify
    // the whole roster. `suppressNotify` is set by callers that already send
    // their own notification (approving a cover/swap request), so the employee
    // doesn't hear about the same change twice.
    if (isPublishing && !suppressNotify && previous?.lastPublishedStaff) {
      try {
        await notifyScheduleChanges(date, previous.lastPublishedStaff, staff);
      } catch (err) {
        // A notification failure must never fail the save itself.
        console.error("Schedule change notifications failed:", err.message);
      }
    }

    res.json(schedule);
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
