import { staffingTargetsByDay, deskHoursByDay, HOURS_START, HOURS_END } from '../../data/mockData';

/** Format a Date as a local YYYY-MM-DD string (matches the key daySchedules is stored under) */
export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeStaffShifts(s) {
  const shifts = s.shifts ?? (s.shiftStart != null ? [{ id: `s${s.id}-0`, start: s.shiftStart, end: s.shiftEnd }] : []);
  const deskShifts = s.deskShifts ?? (s.deskStart != null ? [{ id: `d${s.id}-0`, start: s.deskStart, end: s.deskEnd }] : []);
  return { ...s, shifts, deskShifts };
}

/**
 * Merge the live staff roster with a saved/cached/template shift override
 * list. Identity and metadata (name, maxHoursPerWeek, etc.) always come from
 * the live roster — only shifts/deskShifts come from the override — so
 * staff added or removed since the override was captured, or edited via
 * Manage Staff afterward, are always reflected correctly. Staff no longer
 * on the live roster are dropped entirely.
 */
export function mergeStaffOverrides(liveStaff, overrides) {
  const overrideMap = new Map((overrides ?? []).map(s => [s.id, s]));
  return liveStaff.map(person => {
    const override = overrideMap.get(person.id);
    if (!override) return normalizeStaffShifts({ ...person, shifts: [], deskShifts: [] });
    const { shifts, deskShifts } = normalizeStaffShifts(override);
    return { ...person, shifts, deskShifts };
  });
}

/**
 * Build the full staff list for a date: the saved schedule if there is one,
 * otherwise nobody scheduled — with the whole roster present either way.
 *
 * This used to fall back to the hardcoded `weeklyTemplates` seed whenever a date
 * had no saved schedule, so an unsaved day rendered invented shifts. The seed's
 * ids match the live roster (the roster was created from that file), so those
 * shifts were attributed to real people. A date with no saved row has no
 * schedule — that is what gets shown now.
 */
export function getStaffForDate(date, getDaySchedule, allStaff) {
  const saved = getDaySchedule(toDateStr(date)) ?? getDaySchedule(date.toDateString());
  return mergeStaffOverrides(allStaff, saved ?? []);
}

/**
 * Build a { 'YYYY-MM-DD': staffArray } lookup from what schedulesApi.getRange
 * returns, so a view covering many dates can resolve each one without
 * refetching.
 */
export function buildSavedScheduleMap(schedules) {
  const map = {};
  (schedules ?? []).forEach(s => { if (s?.date) map[s.date] = s.staff ?? []; });
  return map;
}

/**
 * Staff list for a date, resolved the way the manager's views resolve it: the
 * saved schedule for that date if one exists, otherwise nobody scheduled —
 * always merged onto the live roster. `savedByDate` comes from
 * buildSavedScheduleMap.
 *
 * Same correction as getStaffForDate above, and it mattered more here: this
 * backs personForDate, which is what My Schedule renders. An employee looking
 * at a week with no saved rows was being shown seed shifts as their own hours.
 */
export function staffForDateFromSaved(date, savedByDate, allStaff) {
  const saved = savedByDate?.[toDateStr(date)];
  return mergeStaffOverrides(allStaff, saved ?? []);
}

/** One person's entry for a date (with shifts[]), or null if not on the roster. */
export function personForDate(date, savedByDate, allStaff, staffId) {
  if (staffId == null) return null;
  return staffForDateFromSaved(date, savedByDate, allStaff).find(p => p.id === staffId) ?? null;
}

/** Whether the person is scheduled at all on the date. */
export function hasShiftOn(date, savedByDate, allStaff, staffId) {
  return (personForDate(date, savedByDate, allStaff, staffId)?.shifts?.length ?? 0) > 0;
}

/** "7:30 AM – 12:30 PM" (or a comma list for multiple), null when unscheduled. */
export function shiftsLabel(person) {
  const shifts = person?.shifts ?? [];
  if (shifts.length === 0) return null;
  return shifts.map(s => `${formatTime(s.start)} – ${formatTime(s.end)}`).join(', ');
}

