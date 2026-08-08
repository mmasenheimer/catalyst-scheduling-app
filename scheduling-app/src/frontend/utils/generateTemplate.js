import { HOURS_START, HOURS_END } from "../../data/mockData";
import {
  getTarget, formatTime, getDeskWindow, isDeskRequired, mergeAdjacentShifts,
} from "./scheduleUtils";

// Half-hour resolution, matching the editor's snapping.
const SLOT = 0.5;

// Days a weekly template covers. Saturday is omitted — the studio is closed and
// staffingTargetsByDay.saturday is empty.
export const TEMPLATE_DAYS = [
  { name: "Monday", dow: 1 },
  { name: "Tuesday", dow: 2 },
  { name: "Wednesday", dow: 3 },
  { name: "Thursday", dow: 4 },
  { name: "Friday", dow: 5 },
  { name: "Sunday", dow: 0 },
];

const round1 = (n) => Math.round(n * 10) / 10;

/** Is this person free to work the slot starting at `h` on this weekday? */
function isAvailable(windows, h) {
  return (windows ?? []).some((w) => w.start <= h && w.end >= h + SLOT);
}

const worksAt = (person, h) =>
  person.shifts.some((sh) => sh.start <= h && sh.end >= h + SLOT);

/**
 * Put exactly one person on the desk for every half-hour the desk needs manning,
 * drawing only on hours people are actually scheduled.
 *
 * The desk window is narrower than the working day — see deskHoursByDay — so
 * early openers and late closers get no desk duty at all.
 *
 * These are the two rules `buildAlerts` enforces on a real day: no gap inside the
 * desk window, and never two people on desk at once. Both hold by construction
 * here — each slot is handed to exactly one person, and only ever to someone
 * whose shift already covers it. Desk/event conflicts, the third rule, can't
 * arise because generated templates contain no events.
 *
 * No single desk block may exceed `maxDeskRun`. That's a hard cap, so blocks are
 * built as the walk proceeds rather than by merging slots afterwards — merging
 * would silently fuse two consecutive turns by the same person back into one
 * over-long block.
 *
 * Whoever is on the desk keeps it until the cap or the end of their shift, so
 * cover reads as a handful of blocks rather than a mosaic of 30-minute handoffs.
 * At each handover the desk goes to whoever has had the least desk time all week,
 * so duty rotates instead of landing on whoever opens. If nobody else is on
 * shift, the same person starts a fresh block rather than the desk going unmanned
 * — a coverage gap is a real problem, back-to-back turns are just untidy.
 */
function assignDeskCoverage(dayStaff, deskHours, maxDeskRun, dow) {
  if (dayStaff.length === 0) return dayStaff;

  const slots = [];
  for (let h = HOURS_START; h < HOURS_END; h += SLOT) {
    // Only where the desk is needed *and* somebody is there to man it.
    if (isDeskRequired(h, dow, SLOT) && dayStaff.some((p) => worksAt(p, h))) {
      slots.push(h);
    }
  }
  if (slots.length === 0) return dayStaff;

  const blocks = []; // { staffId, start, end }
  const turnsToday = new Map(); // staffId → desk blocks already given today
  let cur = null;

  for (const h of slots) {
    const onShift = dayStaff.filter((p) => worksAt(p, h));

    // The incumbent keeps the desk only while still on shift, still under the
    // cap, and with no break in the slots (a closed studio hour ends a block).
    const canContinue =
      cur != null &&
      cur.end === h &&
      cur.end - cur.start + SLOT <= maxDeskRun &&
      onShift.some((p) => p.id === cur.staffId);

    if (canContinue) {
      cur.end += SLOT;
      deskHours.set(cur.staffId, (deskHours.get(cur.staffId) ?? 0) + SLOT);
      continue;
    }

    // Handover: prefer anyone but the outgoing person so the desk rotates, and
    // fall back to them only if they're the sole person on shift.
    const others = onShift.filter((p) => p.id !== cur?.staffId);
    const pool = others.length ? others : onShift;
    // Nobody takes a second turn today while somebody on shift hasn't had a
    // first — that's the whole point of staffing one person per desk turn. Only
    // once today is even does weekly desk time decide, so it still evens out
    // across the week for people who work different numbers of days.
    pool.sort(
      (a, b) =>
        (turnsToday.get(a.id) ?? 0) - (turnsToday.get(b.id) ?? 0) ||
        (deskHours.get(a.id) ?? 0) - (deskHours.get(b.id) ?? 0) ||
        a.id - b.id,
    );
    const pick = pool[0].id;

    if (cur) blocks.push(cur);
    cur = { staffId: pick, start: h, end: h + SLOT };
    turnsToday.set(pick, (turnsToday.get(pick) ?? 0) + 1);
    deskHours.set(pick, (deskHours.get(pick) ?? 0) + SLOT);
  }
  if (cur) blocks.push(cur);

  return dayStaff.map((person) => {
    const mine = blocks.filter((b) => b.staffId === person.id);
    if (mine.length === 0) return person;
    return {
      ...person,
      deskShifts: mine.map((b, i) => ({
        id: `gend-${person.id}-${i}`,
        start: b.start,
        end: b.end,
      })),
    };
  });
}

