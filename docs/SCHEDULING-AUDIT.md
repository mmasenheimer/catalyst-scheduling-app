# Scheduling System — Bug Audit (pass 2)

Audit only; no code changed in this pass. Findings marked **[verified]** were
reproduced by running the real code. Probes wrote only to `2099-*` dates and
`ZZ Audit2` names, all deleted.

> **Note:** the pass-1 audit document was deleted from disk and had never been
> committed, so it is unrecoverable. This file is a fresh pass. Where a pass-1
> finding was fixed earlier today, it is listed under _Previously Fixed_ with the
> verification that was run, rather than re-reported as new.

---

## Executive Summary

**New confirmed bugs this pass: 5.** 1 high, 3 medium, 1 low.
**Potential issues needing verification: 3.**
**Previously fixed and re-verified: 7.**

**Is it safe to use?** For the managers' sandbox on disposable data, yes. For real
staff schedules, **nearly** — the one high-severity finding requires a
deliberately crafted API request rather than ordinary use, but its outcome is a
shift that silently disappears from the roster while the audit trail shows a
normally approved cover.

**Most dangerous issue:** a **self-targeted cover request deletes the shift**.
An employee files a cover request naming themselves as the coverer, accepts it
themselves (they are the target), the manager sees an ordinary request and
approves — and the shift is stripped from the requester and never re-added to
anyone. [verified]

**Scope note.** The interval and overlap mathematics remain correct and
consistent — half-open `a.start < b.end && a.end > b.start` throughout, point
tests as `start <= h && end > h`. I could not construct a false conflict or a
missed one. As in pass 1, the bugs are in **input validation**, **identity
assumptions**, and **concurrency**, not in the scheduling arithmetic.

---

## Scheduling Architecture

```
EMPLOYEE writes                    MANAGER writes
  AvailabilityPage                   DailySchedulePage ─┐
  ShiftRequestPage                   WeeklyViewPage     ├─ drag/drop editors
  RequestTimeOffPage                 WeeklyTemplatesPage┘
       │                                    │
  PUT /availability/:staffId          PUT /schedules/:date
  POST /requests   ← ONLY employee     POST/PATCH /events
                     schedule-write     POST/PATCH /templates
       │             path                  │
  validateAvailabilityDays()          validateScheduleStaff()   ← added today
  (no date validation)  ← FINDING 2   validateEventFields()
       │                              validateTemplateShape()
       │                                    │
       └──────────────┬─────────────────────┘
                      │
        Request approval (manager)
          RequestsContext.applyScheduleChange
            resolveDay() → fetch the real day
            assertStillMatchesAgreement()
            cover / swap / time_off branches   ← FINDING 1 lives here
                      │
              PUT /schedules/:date
                      │
         frontend/utils/scheduleUtils.js  ← shared core
           shiftsOf / deskShiftsOf        (accessors)
           getStaffCount, buildAlerts     (coverage + warnings)
           isShiftOutsideAvailability     (availability check)
           eventOccursOn                  (recurrence)
           orphanedDeskTurns              (desk invariant)
```

**Time model.** Decimal hours (`13.5` = 1:30pm) on a 0.5 grid, scoped to one day
(`HOURS_START` 7 → `HOURS_END` 20). Dates are local `YYYY-MM-DD` strings from
`toDateStr()`. No UTC conversion, no `toISOString()` in scheduling paths,
deliberately timezone-naive. Defensible: Arizona does not observe DST.

**Concurrency.** `Schedule` writes carry an optimistic `version` precondition
(409 on mismatch). `Event` and `Template` writes have **none** — see finding 3.
Request transitions are atomic (precondition inside the update filter).

**No background jobs, queues, caching layer, or external scheduling services.**

---

## Confirmed Bugs

### [HIGH] A self-targeted cover request silently deletes the shift — ✅ FIXED

> **Fixed at two layers, and the scope turned out to be wider than written
> below: the `swap` branch is affected too, differently.**
>
> Potential issue 1 is resolved — a self-targeted *swap* naming two of the
> person's own shifts leaves one **duplicated** and the other gone
> [verified: `[[14,18],[14,18]]`, and 8–11 lost]. A duplicate shift also
> double-counts toward weekly hour totals.
>
> **The recommended fix below was wrong on one point.** Making the mapping
> "order-independent" would not help: there is no correct schedule to compute
> from "cover for yourself", so any ordering just picks a different wrong
> answer. The code now *refuses* rather than guessing.
>
> - `POST /api/requests` rejects `targetStaffId === staffId` with 400,
>   *"You can't ask yourself to cover or swap a shift."*
> - `assertNotSelfTargeted` in `RequestsContext` refuses at approval, covering
>   rows stored before the guard existed. Placed **before** the status write, so
>   a refusal leaves the request still decidable.
>
> Verified 11/11: cover and swap both refused, for employees and managers alike;
> ordinary cover, swap and drop requests unaffected; the stored-row guard fires
> with a message telling the manager what to do; and the guard provably precedes
> the status write. Zero self-targeted rows existed in the database.