/**
 * Does an event land on this date?
 *
 * An event lists explicit dates in `days`. When `repeating` is set, each of
 * those dates also acts as an anchor: the event recurs on that same weekday,
 * starting no earlier than the anchor itself, and confined to `repeatFrom` /
 * `repeatUntil` when they're set (an unset bound means open-ended on that side).
 *
 * This lives here because the rule was previously duplicated across five pages
 * and had already drifted — some treated an event with no dates as "every day",
 * others as "never".
 */
export function eventOccursOn(evt, date) {
  // No dates means the event happens on no day — not on every day.
  //
  // This used to return true, so a single event with an empty `days` array
  // appeared on every date in every calendar and schedule, for every user,
  // indefinitely, and raised a permanent "Unfilled event" warning on each one.
  // Nothing about an unscheduled event should read as "always". The API now
  // refuses to store that shape (validateEventDays), and this is the second
  // line of defence for anything already in the database.
  if (!evt?.days?.length) return false;

  const dateStr = toDateStr(date);
  const dow = date.getDay();
  // Normalized to midnight so comparisons are date-only, never time-of-day.
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return evt.days.some(d => {
    if (d === dateStr) return true;          // explicitly listed
    if (!evt.repeating) return false;

    const [y, m, day] = String(d).split('-').map(Number);
    if (!y || !m || !day) return false;
    const anchor = new Date(y, m - 1, day);
    if (anchor.getDay() !== dow) return false;
    if (target < anchor) return false;       // never before the anchor date

    if (evt.repeatFrom) {
      const [fy, fm, fd] = String(evt.repeatFrom).split('-').map(Number);
      if (target < new Date(fy, fm - 1, fd)) return false;
    }
    if (evt.repeatUntil) {
      const [uy, um, ud] = String(evt.repeatUntil).split('-').map(Number);
      if (target > new Date(uy, um - 1, ud)) return false;
    }
    return true;
  });
}

/** All events landing on a date. */
export function getEventsForDate(date, events) {
  return (events ?? []).filter(evt => eventOccursOn(evt, date));
}

/**
 * Desk time and event assignments sit on top of a work shift. Deleting that
 * shift leaves them orphaned — still drawn on the row even though the person is
 * no longer scheduled then.
 *
 * Given the shift being removed and the ones that remain, returns what should
 * be cleaned up with it: anything that sat on the deleted shift and isn't
 * covered by a shift the person still has. A second shift elsewhere in the day
 * therefore keeps its own desk time and events.
 */
export function orphanedByShiftRemoval(removedShift, remainingShifts = [], deskShifts = [], assignedEvents = []) {
  const overlaps = (a, b) => a.start < b.end && a.end > b.start;
  const stillCovered = item => remainingShifts.some(sh => overlaps(item, sh));
  const orphaned = item => overlaps(item, removedShift) && !stillCovered(item);
  return {
    deskShifts: deskShifts.filter(orphaned),
    events: assignedEvents.filter(orphaned),
  };
}

/**
 * Row order for a day: earliest shift first, anyone unscheduled at the bottom.
 *
 * Four pages each declare an identical private copy of this (DailySchedulePage,
 * WeeklyViewPage, WeeklyTemplatesPage, TeamSchedulePage). This is the shared
 * version for code outside those pages — worth collapsing the copies into it,
 * but they're load-bearing in the editors so that's a separate change.
 */
export function sortByShift(arr) {
  return [...arr].sort((a, b) => {
    const aMin = a.shifts?.length ? Math.min(...a.shifts.map(s => s.start)) : Infinity;
    const bMin = b.shifts?.length ? Math.min(...b.shifts.map(s => s.start)) : Infinity;
    return aMin - bMin;
  });
}

const overlapsAnyShift = (item, shifts) =>
  (shifts ?? []).some(sh => sh.start < item.end && sh.end > item.start);

