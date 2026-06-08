import { staffingTargets } from '../../data/mockData';

/** Convert decimal hour (e.g. 13.5) → "1:30 PM" */
export function formatTime(t) {
  const h = Math.floor(t);
  const m = Math.round((t % 1) * 60);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m === 0 ? '00' : String(m).padStart(2, '0')} ${suffix}`;
}

/** Return the minimum staff target for a given hour */
export function getTarget(hour) {
  for (const rule of staffingTargets) {
    if (hour >= rule.start && hour < rule.end) return rule.min;
  }
  return 0;
}

/** Count how many staff are on shift at a given hour */
export function getStaffCount(staff, hour) {
  return staff.filter(s => s.shiftStart <= hour && s.shiftEnd > hour).length;
}

/** Return list of conflicts for a person's desk assignment */
export function checkDeskConflicts(person, events) {
  if (person.deskStart === null) return [];
  return events
    .filter(evt =>
      evt.assignedStaff.includes(person.id) &&
      person.deskStart < evt.end &&
      person.deskEnd > evt.start
    )
    .map(evt => `Overlaps with "${evt.name}"`);
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
export function buildAlerts(staff, events) {
  const alerts = [];
  const { HOURS_START, HOURS_END } = { HOURS_START: 7, HOURS_END: 22 };

  for (let h = HOURS_START; h < HOURS_END; h++) {
    const count = getStaffCount(staff, h);
    const target = getTarget(h);
    if (count < target) {
      alerts.push({
        type: 'red',
        text: `Understaffed ${formatTime(h)}–${formatTime(h + 1)}: ${count}/${target} staff.`,
      });
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
