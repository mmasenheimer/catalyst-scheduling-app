# Staff Lifecycle — Bug Audit

Audit only; no code changed. Covers creating an employee, editing them, attaching
a login, and deleting them — specifically what happens to the seven other
collections that reference a person by their bare numeric id.

**Method.** Static reading, plus two live probes against the Atlas database:

1. **Read-only orphan scan** of all eight collections, checking every staff
   reference against the live roster.
2. **A real delete, end to end.** A throwaway employee (id 99001) was seeded into
   all ten places a person can be referenced, then removed by mounting the actual
   `routes/staff.js` router and issuing a real `DELETE`. No mock, no
   reimplementation of the cascade — the shipping code did the work.

All probe data was removed afterwards and the database verified clean. See *A
note on method* for one leftover I created and had to clean up, and for the
false result I nearly reported.

---

## Executive Summary

**Confirmed bugs: 3.** 0 critical, 0 high, 3 medium, 1 low.
**Cascade targets tested: 10. Clean: 8. Leaking: 2.**
**Orphaned references in live data: 0.**

> **Update — the template leak is fixed.** `Template` is now in the cascade (both
> shapes, with a version bump) and the preview filters against the live roster.
> Re-verified: **10 of 10 targets clean**, with a collateral check confirming
> other people in the same arrays are untouched. The two validation findings
> below are still open.

**Is it safe to use?** Yes, and this is not the answer I expected. I nominated
staff deletion as the highest-risk unaudited area in the app. It is the most
carefully written destructive path in the codebase. The cascade is deliberate,
documented, ordered fail-secure, idempotent, and correct on eight of ten targets
including every one that could strand a live request or leave a working login.

**Most dangerous issue:** none is dangerous. The largest is that **weekly and day
templates are not cleaned when an employee is deleted** [verified] — a departed
employee stays in every saved template forever. The impact is smaller than it
first appears, because the apply path rebuilds from the live roster and so cannot
re-inject them (see the finding — I checked this specifically, expecting the
opposite). It is a display and storage defect, not a scheduling one.

**The real gap is at the other end of the lifecycle.** Deletion is rigorous;
*creation* is unvalidated. `POST /api/staff` accepted 4 of 5 malformed payloads,
including a shift running from 99:00 to −5:00. This is the same class of bug
closed across schedules, events, requests and templates in earlier audits — the
staff routes were simply never given the same treatment.

---

## Architecture

A staff member is referenced by a bare `Number` in eight places. There are no
foreign keys and no cascading deletes in Mongo, so every one of these is the
route's responsibility:

```
      Staff._id  (Number, never reused — utils/sequentialId.js)
            │
   ┌────────┼──────────────────────────────────────────┐
   │        │                                          │
User.staffId          Availability.staffId (unique)    Event.assignedStaff[]
Request.staffId       Request.targetStaffId            Notification.recipients[]
Schedule.staff[].id   Schedule.lastPublishedStaff[].id
Template.days[day].staff[].id        ← NOT CLEANED
Template.staff[].id                  ← NOT CLEANED
```

**Two design decisions do a lot of work here and both are right:**

**Ids are never reused.** `utils/sequentialId.js` monotonically increments a
counter. This is what turns every leftover reference from a security problem into
a cosmetic one — anything stranded belongs to a person who existed, not to
whoever is hired next. Without it, the template leak below would be a serious
bug rather than a tidy-up.

**Names are denormalized onto requests.** `Request.staffName` and `targetName`
are stored strings, not lookups. So the historical record of a decided request
still renders correctly after the person is deleted, which is exactly what you
want from an audit trail.

---

## Confirmed Bugs

### [MEDIUM] Templates keep a deleted employee forever

> **FIXED.** `Template` added to the cascade (both shapes) and the preview now
> filters against the live roster. Re-verified end to end: 10 of 10 targets clean,
> `templatesCleaned: 2`, and nobody else touched. See *Resolution*.

