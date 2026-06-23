// Mock weekly availability per staff member.
// Keys: staffId → dayOfWeek (0=Sun, 1=Mon … 5=Fri) → [{start, end}]
// Saturday omitted — library closed.
// Availability windows are intentionally wider than assigned shifts.

function days(mf, sun) {
  return { 1: [mf], 2: [mf], 3: [mf], 4: [mf], 5: [mf], 0: sun ? [sun] : [] };
}

const mockAvailability = {
  // All-day available
  1:  days({ start: 7.5, end: 18.5 }, { start: 12, end: 18.5 }), // Alex C.    shift 7:30–12:30
  5:  days({ start: 7.5, end: 18.5 }, { start: 12, end: 18.5 }), // Helena H.  shift 9–14
  10: days({ start: 7.5, end: 18.5 }, { start: 12, end: 18.5 }), // Langston C. shift 12–17
  13: days({ start: 7.5, end: 18.5 }, { start: 12, end: 18.5 }), // Nova N.    shift 13–18

  // Morning-heavy (~6–7h window, early start)
  2:  days({ start: 7.5, end: 14 },   { start: 12, end: 14 }),   // Anika S.   shift 7:30–12:30
  11: days({ start: 7.5, end: 17 },   { start: 12, end: 17 }),   // Lars L.    shift 12–17

  // Nearly all day (arrive a bit late or leave a bit early)
  3:  days({ start: 8,   end: 18.5 }, { start: 12, end: 18.5 }), // Elise R.   shift 8–13
  8:  days({ start: 8,   end: 18.5 }, { start: 12, end: 18.5 }), // Jo L.      shift 10:30–15:30

  // 3/4 day — middle chunk
  4:  days({ start: 9,   end: 17 },   { start: 12, end: 17 }),   // Heather M. shift 9–14
  7:  days({ start: 9,   end: 16 },   { start: 12, end: 16 }),   // Jesus Q.   shift 10–15

  // Afternoon-focused (~6–8h, starts mid-day or later)
  6:  days({ start: 10,  end: 18.5 }, { start: 12, end: 18.5 }), // Izak M.    shift 10–15
  9:  days({ start: 11,  end: 18 },   { start: 12, end: 18 }),   // Kara U.    shift 11–16
  12: days({ start: 12,  end: 18.5 }, { start: 12, end: 18.5 }), // Mariah E.  shift 12:30–17:30
  14: days({ start: 11,  end: 18.5 }, { start: 12, end: 18.5 }), // Shreyans D. shift 13:30–18:30
  15: days({ start: 12,  end: 18.5 }, { start: 12, end: 18.5 }), // Michael M. shift 13:30–18:30
};

export function getAvailability(staffId, dayOfWeek) {
  return mockAvailability[staffId]?.[dayOfWeek] ?? [];
}

export default mockAvailability;
