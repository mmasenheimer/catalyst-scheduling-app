// Mock weekly availability per staff member.
// Keys: staffId → dayOfWeek (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri) → [{start, end}]
// Swap this out for real DB data once the availability API is wired up.
// Saturday omitted — library closed.

const mockAvailability = {
  1: { // Alex M.
    1: [{ start: 8,  end: 16 }],
    2: [{ start: 8,  end: 16 }],
    3: [{ start: 8,  end: 16 }],
    4: [{ start: 8,  end: 16 }],
    5: [{ start: 8,  end: 12 }],
    0: [],
  },
  2: { // Jordan K.
    1: [{ start: 9,  end: 17 }],
    2: [{ start: 9,  end: 17 }],
    3: [],
    4: [{ start: 9,  end: 17 }],
    5: [{ start: 9,  end: 17 }],
    0: [{ start: 10, end: 15 }],
  },
  3: { // Sam P.
    1: [{ start: 10, end: 18 }],
    2: [{ start: 10, end: 18 }],
    3: [{ start: 10, end: 18 }],
    4: [{ start: 10, end: 18 }],
    5: [],
    0: [],
  },
  4: { // Taylor R.
    1: [{ start: 12, end: 18 }],
    2: [],
    3: [{ start: 12, end: 18 }],
    4: [],
    5: [{ start: 12, end: 18 }],
    0: [{ start: 11, end: 18 }],
  },
  5: { // Morgan L.
    1: [{ start: 7,  end: 14 }],
    2: [{ start: 7,  end: 14 }],
    3: [{ start: 7,  end: 14 }],
    4: [{ start: 7,  end: 14 }],
    5: [{ start: 7,  end: 14 }],
    0: [],
  },
  6: { // Casey W.
    1: [],
    2: [{ start: 11, end: 19 }],
    3: [{ start: 11, end: 19 }],
    4: [{ start: 11, end: 19 }],
    5: [{ start: 11, end: 19 }],
    0: [{ start: 12, end: 20 }],
  },
  7: { // Riley B.
    1: [{ start: 14, end: 20 }],
    2: [{ start: 14, end: 20 }],
    3: [],
    4: [{ start: 14, end: 20 }],
    5: [{ start: 14, end: 20 }],
    0: [{ start: 13, end: 20 }],
  },
  8: { // Quinn A.
    1: [{ start: 7,  end: 15 }],
    2: [{ start: 7,  end: 15 }],
    3: [{ start: 7,  end: 15 }],
    4: [],
    5: [{ start: 7,  end: 15 }],
    0: [{ start: 9,  end: 15 }],
  },
};

export function getAvailability(staffId, dayOfWeek) {
  return mockAvailability[staffId]?.[dayOfWeek] ?? [];
}

export default mockAvailability;
