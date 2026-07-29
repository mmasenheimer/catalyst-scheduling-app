import { HOURS_START, HOURS_END } from "../../data/mockData";
import { getTarget, formatTime } from "./scheduleUtils";

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
 * @param minShiftHours       shifts shorter than this get extended if possible
 * @param maxShiftHours       cap on a single continuous shift
 * @returns { days, stats, gaps, warnings }
 */
export function generateWeeklyTemplate({
  staff,
  availabilityByStaff,
  minShiftHours = 2,
  maxShiftHours = 8,
  maxDailyHours = 8,
  padding = 1,
}) {
  const weeklyHours = new Map(staff.map((s) => [s.id, 0]));
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
            return {
              s,
              // Already working the previous slot → extending, not starting.
              continuing: at(h - SLOT).has(s.id) ? 1 : 0,
              // Could they cover a shift worth giving them at all?
              viable: run * SLOT >= minShiftHours ? 1 : 0,
              run,
              load: loadOf(s),
            };
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

  // Every day's hard minimum is satisfied before any day gets padding.
  // Sequencing matters: padding Monday first would spend hours that Friday's
  // minimum still needs, turning an optional cushion into a real coverage gap.
  dayStates.forEach((ctx) => fillDay(ctx, (need) => need, true));
  if (padding > 0) {
    dayStates.forEach((ctx) => fillDay(ctx, (need) => need + padding, false));
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
      for (const sh of shifts) {
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
        if (sh.end - sh.start < minShiftHours) {
          warnings.push(
            `${person.name}: ${name} ${formatTime(sh.start)}–${formatTime(sh.end)} is shorter than ${minShiftHours}h — availability didn't allow extending it.`,
          );
        }
      }

      dayStaff.push({
        ...person,
        shifts: shifts.map((sh, i) => ({
          id: `gen-${id}-${dow}-${i}`,
          start: sh.start,
          end: sh.end,
        })),
        deskShifts: [], // desk time and events are assigned manually
        scheduled: true,
      });
    }

    // Earliest start first, matching how the editor orders rows.
    dayStaff.sort((a, b) => a.shifts[0].start - b.shifts[0].start);
    days[name] = dayStaff;
  }

  // Per-person summary for the preview.
  const stats = staff
    .map((s) => ({
      id: s.id,
      name: s.name,
      hours: round1(weeklyHours.get(s.id) ?? 0),
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
