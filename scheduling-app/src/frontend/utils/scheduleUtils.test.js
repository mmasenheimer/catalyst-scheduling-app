import { describe, it, expect } from 'vitest';
import {
  isShiftOutsideAvailability,
  shiftsOf,
  deskShiftsOf,
  eventOccursOn,
  orphanedDeskTurns,
  deskBoundsFor,
  mergeAdjacentShifts,
  getStaffCount,
  DUTY_KINDS,
  COVERAGE_DUTY_KINDS,
  getDutyWindow,
  dutyShiftsOf,
  orphanedDutyTurns,
  buildAlerts,
  oneOnOneLabel,
  orphanedByShiftRemoval,
  activeDutyKinds,
  buildTemplateAlerts,
  removeShiftAndSweep,
} from './scheduleUtils';

// Every case below corresponds to a bug that actually shipped and survived in
// this codebase, or to the boundary immediately beside it. That is the selection
// rule for this file: a test earns its place by describing something that has
// broken, not by chasing coverage.
//
// These are pure functions over plain data — no database, no DOM, no mocking.

const person = (over = {}) => ({ id: 1, name: 'Alex C.', shifts: [], deskShifts: [], ...over });
const at = (start, end) => ({ start, end });

describe('isShiftOutsideAvailability', () => {
  // The check used to compare a shift against the earliest start and latest end
  // across all blocks — the outer envelope — so a shift sitting entirely inside
  // the gap between two blocks raised no warning at all. Fragmented availability
  // is the normal case here (students with classes), so it failed precisely
  // where it was needed.
  const student = [at(8, 11), at(14, 18.5)]; // class 11-2

  it('flags a shift lying entirely inside the gap', () => {
    expect(isShiftOutsideAvailability(11.5, 13.5, student)).toBe(true);
  });

  it('flags a shift spanning the gap', () => {
    expect(isShiftOutsideAvailability(10, 15, student)).toBe(true);
  });

  it('flags a shift that starts inside a block and ends in the gap', () => {
    expect(isShiftOutsideAvailability(10.5, 11.5, student)).toBe(true);
  });

  it('allows a shift inside either block', () => {
    expect(isShiftOutsideAvailability(9, 10, student)).toBe(false);
    expect(isShiftOutsideAvailability(15, 17, student)).toBe(false);
  });

  it('allows a shift exactly filling a block', () => {
    expect(isShiftOutsideAvailability(8, 11, student)).toBe(false);
  });

  it('treats touching blocks as one continuous window', () => {
    // 8-11 and 11-2 have no gap between them, so 10-12 is inside.
    expect(isShiftOutsideAvailability(10, 12, [at(8, 11), at(11, 14)])).toBe(false);
  });

  it('ignores the order blocks arrive in', () => {
    const reversed = [at(14, 18.5), at(8, 11)];
    expect(isShiftOutsideAvailability(11.5, 13.5, reversed)).toBe(true);
    expect(isShiftOutsideAvailability(9, 10, reversed)).toBe(false);
  });

  it('treats absent or empty availability as outside, without throwing', () => {
    expect(isShiftOutsideAvailability(9, 10, [])).toBe(true);
    expect(isShiftOutsideAvailability(9, 10, null)).toBe(true);
    expect(isShiftOutsideAvailability(9, 10, undefined)).toBe(true);
  });
});

describe('shiftsOf / deskShiftsOf', () => {
  // Removing a shift empties `shifts` but leaves the legacy shiftStart/shiftEnd
  // scalars behind. Readers that fell back on those whenever `shifts` was empty
  // resurrected deleted shifts — 130 stored rows produced a phantom, and the
  // phantom also inflated the headcount that drives understaffing alerts.
  it('gives no shifts to somebody unscheduled with stale scalars', () => {
    const stale = person({ shifts: [], scheduled: false, shiftStart: 12.5, shiftEnd: 17.5 });
    expect(shiftsOf(stale)).toEqual([]);
  });

  it('keeps the shifts of somebody who is working', () => {
    expect(shiftsOf(person({ shifts: [at(7.5, 12.5)] }))).toHaveLength(1);
  });

  it('still reads a record predating the shifts array', () => {
    // A *missing* array means an old record; an *empty* one means not working.
    expect(shiftsOf({ id: 9, scheduled: true, shiftStart: 9, shiftEnd: 14 })).toEqual([at(9, 14)]);
  });

  it('will not resurrect a legacy record marked unscheduled', () => {
    expect(shiftsOf({ id: 9, scheduled: false, shiftStart: 9, shiftEnd: 14 })).toEqual([]);
  });

  it('applies the same rule to desk turns', () => {
    expect(deskShiftsOf(person({ deskShifts: [], deskStart: 14, deskEnd: 15 }))).toEqual([]);
    expect(deskShiftsOf(person({ deskShifts: [at(11, 12)] }))).toHaveLength(1);
  });

  it('survives null and undefined input', () => {
    expect(shiftsOf(null)).toEqual([]);
    expect(deskShiftsOf(undefined)).toEqual([]);
  });
});

