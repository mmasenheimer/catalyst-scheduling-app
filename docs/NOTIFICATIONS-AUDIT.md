# Notifications System — Bug Audit

Audit only; no code changed. Findings marked **[verified]** were reproduced
against the live backend. Probes created only `ZZ Notif` rows and deleted them.
No real notification was modified.

---

## Executive Summary

**Confirmed bugs: 3.** 0 critical, 0 high, 2 medium, 1 low.
**Potential issues needing verification: 2.**
**Attacks attempted and repelled: 11 of 11.**

**Is it safe to use?** Yes, from a security standpoint — comfortably. Every
attempt to read, tamper with, or forge a notification failed. An employee cannot
see another employee's notifications, cannot see the manager's, cannot mark or
dismiss anything that isn't theirs, cannot choose the name a notification appears
under, cannot address one to a peer or broadcast, and cannot attach a
`requestId` — which is what drives the Approve/Deny buttons.

**Most dangerous issue:** none is a security hole. The one with real teeth is
**an unpaginated fetch on a 45-second poll over a collection nothing prunes**.
At the current rate that reaches roughly **1 MB per poll after 90 days and 3.9 MB
after a year** [verified by measurement], per logged-in user.

**Scope note.** This subsystem was hardened earlier — `from` derived from the
session, `requestId` refused from clients, employees restricted to addressing the
manager — and that work holds up under direct attack. The remaining findings are
all about *lifecycle*: nothing limits how many notifications can be created, how
long they live, or how many are sent at once.

**Two corrections to my own process.** My first pass flagged "notifications
addressed to staff who no longer exist" as a data-hygiene bug. The two rows were
`recipients: [99999]`, dated today, titled "Assigned to an Event" — residue from
*my own* event-validation probe earlier in the session. The staff delete cascade
is intact (`$pull` then delete-if-empty). I removed the rows and dropped the
finding.

Separately, the shared-manager-row finding originally cited "42 rows" as
evidence; that was also my probe's data, counted before cleanup. The real figure
is zero. The finding survives because the *code paths* are real, but the
supporting number was wrong — see that section. Both cases are the same mistake:
measuring a collection I had just written to.

---

## Architecture

```
WRITERS (server-side, trusted)              WRITER (client, untrusted)
  utils/notify.js                             POST /api/notifications
    notifyRequestSubmitted                      from    ← session, not body
    notifyPeerAccepted / Declined               requestId ← refused outright
    notifyRequestWithdrawn                      type    ← enum allowlist
    notifyEventAssigned / Unassigned            recipients: employees may
  routes/schedules.js                                       address 'manager'
    notifyScheduleChanges (diff vs                          ONLY
      lastPublishedStaff, 5-min merge)
                    │
              Notification
                { type, title, message, from,
                  recipients: 'all' | 'manager' | [staffId],
                  requestId, details[], read, createdAt }
                    │
        GET /api/notifications
          addressedToFilter(req.user)   ← server-side scoping, not UI filtering
          manager → 'all' | 'manager'
          employee → 'all' | their own staffId
                    │
          NotificationsContext
            useLiveRefetch: mount + tab focus + every 45s
                    │
             NotificationsPage
               Approve/Deny (manager, status 'pending')
               Accept/Decline (peer, status 'pending_peer')
```

**Authorization model.** One function, `addressedToFilter`, builds the query for
reads; a second, `isAddressedTo`, gates writes on a document already in hand.
Both derive identity from `req.user`, which `requireAuth` populates from the
database. The manager deliberately does *not* receive employee-addressed
notifications — a deliberate change, per the comment, because they previously
received everything including their own schedule edits echoed back.

---

## Confirmed Bugs

### [MEDIUM] The notification list is unpaginated and never pruned — ✅ FIXED

> **Fixed, both halves.**
>
> `GET /api/notifications` now takes `.limit(200)` — roughly a week of the
> manager's traffic, and the payload is bounded at ~40 KB no matter how large the
> collection grows [verified with 260 rows planted: 200 returned, newest first].
>
> `createdAt` now carries a TTL of 90 days, so Mongo expires old rows itself with
> no application code. Adding it needed the existing plain index dropped first —
> Mongoose cannot change an index's options in place; it sees the key already
> indexed, leaves it alone, and the TTL silently never takes effect. That is what
> `npm run migrate:notif-ttl` exists for. It reports before acting, is idempotent,
> and was applied to the live database with **0 rows past the cutoff**, so nothing
> was deleted.
>
> Verified 14/14, including that employees still see only their own, nothing
> leaked across the cap, and create/read/dismiss all still work.
>
> One accepted trade-off, noted in the code: the unread badge counts what the
> endpoint returns, so a viewer sitting on more than 200 unread would see the
> count plateau. That needs a genuinely abandoned account.

