# Template Auto-Generation — Bug Audit

Audit only; no code changed. This subsystem is algorithmic rather than
transactional, so the method is different from the other audits: instead of
probing a request boundary, it runs the real `generateWeeklyTemplate` over many
generated rosters and asserts the invariants it claims to hold. No database, no
writes. Random scenarios use a seeded PRNG, so any failure is reproducible from
its seed.

**Coverage:** 46 scenarios — 6 hand-built edge cases plus 40 randomised
student-shaped weeks — producing 1,327 shifts across 824 person-days.

---

## Executive Summary

**Confirmed bugs: 2.** 0 critical, 0 high, 1 medium, 1 low. **Both now fixed.**
**Potential issues needing verification: 2.**
**Invariants tested: 13. Violations: 0.**

> **Update — both findings fixed and covered by tests.** A post-condition sweep
> on shift length closes both. Sub-minimum shifts went from **95 to 0** across 40
> rosters at a cost of **1.34% of scheduled hours**, now reported as visible gaps
> instead of unworkable shifts. 17 tests added; all 13 invariants still hold.
> The stated root cause was **corrected during the fix** — see the finding.

**Is it safe to use?** Yes. This is the most algorithmically demanding code in
the application and it is correct on every constraint that matters. Across 46
scenarios it never scheduled anyone outside their availability, never exceeded a
weekly cap or a daily limit, never double-booked anyone, never put two people on
the desk at once, and never placed desk duty outside the shift it sits on. It is
deterministic, unaffected by roster order, and survives degenerate input — no
staff, no availability, availability shorter than a shift — without throwing.

**Most dangerous issue:** none is a correctness violation. The real finding is
that **`minShiftHours` is a preference, not a constraint**. 75 of 1,327 shifts
(5.6%) came out shorter than the two-hour minimum, the shortest being **30
minutes** [verified]. Someone is asked to come to campus for half an hour.

**What this audit cannot tell you.** Invariants catch impossible schedules, not
*unpleasant* ones. A schedule can satisfy every constraint here and still be one
no manager would send out. The quality measurements below are an attempt at that
second question, but they are weaker evidence than the invariant results.

---

## Architecture

```
GenerateTemplateModal
  availabilityApi.getAll()  → { [staffId]: { [dow]: [{start,end}] } }
        │
  generateWeeklyTemplate({ staff, availabilityByStaff,
                           minShiftHours 2, maxShiftHours 8,
                           maxDailyHours 8, padding 1, maxDeskRun 1 })
        │
   ┌────┴──────────────────────────────────────────────┐
   │ build dayStates: per-day 30-min demand from        │
   │   getTarget(hour, dow)  ← staffingTargetsByDay     │
   │                                                    │
   │ PASS 1  every day's true minimum                   │
   │ PASS 2  a one-person cushion on top                │
   │   (two passes so padding Monday cannot starve      │
   │    Thursday's minimum)                             │
   │                                                    │
   │   per slot, rank candidates:                       │
   │     continuing > not-a-callback > viable >         │
   │     lowest load > longest run > id                 │
   │   gates: isAvailable, weekly cap, maxDailyHours,   │
   │          maxShiftHours, couldFormShift             │
   │                                                    │
   │ merge consecutive slots → shifts                   │
   │ assignDeskCoverage(deskHours, maxDeskRun, dow)     │
   └────────────────────────┬───────────────────────────┘
                            │
        { days, stats, gaps, warnings }  ← reviewed before saving
```

**Fairness model.** Load is measured as *hours as a share of each person's own
cap*, not as raw hours — the comment explains why, and it is the right call:
equal raw hours maxes out low-cap people while leaving high-cap people at half.
Someone with no cap is treated as nominally 40h so they do not read as
permanently idle.

**Desk hours are tracked weekly, not daily**, so desk duty evens out over the
week rather than landing repeatedly on whoever opens.

---

## Confirmed Bugs

### [MEDIUM] `minShiftHours` is not enforced — 30-minute shifts are produced