/**
 * The same "is it still covered?" question as `orphanedByShiftRemoval`, but asked
 * about a final set of shifts rather than about one shift being deleted. Used
 * when a whole day is rewritten at once — approving a drop, cover, or swap —
 * where someone's shifts are replaced outright and everything sitting on top of
 * them has to be re-checked. Pass `[]` for someone left unscheduled.
 *
 * Works on anything with `start`/`end`: event assignments and desk shifts alike.
 * Desk shifts live on the day's staff record and events live on the Event
 * document, but neither moves when shifts are rewritten — the caller reconciles.
 */
export function coveredBy(shifts, items) {
  return (items ?? []).filter(item => overlapsAnyShift(item, shifts));
}

/** The complement of `coveredBy` — items no remaining shift overlaps. */
export function notCoveredBy(shifts, items) {
  return (items ?? []).filter(item => !overlapsAnyShift(item, shifts));
}

/**
 * Collapse shifts that touch or overlap into single continuous blocks.
 *
 * Dragging and resizing bars readily leaves a shift split into abutting pieces —
 * 7:30–12:30 followed by 12:30–1:30 followed by 1:30–2:30 is one stretch of work
 * described three times. It renders as separate bars, reads as separate shifts to
 * anyone looking at their schedule, and would offer somebody three things to pick
 * from when they only ever worked one.
 *
 * Touching counts as adjacent, not just overlapping: 9–12 and 12–3 have no gap
 * between them, so they're one 9–3 shift. Genuinely split days — a morning and an
 * evening with time off in between — are left alone, which is the whole point.
 *
 * The surviving block keeps the earliest piece's id, so anything keyed to it
 * (desk shifts, event coverage) still resolves. Returns the same array when
 * nothing merged, so callers can cheaply detect a no-op.
 */
export function mergeAdjacentShifts(shifts) {
  const list = shifts ?? [];
  if (list.length < 2) return shifts;

  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const shift of sorted) {
    const last = merged[merged.length - 1];
    // `<=` rather than `<`: back-to-back shifts have no gap, so they're one.
    if (last && shift.start <= last.end) {
      if (shift.end > last.end) last.end = shift.end;
    } else {
      merged.push({ ...shift });
    }
  }
  return merged.length === list.length ? shifts : merged;
}

/** Apply mergeAdjacentShifts to everyone's shifts and desk shifts on a day. */
export function mergeStaffShifts(staffList) {
  let changed = false;
  const next = (staffList ?? []).map(person => {
    const shifts = mergeAdjacentShifts(person.shifts);
    const deskShifts = mergeAdjacentShifts(person.deskShifts);
    if (shifts === person.shifts && deskShifts === person.deskShifts) return person;
    changed = true;
    return { ...person, shifts, deskShifts };
  });
  return changed ? next : staffList;
}

/**
 * Being assigned to an event means being scheduled to work it, so a shift is
 * stretched out to cover any event the person is assigned to that day. Both
 * editors already do this when you drag an event onto a row; this is the same
 * rule expressed as a function so it can be enforced wherever a day is saved.
 *
 * That matters most for repeating events: `assignedStaff` is one array shared by
 * every occurrence, so there's no per-date moment when someone gets "assigned"
 * to next Thursday's class. Without a save-time pass, the event shows on their
 * schedule on every repeat date with no shift behind it.
 *
 * A shift that already overlaps the event is widened; if none does, a new shift
 * spanning the event is added. Returns the same array when nothing changed, so
 * callers can cheaply detect a no-op.
 */
