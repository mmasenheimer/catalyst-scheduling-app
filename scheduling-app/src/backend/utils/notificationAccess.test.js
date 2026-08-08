import { describe, it, expect } from 'vitest';
import { addressedToFilter, isAddressedTo } from './notificationAccess.js';

// These two functions are the entire notification authorization model, and
// notifications carry the Approve/Deny controls for the request pipeline — so a
// mistake here decides who can act on somebody else's shift request, not just
// who can read text.
//
// Eleven live attacks passed against this code during the audit, which says it
// is right today. These say it stays right.
//
// The pairing matters and is easy to break: `addressedToFilter` decides what a
// viewer is *sent*, `isAddressedTo` decides what they may *act on*. If the two
// ever disagree you get a notification somebody can see but not dismiss, or —
// far worse — one they cannot see but can act on by id. Several cases below
// assert the two agree.

const MANAGER = { role: 'manager', staffId: null };
const ALEX = { role: 'employee', staffId: 1 };
const SAM = { role: 'employee', staffId: 2 };

/** Does this viewer's Mongo filter select this notification? */
const filterMatches = (viewer, notif) => {
  const clauses = addressedToFilter(viewer).$or;
  return clauses.some(c => {
    const wanted = c.recipients;
    const actual = notif.recipients;
    return Array.isArray(actual) ? actual.includes(wanted) : actual === wanted;
  });
};

/** The two functions must never disagree about the same notification. */
const agree = (viewer, notif) =>
  filterMatches(viewer, notif) === isAddressedTo(notif, viewer);

describe('addressedToFilter', () => {
  it('gives a manager the broadcast and manager-addressed clauses', () => {
    expect(addressedToFilter(MANAGER)).toEqual({
      $or: [{ recipients: 'all' }, { recipients: 'manager' }],
    });
  });

  it('gives an employee the broadcast and their own id', () => {
    expect(addressedToFilter(ALEX)).toEqual({
      $or: [{ recipients: 'all' }, { recipients: 1 }],
    });
  });

  it('never puts another employee\'s id in the filter', () => {
    const clauses = addressedToFilter(ALEX).$or.map(c => c.recipients);
    expect(clauses).not.toContain(2);
  });

  it('does not let an employee ask for manager notifications', () => {
    // The literal string 'manager' must not appear in an employee's filter —
    // otherwise an employee whose staffId were somehow that string would match.
    const clauses = addressedToFilter(ALEX).$or.map(c => c.recipients);
    expect(clauses).not.toContain('manager');
  });
});

describe('isAddressedTo', () => {
  it('lets everyone see a broadcast', () => {
    const broadcast = { recipients: 'all' };
    expect(isAddressedTo(broadcast, MANAGER)).toBe(true);
    expect(isAddressedTo(broadcast, ALEX)).toBe(true);
  });

  it('restricts manager-addressed notifications to a manager', () => {
    const forManager = { recipients: 'manager' };
    expect(isAddressedTo(forManager, MANAGER)).toBe(true);
    expect(isAddressedTo(forManager, ALEX)).toBe(false);
  });

  it('restricts a per-staff notification to the people named', () => {
    const forAlex = { recipients: [1] };
    expect(isAddressedTo(forAlex, ALEX)).toBe(true);
    expect(isAddressedTo(forAlex, SAM)).toBe(false);
  });

  it('includes everyone named when there are several', () => {
    const forBoth = { recipients: [1, 2] };
    expect(isAddressedTo(forBoth, ALEX)).toBe(true);
    expect(isAddressedTo(forBoth, SAM)).toBe(true);
  });

  it('does not give the manager employee-addressed notifications', () => {
    // Deliberate: the manager used to receive every per-employee notice,
    // including echoes of their own schedule edits.
    expect(isAddressedTo({ recipients: [1] }, MANAGER)).toBe(false);
  });

  it('refuses a recipients value it does not understand', () => {
    // `recipients` is Mixed, so a malformed value is reachable. Refusing is the
    // safe direction: unreachable is a nuisance, readable-by-all is a leak.
    for (const recipients of [null, undefined, 42, '', 'everyone', {}, true]) {
      expect(isAddressedTo({ recipients }, MANAGER)).toBe(false);
      expect(isAddressedTo({ recipients }, ALEX)).toBe(false);
    }
  });

  it('treats an empty recipient list as addressed to nobody', () => {
    expect(isAddressedTo({ recipients: [] }, ALEX)).toBe(false);
    expect(isAddressedTo({ recipients: [] }, MANAGER)).toBe(false);
  });

  it('does not match a manager on their null staffId', () => {
    // A manager's staffId is null. If a notification were ever stored with
    // `recipients: [null]`, it must not become manager-visible by accident.
    expect(isAddressedTo({ recipients: [null] }, MANAGER)).toBe(false);
  });

  it('does not confuse a staff id with its string form', () => {
    expect(isAddressedTo({ recipients: ['1'] }, ALEX)).toBe(false);
  });
});

describe('the two functions agree', () => {
  const notifications = [
    { label: 'broadcast', recipients: 'all' },
    { label: 'manager-addressed', recipients: 'manager' },
    { label: 'addressed to Alex', recipients: [1] },
    { label: 'addressed to Sam', recipients: [2] },
    { label: 'addressed to both', recipients: [1, 2] },
    { label: 'addressed to nobody', recipients: [] },
  ];

  for (const notif of notifications) {
    it(`for a ${notif.label}, what is sent is what can be acted on`, () => {
      expect(agree(MANAGER, notif)).toBe(true);
      expect(agree(ALEX, notif)).toBe(true);
      expect(agree(SAM, notif)).toBe(true);
    });
  }
});
