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