**Location:**
- File: `src/frontend/context/RequestsContext.jsx`
- Function: `applyScheduleChange`, the `req.type === 'cover'` branch
- Lines: ~295–310

**What happens:** The mapping over the day's staff tests two identities in order:

```js
return list.map(s => {
  if (s.id === req.staffId)      return { ...s, shifts: requesterKeeps, ... };  // strips it
  if (s.id === req.targetStaffId) return { ...s, shifts: [...s.shifts, ...handedOver] }; // re-adds it
  return s;
});
```

When `staffId === targetStaffId`, the **first branch returns** and the second is
never reached. The shift is removed from the requester and added to nobody.

**[verified]** Running the exact mapping with a self-targeted request:

```
before:  Michael M. shifts=[[13,18]] desk=[[16,17]]
after:   Michael M. shifts=[]        desk=[]
```

Desk time goes with it, via `coveredBy(requesterKeeps, ...)`.

**Why it is wrong:** The two branches assume distinct people. Nothing enforces
that assumption at any layer — not the API (`POST /requests` accepts
`targetStaffId === staffId` [verified: 201, status `pending_peer`]), not the
model, not the approval path.

**Trigger condition:** An employee POSTs a `cover` request with their own
`staffId` as `targetStaffId`. Because they are the target, they can accept their
own peer stage, promoting it to `pending`. The manager's queue shows an ordinary
cover request. On approval the shift vanishes.

**Example:** Michael (id 15) works 1:00–6:30 on Mon Aug 10 with a 4:00–5:00 desk
turn. He POSTs `{type:'cover', staffId:15, targetStaffId:15, requesterShift:{start:13,end:18.5}}`,
accepts it, the manager approves. Aug 10 now has nobody on that shift and the
desk turn is gone.

**Impact:** A shift silently leaves the roster. The day reports as understaffed
with no explanation, and the request history reads as a normal approved cover —
so the cause is invisible. The UI will not offer you as your own coverer (the
candidate list excludes people already working), so this is not reachable by
misclick; it needs a crafted request.

**Root cause:** Identity assumption encoded as `if/else if` ordering rather than
as a validated precondition.

**Recommended fix:** Reject `targetStaffId === staffId` at `POST /api/requests`
with 400. Additionally make the mapping order-independent — compute the
requester's and target's new shift lists first, then apply both — so the
invariant does not depend on branch order.

**Confidence:** High.

---

### [MEDIUM] Request dates are entirely unvalidated

**Location:**
- File: `src/backend/routes/requests.js`, `router.post("/")`
- Also: `src/backend/models/Request.js` — `date: { type: String, required: true }`

**What happens:** [verified — all stored, status 201]

| `date` sent | Result |
|---|---|
| `"banana"` | stored verbatim |
| `"2026-02-30"` | stored verbatim |
| `"2026-13-45"` | stored verbatim |
| `"2020-01-01"` (past) | stored verbatim |
| `""` | rejected (400) — schema `required` |

**Why it is wrong:** This is the one scheduling write path an **employee** can
reach, so it is the path most in need of validation. `validateDateString` already
exists in `utils/validate.js` and is used by `schedules.js` and `events.js`; it
was simply never applied here.

**Trigger condition:** Any employee POSTing a request with a malformed date.

**Impact:** Two distinct consequences. A nonsense date produces a request that
appears normal in the manager's queue but whose approval fails — the resulting
`PUT /api/schedules/banana` is now rejected by `validateDateString` (added
today), so the failure is contained, but the manager gets an approval that does
not work with no clear reason. A **past** date is worse in a subtler way: it is
well-formed, so approval succeeds and rewrites a historical schedule. The two-week
notice rule in `RequestTimeOffPage` is enforced only client-side.

**Root cause:** Validation added to schedules and events but not to requests.

**Recommended fix:** Apply `validateDateString(date)` in `POST /api/requests`.
Separately consider enforcing the two-week minimum server-side for `time_off`,
since it is a policy the UI already claims to apply.

**Confidence:** High.

---

### [MEDIUM] Events and templates have no concurrency guard — ✅ FIXED (server), templates wired