export function stretchShiftsToCoverEvents(staffList, eventsOnDate) {
  const events = eventsOnDate ?? [];
  if (events.length === 0) return staffList;

  let changed = false;
  const next = staffList.map(person => {
    const mine = events.filter(evt => (evt.assignedStaff ?? []).includes(person.id));
    if (mine.length === 0) return person;

    let shifts = person.shifts ?? [];
    let personChanged = false;

    mine.forEach(evt => {
      // Already covered end-to-end — nothing to do.
      if (shifts.some(sh => sh.start <= evt.start && sh.end >= evt.end)) return;

      const hostIdx = shifts.findIndex(sh => sh.start <= evt.end && sh.end >= evt.start);
      if (hostIdx !== -1) {
        const host = shifts[hostIdx];
        const start = Math.min(host.start, evt.start);
        const end = Math.max(host.end, evt.end);
        if (start !== host.start || end !== host.end) {
          shifts = shifts.map((sh, i) => (i === hostIdx ? { ...sh, start, end } : sh));
          personChanged = true;
        }
      } else {
        shifts = [...shifts, { id: `s${person.id}-evt${evt.id}`, start: evt.start, end: evt.end }];
        personChanged = true;
      }
    });

    if (!personChanged) return person;
    changed = true;
    return { ...person, shifts, scheduled: true };
  });

  return changed ? next : staffList;
}

