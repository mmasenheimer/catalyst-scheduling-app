import { staffingTargetsByDay } from '../../data/mockData';

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
  const { HOURS_START, HOURS_END } = { HOURS_START: 7, HOURS_END: 22 };

  for (let h = HOURS_START; h < HOURS_END; h += 0.5) {
    const count = getStaffCount(staff, h);
    const target = getTarget(h, dow);
    if (count < target) {
      alerts.push({
        type: 'red',
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
        type: 'yellow',
        text: `Unfilled: "${evt.name}" needs ${gap} more person(s) (${formatTime(evt.start)}–${formatTime(evt.end)}).`,
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({ type: 'blue', text: 'All staffing requirements met! No issues detected.' });
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
