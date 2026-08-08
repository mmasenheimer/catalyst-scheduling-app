"use strict";

// Who may see a notification, and who may act on one.
//
// These two functions are the whole of notification scoping. That matters more
// than their size suggests: notifications carry the Approve/Deny controls for
// the request pipeline, so a mistake here does not merely leak text — it decides
// who can act on somebody else's shift request.
//
// They live in their own module, free of express and mongoose, so they can be
// tested directly rather than through the HTTP layer. See
// notificationAccess.test.js.
//
// Visibility follows who a notification is addressed to:
//   'all'      → everyone
//   'manager'  → the manager (request submissions, availability submissions)
//   [staffId]  → only those employees
//
// The manager deliberately does NOT receive employee-addressed notifications.
// They used to get everything except type 'approval', which meant every
// per-employee notice — including schedule changes the manager made themselves —
// landed back in their own inbox.

/** Mongo filter selecting exactly what this viewer may see. */
function addressedToFilter({ role, staffId }) {
  return role === "manager"
    ? { $or: [{ recipients: "all" }, { recipients: "manager" }] }
    : { $or: [{ recipients: "all" }, { recipients: staffId }] };
}

/**
 * The same rule against a document already in hand — used to decide whether the
 * caller may mark one read or delete it.
 *
 * Note the final `return false`: anything whose `recipients` is not one of the
 * three understood shapes is visible to nobody. `recipients` is Mixed, so a
 * malformed value is possible, and refusing is the safe direction — an
 * unreachable notification is a nuisance, one readable by everyone is a leak.
 */
function isAddressedTo(notif, { role, staffId }) {
  const { recipients } = notif;
  if (recipients === "all") return true;
  if (recipients === "manager") return role === "manager";
  if (Array.isArray(recipients)) {
    // `staffId != null` is load-bearing, not defensive noise. A manager's
    // staffId is null, and `[null].includes(null)` is true — so without this a
    // manager matches any notification stored as `recipients: [null]`, which
    // addressedToFilter would never have shown them. That mismatch is the
    // dangerous shape: invisible in the list, yet actionable by id.
    return staffId != null && recipients.includes(staffId);
  }
  return false;
}

module.exports = { addressedToFilter, isAddressedTo };