/** Convert decimal hour (e.g. 13.5) → "1:30 PM" */
export function formatTime(t) {
  const h = Math.floor(t);
  const m = Math.round((t % 1) * 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m === 0 ? '00' : String(m).padStart(2, '0')} ${suffix}`;
}

/** Return the minimum staff target for a given hour and day-of-week (0=Sun…6=Sat) */
export function getTarget(hour, dow = 1) {
  const rules = dow === 0 ? staffingTargetsByDay.sunday
              : dow === 6 ? staffingTargetsByDay.saturday
              : staffingTargetsByDay.weekday;
  for (const rule of rules) {
    if (hour >= rule.start && hour < rule.end) return rule.min;
  }
  return 0;
}

/** The hours the front desk needs manning on this weekday, or null if none. */
export function getDeskWindow(dow = 1) {
  return deskHoursByDay[dow] ?? null;
}

/**
 * Does the half-hour slot starting at `hour` need someone on the desk?
 *
 * Overlap, not containment: Friday's desk closes at 5:45 PM, which isn't on the
 * 30-minute grid, so the 5:30–6:00 slot still counts as needing cover. Rounding
 * down instead would leave the desk unmanned for the last 15 minutes.
 */
export function isDeskRequired(hour, dow = 1, slot = 0.5) {
  const w = getDeskWindow(dow);
  return w != null && hour < w.end && hour + slot > w.start;
}

/**
 * The days a weekly template records, Monday first.
 *
 * Every template stores all seven, including Saturday, even though the studio is
 * closed then and no editor offers a Saturday tab. The distinction matters on
 * apply: a day a template defines is written (clearing it), while a day it omits
 * is left alone. Recording all seven keeps that behaviour the same no matter
 * which of the three creation paths produced the template.
 *
 * Canonical here because a private copy of this list in the template editor —
 * six days, missing Saturday — is what silently stripped Saturday from any
 * template that was opened and saved.
 */
export const WEEK_DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * True when any part of a shift falls outside what someone said they can work.
 *
 * Availability arrives as a list of blocks, and a student's day is usually
 * several of them with classes in between. The three editors each carried a
 * copy of this that compared the shift against the earliest start and the
 * latest end — the outer envelope — and so never noticed a shift sitting
 * entirely inside a gap. Somebody free 8–11 and 2–6:30 could be scheduled
 * 11:30–1:30, straight through the class that made the gap, with no warning at
 * all. Since fragmented availability is the normal case here, the check was
 * silently useless exactly when it was needed.
 *
 * Blocks are merged before testing, so availability given as 8–11 and 11–2
 * counts as one continuous 8–2 and a shift spanning the join is fine — there is
 * no real gap there. Touching blocks merge; only a genuine hole is a hole.
 */
export function isShiftOutsideAvailability(start, end, blocks) {
  if (!blocks?.length) return true;

  const merged = [...blocks]
    .sort((a, b) => a.start - b.start)
    .reduce((acc, b) => {
      const last = acc[acc.length - 1];
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
      else acc.push({ start: b.start, end: b.end });
      return acc;
    }, []);

  // The whole shift has to sit inside a single merged window. Straddling two
  // windows means crossing the gap between them.
  return !merged.some(w => w.start <= start && w.end >= end);
}

/**
 * A person's shifts, and their desk turns, for whichever day the record
 * describes. Every reader should go through these rather than touching
 * `shiftStart`/`shiftEnd`/`deskStart`/`deskEnd` itself.
 *
 * Those scalars are a fossil of the pre-array model and they are not maintained:
 * removing somebody's shift empties `shifts` but leaves the old numbers behind,
 * and editing one updates the array without touching them. Across the stored
 * data roughly half of them now contradict the array they sit beside.
 *
 * The distinction that matters, and that the old copies of this logic got
 * wrong: an *empty* array means the person explicitly is not working, while a
 * *missing* array means a record old enough to predate the array. Only the
 * second may fall back — and then only when `scheduled` agrees, so a stale
 * scalar can't resurrect a shift that was deleted.
 */
export function shiftsOf(person) {
  if (Array.isArray(person?.shifts)) return person.shifts;
  return person?.scheduled && person?.shiftStart != null
    ? [{ start: person.shiftStart, end: person.shiftEnd }]
    : [];
}

export function deskShiftsOf(person) {
  if (Array.isArray(person?.deskShifts)) return person.deskShifts;
  return person?.scheduled && person?.deskStart != null
    ? [{ start: person.deskStart, end: person.deskEnd }]
    : [];
}

/** Count how many staff are on shift at a given hour. */
export function getStaffCount(staff, hour) {
  return staff.filter(s => shiftsOf(s).some(sh => sh.start <= hour && sh.end > hour)).length;
}

/**
 * Desk turns that no shift of this person's covers.
 *
 * Desk duty is time at the front desk *during a shift*, so a turn outside every
 * shift means somebody is rostered to cover the desk while not in the building
 * — the exact failure the desk-coverage feature exists to prevent, and one the
 * grid renders as though the desk were staffed.
 *
 * Creating and resizing a desk turn are both already constrained to a host
 * shift, and deleting a shift sweeps up the turns sitting on it
 * (orphanedByShiftRemoval). The gap is *editing* a shift: dragging its edge
 * leaves the desk turns where they are, so shrinking 9–5 to 9–12 strands a 3–4
 * desk turn with nothing to notice it.
 *
 * Reported rather than auto-repaired on purpose. Deleting the turn would be
 * surprising for a 30-minute nudge, and moving it into the shortened shift means
 * guessing where the manager wanted it.
 */
export function orphanedDeskTurns(person) {
  const shifts = shiftsOf(person);
  return deskShiftsOf(person).filter(
    d => !shifts.some(sh => sh.start <= d.start && sh.end >= d.end),
  );
}

/**
 * The range a desk turn may be dragged or resized within.
 *
 * Prefers the shift containing it, then one it merely overlaps, then the span of
 * everything the person works that day. The editors previously fell straight
 * back to the whole studio day when no shift contained the turn — which is
 * precisely the already-orphaned case, so the one control that keeps desk time
 * inside a shift stopped doing so exactly when it was needed, letting a stranded
 * turn wander further.
 */
export function deskBoundsFor(person, desk) {
  const shifts = shiftsOf(person);
  const host = shifts.find(sh => sh.start <= desk.start && sh.end >= desk.end)
    ?? shifts.find(sh => desk.start < sh.end && desk.end > sh.start);
  if (host) return { lo: host.start, hi: host.end };
  if (shifts.length) {
    return {
      lo: Math.min(...shifts.map(s => s.start)),
      hi: Math.max(...shifts.map(s => s.end)),
    };
  }
  return { lo: HOURS_START, hi: HOURS_END };
}

/** Alert lines for any desk turn stranded outside its shift. */
function orphanedDeskAlerts(person) {
  const working = shiftsOf(person).length > 0;
  return orphanedDeskTurns(person).map(d => ({
    type: 'yellow',
    text: working
      ? `${person.name}: desk ${formatTime(d.start)}–${formatTime(d.end)} is outside their shift.`
      : `${person.name} is on desk ${formatTime(d.start)}–${formatTime(d.end)} but isn't scheduled to work.`,
  }));
}