> **Fixed server-side for both; the template client now sends a version, the
> event client deliberately does not yet.**
>
> `utils/optimisticUpdate.js` holds one `updateWithVersion` helper, used by both
> routes — rather than a third copy of the pattern. `version` added to both
> schemas. A stale write gets 409 with `currentVersion`; `WeeklyTemplatesPage`
> already surfaces `err.message`, so the manager sees the reason with no client
> change.
>
> **Enforced only when `expectedVersion` is sent**, matching `Schedule`. That is
> not laziness — it is required for correctness given how the two clients differ.
> `updateTemplate` is awaited and replaces its local copy from the response, so
> the version it holds is always server-confirmed: safe. `updateEvent` is
> debounced 400ms, fire-and-forget, `.catch(() => {})`, and never reconciles — so
> sending a version there would make things **worse than the bug**. Dragging an
> event bar would fire a PATCH (server → v1), then fire again still holding v0,
> 409 against itself, and swallow the error. The user would silently lose their
> own edit rather than a rival's.
>
> Wiring events properly means reconciling local state from the response and
> serialising per event — a real change to a hot drag path, worth doing on its
> own rather than as a rider here.
>
> Verified 16/16: simultaneous edits give exactly one 200 and one 409 on both
> collections; stale versions refused, current accepted; omitting the version
> still applies; a missing record is 404 not 409; and — the one that would have
> bitten — **records predating the field, with no `version` key at all, match
> `expectedVersion: 0`**, so no migration is needed. All 6 real templates still
> rename.

**Location:**
- Files: `src/backend/routes/events.js`, `src/backend/routes/templates.js`
- Compare: `src/backend/routes/schedules.js`, which does this correctly

**What happens:** [verified] Two simultaneous `PATCH /api/events/:id` both
returned **200**; `staffNeeded` ended at whichever landed last. No 409, no
warning, no indication that one edit was discarded.

**Why it is wrong:** `Schedule` writes carry an `expectedVersion` precondition
inside the update filter precisely because a write replaces the whole record
rather than merging. `Event` and `Template` writes replace whole records too, but
have no equivalent — so the same lost-update hazard exists with no guard.

**Trigger condition:** Two managers editing the same event or template at once —
the scenario that motivated multiple manager accounts in the first place. Also
reachable by one manager with two tabs.

**Impact:** Silent loss of an edit. On a template this can be a whole day's
layout; the editor sends the entire `days` map on save, so a concurrent rename
and a concurrent day-edit will not merge — one simply wins.

**Root cause:** The version pattern was applied to the collection where it was
noticed and not generalised.

**Recommended fix:** Add `version` to the `Event` and `Template` schemas and the
same `findOneAndUpdate({ _id, version })` + 409 pattern. The client already knows
how to surface a 409 (`isConflict` in `utils/api.js` and the conflict banner in
the editors).

**Confidence:** High.

---

### [MEDIUM] A request can name a staff member who does not exist — ✅ FIXED

> **Fixed.** `POST /api/requests` now rejects an id that names nobody, with
> *"No staff member with id 99999"*.
>
> **`staffId` is checked as well as `targetStaffId`**, which the finding did not
> call for. An employee's own id comes from their verified session and is safe,
> but a *manager* may file a request on somebody's behalf and that id is taken
> from the body — so the same hole existed on the requester side. Verified.
>
> The `unknownStaffIds` helper moved out of `routes/events.js` into
> `utils/roster.js` and both routes now share it. Writing a second copy would
> have repeated the mistake that put `isShiftOutsideAvailability` in three files
> with the same bug in each.
>
> Verified 17/17: cover and swap to a missing person refused, a manager filing
> for a missing person refused, ordinary cover/swap/drop untouched, self-targeting
> still caught first, events unaffected by the extraction, and the helper itself
> handles empty input, nulls, a bare id, and duplicates. Zero existing requests
> named a missing id.

**Location:** `src/backend/routes/requests.js`, `router.post("/")`

**What happens:** [verified] A `cover` request with `targetStaffId: 99999`
is accepted (201) and enters `pending_peer`.

**Why it is wrong:** `pending_peer` can only be cleared by the named target
(`filter = { _id, status: 'pending_peer', targetStaffId: req.user.staffId }`).
No such user exists, so nothing can ever advance or decline it.

**Trigger condition:** A crafted request, or a genuine race — filing a request
against somebody who is removed from the roster before they act on it. The staff
delete cascade removes *unresolved* requests, so the race window is narrow, but a
crafted id is trivially reachable.

**Impact:** A permanently stuck request. It never reaches the manager's queue, so
it is invisible to them, and the requester sees it waiting forever with no way to
understand why. Withdrawal works, so it is recoverable if the requester notices.

**Recommended fix:** Verify `targetStaffId` exists on the roster at POST, the way
`events.js` now checks `assignedStaff` via `unknownStaffIds`.

**Confidence:** High.

---

### [LOW] The requester's display name is client-supplied

**Location:** `src/backend/routes/requests.js`, `router.post("/")` — `staffName`
passed through to `Request.create` and used by `notifyRequestSubmitted`.

