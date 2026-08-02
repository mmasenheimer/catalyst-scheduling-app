"use strict";
const Notification = require("../models/Notification");
const { formatTime, formatDayLabel } = require("./scheduleDiff");

// Server-authored notifications for the request pipeline.
//
// Why these don't come from the client: the notification a request produces is
// addressed to somebody *else* — a coworker, or the manager — and carries a
// `requestId`, which is what puts Approve/Deny buttons on the manager's card.
// Letting the submitter write that text means an employee can put any words they
// like above the manager's Approve button, and name anyone as the sender.
//
// So the text is generated here, from the Request document the server just wrote,
// at the moment of the state transition. `POST /api/notifications` refuses
// `requestId` outright for the same reason — only this module sets it.
//
// Emitting is deliberately best-effort: a request transition that succeeded must
// not be reported as failed because a notification insert didn't land.

const TYPE_LABEL = { time_off: "drop shift", cover: "cover", swap: "swap" };

// A day can hold more than one shift, so naming the hours is the difference
// between "cover my Tuesday" and something the reader can actually act on.
// Falls back to a bare "shift" for requests written before shifts were named.
const shiftPhrase = shift =>
  shift ? `${formatTime(shift.start)}–${formatTime(shift.end)} shift` : "shift";

async function emit(fields) {
  try {
    return await Notification.create(fields);
  } catch (err) {
    console.error("Notification insert failed:", err.message);
    return null;
  }
}

/**
 * A request was just created. A drop-shift goes straight to the manager; a
 * cover/swap goes to the coworker it names, who has to accept before the manager
 * ever sees it.
 */
async function notifyRequestSubmitted(request) {
  const {
    type, staffId, staffName, targetName, targetStaffId, dayLabel, note,
    requesterShift, targetShift,
  } = request;
  const quoted = note ? ` "${note}"` : "";
  const mine = shiftPhrase(requesterShift);

  if (type === "time_off") {
    await emit({
      requestId: String(request._id),
      type: "coverage",
      title: "Drop Shift Request",
      message: `${staffName} requested to drop their ${dayLabel} shift.${quoted}`,
      from: staffName,
      recipients: "manager",
    });
  } else {
    await emit({
      requestId: String(request._id),
      type: "shift_change",
      title: type === "cover" ? "Cover Request" : "Swap Proposal",
      message:
        type === "cover"
          ? `${staffName} asked you to cover their ${mine} on ${dayLabel}.${quoted} Accept to send it to the manager for approval.`
          : `${staffName} offered their ${mine} on ${dayLabel} for your ${shiftPhrase(targetShift)}.${quoted} Accept to send it to the manager for approval.`,
      from: staffName,
      recipients: [targetStaffId],
    });
  }

  // The requester's own copy. Partly a receipt — every other notification about
  // this request goes to somebody else, so without it they have no evidence it
  // sent — and partly the surface their Withdraw button lives on, since it
  // carries the requestId the notification card keys off.
  return emit({
    requestId: String(request._id),
    type: "shift_change",
    title: "Request Sent",
    message:
      type === "time_off"
        ? `Your drop-shift request for ${dayLabel} was sent to the manager.`
        : `Your ${type} request for ${dayLabel} was sent to ${targetName}. You'll hear back once they respond.`,
    from: staffName,
    recipients: [staffId],
  });
}

/**
 * The requester took it back. Told to whoever was actually waiting on it: the
 * coworker if it never got past them, the manager once it had — plus the coworker
 * in that case, since they'd already agreed to something that's now off.
 */
async function notifyRequestWithdrawn(request, previousStatus) {
  const { type, staffName, targetName, targetStaffId, dayLabel } = request;
  const label = TYPE_LABEL[type] ?? type;

  if (previousStatus === "pending_peer") {
    return emit({
      requestId: String(request._id),
      type: "shift_change",
      title: "Request Withdrawn",
      message: `${staffName} withdrew their ${label} request for ${dayLabel} — no action needed.`,
      from: staffName,
      recipients: [targetStaffId],
    });
  }

  // It had already reached the manager's desk.
  await emit({
    requestId: String(request._id),
    type: "shift_change",
    title: "Request Withdrawn",
    message: `${staffName} withdrew their ${label} request for ${dayLabel} before it was approved.`,
    from: staffName,
    recipients: "manager",
  });

  if (targetStaffId != null) {
    return emit({
      requestId: String(request._id),
      type: "shift_change",
      title: "Request Withdrawn",
      message: `${staffName} withdrew the ${label} request for ${dayLabel} that you accepted — you're no longer covering it.`,
      from: staffName,
      recipients: [targetStaffId],
    });
  }
  return null;
}