/** Return list of conflicts for a person's desk assignments vs events */
export function checkDeskConflicts(person, events) {
  const desks = deskShiftsOf(person);
  const conflicts = [];
  for (const desk of desks) {
    for (const evt of events) {
      if (evt.assignedStaff.includes(person.id) && desk.start < evt.end && desk.end > evt.start) {
        conflicts.push(`Desk overlaps with "${evt.name}"`);
      }
    }
  }
  return conflicts;
}

/** Build the alerts list from current staff + events */
export function buildAlerts(staff, events, dow = 1) {
  const alerts = [];

  for (let h = HOURS_START; h < HOURS_END; h += 0.5) {
    const count = getStaffCount(staff, h);
    const target = getTarget(h, dow);
    if (count < target) {
      alerts.push({
        type: 'understaffed',
        text: `Understaffed ${formatTime(h)}–${formatTime(h + 0.5)}: ${count}/${target} staff.`,
      });
    }
  }

  // Desk coverage gaps — only inside the hours the desk actually needs manning
  // (see deskHoursByDay). Shifts outside that window need no desk cover, so an
  // early opener or a late closer is no longer flagged for it.
  const deskWindow = getDeskWindow(dow);
  const anyoneScheduled = staff.some(s => (s.shifts ?? []).length > 0);
  if (deskWindow && anyoneScheduled) {
    let gapStart = null;
    const closeGap = (end) => {
      if (gapStart === null) return;
      alerts.push({ type: 'yellow', text: `No one on desk ${formatTime(gapStart)}–${formatTime(end)}.` });
      gapStart = null;
    };
    for (let h = deskWindow.start; h < deskWindow.end; h += 0.5) {
      const onDesk = staff.some(s => (s.deskShifts ?? []).some(d => d.start <= h && d.end > h));
      if (!onDesk) {
        if (gapStart === null) gapStart = h;
      } else {
        closeGap(h);
      }
    }
    closeGap(deskWindow.end);
  }

  // Concurrent desk: one alert per conflict window listing everyone on desk at that time
  const withDesks = staff.filter(s => s.deskShifts?.length > 0);
  if (withDesks.length > 1) {
    const times = [...new Set(
      withDesks.flatMap(s => s.deskShifts.flatMap(d => [d.start, d.end]))
    )].sort((a, b) => a - b);

    const seenKey = new Set();
    for (let i = 0; i < times.length - 1; i++) {
      const t = times[i];
      const onDesk = withDesks.filter(s => s.deskShifts.some(d => d.start <= t && d.end > t));
      if (onDesk.length > 1) {
        const key = onDesk.map(s => s.id).sort().join(',');
        if (!seenKey.has(key)) {
          seenKey.add(key);
          const names = onDesk.map(s => s.name);
          const last  = names.pop();
          const nameStr = names.length ? `${names.join(', ')} and ${last}` : last;
          alerts.push({
            type: 'yellow',
            text: `${nameStr} are all on desk at ${formatTime(t)}.`,
          });
        }
      }
    }
  }

  staff.forEach(person => {
    const conflicts = checkDeskConflicts(person, events);
    conflicts.forEach(msg => {
      alerts.push({ type: 'yellow', text: `${person.name}: ${msg}` });
    });
    alerts.push(...orphanedDeskAlerts(person));
  });

  events.forEach(evt => {
    // Count only people actually on shift. Assignment lives on the event, not
    // on each occurrence, so a repeating event keeps whoever was assigned when
    // it was created — even on later weeks where they aren't working. Counting
    // raw `assignedStaff.length` would report such an event as fully covered
    // when nobody assigned is present.
    const assigned = evt.assignedStaff ?? [];
    // "Covered" means on shift *during* the event, not merely working that day —
    // a 9–11 shift can't staff a 3pm event.
    const working = assigned.filter(id => {
      const person = staff.find(p => p.id === id);
      return (person?.shifts ?? []).some(sh => sh.start < evt.end && sh.end > evt.start);
    });

    const gap = evt.staffNeeded - working.length;
    if (gap > 0) {
      alerts.push({
        type: 'event',
        text: `Unfilled: "${evt.name}" needs ${gap} more person(s) (${formatTime(evt.start)}–${formatTime(evt.end)}).`,
      });
    }

    // Name whoever is assigned but not scheduled, so the manager knows who to
    // replace rather than just that a number is short.
    assigned
      .filter(id => !working.includes(id))
      .forEach(id => {
        const person = staff.find(p => p.id === id);
        if (!person) return;   // off the roster entirely — nothing useful to say
        const scheduledAtAll = (person.shifts?.length ?? 0) > 0;
        alerts.push({
          type: 'event',
          text: scheduledAtAll
            ? `${person.name} is assigned to "${evt.name}" but their shift doesn't cover ${formatTime(evt.start)}–${formatTime(evt.end)}.`
            : `${person.name} is assigned to "${evt.name}" but isn't scheduled to work.`,
        });
      });
  });

  if (alerts.length === 0) {
    alerts.push({ type: 'blue', text: 'No issues here, looks good bro!' });
  }

  return alerts;
}