**Location:** `src/backend/routes/staff.js`, the `DELETE /:id` cascade —
`Template` is absent from it. `Schedule` is handled immediately above.

**What happens:** [verified — real router, real delete]

```
DELETE /api/staff/99001 -> 200
   staff row                  clean
   login                      clean
   availability               clean
   event assignment           clean
   pending request            clean
   notification               clean
   schedule snapshot          clean
   schedule published copy    clean
   WEEK TEMPLATE              1 LEFT BEHIND
   DAY TEMPLATE               1 LEFT BEHIND
```

Both template shapes leak — `days.{Day}.staff[]` on a week template and
`staff[]` on a day template.

**Why it is wrong:** The cascade's own comment states the principle — *"Every
other collection references a person by that bare number, so anything left behind
belongs to whoever holds the id next."* Templates are exactly such a collection
and were missed. `Schedule` is cleaned four lines earlier for the same reason,
which makes this an oversight rather than a decision.

**Impact — smaller than it looks, and I verified this rather than assuming it.**
My first expectation was that applying a stale template would re-schedule a
departed employee onto a real day. It does not:

```js
function buildStaffForDate(allStaff, tplStaff) {
  const map = new Map((tplStaff ?? []).map(s => [s.id, s]));
  return allStaff.map(p => normalizeForSave(p, map.get(p.id)));   // ← iterates the LIVE roster
}
```

The apply walks the *live roster* and looks each person up in the template. A
template entry whose id is no longer on the roster is never read. So the
scheduling path is immune, and this is not a repeat of the Mariah bug.

What is affected is everything that renders the template directly:

- `DayPreview` (`ApplyTemplateCalendarModal.jsx:98`, `:168`, `:184`) renders
  `template.days[day].staff` unfiltered — the preview shows a departed employee
  with shifts.
- The day chip count (`:124`) counts them, so a template reads *"8 staff"* when
  only 7 will actually be scheduled.

A manager therefore previews one thing and applies another. Plus unbounded growth
of dead snapshot data in every template.

**Trigger condition:** Delete any employee who appears in a saved template. Not
yet triggered in your data — the roster is ids 1–15 with nobody deleted, and the
orphan scan found **zero** stale references across all eight collections. This is
latent, not active.

**Root cause:** The cascade enumerates collections by hand, so a collection added
later is only covered if someone remembers. `Template` post-dates it.

**Recommended fix:** Add `Template` to the cascade. Both shapes need pulling:

```js
await Template.updateMany({ "staff.id": staffId },
                          { $pull: { staff: { id: staffId } } });
// week templates: days is Mixed, so the day keys must be walked
```

The week shape is the awkward one — `days` is `Mixed`, so `$pull` cannot reach
into it with a static path and the day keys have to be enumerated. Report the
count in the response alongside `schedulesCleaned`.

Separately, and cheaper: make `DayPreview` filter against the live roster, so the
preview matches what apply will actually do. Worth doing regardless of the
cascade, since it also covers templates saved before the fix ships.

**Confidence:** High — reproduced end to end with the shipping router.

#### Resolution

**Cascade.** One `updateMany` covering both shapes. `days` is `Mixed`, so `$pull`
cannot use a wildcard and the day keys are named explicitly — all seven weekdays
rather than the six the studio opens, because a template written before the
Saturday change (or by any later code) must still be cleaned, and naming a key
that isn't present is a no-op.

It also bumps `version`. Without that, a manager who already had the template open
could save it back with the deleted person still in it and silently undo the
cleanup; now their write carries a stale version and conflicts instead.

**Preview.** `DayPreview`, the day headcount, and `MiniPreview` now take a
`liveIds` set built from the same roster `buildStaffForDate` uses, so what is
previewed is what gets saved. This matters independently of the cascade: it also
covers templates saved before this fix ships, which the cascade will never see.

Re-verified with the same probe:

