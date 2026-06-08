// ── Time constants ────────────────────────────────────────────────────────────
export const HOURS_START = 7;
export const HOURS_END = 22;

// ── Staff ─────────────────────────────────────────────────────────────────────
export const initialStaff = [
  { id: 1,  name: 'Alex M.',    role: 'Senior',    shiftStart: 8,    shiftEnd: 16,   deskStart: 10,  deskEnd: 11  },
  { id: 2,  name: 'Jordan K.',  role: 'Regular',   shiftStart: 9,    shiftEnd: 17,   deskStart: 13,  deskEnd: 14  },
  { id: 3,  name: 'Sam P.',     role: 'Regular',   shiftStart: 10,   shiftEnd: 18,   deskStart: null, deskEnd: null },
  { id: 4,  name: 'Taylor R.',  role: 'Part-time', shiftStart: 12,   shiftEnd: 18,   deskStart: 14,  deskEnd: 15  },
  { id: 5,  name: 'Morgan L.',  role: 'Senior',    shiftStart: 8,    shiftEnd: 14,   deskStart: 9,   deskEnd: 10  },
  { id: 6,  name: 'Casey W.',   role: 'Regular',   shiftStart: 11,   shiftEnd: 19,   deskStart: null, deskEnd: null },
  { id: 7,  name: 'Riley B.',   role: 'Part-time', shiftStart: 14,   shiftEnd: 20,   deskStart: 16,  deskEnd: 17  },
  { id: 8,  name: 'Quinn A.',   role: 'Regular',   shiftStart: 7,    shiftEnd: 15,   deskStart: 8,   deskEnd: 9   },
];

// ── Staffing targets ──────────────────────────────────────────────────────────
export const staffingTargets = [
  { start: 7,  end: 9,  min: 2 },
  { start: 9,  end: 12, min: 3 },
  { start: 12, end: 14, min: 4 },
  { start: 14, end: 17, min: 3 },
  { start: 17, end: 20, min: 2 },
  { start: 20, end: 22, min: 1 },
];

// ── Events ────────────────────────────────────────────────────────────────────
export const initialEvents = [
  {
    id: 1,
    name: 'Story Time',
    type: 'program',
    start: 10,
    end: 11,
    staffNeeded: 2,
    assignedStaff: [1, 5],
    notes: 'Children\'s program room',
  },
  {
    id: 2,
    name: 'Book Club',
    type: 'program',
    start: 13,
    end: 14.5,
    staffNeeded: 1,
    assignedStaff: [2],
    notes: 'Meeting room A',
  },
  {
    id: 3,
    name: 'Tech Help Session',
    type: 'service',
    start: 15,
    end: 17,
    staffNeeded: 2,
    assignedStaff: [4],
    notes: 'Needs one more person',
  },
];

// ── Weekly templates ──────────────────────────────────────────────────────────
export const weeklyTemplates = {
  Monday:    { staff: initialStaff.slice(0, 5), events: [] },
  Tuesday:   { staff: initialStaff.slice(1, 6), events: [] },
  Wednesday: { staff: initialStaff,             events: initialEvents },
  Thursday:  { staff: initialStaff.slice(2, 7), events: [] },
  Friday:    { staff: initialStaff.slice(0, 6), events: [] },
  Saturday:  { staff: initialStaff.slice(3, 7), events: [] },
  Sunday:    { staff: initialStaff.slice(5),    events: [] },
};