/**
 * Build alerts for templates — desk gaps + concurrent desk only (no staffing
 * minimums, since a template isn't a real day).
 *
 * `dow` is needed for the gap check because desk hours differ by weekday; pass
 * it and gaps are reported, omit it and only concurrency is. The gap half was
 * promised by this function's old comment but never implemented — it matters now
 * that auto-generated templates carry desk shifts of their own.
 */
export function buildTemplateAlerts(staff, dow = null) {
  const alerts = [];

  // Desk coverage gaps, within this weekday's desk hours only.
  const deskWindow = dow == null ? null : getDeskWindow(dow);
  const anyoneScheduled = staff.some(s => (s.shifts ?? []).length > 0);
  if (deskWindow && anyoneScheduled) {
    let gapStart = null;
    const closeGap = (end) => {
      if (gapStart === null) return;
      alerts.push({ type: 'yellow', text: `No one on desk ${formatTime(gapStart)}–${formatTime(end)}.` });
      gapStart = null;
    };
    for (let h = deskWindow.start; h < deskWindow.end; h += 0.5) {
      const onDesk = staff.some(s => (s.deskShifts ?? []).some(d => d.start <= h && d.end > h));
      if (!onDesk) {
        if (gapStart === null) gapStart = h;
      } else {
        closeGap(h);
      }
    }
    closeGap(deskWindow.end);
  }

  // Desk turns stranded outside their shift — same check the daily/weekly
  // editors run; a template can strand one the same way, by resizing a shift.
  staff.forEach(person => alerts.push(...orphanedDeskAlerts(person)));

  // Concurrent desk
  const withDesks = staff.filter(s => s.deskShifts?.length > 0);
  if (withDesks.length > 1) {
    const times = [...new Set(
      withDesks.flatMap(s => s.deskShifts.flatMap(d => [d.start, d.end]))
    )].sort((a, b) => a - b);
    const seenKey = new Set();
    for (let i = 0; i < times.length - 1; i++) {
      const t = times[i];
      const onDesk = withDesks.filter(s => s.deskShifts.some(d => d.start <= t && d.end > t));
      if (onDesk.length > 1) {
        const key = onDesk.map(s => s.id).sort().join(',');
        if (!seenKey.has(key)) {
          seenKey.add(key);
          const names = onDesk.map(s => s.name);
          const last  = names.pop();
          const nameStr = names.length ? `${names.join(', ')} and ${last}` : last;
          alerts.push({ type: 'yellow', text: `${nameStr} are all on desk at ${formatTime(t)}.` });
        }
      }
    }
  }

  if (alerts.length === 0) {
    alerts.push({ type: 'blue', text: 'No desk conflicts. Looks good!' });
  }
  return alerts;
}