describe('getStaffCount', () => {
  // Counted a person with stale scalars as present, so days looked better
  // staffed than they were and understaffing warnings were suppressed.
  const roster = [
    person({ id: 1, shifts: [at(9, 17)] }),
    person({ id: 2, shifts: [at(13, 18)] }),
    person({ id: 3, shifts: [], scheduled: false, shiftStart: 12.5, shiftEnd: 17.5 }),
  ];

  it('does not count somebody unscheduled with stale scalars', () => {
    expect(getStaffCount(roster, 14)).toBe(2);
  });

  it('counts the start of a shift but not its end', () => {
    // Half-open [start, end): the 5pm slot belongs to the next shift, not this one.
    expect(getStaffCount([person({ shifts: [at(9, 17)] })], 9)).toBe(1);
    expect(getStaffCount([person({ shifts: [at(9, 17)] })], 17)).toBe(0);
  });

  it('counts each person once however many shifts they work', () => {
    expect(getStaffCount([person({ shifts: [at(8, 11), at(14, 18)] })], 15)).toBe(1);
  });
});

describe('eventOccursOn', () => {
  // An event with no dates used to match *every* date, so one such event
  // appeared on every day of every calendar forever and raised a permanent
  // unfilled-event warning on each.
  it('places an event with no dates on no day', () => {
    const ghost = { id: 1, days: [] };
    expect(eventOccursOn(ghost, new Date(2026, 7, 3))).toBe(false);
    expect(eventOccursOn(ghost, new Date(2030, 5, 14))).toBe(false);
  });

  it('treats a missing days field the same way', () => {
    expect(eventOccursOn({ id: 1 }, new Date(2026, 7, 3))).toBe(false);
  });

  it('places a one-off event on its own date only', () => {
    const evt = { id: 1, days: ['2026-08-10'] };
    expect(eventOccursOn(evt, new Date(2026, 7, 10))).toBe(true);
    expect(eventOccursOn(evt, new Date(2026, 7, 9))).toBe(false);
  });

  it('repeats a weekly event on the same weekday', () => {
    const weekly = { id: 1, days: ['2026-08-10'], repeating: true }; // a Monday
    expect(eventOccursOn(weekly, new Date(2026, 7, 17))).toBe(true);
    expect(eventOccursOn(weekly, new Date(2026, 7, 18))).toBe(false);
  });

  it('never repeats backwards before its anchor date', () => {
    const weekly = { id: 1, days: ['2026-08-10'], repeating: true };
    expect(eventOccursOn(weekly, new Date(2026, 7, 3))).toBe(false);
  });

  it('honours repeatUntil as an inclusive bound', () => {
    const weekly = { id: 1, days: ['2026-08-10'], repeating: true, repeatUntil: '2026-08-17' };
    expect(eventOccursOn(weekly, new Date(2026, 7, 17))).toBe(true);
    expect(eventOccursOn(weekly, new Date(2026, 7, 24))).toBe(false);
  });

  it('compares by calendar date, not by time of day', () => {
    // Local-midnight dates and mid-afternoon dates must agree.
    const evt = { id: 1, days: ['2026-08-10'] };
    expect(eventOccursOn(evt, new Date(2026, 7, 10, 15, 30))).toBe(true);
  });
});