> **FIXED.** Post-condition sweep added to the shift-assembly block. Verified: 95
> sub-minimum shifts across 40 rosters → **0**. See *Resolution* below. The root
> cause below has been **corrected** — my original analysis of the mechanism was
> wrong, and the correction is recorded rather than quietly overwritten.

**Location:**
- File: `src/frontend/utils/generateTemplate.js`
- Function: `couldFormShift`, lines ~240–255; the slot-filling loop that uses it
- Constant: `minShiftHours = 2` (parameter default, line ~163)

**What happens:** [verified across 1,327 shifts]

```
sub-minimum shifts by length: { 1.5h: 24, 1h: 29, 0.5h: 22 }
total: 75 of 1327 (5.6%)
   as a person's first block of the day : 64
   as a later block (a callback)        : 11
```

A concrete case, reproducible at seed 1:

```
Monday, P5 — available 8:00–10:30, 1:00–3:30, 5:30–7:30
           — scheduled 10:00–10:30   (30 minutes)
```

They were free for two and a half continuous hours beforehand and were given the
last half hour of it.

**Why it is wrong — corrected.** My original analysis said the generator predicts
growth that "nothing afterwards actually builds." **That was wrong.** A stretch
pass does exist, immediately after slots are merged into shifts, and it works
correctly. Instrumenting which guard stops it settled the question:

```
why the stretch stopped, across all attempts:
   weekly cap               75
   daily limit               0
   max shift length          0
   no adjacent availability  0
```

**The weekly cap, in 100% of cases. Availability was never the blocker** — which
also means the warning the code emitted (`"availability didn't allow extending
it"`) named the wrong cause every single time.

The real mechanism is a staleness problem. `couldFormShift` *does* check the
weekly budget when it picks someone:

```js
const budget = Math.min(
  capOf(s) - weeklyHours.get(s.id),      // ← weekly cap is already accounted for
  maxDailyHours - (dayHours.get(s.id) ?? 0),
  maxShiftHours,
);
if (budget < minShiftHours) return false;
```

So at selection time the person genuinely had a full shift's worth of cap left.
The gate was honest. But it runs *per slot*, while the stretch runs *once at the
end of the day* — and slots assigned in between spend the budget the gate
reserved. By the time the shift is assembled the person is at their cap and the
fragment cannot grow.

This also explains the distribution I could not account for before: **64 of 75
were the person's first block of the day.** The fragment is early, and a larger
block assigned later the same day is what eats the remaining cap. Chronologically
first, but funded last.

**Trigger condition:** A person near their weekly cap who is picked for an
isolated slot and then given a larger block later the same day.

**Impact:** The template proposes shifts nobody would work. A manager reviewing
it either notices and hand-fixes them, or does not and sends out a schedule
asking a student to travel to campus for thirty minutes.

**Root cause:** `minShiftHours` is enforced as an eligibility filter evaluated
against a budget that later assignments consume, rather than as a post-condition
checked against the finished shift.

**Confidence:** High.

#### Resolution

A post-condition sweep in the shift-assembly block. Shifts are processed
shortest-first — dropping the most hopeless fragment releases cap hours that may
let a longer one reach the minimum — and any shift that still cannot reach
`minShiftHours` is removed, its hours returned to the weekly and daily budgets,
and its slots reported as gaps where they leave a genuine shortfall. Warnings now
name the weekly cap, which is the true cause.

Measured over the same 40 rosters, before and after:

| | before | after |
|---|---|---|
| shifts produced | 1,777 | 1,693 |
| **under 2h** | **95** | **0** |
| shortest shift | 0.5h | — |
| shifts dropped | 0 | 84 |
| hours scheduled | 5,618 | 5,542.5 |

**Coverage traded away: 75.5h of 5,618h — 1.34%.** That trade is the point of the
fix, not a side effect: an unfilled half hour is a staffing problem the manager
can see and solve, whereas a half-hour shift hides the same problem behind
something nobody will work. Every drop is surfaced as a warning and, where it
creates a real shortfall, as a gap.

