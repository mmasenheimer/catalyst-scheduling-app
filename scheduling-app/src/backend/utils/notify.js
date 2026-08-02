"use strict";
const Notification = require("../models/Notification");

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
  const { type, staffId, staffName, targetName, targetStaffId, dayLabel, note } = request;
  const quoted = note ? ` "${note}"` : "";

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
          ? `${staffName} asked you to cover their ${dayLabel} shift.${quoted} Accept to send it to the manager for approval.`
          : `${staffName} proposed swapping shifts with you on ${dayLabel}.${quoted} Accept to send it to the manager for approval.`,
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
  const { type, staffId, staffName, targetName, dayLabel } = request;

  await emit({
    requestId: String(request._id),
    type: "shift_change",
    title: type === "cover" ? "Cover Request" : "Swap Proposal",
    message:
      type === "cover"
        ? `${targetName} accepted ${staffName}'s request to cover their ${dayLabel} shift. Approve to apply it to the schedule.`
        : `${targetName} accepted ${staffName}'s shift swap for ${dayLabel}. Approve to apply it to the schedule.`,
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

module.exports = {
  notifyRequestSubmitted,
  notifyPeerAccepted,
  notifyPeerDeclined,
  notifyRequestWithdrawn,
};