/**
 * The named coworker accepted. Two people need to know: the manager, because it
 * has just landed on their desk, and the requester, because their ask went
 * through. Only the manager's copy carries Approve/Deny.
 */
async function notifyPeerAccepted(request) {
  const { type, staffId, staffName, targetName, dayLabel, requesterShift, targetShift } = request;
  // The manager is about to move specific hours, so the card has to say which.
  const mine = shiftPhrase(requesterShift);
  const theirs = shiftPhrase(targetShift);

  await emit({
    requestId: String(request._id),
    type: "shift_change",
    title: type === "cover" ? "Cover Request" : "Swap Proposal",
    message:
      type === "cover"
        ? `${targetName} accepted ${staffName}'s ${mine} on ${dayLabel}. Approve to apply it to the schedule.`
        : `${targetName} accepted a swap on ${dayLabel}: ${staffName}'s ${mine} for ${targetName}'s ${theirs}. Approve to apply it to the schedule.`,
    from: targetName,
    recipients: "manager",
  });

  return emit({
    requestId: String(request._id),
    type: "shift_change",
    title: "Request Accepted",
    message: `${targetName} accepted your ${TYPE_LABEL[type]} request for ${dayLabel}. It's now waiting on manager approval.`,
    from: targetName,
    recipients: [staffId],
  });
}

/** The coworker said no. Terminal — the manager is never asked. */
async function notifyPeerDeclined(request) {
  const { type, staffId, targetName, dayLabel } = request;
  return emit({
    requestId: String(request._id),
    type: "shift_change",
    title: "Request Declined",
    message: `${targetName} declined your ${TYPE_LABEL[type]} request for ${dayLabel}.`,
    from: targetName,
    recipients: [staffId],
  });
}

// ── Event assignments ─────────────────────────────────────────────────────────

/** "Thu, Jul 23", "Thu, Jul 23 and 2 more dates", plus a note if it recurs. */
function describeWhen(event) {
  const days = event.days ?? [];
  const first = days.length ? formatDayLabel(days[0]) : null;
  const more = days.length > 1 ? ` and ${days.length - 1} more date${days.length > 2 ? "s" : ""}` : "";
  const recurs = event.repeating ? ", repeating weekly" : "";
  return first ? `${first}${more}${recurs}` : "an unscheduled date";
}

/**
 * Somebody was put on an event.
 *
 * Raised from the route rather than the editor so it fires however the assignment
 * happened — dragging an event onto a row, picking staff while creating it, or
 * anything added later. Being handed an event is a commitment with a time
 * attached, so the message carries the name, the date and the hours; "you've been
 * assigned to something" would just prompt a trip to the schedule to find out
 * what.
 *
 * One notification per person: they're addressed individually so each reads as
 * their own, and so dismissing one doesn't clear it for everybody else.
 */
async function notifyEventAssigned(event, staffIds) {
  const ids = (staffIds ?? []).filter(id => Number.isInteger(id));
  if (ids.length === 0) return null;

  const message =
    `You've been assigned to "${event.name}" on ${describeWhen(event)}`
    + `, ${formatTime(event.start)}–${formatTime(event.end)}.`;

  return Promise.all(ids.map(id => emit({
    type: "event_assigned",
    title: "Assigned to an Event",
    message,
    from: "Manager",
    recipients: [id],
  })));
}

/**
 * Somebody came off an event.
 *
 * Worth saying for the same reason the assignment was: they may have planned
 * around it. It also covers a case nothing else announces — approving a cover or
 * swap releases the requester from events their remaining shifts no longer reach,
 * and the approval message only talks about shifts, so without this the event
 * quietly disappears from their schedule.
 *
 * `reason` distinguishes being taken off from the whole event being called off,
 * which read identically from the schedule but are not the same news.
 */
async function notifyEventUnassigned(event, staffIds, reason = "removed") {
  const ids = (staffIds ?? []).filter(id => Number.isInteger(id));
  if (ids.length === 0) return null;

  const when = describeWhen(event);
  const cancelled = reason === "cancelled";
  const message = cancelled
    ? `"${event.name}" on ${when} was cancelled — you're no longer assigned to it.`
    : `You're no longer assigned to "${event.name}" on ${when}.`;

  return Promise.all(ids.map(id => emit({
    type: "event_unassigned",
    title: cancelled ? "Event Cancelled" : "Removed from an Event",
    message,
    from: "Manager",
    recipients: [id],
  })));
}

module.exports = {
  notifyRequestSubmitted,
  notifyPeerAccepted,
  notifyPeerDeclined,
  notifyRequestWithdrawn,
  notifyEventAssigned,
  notifyEventUnassigned,
};