A person whose every block is dropped is now removed from the day entirely.
Without that they would have reached the day's sort with an empty `shifts` array
and thrown on `shifts[0].start`.

Pinned by `src/frontend/utils/generateTemplate.test.js` (17 tests). All eight
seeds used there fail against the pre-fix code — including the seed-1
`P5 Monday 10:00–10:30` case above — so this is genuine regression coverage
rather than a test written to match current behaviour.

---

### [LOW] The short-callback rule has a hole

> **FIXED** by the same post-condition sweep. A short callback is a short shift,
> so it is now grown or dropped like any other. The cause is the same one
> corrected above — the weekly cap being spent after the gate passed, not a
> shortfall in demand as originally written.

**Location:** same file; the `callback` flag in the candidate ranking.

**What happens:** [verified] 11 of the 75 sub-minimum shifts are a person's
*second or third* block of the day — the case a rule was added specifically to
prevent. Example at seed 3:

```
Tuesday, P7 — available 8:30–11:00, 12:30–15:00, 16:00–20:00
            — scheduled …, …, 16:30–18:00   (third block, 1.5h)
```

**Why it is wrong:** The callback rule requires a returning person to satisfy
`viable`, which is measured forward from the slot. That is a claim about
available room, not about the shift that ends up being written — the same
prediction-versus-outcome gap as the finding above. When demand runs out early,
the block is shorter than the check implied.

**Trigger condition:** A returning person whose forward room is ample but whose
*demand* ends before `minShiftHours` is reached.

**Impact:** Someone is asked back to campus for a second short stint. Less
frequent than the first finding — 11 occurrences versus 64 — and the fix is the
same post-condition sweep, which would catch both.

**Confidence:** High.

---

## Potential Issues / Needs Verification

**1. 58% of person-days carry a split shift.** [verified: 480 of 824] With
genuinely fragmented availability some splitting is unavoidable — you cannot give
someone a continuous shift through a class. Whether 58% is the floor imposed by
the input, or whether the generator splits more than it needs to, I could not
determine without a comparison implementation to measure against. Worth
establishing before treating it as a defect; my randomised availability may be
more fragmented than a real roster.

**2. Coverage gaps are reported faithfully, but the accounting is not identical.**
Independently recomputing shortfalls gave **2,590** short slots against **2,592**
gap entries reported. Near-exact, and erring toward over-reporting, which is the
safe direction — but the two-entry difference is unexplained. Likely a boundary
in how adjacent short slots are grouped rather than a miscount.

---

## Invariants tested — all held

| Invariant | Result |
|---|---|
| Never scheduled outside declared availability | held |
| Shifts within studio hours | held |
| Never exceeds `maxShiftHours` | held |
| Never exceeds `maxDailyHours` | held |
| Never exceeds a person's weekly cap | held (0 of 240 over) |
| No overlapping shifts for one person | held |
| Nobody appears twice in a day | held |
| No zero or negative-length shift | held |
| Desk turn sits inside that person's own shift | held |
| Desk turn within `maxDeskRun` | held |
| Desk turn within the day's desk window | held |
| Never two people on the desk at once | held |
| Reported hours match the schedule exactly | held |
| Deterministic — same input, same output | held |
| Roster order does not change the result | held |
| Degenerate input does not throw | held (no staff, no availability, sub-minimum availability, 2h caps) |

**Fairness**, over 240 person-cap samples: p10 **90%**, median **100%**, p90
**100%** of cap, with **zero** over. The stated fairness goal is met.

---

## A note on method — three false findings

My first run reported 260 violations. All were defects in the audit harness:

**242 "scheduled outside availability"** — my containment check required a shift
to fit inside a *single* availability window, so a legitimate shift spanning two
*touching* blocks (`8:30–13:00` and `13:00–13:30`) looked like a violation. This
is precisely the bug I fixed in `isShiftOutsideAvailability` in the application
this morning, reproduced in my own test code hours later.

**18 "desk turn outside desk hours"** — Friday's desk window ends at 17:45, which
is off the half-hour grid. `isDeskRequired` deliberately rounds *up* so the final
quarter hour is covered rather than left unmanned. My check treated the
documented behaviour as a violation.