**Location:**
- File: `src/backend/routes/notifications.js`, `router.get("/")`, line ~34
- Also: `src/frontend/hooks/useLiveRefetch.js`, `POLL_MS = 45 * 1000`

**What happens:** The read returns every notification the caller may see, with
no limit, no pagination and no date window:

```js
const list = await Notification.find(addressedToFilter(req.user)).sort({ createdAt: -1 });
res.json(list);
```

Nothing anywhere deletes an old notification. `NotificationsContext` refetches on
mount, on tab focus, and every 45 seconds while the tab is visible.

**[verified]** Measured against the live collection:

```
132 rows = 48 KB  (376 bytes each)
projected at ~30/day:
   after  90 days:  2,700 rows ≈ 1.0 MB per fetch
   after 365 days: 10,950 rows ≈ 3.9 MB per fetch
```

Thirty per day is this database's own observed rate on active days
[verified: 29, 26, 30, 32 on the four busiest].

**Why it is wrong:** The payload grows without bound while the fetch frequency
stays constant. A year in, every logged-in browser pulls roughly 4 MB every 45
seconds, and the manager — who receives every request and every availability
submission — accumulates fastest.

**Trigger condition:** Time. No unusual usage required.

**Impact:** Gradual: a slower notifications page, then a visibly slow one, then
noticeable data usage for anyone on a phone. It also falls on Atlas's shared-tier
bandwidth. Nothing breaks abruptly, which is precisely why it will not get
noticed until it is annoying.

**Root cause:** The read was written when the collection was small and no
retention policy was ever added.

**Recommended fix:** Two independent halves. Cap the read — `.limit(200)` with
the existing `createdAt` index already in place is enough, since nobody scrolls
a year back. Separately, expire old rows: a Mongo TTL index on `createdAt`
(`expireAfterSeconds: 90 * 86400`) prunes them server-side with no application
code. Keep `read: true` rows for a shorter window than unread ones if you want to
be gentler.

**Confidence:** High.

---

### [MEDIUM] Manager notifications are a single shared row

**Location:** `src/backend/routes/notifications.js`, `addressedToFilter` /
`isAddressedTo`; every `recipients: "manager"` writer in `utils/notify.js`.

**What happens:** A notification for the manager is stored once with
`recipients: "manager"` — a role, not a person. Every manager account matches it.
`read` and deletion are properties of that one row.

**[verified]** Four code paths write `recipients: "manager"` —
`notifyRequestSubmitted`, `notifyPeerAccepted`, `notifyRequestWithdrawn`, and
the availability submission from `AvailabilityPage`. The manager's read filter
matches them with `{ $or: [{recipients: 'all'}, {recipients: 'manager'}] }`.

**Correction:** an earlier draft of this report claimed "42 rows currently carry
`recipients: 'manager'`". That number was my own probe's data, counted before its
cleanup ran — 1 planted row, 1 from-name test, and 40 spam-test rows. The live
collection currently holds **zero** manager-addressed notifications; all 132 are
addressed to individual staff ids. The finding stands on the code paths above,
not on that count.

**Why it is wrong:** With one manager the model is exactly right. With more, the
row is shared state: whoever dismisses a pending cover request removes it from
*every* manager's list, and whoever opens it marks it read for all of them. The
request itself is untouched and still waiting — only the prompt disappears — so
the failure mode is a request that silently stops being visible to anyone.

**Trigger condition:** A second manager account. Not yet true — there is
currently exactly one [verified] — which is why this is MEDIUM rather than HIGH,
but the plan to add two more makes it imminent.

**Impact:** A pending request can vanish from every manager's queue because one
of them tidied up. There is no undo and no indication it happened.

**Root cause:** `recipients` conflates "who should see this" with "who has dealt
with it". Those are the same thing for an individual and different for a role.