/**
 * Auto-build a weekly staffing template from submitted availability.
 *
 * The problem: cover every half-hour of every open day with at least the
 * minimum headcount from `staffingTargetsByDay`, using only hours people said
 * they can work, without exceeding anyone's weekly cap.
 *
 * The approach is a greedy slot filler rather than a true optimiser — a real
 * ILP solver would need a dependency and is overkill for ~15 staff. It walks
 * each day chronologically and, whenever a slot is short-staffed, adds the best
 * available person. Two heuristics keep the output sane:
 *
 *   1. Strongly prefer someone already working the previous slot. This is what
 *      produces continuous shifts instead of a scatter of 30-minute fragments.
 *   2. When starting someone new, prefer whoever can cover the longest run from
 *      here (lookahead), then whoever has the fewest hours so far (fairness).
 *
 * Coverage always wins over tidiness: if nobody is available, the slot is left
 * short and reported as a gap rather than silently filled with someone who
 * isn't available.
 *
 * @param staff               live roster (needs id, name, maxHoursPerWeek)
 * @param availabilityByStaff { [staffId]: { [dow]: [{start,end}] } }
 * Desk cover is layered on afterwards, once each day's shifts are settled — see
 * assignDeskCoverage. It can only draw on hours people are already scheduled, so
 * it has to run second.
 *
 * @param minShiftHours       shifts shorter than this get extended if possible
 * @param maxShiftHours       cap on a single continuous shift
 * @param assignDesks         also fill the desk rota (one person on at all times)
 * @param maxDeskRun          hard cap on the length of a single desk shift
 * @param minStaffPerDay      distinct staff to schedule per day; defaults to one
 *                            per desk turn, so nobody needs two desk shifts
 * @returns { days, stats, gaps, warnings }
 */