```
DELETE -> 200 {"…","schedulesCleaned":1,"templatesCleaned":2}

   WEEK TEMPLATE                    clean      (was 1 LEFT BEHIND)
   DAY TEMPLATE                     clean      (was 1 LEFT BEHIND)

collateral damage — the real person must survive:
   week tpl Monday staff  [1]   expect [1]
   week tpl Tuesday staff [1]   expect [1], untouched
   day  tpl staff         [1]   expect [1]
   schedule staff         [1]   expect [1]
   version 4 -> 5,  7 -> 8      expect 5 and 8
```

The collateral check is the one that matters. `$pull` with a wrong predicate would
empty the whole array, so the probe deliberately puts a second, real person beside
the deleted one in every location and asserts they survive — including on a day
the deleted employee never appeared on.

---

### [MEDIUM] Creating an employee validates almost nothing

**Location:** `src/backend/routes/staff.js`, `POST /` and `PATCH /:id`. Neither
calls into `utils/validate.js`, which every other write path now uses.

**What happens:** [verified against the real router]

```
POST /api/staff
   name empty string                       400  rejected
   shiftStart 99, shiftEnd -5              201  ACCEPTED
   maxHoursPerWeek -40                     201  ACCEPTED
   shiftEnd before shiftStart (17 -> 8)    201  ACCEPTED
   name 5000 chars                         201  ACCEPTED

PATCH /api/staff/:id
   shiftStart 100, shiftEnd 200            200  ACCEPTED
   maxHoursPerWeek -1                      200  ACCEPTED
```

**4 of 5 create payloads and 2 of 2 edit payloads accepted.** The only rejection
comes from Mongoose's `required: true` on `name`, not from any check in the route.

**Why it is wrong:** Every other write surface in this app was hardened in the
earlier audits — `validateScheduleStaff`, `validateEventFields`,
`validateTemplateShape` and friends all exist in `utils/validate.js`. Staff is
the one collection whose writes still go in raw, and it is the collection every
other one references.

**Impact:** A staff member with `shiftStart: 99` is a legacy-scalar row with
nonsense in it — the exact shape the scheduling audit spent effort eliminating.
`maxHoursPerWeek: -40` flows straight into the template generator's `capOf()`,
where a negative cap means the person can never be scheduled and silently drops
out of every generated template with no explanation. A 5000-character name goes
into schedule snapshots, notifications and the roster list.

The Manage Staff form does check name-empty and duplicate-name — but **client-side
only**, so anything reaching the API directly bypasses it.

**Trigger condition:** Any malformed request to these two endpoints. Not
reachable through normal UI use.

**Root cause:** The staff routes predate `utils/validate.js` and were never
revisited when it was introduced.

**Recommended fix:** A `validateStaffFields` in `utils/validate.js`, applied to
both routes: hours on the 0–24 clock and on the 0.5 grid, `shiftEnd > shiftStart`,
`maxHoursPerWeek` null or 0 < n ≤ 168, `name` trimmed and length-bounded. The
backend cannot import the frontend's `HOURS_START`/`HOURS_END`, so use clock
bounds — the same deliberate compromise documented for the other validators.

**Confidence:** High.

---

### [MEDIUM] A login can be attached to a staff member who does not exist

**Location:** `src/backend/routes/auth.js`, `POST /auth/provision` —
`const { name, staffId = null, role = "employee" } = req.body;`

**What happens:** [verified with a valid manager token]

```
live staff ids: 1..15
   staffId 99999 — no such staff member    201  ACCEPTED -> account staffId=99999
   staffId "abc" — not a number            500  rejected  (Mongoose cast error)
```

**Why it is wrong:** `staffId` is taken from the request body and never checked
against the roster. `utils/roster.js` already exports `unknownStaffIds()` — it was
extracted during the scheduling audit precisely so events and requests could
reject unknown staff — and this route does not use it.