**What happens:** [verified] An employee POSTs `staffName: "The Manager"` with
their own (correctly enforced) `staffId`. The notification raised to the manager
carries the false name.

**Why it is wrong:** `staffId` is verified against the session; the name beside it
is not, and the name is what a human reads. The notification system was hardened
in an earlier pass specifically so that notification wording could not be
attacker-controlled — this is the same class of hole via a different field.

**Impact:** Limited, since the request's `staffId` is correct and every schedule
change derives from it. The consequence is misleading text in the manager's
notification and the request list. Within a trusted studio this is a nuisance
rather than a threat.

**Recommended fix:** Derive `staffName` (and `targetName`) server-side from the
roster, ignoring whatever the client sends — the same approach `notifications.js`
already takes with `from`.

**Confidence:** High.

---

## Potential Issues / Needs Verification

**1. The `swap` branch may share the self-target defect.** I traced the `cover`
branch to a verified conclusion but did not run the `swap` branch. It performs a
similar two-identity mapping, so the same `staffId === targetStaffId` collapse is
plausible — with a different outcome, since swap exchanges rather than moves.
Worth reproducing before assuming either way.

**2. `applyScheduleChange` sends no `expectedVersion`.** The apply-template path
was fixed today to send one; I did not confirm whether the request-approval path
does. If it does not, approving a request can clobber a concurrent manager edit
of the same day — the exact bug fixed for templates.

**3. Past-dated availability and schedule writes.** Nothing prevents writing a
schedule for a date in the past, or availability that contradicts an
already-approved schedule. Whether that is a bug or a deliberate affordance
(managers correcting history) is a product decision I cannot make from the code.

---

## Previously Fixed and Re-verified

| Finding | Verification |
|---|---|
| Malformed schedule write breaks a date permanently | 6/8 payloads now 400; 45 stored days + 32 snapshots still save |
| Event with no dates appears on every day | 0 of 365 days (was 365); 17/17 |
| Event times entirely unvalidated | 27/27; single-edge resize now caught |
| Schedule writes accept invalid shift data | 13/13 against the original table |
| Desk turn outside its shift never flagged | 16/16; 0 of 45 stored days trip it |
| `POST /api/templates` shape unvalidated | 22/22; all 6 templates still save and rename |
| No automated tests | 35 tests; 9 fail when three fixes are reverted |

Full API sweep is now **2 of 17 invalid payloads accepted**, both deliberate and
documented, down from 16 of 17.

---

## Missing Test Coverage

The 35-test suite covers the pure functions in `scheduleUtils`. Not covered:

1. **`applyScheduleChange` — all three branches.** The highest-value gap: this is
   where finding 1 lives, and it is the only place shifts move between people.
   Testable as a pure function over a staff list.
2. **Self-identity cases** — requester equals target, for cover and swap.
3. **The API validators** — integration tests needing a server and database.
4. **`generateTemplate`** — not audited in depth this pass and untested.
5. **Concurrency** — two writers on one schedule, event, or template.
6. **`assertStillMatchesAgreement`** — the guard that stops an approval applying
   against a schedule that moved underneath it.

---

## Recommended Fix Order

1. **Reject `targetStaffId === staffId`** at `POST /api/requests` — one condition,
   closes the high-severity finding at the boundary.
2. **Make the cover/swap mapping order-independent**, so the invariant does not
   depend on `if/else if` ordering even if a bad request slips through.
3. **Verify the swap branch** (potential issue 1) and fix if it shares the defect.
4. **Apply `validateDateString` to `POST /api/requests`** — the function already
   exists and is used elsewhere.
5. **Check `applyScheduleChange` sends `expectedVersion`** (potential issue 2).
6. **Add version guards to `Event` and `Template`.**
7. **Verify `targetStaffId` exists** at request creation.
8. **Derive `staffName`/`targetName` server-side.**

Items 1–4 are small and close everything user-facing. 5–6 matter once more than
one manager uses the app in earnest.

---

## Overall Assessment

**B — Generally reliable.**

The scheduling arithmetic is correct: intervals are consistently half-open,
overlap tests are right, availability now handles fragmented windows properly,
and the desk and event invariants are enforced and alerted on. Authorization
holds — an employee cannot write a schedule, event, or template [verified 403 on
all three]. The request pipeline's state transitions are genuinely atomic. The
validation added today closed the entire class of malformed-write bugs that made
pass 1 read as a C.

It is not an A because of finding 1: a path exists by which an approved,
legitimate-looking request removes a shift from the schedule entirely. It needs a
crafted request rather than a misclick, which is why this is High rather than
Critical — but the outcome is a silently unstaffed shift with a misleading audit
trail, and the fix is one condition.

The remaining findings are the ordinary consequences of a system that grew a
validation layer late: it was applied where problems were noticed rather than
uniformly, so requests and the concurrency guard are behind schedules and events.