describe('orphanedDeskTurns / deskBoundsFor', () => {
  // Editing a shift leaves its desk turns behind, and nothing noticed: the desk
  // read as staffed while nobody was in the building.
  it('flags a desk turn outside every shift', () => {
    const stranded = person({ shifts: [at(9, 12)], deskShifts: [at(15, 16)] });
    expect(orphanedDeskTurns(stranded)).toHaveLength(1);
  });

  it('accepts a desk turn flush with either edge of its shift', () => {
    expect(orphanedDeskTurns(person({ shifts: [at(9, 17)], deskShifts: [at(9, 10)] }))).toHaveLength(0);
    expect(orphanedDeskTurns(person({ shifts: [at(9, 17)], deskShifts: [at(16, 17)] }))).toHaveLength(0);
  });

  it('accepts a desk turn inside the second block of a split day', () => {
    const split = person({ shifts: [at(8, 11), at(14, 18)], deskShifts: [at(15, 16)] });
    expect(orphanedDeskTurns(split)).toHaveLength(0);
  });

  it('flags a desk turn that only partly overlaps a shift', () => {
    const hanging = person({ shifts: [at(9, 12)], deskShifts: [at(11, 13)] });
    expect(orphanedDeskTurns(hanging)).toHaveLength(1);
  });

  it('confines a resize to the shift that hosts the turn', () => {
    const p = person({ shifts: [at(9, 17)], deskShifts: [at(11, 12)] });
    expect(deskBoundsFor(p, at(11, 12))).toEqual({ lo: 9, hi: 17 });
  });

  it('confines a stranded turn to the shift rather than the whole day', () => {
    // This used to widen to studio hours (7-20) exactly when the turn was
    // already outside every shift, letting it wander further.
    const p = person({ shifts: [at(9, 12)], deskShifts: [at(15, 16)] });
    expect(deskBoundsFor(p, at(15, 16))).toEqual({ lo: 9, hi: 12 });
  });
});

describe('mergeAdjacentShifts', () => {
  it('joins shifts that touch exactly', () => {
    expect(mergeAdjacentShifts([at(9, 12), at(12, 15)])).toEqual([at(9, 15)]);
  });

  it('joins overlapping shifts', () => {
    expect(mergeAdjacentShifts([at(9, 13), at(12, 15)])).toEqual([at(9, 15)]);
  });

  it('leaves a genuine gap alone', () => {
    const split = [at(8, 11), at(14, 18)];
    expect(mergeAdjacentShifts(split)).toHaveLength(2);
  });

  it('merges regardless of the order given', () => {
    expect(mergeAdjacentShifts([at(12, 15), at(9, 12)])).toEqual([at(9, 15)]);
  });

  it('returns the original array when nothing merges', () => {
    // Identity is load-bearing: callers use it to decide whether state changed.
    const untouched = [at(9, 12)];
    expect(mergeAdjacentShifts(untouched)).toBe(untouched);
  });
});

describe('1-1 duty kind', () => {
  // A 1-1 was added to DUTIES so it would inherit the bar mechanics (host-shift
  // bounds, orphan detection, deletion sweeps). But every existing consumer of
  // DUTIES assumed a duty is a *staffed post*, which a 1-1 is not: nothing
  // requires one to happen, and any number can run at once. These tests pin the
  // two halves of that distinction, because getting it wrong doesn't error — it
  // silently invents coverage requirements, or crashes template generation on a
  // DUTY_GEN lookup that has no entry for it.

  it('is a duty, but not a coverage duty', () => {
    expect(DUTY_KINDS).toContain('oneOnOne');
    expect(COVERAGE_DUTY_KINDS).not.toContain('oneOnOne');
    // The posts that do need covering are still both there.
    expect(COVERAGE_DUTY_KINDS).toEqual(['desk', 'vr']);
  });

  it('has no coverage window on any weekday, so no gap can be reported', () => {
    for (let dow = 0; dow <= 6; dow++) {
      expect(getDutyWindow('oneOnOne', dow)).toBeNull();
    }
  });

  it('reads its turns from the array with no legacy scalar fallback', () => {
    // Desk and VR fall back to pre-array scalars on old rows. A 1-1 postdates
    // those, and `legacyStart: null` must not become a `person[null]` lookup.
    const p = person({ scheduled: true, oneOnOnes: [at(13, 14)] });
    expect(dutyShiftsOf(p, 'oneOnOne')).toEqual([at(13, 14)]);
    expect(dutyShiftsOf(person({ scheduled: true }), 'oneOnOne')).toEqual([]);
  });

  it('flags a 1-1 left outside its shift, the same as a desk turn', () => {
    // Shrinking a shift strands whatever sat on it. This is the one alert a 1-1
    // still earns, because the grid would otherwise draw it on an unscheduled row.
    const p = person({ shifts: [at(9, 12)], oneOnOnes: [at(15, 16)] });
    expect(orphanedDutyTurns(p, 'oneOnOne')).toEqual([at(15, 16)]);
    expect(orphanedDutyTurns(person({ shifts: [at(9, 17)], oneOnOnes: [at(15, 16)] }), 'oneOnOne')).toEqual([]);
  });

  it('never reports a coverage gap or a double-booking for 1-1s', () => {
    // Two people in 1-1s at the same time is normal, and a day with none is not
    // short of anything. buildAlerts must say nothing about either.
    const staff = [
      person({ id: 1, name: 'Alex C.', shifts: [at(9, 17)], vrShifts: [], oneOnOnes: [at(10, 11)] }),
      person({ id: 2, name: 'Bo D.',   shifts: [at(9, 17)], vrShifts: [], oneOnOnes: [at(10, 11)] }),
    ];
    const texts = buildAlerts(staff, [], 1).map(a => a.text).join(' | ');
    expect(texts).not.toMatch(/1-1/);
  });
});