The `"abc"` case is rejected only by a Mongoose cast failure surfacing as a **500**.
That is the wrong status for a bad request, and it means the route has no
first-line validation at all; it is relying on the schema to catch things
incidentally.

**Impact:** An account exists whose `staffId` matches no employee. That person can
log in and sees an empty schedule with no explanation. Because ids are never
reused, the account cannot later collide with a real hire — which is the only
reason this is medium rather than high.

The realistic trigger is a typo during onboarding, not an attack: only a manager
can call this endpoint.

**Trigger condition:** Provisioning with a mistyped or stale staff id.

**Recommended fix:** Reject a non-integer `staffId` with a 400, and reject one
that is not on the roster using the existing `unknownStaffIds()`. Both are a few
lines and reuse code that already exists.

**Confidence:** High.

---

### [LOW] Editing a staff member cannot change their name, and says it did

**Location:** `src/backend/routes/staff.js`, `PATCH /:id` — the destructure omits
`name`.

**What happens:** [verified]

```
PATCH { name: "RENAMED" }  ->  200 OK,  name is still "ZZ-AUDIT-PROBE2"
```

The route returns `200` with the unchanged document. The write silently does
nothing.

**Why it is wrong:** A successful status code should mean the requested change
happened. Here it means the field was quietly discarded.

**Impact:** Currently none — Manage Staff has no rename control, so nothing sends
this. It is a trap for the next person who adds one: they will get a `200`, see
no change, and go looking in the wrong place. Names are also denormalized onto
requests and schedule snapshots, so a real rename feature needs to decide what
happens to those anyway.

**Recommended fix:** Either accept `name` (and decide the denormalization
question), or reject a request containing fields the route does not handle rather
than ignoring them. The second is the smaller change and the more honest one.

**Confidence:** High, but low severity — unreachable today.

---

## Potential Issues / Needs Verification

**1. `role` is taken from the provision request body.** `{ role: "manager" }` was
accepted and created a second manager account [verified]. Only a manager can call
the endpoint, so this is plausibly the intended way to add the second/third
manager discussed during the auth audit. Flagging it because it is undocumented
and unvalidated, not because it is clearly wrong. I did not test whether an
unrecognised role string (`"superadmin"`) is caught by the schema enum.

**2. The cascade is not transactional, by documented choice.** Mongo needs a
replica set for multi-document transactions. The route handles this correctly —
steps are individually idempotent, ordered so the login dies first, and the
response reports each step so a partial failure is visible. Re-running the delete
finishes an interrupted one. This is the right call for the constraint, but it
does mean a mid-cascade crash leaves a half-deleted employee until someone
retries, and nothing currently detects that state. An orphan scan run as a
periodic check would close it — the probe from this audit is most of one.

---

## What Held

Everything below was tested against the real router, not reasoned about:

| Behaviour | Result |
|---|---|
| Login revoked, killing live sessions | held |
| Login revoked *first*, so a later failure fails secure | held (by construction) |
| Availability removed, stops feeding the generator | held |
| Event assignments pulled from `assignedStaff` | held |
| Pending requests removed — as requester *and* as target | held |
| Decided requests preserved as a record | held (deliberate) |
| Notification recipient lists pulled, not rows deleted | held |
| Notifications addressed to nobody else then dropped | held |
| Multi-recipient notifications survive for the others | held |
| Schedule snapshots cleaned | held |
| `lastPublishedStaff` cleaned too — stops phantom change notices | held |
| Delete is idempotent / re-runnable after partial failure | held |
| 404 still reports what cleanup ran | held |
| Non-integer id rejected with 400 | held |
| Manager-only | held |
| Ids never reused | held |
| Request names survive deletion (denormalized) | held |
| **Live data: orphaned references across 8 collections** | **0** |

---

## A note on method — a false result and a mess I made