**Recommended fix:** Cheapest correct version — keep the single row but track
`readBy: [userId]` and `dismissedBy: [userId]` instead of a scalar `read`, and
filter per viewer. That preserves one canonical notification while giving each
manager their own state. Fanning out one row per manager at write time also
works and is simpler to query, at the cost of duplicating every write.

**Confidence:** High.

---

### [LOW] Notification creation is unrestricted

**Location:** `src/backend/routes/notifications.js`, `router.post("/")`. No rate
limiter is applied — `api.js` limits `/api/auth/login` only.

**What happens:** [verified] Forty notifications created from one employee
account in 864ms, all accepted.

**Why it is wrong:** Everything *about* each notification is validated —
type, length, addressee, `from`, `requestId` — but not how many. The endpoint is
the only client-writable path into a collection that nothing prunes.

**Trigger condition:** Any authenticated employee, deliberately.

**Impact:** Bounded by what the endpoint permits, which is why this is LOW: an
employee may address the manager and nobody else, so the worst case is burying
the manager's queue and inflating the collection — which compounds the first
finding. No other user is affected and nothing is corrupted.

**Recommended fix:** An `express-rate-limit` instance on this route, sized
generously — the legitimate client sends one notification per user action, so
even 30/minute would never be reached in normal use.

**Confidence:** High.

---

## Potential Issues / Needs Verification

**1. The 5-minute merge window versus the 45-second poll.** `schedules.js` merges
schedule-change notifications for the same person within five minutes by
rewriting the existing row's `details`. A client that polled during that window
holds the pre-merge copy; whether the next poll reconciles cleanly, or the user
briefly sees a notification that then changes underneath them, I did not test.

**2. Notification writes are not transactional with the change they describe.**
`notifyEventAssigned` runs after the event write succeeds, unawaited in places.
If it throws, the schedule change stands but nobody is told. I saw no evidence
of this happening; establishing it needs fault injection.

---

## What was attacked and held

| Attack (as an employee) | Result |
|---|---|
| Read a notification addressed to another employee | not returned |
| Read manager-only notifications | not returned |
| Mark another employee's as read | 403 |
| Dismiss another employee's | 403 |
| Dismiss the manager's | 403 |
| Attach a `requestId` (drives Approve/Deny) | 400 |
| Set the `from` name to "Manager" | overwritten with real name |
| Address a notification to another employee | 403 |
| Broadcast to everyone | 403 |
| Invent a notification `type` | 400 |
| Send a 50 KB message | 400 |

---

## Missing Test Coverage

None of this is tested. In order of value:

1. **`addressedToFilter` and `isAddressedTo`** — pure functions over
   `{role, staffId}` and a recipients value. The entire authorization model, and
   trivially testable.
2. **The POST allowlist** — each rejection above as a case.
3. **The 5-minute merge** in `notifyScheduleChanges` — that a second change
   inside the window appends to `details` rather than creating a row, and a later
   one starts fresh.
4. **Per-viewer read state**, once the shared-row finding is addressed.

---

## Recommended Fix Order

1. **`.limit(200)` on the read.** One line, removes the growth problem's sharp
   edge immediately.
2. **TTL index on `createdAt`.** Fixes it at the source, no application code.
3. **Per-manager read/dismiss state** — before the second and third manager
   accounts exist, not after.
4. Rate-limit the POST.

Items 1 and 2 together are perhaps twenty minutes and retire the only finding
that gets worse on its own.

---

## Overall Assessment

**A− — Robust.**

The security model is genuinely well built and it is the part that matters most
here, because notifications carry the Approve/Deny controls for the request
pipeline. Scoping happens in the database query rather than the interface, so
there is nothing to bypass client-side. Identity for `from` is taken from the
session. `requestId` is refused outright from clients, which is what stops an
employee attaching plausible words to a live approval button. Eleven attacks,
eleven rejections, several of them things this codebase had wrong earlier and
fixed.

It is not an A because of lifecycle rather than correctness: the collection has
no ceiling, the read has no limit, and the poll never slows down. Those three
compound, and the trajectory is measurable rather than hypothetical — 1 MB per
poll at 90 days, 3.9 MB at a year. The shared manager row is correct today and
becomes wrong the moment a second manager exists, which is a scheduled event
rather than a risk.
