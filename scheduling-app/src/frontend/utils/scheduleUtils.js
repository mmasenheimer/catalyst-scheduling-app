import { staffingTargetsByDay, weeklyTemplates, HOURS_START, HOURS_END } from '../../data/mockData';

const DOW_TO_TPL = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

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

/** Build the full staff list for a date — saved override if one exists, else the day's template, with everyone else blank */
export function getStaffForDate(date, getDaySchedule, allStaff) {
  const saved = getDaySchedule(toDateStr(date)) ?? getDaySchedule(date.toDateString());
  const tplStaff = weeklyTemplates[DOW_TO_TPL[date.getDay()]]?.staff ?? [];
  return mergeStaffOverrides(allStaff, saved ?? tplStaff);
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
 * Staff list for a date, resolved exactly the way the manager's views resolve
 * it: the saved schedule for that date if one exists, otherwise the day's
 * template — always merged onto the live roster. This is what lets the
 * employee-facing pages reflect real schedule changes instead of only the
 * hardcoded weekly template. `savedByDate` comes from buildSavedScheduleMap.
 */
export function staffForDateFromSaved(date, savedByDate, allStaff) {
  const saved = savedByDate?.[toDateStr(date)];
  const tplStaff = weeklyTemplates[DOW_TO_TPL[date.getDay()]]?.staff ?? [];
  return mergeStaffOverrides(allStaff, saved ?? tplStaff);
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
  // No dates at all — treat as an every-day event (matches the calendar,
  // daily and my-schedule views, which is the behaviour users have seen).
  if (!evt?.days?.length) return true;

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

/** Count how many staff are on shift at a given hour (handles shifts array or legacy shiftStart/shiftEnd) */
export function getStaffCount(staff, hour) {
  return staff.filter(s => {
    if (s.shifts?.length) return s.shifts.some(sh => sh.start <= hour && sh.end > hour);
    return s.shiftStart <= hour && s.shiftEnd > hour;
  }).length;
}

/** Return list of conflicts for a person's desk assignments vs events */
export function checkDeskConflicts(person, events) {
  const desks = person.deskShifts?.length
    ? person.deskShifts
    : (person.deskStart != null ? [{ start: person.deskStart, end: person.deskEnd }] : []);
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

/** Return staff members eligible to be assigned to an event */
export function getEligibleStaff(evt, staff, events) {
  return staff.filter(person => {
    if (person.shiftStart > evt.start || person.shiftEnd < evt.end) return false;
    if (evt.assignedStaff.includes(person.id)) return false;
    if (
      person.deskStart !== null &&
      person.deskStart < evt.end &&
      person.deskEnd > evt.start
    ) return false;
    for (const other of events) {
      if (other.id === evt.id) continue;
      if (
        other.assignedStaff.includes(person.id) &&
        other.start < evt.end &&
        other.end > evt.start
      ) return false;
    }
    return true;
  });
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

  // Desk coverage gaps: flag stretches when staff are working but nobody is on desk
  const allShifts = staff.flatMap(s => s.shifts ?? []);
  if (allShifts.length > 0) {
    const dayStart = Math.min(...allShifts.map(sh => sh.start));
    const dayEnd   = Math.max(...allShifts.map(sh => sh.end));
    let gapStart = null;
    for (let h = dayStart; h < dayEnd; h += 0.5) {
      const anyoneWorking = staff.some(s => (s.shifts ?? []).some(sh => sh.start <= h && sh.end > h));
      if (!anyoneWorking) {
        if (gapStart !== null) {
          alerts.push({ type: 'yellow', text: `No one on desk ${formatTime(gapStart)}–${formatTime(h)}.` });
          gapStart = null;
        }
        continue;
      }
      const onDesk = staff.some(s => (s.deskShifts ?? []).some(d => d.start <= h && d.end > h));
      if (!onDesk) {
        if (gapStart === null) gapStart = h;
      } else {
        if (gapStart !== null) {
          alerts.push({ type: 'yellow', text: `No one on desk ${formatTime(gapStart)}–${formatTime(h)}.` });
          gapStart = null;
        }
      }
    }
    if (gapStart !== null) {
      alerts.push({ type: 'yellow', text: `No one on desk ${formatTime(gapStart)}–${formatTime(dayEnd)}.` });
    }
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
  });

  events.forEach(evt => {
    const gap = evt.staffNeeded - evt.assignedStaff.length;
    if (gap > 0) {
      alerts.push({
        type: 'event',
        text: `Unfilled: "${evt.name}" needs ${gap} more person(s) (${formatTime(evt.start)}–${formatTime(evt.end)}).`,
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({ type: 'blue', text: 'No issues here, looks good bro!' });
  }

  return alerts;
}

/** Auto-assign desk shifts to staff who don't have one */
export function autoAssignDesks(staff, events) {
  return staff.map(person => {
    if (person.deskStart !== null) return person;
    for (let h = Math.ceil(person.shiftStart); h < person.shiftEnd - 1; h++) {
      const hasEventConflict = events.some(
        evt => evt.assignedStaff.includes(person.id) && h < evt.end && h + 1 > evt.start
      );
      const othersAtTime = staff.filter(s => s.id !== person.id && s.deskStart === h).length;
      if (!hasEventConflict && othersAtTime === 0) {
        return { ...person, deskStart: h, deskEnd: h + 1 };
      }
    }
    return person;
  });
}

/** Build alerts for templates — desk gaps + concurrent desk only (no staffing minimums) */
export function buildTemplateAlerts(staff) {
  const alerts = [];

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