describe('oneOnOneLabel', () => {
  // The bar is about an hour of timeline wide, so the full sentence only fits in
  // the tooltip. Both fields are optional while the manager is still filling the
  // freshly-dropped bar in, and neither absence may render as "undefined".
  it('reads as a sentence when both fields are filled', () => {
    const turn = { kind: 'Embroidery', withWhom: 'Sarah' };
    expect(oneOnOneLabel(turn)).toBe('Embroidery One-One with Sarah');
    expect(oneOnOneLabel(turn, { short: true })).toBe('1:1 · Sarah');
  });

  it('degrades cleanly when either field is missing', () => {
    expect(oneOnOneLabel({ kind: 'Laser' })).toBe('Laser One-One');
    expect(oneOnOneLabel({ withWhom: 'Sarah' })).toBe('One-One with Sarah');
    expect(oneOnOneLabel({})).toBe('One-One');
    expect(oneOnOneLabel({}, { short: true })).toBe('1:1');
    // A bar dropped a moment ago, not yet edited.
    expect(oneOnOneLabel({ kind: '', withWhom: '' }, { short: true })).toBe('1:1');
    expect(oneOnOneLabel(undefined)).toBe('One-One');
  });

  it('ignores whitespace-only input rather than printing a dangling "with"', () => {
    expect(oneOnOneLabel({ kind: '  ', withWhom: '  ' })).toBe('One-One');
  });
});

describe('orphanedByShiftRemoval with 1-1s', () => {
  // Deleting a shift has to sweep up the 1-1s sitting on it, or they stay drawn
  // on a row that is no longer scheduled. The 1-1 list is the sixth positional
  // argument, appended so existing callers keep working — a caller that forgets
  // to pass it gets an empty list, which is how the Weekly view silently stopped
  // sweeping VR turns.
  it('returns only the 1-1s the remaining shifts no longer cover', () => {
    const removed = at(9, 12);
    const remaining = [at(14, 18)];
    const oneOnOnes = [at(10, 11), at(15, 16)];
    const result = orphanedByShiftRemoval(removed, remaining, [], [], [], oneOnOnes);
    expect(result.oneOnOnes).toEqual([at(10, 11)]);
  });

  it('defaults to an empty list when no 1-1s are passed', () => {
    expect(orphanedByShiftRemoval(at(9, 12), [], [], []).oneOnOnes).toEqual([]);
  });
});

describe('disabling a duty studio-wide', () => {
  // A studio can switch the VR post off (see context/SettingsContext). The flag is
  // runtime state from the backend, so it can't live in the module-level DUTIES
  // table — it has to be passed in. These pin that a disabled post produces no
  // alerts of any kind, while leaving the posts still in use untouched.

  const scheduled = over => person({ shifts: [at(9, 17)], deskShifts: [], vrShifts: [], ...over });

  it('drops the disabled kind and keeps the rest', () => {
    expect(activeDutyKinds(['desk', 'vr'], ['vr'])).toEqual(['desk']);
    expect(activeDutyKinds(['desk', 'vr'], [])).toEqual(['desk', 'vr']);
    // No argument means nothing is disabled — that default is what keeps every
    // existing call site working unchanged.
    expect(activeDutyKinds(['desk', 'vr'])).toEqual(['desk', 'vr']);
  });

  it('reports no VR coverage gap once VR is off', () => {
    // Monday has a VR window, and nobody is on it — normally a gap alert.
    const staff = [scheduled()];
    expect(buildAlerts(staff, [], 1).some(a => /VR/.test(a.text))).toBe(true);
    expect(buildAlerts(staff, [], 1, { disabledDuties: ['vr'] }).some(a => /VR/.test(a.text))).toBe(false);
  });

  it('still reports the desk gap that is genuinely there', () => {
    // Switching VR off must not silence desk: the point is to remove one post,
    // not to quieten the alerts bar.
    const staff = [scheduled()];
    const texts = buildAlerts(staff, [], 1, { disabledDuties: ['vr'] }).map(a => a.text).join(' | ');
    expect(texts).toMatch(/desk/i);
  });

  it('stops flagging a stranded VR turn, and the desk/VR room clash', () => {
    // Both of these are about VR existing. With VR off there is no VR turn to be
    // stranded and no second room to double-book.
    const stranded = person({ shifts: [at(9, 12)], deskShifts: [at(10, 11)], vrShifts: [at(15, 16)] });
    const on  = buildAlerts([stranded], [], 1).map(a => a.text).join(' | ');
    const off = buildAlerts([stranded], [], 1, { disabledDuties: ['vr'] }).map(a => a.text).join(' | ');
    expect(on).toMatch(/VR/);
    expect(off).not.toMatch(/VR/);
  });

  it('says so in the template all-clear line', () => {
    const clear = person({ shifts: [at(9, 17)], deskShifts: [at(9, 17)], vrShifts: [] });
    const off = buildTemplateAlerts([clear], null, { disabledDuties: ['vr'] });
    expect(off.map(a => a.text).join(' ')).not.toMatch(/VR/);
  });
});

