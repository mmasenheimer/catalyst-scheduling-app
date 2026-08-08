import { describe, it, expect } from 'vitest';
import { generateWeeklyTemplate, TEMPLATE_DAYS } from './generateTemplate.js';
import { HOURS_START, HOURS_END } from '../../data/mockData.js';

// The generator is pure and deterministic, which makes it worth testing by
// property rather than by example: build many plausible rosters, run the real
// thing, and assert the rules it claims to keep. A fixed-seed PRNG means a
// failure here is reproducible from its seed rather than being a flaky ghost.
//
// The audit that prompted these found 95 shifts shorter than the two-hour
// minimum across 40 rosters, the shortest being thirty minutes. `minShiftHours`
// was being enforced as an eligibility filter at selection time — `couldFormShift`
// checked that the person had a full shift's worth of weekly cap left — and then
// slots assigned later the same day spent that budget before the shift was
// assembled. The gate was honest when it ran and stale by the end.
//
// The first test below is the one that was failing.

const SLOT = 0.5;
const OPTS = { minShiftHours: 2, maxShiftHours: 8, maxDailyHours: 8, maxDeskRun: 1 };

/** Deterministic PRNG — same seed, same roster, every run. */
function rngFor(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/**
 * A student-shaped week: part-time caps, and availability broken into a few
 * blocks a day by classes. Fragmented availability is the normal case here, and
 * it is what produces short shifts.
 */
function rosterFor(seed) {
  const r = rngFor(seed);
  const size = 6 + Math.floor(r() * 10);
  const staff = Array.from({ length: size }, (_, i) => ({
    id: i + 1,
    name: `P${i}`,
    maxHoursPerWeek: [10, 15, 20, 30][Math.floor(r() * 4)],
  }));

  const availabilityByStaff = {};
  for (const s of staff) {
    availabilityByStaff[s.id] = {};
    for (const { dow } of TEMPLATE_DAYS) {
      const blocks = [];
      let cursor = HOURS_START + Math.floor(r() * 4) * SLOT;
      while (cursor < HOURS_END && blocks.length < 3) {
        const end = Math.min(cursor + (1 + Math.floor(r() * 10) * SLOT), HOURS_END);
        if (end - cursor >= SLOT) blocks.push({ start: cursor, end });
        cursor = end + 1 + Math.floor(r() * 4) * SLOT;
      }
      // Some people are simply unavailable on a given day.
      availabilityByStaff[s.id][dow] = r() < 0.1 ? [] : blocks;
    }
  }
  return { staff, availabilityByStaff };
}

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

/** Every shift produced across a whole week, tagged with who and when. */
function allShifts(result) {
  const out = [];
  for (const { name } of TEMPLATE_DAYS) {
    for (const person of result.days[name] ?? []) {
      for (const shift of person.shifts ?? []) out.push({ day: name, person, shift });
    }
  }
  return out;
}

describe('minShiftHours is a post-condition', () => {
  for (const seed of SEEDS) {
    it(`produces no shift under the minimum (seed ${seed})`, () => {
      const result = generateWeeklyTemplate({ ...rosterFor(seed), ...OPTS });
      const short = allShifts(result)
        .filter(({ shift }) => shift.end - shift.start < OPTS.minShiftHours)
        .map(({ day, person, shift }) => `${person.name} ${day} ${shift.start}–${shift.end}`);
      expect(short).toEqual([]);
    });
  }

  it('reports every dropped shift rather than discarding it silently', () => {
    // A shift that cannot reach the minimum is dropped, which costs coverage.
    // That trade is only defensible if the manager can see it, so the drop must
    // always surface as a warning.
    const result = generateWeeklyTemplate({ ...rosterFor(1), ...OPTS });
    const drops = result.warnings.filter((w) => /was dropped/.test(w));
    expect(drops.length).toBeGreaterThan(0);
    for (const w of drops) {
      expect(w).toMatch(/couldn't reach 2h within their weekly cap/);
    }
  });

  it('leaves nobody on the schedule with no shifts', () => {
    // Dropping can remove a person's only block. If they were still pushed onto
    // the day, `shifts[0].start` in the sort would throw — and the row would
    // render as a scheduled person working nothing.
    for (const seed of SEEDS) {
      const result = generateWeeklyTemplate({ ...rosterFor(seed), ...OPTS });
      for (const { name } of TEMPLATE_DAYS) {
        for (const person of result.days[name] ?? []) {
          expect(person.shifts.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('the constraints that must never bend', () => {
  // Dropping a shift hands hours back to the weekly and daily budgets. These
  // guard the arithmetic of that refund: a bookkeeping slip would show up as a
  // cap breach rather than as anything obviously wrong in the output.
  it('never schedules anyone past their weekly cap', () => {
    for (const seed of SEEDS) {
      const roster = rosterFor(seed);
      const result = generateWeeklyTemplate({ ...roster, ...OPTS });
      const worked = new Map();
      for (const { person, shift } of allShifts(result)) {
        worked.set(person.id, (worked.get(person.id) ?? 0) + (shift.end - shift.start));
      }
      for (const s of roster.staff) {
        expect(worked.get(s.id) ?? 0).toBeLessThanOrEqual(s.maxHoursPerWeek);
      }
    }
  });

  it('never schedules anyone past the daily limit', () => {
    for (const seed of SEEDS) {
      const result = generateWeeklyTemplate({ ...rosterFor(seed), ...OPTS });
      for (const { name } of TEMPLATE_DAYS) {
        for (const person of result.days[name] ?? []) {
          const total = person.shifts.reduce((a, sh) => a + (sh.end - sh.start), 0);
          expect(total).toBeLessThanOrEqual(OPTS.maxDailyHours);
        }
      }
    }
  });

  it('never schedules anyone outside their stated availability', () => {
    for (const seed of SEEDS) {
      const roster = rosterFor(seed);
      const result = generateWeeklyTemplate({ ...roster, ...OPTS });
      for (const { name, dow } of TEMPLATE_DAYS) {
        for (const person of result.days[name] ?? []) {
          // Touching windows (8:30–13:00 and 13:00–13:30) are one stretch, so
          // merge before testing containment. Checking against a single window
          // is the mistake that made this look broken when it wasn't.
          const merged = [...(roster.availabilityByStaff[person.id]?.[dow] ?? [])]
            .sort((a, b) => a.start - b.start)
            .reduce((acc, b) => {
              const last = acc[acc.length - 1];
              if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
              else acc.push({ ...b });
              return acc;
            }, []);
          for (const sh of person.shifts) {
            expect(merged.some((w) => w.start <= sh.start && w.end >= sh.end)).toBe(true);
          }
        }
      }
    }
  });

  it('is deterministic and unaffected by roster order', () => {
    const roster = rosterFor(7);
    const a = generateWeeklyTemplate({ ...roster, ...OPTS });
    const b = generateWeeklyTemplate({ ...roster, ...OPTS });
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));

    // Reversing the roster must not change anyone's hours. Greedy schedulers
    // often fail this, and it would mean the template depended on row order.
    const hoursOf = (res) => {
      const m = {};
      for (const { person, shift } of allShifts(res)) {
        m[person.id] = (m[person.id] ?? 0) + (shift.end - shift.start);
      }
      return m;
    };
    const reversed = generateWeeklyTemplate({
      staff: [...roster.staff].reverse(),
      availabilityByStaff: roster.availabilityByStaff,
      ...OPTS,
    });
    expect(hoursOf(reversed)).toEqual(hoursOf(a));
  });
});

describe('degenerate input', () => {
  const days = () => Object.fromEntries(TEMPLATE_DAYS.map(({ dow }) => [dow, []]));

  it('handles an empty roster', () => {
    const res = generateWeeklyTemplate({ staff: [], availabilityByStaff: {}, ...OPTS });
    for (const { name } of TEMPLATE_DAYS) expect(res.days[name]).toEqual([]);
  });

  it('handles staff who submitted no availability', () => {
    const staff = [{ id: 1, name: 'A', maxHoursPerWeek: 20 }];
    const res = generateWeeklyTemplate({
      staff,
      availabilityByStaff: { 1: days() },
      ...OPTS,
    });
    for (const { name } of TEMPLATE_DAYS) expect(res.days[name]).toEqual([]);
    expect(res.gaps.length).toBeGreaterThan(0);
  });

  it('schedules nobody when every window is shorter than the minimum', () => {
    // Each person can offer only 30 minutes a day. Before the post-condition
    // existed this produced a week of half-hour shifts.
    const staff = [1, 2, 3].map((id) => ({ id, name: `P${id}`, maxHoursPerWeek: 20 }));
    const availabilityByStaff = {};
    for (const s of staff) {
      availabilityByStaff[s.id] = Object.fromEntries(
        TEMPLATE_DAYS.map(({ dow }) => [dow, [{ start: 10, end: 10.5 }]]),
      );
    }
    const res = generateWeeklyTemplate({ staff, availabilityByStaff, ...OPTS });
    expect(allShifts(res)).toEqual([]);
  });
});