export function generateWeeklyTemplate({
  staff,
  availabilityByStaff,
  minShiftHours = 2,
  maxShiftHours = 8,
  maxDailyHours = 8,
  padding = 1,
  assignDesks = true,
  maxDeskRun = 1,
  minStaffPerDay = null,
}) {
  const weeklyHours = new Map(staff.map((s) => [s.id, 0]));
  // Tracked across the whole week, not per day, so desk duty evens out over the
  // week rather than repeatedly landing on whoever opens each morning.
  const deskHours = new Map(staff.map((s) => [s.id, 0]));
  const capOf = (s) =>
    s.maxHoursPerWeek == null ? Infinity : s.maxHoursPerWeek;

  // Fairness is measured as a share of what each person said they could work,
  // not as raw hours. Splitting hours equally sounds fair but isn't: it maxes
  // out everyone with a low cap while leaving people who offered 30 hours at
  // half that. Someone with no cap is treated as nominally full-time so they
  // don't read as permanently idle and soak up every shift.
  const NOMINAL_FULL_TIME = 40;
  const loadOf = (s) =>
    weeklyHours.get(s.id) / (s.maxHoursPerWeek ?? NOMINAL_FULL_TIME);

  const days = {};
  const gaps = [];
  const warnings = [];

  // Per-day working state, built up front so the fill passes below can run
  // across the whole week rather than finishing one day at a time.
  const dayStates = TEMPLATE_DAYS.map(({ name, dow }) => {
    const demand = [];
    for (let h = HOURS_START; h < HOURS_END; h += SLOT) {
      const need = getTarget(h, dow);
      if (need > 0) demand.push({ h, need });
    }
    return {
      name,
      dow,
      demand,
      assignedAt: new Map(), // slot start → Set(staffId)
      dayHours: new Map(), // staffId → hours already assigned that day
    };
  });

  // Top every slot of one day up to `targetOf(need)`.
  const fillDay = (ctx, targetOf, recordGaps) => {
    const { name, dow, demand, assignedAt, dayHours } = ctx;
    const at = (h) => assignedAt.get(h) ?? new Set();

    // How long has this person been working continuously up to `h`? Stops a
    // shift growing past maxShiftHours — without it the "keep them going"
    // preference below runs unchecked and produces 10-hour days.
    const runInto = (id, h) => {
      let n = 0;
      for (let t = h - SLOT; t >= HOURS_START; t -= SLOT) {
        if (!at(t).has(id)) break;
        n += 1;
      }
      return n;
    };

    // Is there any shift worth giving this person that covers `h` at all?
    //
    // Measured across the whole contiguous stretch of their availability
    // containing `h`, not just forward from it, because the short-shift pass
    // later grows a shift backwards as well — so somebody first considered near
    // the end of a window can still end up with a full-length shift.
    //
    // What this rules out is the case that produces nonsense: a fragment of
    // availability too small to hold a real shift no matter how it's extended.
    // Filling a slot from one of those buys half an hour of coverage at the cost
    // of asking somebody to come in for half an hour.
    const couldFormShift = (s, from) => {
      const windows = availabilityByStaff[s.id]?.[dow];
      const budget = Math.min(
        capOf(s) - weeklyHours.get(s.id),
        maxDailyHours - (dayHours.get(s.id) ?? 0),
        maxShiftHours,
      );
      if (budget < minShiftHours) return false;

      let stretch = 0;
      for (let t = from; t < HOURS_END; t += SLOT) {
        if (getTarget(t, dow) === 0 || !isAvailable(windows, t)) break;
        stretch += SLOT;
      }
      for (let t = from - SLOT; t >= HOURS_START; t -= SLOT) {
        if (getTarget(t, dow) === 0 || !isAvailable(windows, t)) break;
        stretch += SLOT;
      }
      return Math.min(stretch, budget) >= minShiftHours;
    };

    // How many consecutive slots from `h` could this person cover? Avoids
    // starting someone who's about to become unavailable.
    const lookahead = (s, from) => {
      const windows = availabilityByStaff[s.id]?.[dow];
      let run = 0;
      let hours = weeklyHours.get(s.id);
      let today = dayHours.get(s.id) ?? 0;
      for (
        let h = from;
        h < HOURS_END && run * SLOT < maxShiftHours;
        h += SLOT
      ) {
        if (getTarget(h, dow) === 0) break; // demand ended
        if (!isAvailable(windows, h)) break;
        if (hours + SLOT > capOf(s)) break;
        if (today + SLOT > maxDailyHours) break;
        run += 1;
        hours += SLOT;
        today += SLOT;
      }
      return run;
    };

    for (const { h, need } of demand) {
      const target = targetOf(need);
      const filled = new Set(at(h));

      while (filled.size < target) {
        const candidates = staff
          .filter(
            (s) =>
              !filled.has(s.id) &&
              isAvailable(availabilityByStaff[s.id]?.[dow], h) &&
              weeklyHours.get(s.id) + SLOT <= capOf(s) &&
              (dayHours.get(s.id) ?? 0) + SLOT <= maxDailyHours &&
              // Can't extend a shift that's already at the maximum length.
              runInto(s.id, h) * SLOT < maxShiftHours,
          )
          .map((s) => {
            const run = lookahead(s, h);
            const continuing = at(h - SLOT).has(s.id) ? 1 : 0;
            return {
              s,
              // Already working the previous slot → extending, not starting.
              continuing,
              // Starting them again after a break in the same day: they'd have
              // to leave and come back.
              callback: !continuing && (dayHours.get(s.id) ?? 0) > 0 ? 1 : 0,
              // Could they cover a shift worth giving them at all?
              viable: run * SLOT >= minShiftHours ? 1 : 0,
              run,
              load: loadOf(s),
            };
          })
          // Somebody already working the previous slot is being extended, and
          // their shift is whatever length it has already reached — the length
          // test only applies to starting somebody new. Leaving a slot uncovered
          // and reporting it as a gap is more use to a manager than a 30-minute
          // shift they'd have to notice and delete.
          //
          // A callback is held to a stricter test: not "could a decent shift
          // exist in this stretch" but "will this one actually be long enough",
          // measured forward from here. Asking somebody to travel back in for
          // the last half hour of the day isn't worth the coverage it buys, and
          // unlike a first shift there's no earlier slot to grow backwards into.
          .filter((c) => {
            if (c.continuing) return true;
            if (c.callback) return c.viable === 1;
            return couldFormShift(c.s, h);
          });

        if (candidates.length === 0) {
          // Only a shortfall against the real minimum is a gap. Failing to add
          // optional padding is a normal outcome, not a problem.
          if (recordGaps)
            gaps.push({ day: name, hour: h, need, have: filled.size });
          break;
        }

        candidates.sort(
          (a, b) =>
            b.continuing - a.continuing || // keep existing shifts going
            a.callback - b.callback || // rather ask someone not already done for the day
            b.viable - a.viable || // don't start someone for 30 minutes
            a.load - b.load || // then even out share-of-cap
            b.run - a.run || // tie-break toward longer coverage
            a.s.id - b.s.id,
        ); // stable, so output is deterministic

        const pick = candidates[0].s;
        filled.add(pick.id);
        weeklyHours.set(pick.id, weeklyHours.get(pick.id) + SLOT);
        dayHours.set(pick.id, (dayHours.get(pick.id) ?? 0) + SLOT);
      }

      assignedAt.set(h, filled);
    }
  };

  // How many desk turns a day needs: the length of its desk window divided by
  // the desk-shift cap. A 9-hour desk window at 1-hour turns needs 9 of them —
  // which is also the headcount that lets everyone have at most one turn.
  const deskTurnsFor = (ctx) => {
    const w = getDeskWindow(ctx.dow);
    return w ? Math.ceil((w.end - w.start) / maxDeskRun) : 0;
  };

  // Bring a day's distinct headcount up to `target` by giving unused staff a
  // real shift, over and above the coverage minimum and padding.
  //
  // This exists for the desk rota. Desk shifts are capped at maxDeskRun, so an
  // 11-hour day needs 11 turns; with only 10 people on, somebody has to take two
  // — that's pigeonhole, not a scheduling flaw. Recruiting up to one body per
  // turn is what lets the rota give everybody at most one.
  //
  // Each recruit gets their longest viable run, so they get a shift worth coming
  // in for rather than a token half hour. Availability, weekly caps, daily and
  // shift-length limits are all still hard constraints — if nobody is left who
  // can take a real shift, the day simply stays short-handed.
  const recruitDay = (ctx, target) => {
    const { dow, demand, assignedAt, dayHours } = ctx;
    if (demand.length === 0) return;

    const workingIds = () =>
      new Set([...assignedAt.values()].flatMap((set) => [...set]));

    for (let guard = 0; guard < staff.length; guard += 1) {
      const already = workingIds();
      if (already.size >= target) return;

      let best = null;
      for (const s of staff) {
        if (already.has(s.id)) continue;
        const windows = availabilityByStaff[s.id]?.[dow];
        if (!windows?.length) continue;

        for (const { h } of demand) {
          let run = 0;
          let hours = weeklyHours.get(s.id);
          let today = 0;
          for (let t = h; t < HOURS_END && run * SLOT < maxShiftHours; t += SLOT) {
            if (getTarget(t, dow) === 0) break;
            if (!isAvailable(windows, t)) break;
            if (hours + SLOT > capOf(s)) break;
            if (today + SLOT > maxDailyHours) break;
            run += 1;
            hours += SLOT;
            today += SLOT;
          }
          if (run * SLOT < minShiftHours) continue;

          const cand = { s, start: h, run, load: loadOf(s) };
          const better =
            !best ||
            cand.run > best.run ||
            (cand.run === best.run &&
              (cand.load < best.load ||
                (cand.load === best.load && cand.s.id < best.s.id)));
          if (better) best = cand;
        }
      }

      if (!best) return; // nobody left who could take a real shift

      for (let i = 0; i < best.run; i += 1) {
        const t = best.start + i * SLOT;
        const set = assignedAt.get(t) ?? new Set();
        set.add(best.s.id);
        assignedAt.set(t, set);
        weeklyHours.set(best.s.id, weeklyHours.get(best.s.id) + SLOT);
        dayHours.set(best.s.id, (dayHours.get(best.s.id) ?? 0) + SLOT);
      }
    }
  };

  // Every day's hard minimum is satisfied before any day gets padding.
  // Sequencing matters: padding Monday first would spend hours that Friday's
  // minimum still needs, turning an optional cushion into a real coverage gap.
  dayStates.forEach((ctx) => fillDay(ctx, (need) => need, true));
  if (padding > 0) {
    dayStates.forEach((ctx) => fillDay(ctx, (need) => need + padding, false));
  }
  // Headcount for desk rotation comes last, for the same reason padding does:
  // it's the most optional thing here, so it spends hours only after every day's
  // real coverage is already satisfied.
  if (assignDesks) {
    dayStates.forEach((ctx) =>
      recruitDay(ctx, minStaffPerDay ?? deskTurnsFor(ctx)),
    );
  }

  for (const { name, assignedAt, dayHours, dow } of dayStates) {
    if (assignedAt.size === 0) {
      days[name] = [];
      continue;
    } // closed

    // Collapse the per-slot assignments into continuous shifts.
    const slotsByStaff = new Map();
    [...assignedAt.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([h, ids]) =>
        ids.forEach((id) => {
          if (!slotsByStaff.has(id)) slotsByStaff.set(id, []);
          slotsByStaff.get(id).push(h);
        }),
      );

    const dayStaff = [];
    for (const [id, slots] of slotsByStaff) {
      const person = staff.find((s) => s.id === id);
      if (!person) continue;

      const shifts = [];
      let start = slots[0];
      let prev = slots[0];
      for (let i = 1; i <= slots.length; i++) {
        const h = slots[i];
        if (h !== prev + SLOT) {
          // break in continuity (or end)
          shifts.push({ start, end: prev + SLOT });
          start = h;
        }
        prev = h;
      }

      // A lone half-hour here and there is technically valid but nobody wants
      // to be scheduled for it — stretch short shifts into adjacent availability
      // where the cap allows. Coverage is already satisfied at this point, so
      // this only ever adds hours.
      const windows = availabilityByStaff[id]?.[dow];
      const grow = (sh) => {
        let guard = 0;
        while (sh.end - sh.start < minShiftHours && guard++ < 40) {
          const canGrowEnd =
            isAvailable(windows, sh.end) &&
            sh.end + SLOT <= HOURS_END &&
            !shifts.some(
              (o) => o !== sh && o.start < sh.end + SLOT && o.end > sh.start,
            );
          const canGrowStart =
            isAvailable(windows, sh.start - SLOT) &&
            sh.start - SLOT >= HOURS_START &&
            !shifts.some(
              (o) => o !== sh && o.start < sh.end && o.end > sh.start - SLOT,
            );

          if (weeklyHours.get(id) + SLOT > capOf(person)) break;
          if ((dayHours.get(id) ?? 0) + SLOT > maxDailyHours) break;
          if (sh.end - sh.start + SLOT > maxShiftHours) break;
          if (canGrowEnd) sh.end += SLOT;
          else if (canGrowStart) sh.start -= SLOT;
          else break;
          weeklyHours.set(id, weeklyHours.get(id) + SLOT);
          dayHours.set(id, (dayHours.get(id) ?? 0) + SLOT);
        }
      };

      // `minShiftHours` is a post-condition, not a preference. Growing above can
      // fail, and what it leaves behind is unworkable — half an hour on campus.
      //
      // In practice the blocker is always the weekly cap, never availability:
      // `couldFormShift` confirmed a full shift's worth of budget when this
      // person was picked, but slots assigned later the same day spend it before
      // we get here. The gate is honest at the time and stale by the end.
      //
      // So a shift that can't reach the minimum is dropped and its slots are
      // reported as gaps. That trades coverage for honesty deliberately: an
      // unfilled half hour is a staffing problem the manager can see and solve,
      // whereas a half-hour shift hides the same problem behind something nobody
      // will actually work.
      //
      // Shortest first, because dropping the most hopeless fragment releases cap
      // hours that may let a longer one reach the minimum.
      for (const sh of [...shifts].sort(
        (a, b) => a.end - a.start - (b.end - b.start),
      )) {
        grow(sh);
        if (sh.end - sh.start >= minShiftHours) continue;

        shifts.splice(shifts.indexOf(sh), 1);
        const released = sh.end - sh.start;
        weeklyHours.set(id, weeklyHours.get(id) - released);
        dayHours.set(id, (dayHours.get(id) ?? 0) - released);

        // Report only the slots that actually fall short once this person is
        // removed — they may have been the padding pass's cushion rather than
        // part of the day's true minimum.
        for (let t = sh.start; t < sh.end; t += SLOT) {
          const covering = assignedAt.get(t);
          covering?.delete(id);
          const need = getTarget(t, dow);
          const have = covering?.size ?? 0;
          if (have < need) gaps.push({ day: name, hour: t, need, have });
        }

        warnings.push(
          `${person.name}: ${name} ${formatTime(sh.start)}–${formatTime(sh.end)} was dropped — it couldn't reach ${minShiftHours}h within their weekly cap.`,
        );
      }

      // Every block they had was too short to keep, so they aren't working.
      if (shifts.length === 0) continue;

      dayStaff.push({
        ...person,
        // Merged first: slots collapse into shifts with gaps between them, but
        // the short-shift extension above grows those shifts outward and can
        // close a gap, leaving two blocks that are really one stretch.
        shifts: mergeAdjacentShifts(shifts).map((sh, i) => ({
          id: `gen-${id}-${dow}-${i}`,
          start: sh.start,
          end: sh.end,
        })),
        deskShifts: [], // filled by assignDeskCoverage once the day is settled
        scheduled: true,
      });
    }

    // Earliest start first, matching how the editor orders rows.
    dayStaff.sort((a, b) => a.shifts[0].start - b.shifts[0].start);
    days[name] = assignDesks
      ? assignDeskCoverage(dayStaff, deskHours, maxDeskRun, dow)
      : dayStaff;
  }

  // Per-person summary for the preview.
  const stats = staff
    .map((s) => ({
      id: s.id,
      name: s.name,
      hours: round1(weeklyHours.get(s.id) ?? 0),
      desk: round1(deskHours.get(s.id) ?? 0),
      cap: s.maxHoursPerWeek ?? null,
      days: TEMPLATE_DAYS.filter((d) =>
        days[d.name]?.some((p) => p.id === s.id),
      ).length,
      hasAvailability: Object.values(availabilityByStaff[s.id] ?? {}).some(
        (w) => w?.length,
      ),
    }))
    .sort((a, b) => b.hours - a.hours);

  const unavailable = stats.filter((s) => !s.hasAvailability);
  if (unavailable.length) {
    warnings.unshift(
      `${unavailable.length} staff have no availability on file and were left unscheduled: ${unavailable.map((s) => s.name).join(", ")}.`,
    );
  }
  const unused = stats.filter((s) => s.hasAvailability && s.hours === 0);
  if (unused.length) {
    warnings.push(
      `${unused.length} available staff weren't needed: ${unused.map((s) => s.name).join(", ")}.`,
    );
  }

  return { days, stats, gaps, warnings };
}

/** Group raw gap slots into readable "Monday 4:00 PM–5:00 PM (3/5)" ranges. */
export function summarizeGaps(gaps) {
  const out = [];
  for (const g of gaps) {
    const last = out[out.length - 1];
    if (
      last &&
      last.day === g.day &&
      last.end === g.hour &&
      last.have === g.have &&
      last.need === g.need
    ) {
      last.end = g.hour + SLOT;
    } else {
      out.push({
        day: g.day,
        start: g.hour,
        end: g.hour + SLOT,
        need: g.need,
        have: g.have,
      });
    }
  }
  return out.map(
    (r) =>
      `${r.day} ${formatTime(r.start)}–${formatTime(r.end)}: ${r.have}/${r.need} staff`,
  );
}