describe('removeShiftAndSweep', () => {
  // The bug: dragging a shift bar to the trash deleted the shift and marked the
  // row Unscheduled, but its desk turn, VR turn, 1-1 and event assignment stayed
  // drawn on the row. Cause: the same-row drag handler repositions a shift live as
  // the cursor moves, so a bar dragged up to the trash arrives with its start/end
  // set to wherever the cursor last crossed the timeline. The sweep compared the
  // stranded items against *that* position, found no overlap, and kept them all.

  const loaded = () => person({
    shifts: [{ id: 's1', start: 9, end: 17 }],
    deskShifts: [{ id: 'd1', start: 10, end: 11 }],
    vrShifts: [{ id: 'v1', start: 13, end: 14 }],
    oneOnOnes: [{ id: 'o1', start: 15, end: 16, kind: 'Laser', withWhom: 'Sarah' }],
  });
  const evt = { id: 7, start: 11, end: 12, assignedStaff: [1] };

  it('clears everything that sat on the only shift', () => {
    const { person: swept, events } = removeShiftAndSweep(loaded(), 0, [evt]);
    expect(swept.shifts).toEqual([]);
    expect(swept.scheduled).toBe(false);
    expect(swept.deskShifts).toEqual([]);
    expect(swept.vrShifts).toEqual([]);
    expect(swept.oneOnOnes).toEqual([]);
    expect(events).toEqual([evt]);
  });

  it('sweeps against the extent given, not where the bar ended up', () => {
    // Reproduces the drag: the shift has been moved to 17–21 by the time it is
    // dropped on the trash, far from the 10–11 desk turn and 15–16 1-1.
    const dragged = { ...loaded(), shifts: [{ id: 's1', start: 17, end: 21 }] };

    // Without the override — the old behaviour — nothing is found.
    const naive = removeShiftAndSweep(dragged, 0, [evt]);
    expect(naive.person.deskShifts).toHaveLength(1);
    expect(naive.person.oneOnOnes).toHaveLength(1);
    expect(naive.events).toEqual([]);

    // With the extent captured at drag start, everything is swept.
    const fixed = removeShiftAndSweep(dragged, 0, [evt], { start: 9, end: 17 });
    expect(fixed.person.deskShifts).toEqual([]);
    expect(fixed.person.vrShifts).toEqual([]);
    expect(fixed.person.oneOnOnes).toEqual([]);
    expect(fixed.events).toEqual([evt]);
  });

  it('leaves alone whatever a second shift still covers', () => {
    // Deleting the morning shift must not strip the afternoon's desk turn.
    const two = person({
      shifts: [{ id: 's1', start: 9, end: 12 }, { id: 's2', start: 14, end: 18 }],
      deskShifts: [{ id: 'd1', start: 10, end: 11 }, { id: 'd2', start: 15, end: 16 }],
      vrShifts: [],
      oneOnOnes: [],
    });
    const { person: swept } = removeShiftAndSweep(two, 0, []);
    expect(swept.shifts.map(s => s.id)).toEqual(['s2']);
    expect(swept.scheduled).toBe(true);
    expect(swept.deskShifts.map(d => d.id)).toEqual(['d2']);
  });

  it('is a no-op on an index that isn\'t there', () => {
    const p = loaded();
    expect(removeShiftAndSweep(p, 4, []).person).toBe(p);
  });
});