**The false result I nearly reported.** My first orphan scan printed
`live roster: 0 staff` and declared every reference in the database orphaned —
fifteen employees' worth of templates and schedules, apparently all dangling. It
was entirely wrong. Mongoose pluralizes the `Staff` model to the collection
`staffs`, and my probe queried `staff`, which does not exist. An empty result from
a misspelled collection looks identical to catastrophic data loss.

This is the fourth audit in a row where a probe defect produced a false finding.
The difference this time is that it was caught before being written down — the
result was *too* alarming to be plausible, and checking `listCollections()` took
one command. **A finding that would be catastrophic if true deserves one more
verification step, not fewer.**

**The mess I made.** My validation probe created staff rows, and my cleanup
matched on a `ZZ-AUDIT` name prefix — but one test case deliberately used a
5000-character name, which did not match the prefix and so survived cleanup. It
sat in your live roster as a sixteenth employee until I noticed it in a later
probe's output. Removed, and the roster verified back to your fifteen real people
by name.

Two things follow. First, **cleanup keyed on data the test deliberately corrupts
is not cleanup** — it should have keyed on the id range. Second, ids 16–23 are now
consumed; your next hire will be id 24. That is harmless because ids are never
reused, but it is a real change to your data that I caused, and you should know
about it rather than discover it later.

---

## Missing Test Coverage

Nothing in this subsystem has tests, and the delete cascade is the single best
test candidate in the app: pure input/output, no timing, and an exhaustive list of
things that must be true afterwards.

1. **The cascade table above**, as a suite — seed a throwaway employee into all
   ten locations, delete, assert each is clean. This audit's probe is the test,
   nearly verbatim.
2. **Template cleanup** — currently failing, so write it before the fix.
3. **Idempotency** — delete twice, assert the second is a 404 that still reports
   cleanup.
4. **Multi-recipient notifications** — the subtlest correct behaviour here, and
   the easiest to break later.
5. **`validateStaffFields`** once it exists, alongside the other validators.

These need a test database. Everything else in the suite is pure functions, so
this would be the first test requiring one — probably `mongodb-memory-server`.

---

## Recommended Fix Order

1. ~~**Add `Template` to the delete cascade**, and filter `DayPreview` against the
   live roster.~~ **Done.** Both shapes cleaned, preview filtered, verified with a
   collateral-damage check.
2. **`validateStaffFields`** on `POST` and `PATCH /api/staff` — closes the last
   unvalidated write surface in the app.
3. **Check `staffId` on provision** using the existing `unknownStaffIds()`, and
   return 400 rather than 500 for a non-numeric one.
4. Decide the `PATCH` name question — accept it or reject unknown fields.
5. Pin the cascade with tests.

---

## Overall Assessment

**B+ — Sound, with one end of the lifecycle much stronger than the other.**

I called this the highest-risk unaudited area in the app and I was wrong. The
delete cascade is the most carefully considered destructive operation in the
codebase: it revokes access first so a partial failure fails secure, it removes
requests in both directions, it distinguishes pulling a name from a recipient list
from deleting the row, it cleans `lastPublishedStaff` specifically so the publish
diff cannot address a change notice to someone who no longer exists, and it
reports every step so an interrupted run is visible rather than assumed complete.
That last detail is the one most codebases get wrong. Eight of ten targets clean,
zero orphans in live data, and the two that leak are contained by the decision to
never reuse ids.

It is not an A because the other end of the lifecycle has no validation at all.
Deletion was clearly thought about; creation was not. `POST /api/staff` accepts a
shift from 99:00 to −5:00 and a negative weekly cap that would make someone
invisible to the generator for reasons no one would ever diagnose. That is the
same class of bug the scheduling, events and templates audits each closed, and
staff is the collection all the others point at — so it is the one place where
bad data spreads furthest.

None of it is dangerous today. Ranked against the other four audits this sits
above the areas that had real correctness failures, and below the generator. The
fixes are small and reuse code that already exists.