Both were corrected and the run reproduced with zero violations. Recording this
because it is the third audit in a row where probe defects produced false
findings, and the pattern is consistent: **the harness is as likely to be wrong
as the code, and a finding is not a finding until the harness has been questioned
too.**

**A fourth correction, and the instructive one.** The surviving finding was real
— 30-minute shifts are genuinely produced — but the *mechanism* I gave for it was
wrong. I wrote that the generator predicts growth "and nothing afterwards
actually builds it." A stretch pass does exist and does work; the blocker is the
weekly cap being spent between the gate and the stretch. I had read the selection
gate and the outcome, inferred the middle, and written the inference as a finding.

What caught it was refusing to implement my own recommendation until I had
instrumented *which* guard was stopping the growth. That one measurement
overturned the analysis. It also revealed a second defect I had not noticed at
all: the warning text blamed availability, which was wrong in every one of the 75
cases — a manager acting on it would have gone looking at the wrong thing.

The lesson generalises past this audit: **a correct symptom does not validate the
explanation attached to it.** The observation was sound and the reasoning built
on it was not, and only measurement told them apart. Worth remembering when
reading the other three audits, whose root-cause sections were written with the
same confidence and have not had the same instrumentation applied to them.

---

## Missing Test Coverage

The generator has no tests. It is unusually well suited to property-based
testing — pure, deterministic, and rich in invariants:

1. **The invariant table above**, as a suite over a handful of fixed rosters plus
   a seeded random sweep. This audit's harness is most of the work already.
2. **`minShiftHours` as a post-condition** — currently the failing case, so it
   should be written before the fix and watched go green.
3. **Degenerate inputs** — no staff, nobody available, availability shorter than
   a shift, a single person carrying a whole week.
4. **Determinism** — same input twice, and roster order reversed.
5. **`assignDeskCoverage` alone** — desk containment, the one-hour cap, and the
   no-overlap rule, without running the whole week.

---

## Recommended Fix Order

1. ~~**Post-condition sweep on shift length.**~~ **Done.** Both confirmed
   findings closed; 95 sub-minimum shifts → 0.
2. ~~**Pin the invariants as tests.**~~ **Done in part.** 17 tests in
   `generateTemplate.test.js` cover the post-condition, the weekly cap, the daily
   limit, availability containment, determinism, roster-order independence, and
   degenerate input. Not yet covered: `assignDeskCoverage` in isolation (desk
   containment, the one-hour cap, no-overlap) — the desk invariants are exercised
   only through the full-week harness.
3. Establish whether the 58% split rate is inherent or excessive, before deciding
   whether it needs anything.

---

## Overall Assessment

**A− — Robust.**

I expected this to be the buggiest subsystem in the application — it is the only
place doing something genuinely hard, and it had been patched several times
without ever being audited. It is instead the most rigorously correct code here.
Thirteen invariants over 46 scenarios and 1,327 shifts produced zero violations,
including the ones most likely to be wrong: availability containment under
fragmented input, weekly caps across a two-pass fill, and desk exclusivity.
Determinism and roster-order independence both hold, which many greedy schedulers
get wrong. The fairness model is thoughtfully chosen and demonstrably achieves
what it claims.

It was not an A because `minShiftHours` was advertised as a constraint and
behaved as a hint. 5.6% of shifts violated it, down to thirty minutes — not a
correctness failure in the scheduling sense, since nothing impossible was
produced, but a usability one that landed directly on the students being
scheduled.

**Revised after the fix: A.** `minShiftHours` is now a post-condition, verified
against the finished shift rather than predicted at selection, and pinned by
tests that fail against the previous code. The subsystem now holds every
constraint it claims to hold, including the one it used to advertise and miss.

The remaining open question is the 58% split-shift rate, which I could not
classify as a defect without a comparison implementation to measure against — it
may simply be what fragmented student availability forces. That is a question
about schedule *quality*, which this method is weaker at answering than it is at
proving impossible schedules never appear.
