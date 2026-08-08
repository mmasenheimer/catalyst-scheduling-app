"use strict";

// Shared request-body validators.
//
// These exist because several collections are declared as Schema.Types.Mixed —
// convenient for snapshots, but it means Mongoose validates nothing and whatever
// the client sends is what gets stored. That's tolerable for data only the
// manager's editor writes, and not tolerable for availability, which any employee
// can PUT and which is the auto-generator's primary input. Garbage there doesn't
// error, it silently produces a wrong schedule.

// Availability blocks snap to the half hour, matching the grid employees paint on
// (see SLOTS in pages/AvailabilityPage.jsx) and the editor's 30-minute snapping.
const SLOT = 0.5;

// Deliberately clock bounds, not studio hours. Studio hours live in
// src/data/mockData.js, which this process can't import (frontend ESM vs backend
// CommonJS) — and duplicating them here would mean a stale copy silently
// rejecting valid availability the day the studio's hours change. Availability
// outside opening hours is harmless anyway: the generator only ever schedules
// where there's demand. What actually needs catching is nonsense like end: 9999.
const DAY_START = 0;
const DAY_END = 24;

const MAX_BLOCKS_PER_DAY = 24;
const MAX_NOTE_LENGTH = 1000;

const isPlainObject = v => v != null && typeof v === "object" && !Array.isArray(v);
const onGrid = n => Math.abs(n / SLOT - Math.round(n / SLOT)) < 1e-9;

/**
 * Validate an availability `days` map: { "0".."6": [{ start, end }, ...] }.
 * Returns an error string, or null when the value is acceptable.
 */
function validateAvailabilityDays(days) {
  if (!isPlainObject(days)) {
    return "days must be an object keyed by day of week (0–6)";
  }

  for (const [key, blocks] of Object.entries(days)) {
    if (!/^[0-6]$/.test(key)) {
      return `days has an invalid day key "${key}" — expected 0–6`;
    }
    if (!Array.isArray(blocks)) {
      return `days["${key}"] must be an array of { start, end } blocks`;
    }
    if (blocks.length > MAX_BLOCKS_PER_DAY) {
      return `days["${key}"] has ${blocks.length} blocks — the most allowed is ${MAX_BLOCKS_PER_DAY}`;
    }

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const where = `days["${key}"][${i}]`;
      if (!isPlainObject(b)) return `${where} must be an object with start and end`;

      const { start, end } = b;
      if (typeof start !== "number" || !Number.isFinite(start)) {
        return `${where}.start must be a number`;
      }
      if (typeof end !== "number" || !Number.isFinite(end)) {
        return `${where}.end must be a number`;
      }
      if (start >= end) {
        return `${where} ends before it starts (${start}–${end})`;
      }
      if (start < DAY_START || end > DAY_END) {
        return `${where} (${start}–${end}) is outside the ${DAY_START}–${DAY_END} hour range`;
      }
      if (!onGrid(start) || !onGrid(end)) {
        return `${where} (${start}–${end}) must fall on ${SLOT}-hour boundaries`;
      }
    }

    // Overlapping blocks in one day are never something the grid produces, and
    // they'd double-count the same hours. Touching blocks (9–12, 12–15) are fine.
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) {
        return `days["${key}"] has overlapping blocks (${sorted[i - 1].start}–${sorted[i - 1].end} and ${sorted[i].start}–${sorted[i].end})`;
      }
    }
  }

  return null;
}

/** Validate the optional free-text note. Returns an error string, or null. */
function validateNote(note) {
  if (note == null) return null;
  if (typeof note !== "string") return "note must be a string";
  if (note.length > MAX_NOTE_LENGTH) {
    return `note is too long (max ${MAX_NOTE_LENGTH} characters)`;
  }
  return null;
}

// ── Saved schedules ───────────────────────────────────────────────────────────
//
// `Schedule.staff` is Mixed, so Mongoose stores whatever arrives. Until this
// existed the route wrote the body straight through: a `staff` of `"x"` was
// accepted with a 200, and every reader then threw `staff.filter is not a
// function` — leaving that date unrenderable for everyone, with no way to
// repair it from inside the app.
//
// What is deliberately NOT checked here: whether a desk turn sits inside one of
// the person's own shifts. It should — a desk turn outside every shift means
// somebody is covering the front desk while not in the building — but the
// editor auto-saves 600ms after each change, so shrinking a shift would hit
// this state in passing and the manager would get a failed save mid-edit for
// something they were about to fix. That belongs in the coverage warnings, not
// at the API boundary.

const MAX_STAFF_ROWS = 500;
const MAX_INTERVALS = 24;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One { start, end } pair. Returns an error string, or null. */
function validateInterval(iv, where) {
  if (!isPlainObject(iv)) return `${where} must be an object with start and end`;
  const { start, end } = iv;
  if (!Number.isFinite(start)) return `${where}.start must be a number`;
  if (!Number.isFinite(end)) return `${where}.end must be a number`;
  if (start >= end) return `${where} ends before it starts (${start}–${end})`;
  if (start < DAY_START || end > DAY_END) {
    return `${where} (${start}–${end}) is outside the ${DAY_START}–${DAY_END} hour range`;
  }
  if (!onGrid(start) || !onGrid(end)) {
    return `${where} (${start}–${end}) must fall on ${SLOT}-hour boundaries`;
  }
  return null;
}

/** A list of intervals for one person, rejecting overlaps within it. */
function validateIntervalList(list, where) {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return `${where} must be an array`;
  if (list.length > MAX_INTERVALS) {
    return `${where} has ${list.length} entries — the most allowed is ${MAX_INTERVALS}`;
  }
  for (let i = 0; i < list.length; i++) {
    const err = validateInterval(list[i], `${where}[${i}]`);
    if (err) return err;
  }
  // Nobody can be in two places at once, and overlapping entries would
  // double-count toward the weekly hour totals.
  const sorted = [...list].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return `${where} has overlapping entries (${sorted[i - 1].start}–${sorted[i - 1].end} and ${sorted[i].start}–${sorted[i].end})`;
    }
  }
  return null;
}

/**
 * Validate the `staff` snapshot on a saved schedule or a template day.
 * Returns an error string, or null when acceptable.
 *
 * Unknown fields are ignored on purpose: rows carry roster metadata (name,
 * maxHoursPerWeek) and the legacy shiftStart/shiftEnd pair, none of which this
 * needs an opinion about.
 */
function validateScheduleStaff(staff) {
  if (!Array.isArray(staff)) return "staff must be an array";
  if (staff.length > MAX_STAFF_ROWS) {
    return `staff has ${staff.length} rows — the most allowed is ${MAX_STAFF_ROWS}`;
  }

  for (let i = 0; i < staff.length; i++) {
    const person = staff[i];
    const where = `staff[${i}]`;
    if (!isPlainObject(person)) return `${where} must be an object`;
    if (!Number.isInteger(person.id)) return `${where}.id must be a staff id`;

    const shiftErr = validateIntervalList(person.shifts, `${where}.shifts`);
    if (shiftErr) return shiftErr;

    const deskErr = validateIntervalList(person.deskShifts, `${where}.deskShifts`);
    if (deskErr) return deskErr;
  }
  return null;
}

/** The events snapshot stored alongside a day. Only its shape is this route's business. */
function validateScheduleEvents(events) {
  if (events === undefined) return null;
  if (!Array.isArray(events)) return "events must be an array";
  return null;
}

/** A YYYY-MM-DD path parameter that also has to be a real calendar date. */
function validateDateString(date) {
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return "date must be in YYYY-MM-DD form";
  }
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return `${date} is not a real date`;
  }
  return null;
}

// ── Events ────────────────────────────────────────────────────────────────────

const MAX_EVENT_DATES = 366;

/**
 * The dates an event happens on. Returns an error string, or null.
 *
 * An empty list is rejected rather than treated as "unscheduled", because
 * downstream it is not treated as unscheduled: eventOccursOn read a missing or
 * empty `days` as matching *every* date, so one such event appeared on every
 * day of every calendar forever and raised a permanent unfilled-event warning
 * on each of them. That default has been inverted, and this stops the shape
 * being created in the first place.
 */
function validateEventDays(days) {
  if (!Array.isArray(days)) return "days must be an array of YYYY-MM-DD strings";
  if (days.length === 0) return "an event needs at least one date";
  if (days.length > MAX_EVENT_DATES) {
    return `days has ${days.length} entries — the most allowed is ${MAX_EVENT_DATES}`;
  }
  for (let i = 0; i < days.length; i++) {
    const err = validateDateString(days[i]);
    if (err) return `days[${i}]: ${err}`;
  }
  return null;
}

const MAX_STAFF_NEEDED = 100;

/**
 * An event's own fields: its times, how many people it needs, and its
 * recurrence bounds. Returns an error string, or null.
 *
 * On a PATCH, pass the values the event will END UP with rather than only what
 * was sent — the same rule the repeat/multi-date check already follows, because
 * a PATCH can move `start` past an `end` it never mentions.
 *
 * Times reuse validateInterval, so an event is held to the same standard as a
 * shift: finite, ordered, on the half-hour grid, inside a real clock. All three
 * mattered. A backwards event (14→9) still satisfies the overlap test every
 * coverage warning uses — `sh.start < evt.end && sh.end > evt.start` — so a
 * shift of 8–15 reads as covering it and the alerts quietly describe something
 * that cannot happen. Off-grid times can never be matched exactly by a shift,
 * so the event stays permanently "unfilled" no matter who is scheduled.
 */
function validateEventFields({ start, end, staffNeeded, repeatFrom, repeatUntil }) {
  const timeError = validateInterval({ start, end }, "the event's time");
  if (timeError) return timeError;

  if (staffNeeded !== undefined && staffNeeded !== null) {
    if (!Number.isInteger(staffNeeded) || staffNeeded < 0) {
      return "staffNeeded must be a whole number of people, zero or more";
    }
    if (staffNeeded > MAX_STAFF_NEEDED) {
      return `staffNeeded is ${staffNeeded} — the most allowed is ${MAX_STAFF_NEEDED}`;
    }
  }

  for (const [label, value] of [["repeatFrom", repeatFrom], ["repeatUntil", repeatUntil]]) {
    if (value == null || value === "") continue;
    const err = validateDateString(value);
    if (err) return `${label}: ${err}`;
  }
  // YYYY-MM-DD sorts lexicographically the same way it sorts chronologically.
  // Reversed bounds aren't rejected by anything downstream — the recurrence just
  // silently produces nothing past the anchor, with no error to explain it.
  if (repeatFrom && repeatUntil && repeatFrom > repeatUntil) {
    return "repeatFrom must be on or before repeatUntil";
  }
  return null;
}

/** The assignedStaff list's shape. Whether the ids exist is the route's job. */
function validateAssignedStaff(assignedStaff) {
  if (assignedStaff === undefined) return null;
  if (!Array.isArray(assignedStaff)) return "assignedStaff must be an array of staff ids";
  if (assignedStaff.some(id => !Number.isInteger(id))) {
    return "assignedStaff must contain only staff ids";
  }
  return null;
}

// ── Templates ─────────────────────────────────────────────────────────────────
//
// Declared here rather than imported from src/data/mockData.js for the same
// reason as the hour bounds above: that file is frontend ESM and this process is
// CommonJS. Unlike studio hours, weekday names are not policy that can change,
// so the copy cannot drift into rejecting valid data.
const WEEKDAY_NAMES = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

/**
 * A week template's `days` map: { "Monday": { staff: [...] }, ... }.
 * Returns an error string, or null.
 *
 * Any subset of weekdays is allowed — templates made before Saturday was
 * recorded hold six days, and a template is not required to cover the week.
 * What is rejected is an *empty* map, which saves happily and then renders as
 * "This template has no days" with no way to tell it from a real one.
 */
function validateTemplateDays(days) {
  if (!isPlainObject(days)) return "days must be an object keyed by weekday name";
  const names = Object.keys(days);
  if (names.length === 0) return "a weekly template needs at least one day";

  for (const name of names) {
    if (!WEEKDAY_NAMES.has(name)) {
      return `days has an invalid key "${name}" — expected a weekday name`;
    }
    const day = days[name];
    if (!isPlainObject(day)) return `days["${name}"] must be an object with a staff list`;
    if (day.staff !== undefined) {
      const err = validateScheduleStaff(day.staff);
      if (err) return `days["${name}"]: ${err}`;
    }
  }
  return null;
}

/**
 * A template as sent to POST. `type` decides which half has to be present;
 * PATCH validates whichever fields it was given instead, so a rename does not
 * have to resend the whole thing.
 */
function validateTemplateShape({ type, days, staff }) {
  const kind = type ?? "week";
  if (kind !== "week" && kind !== "day") return 'type must be "week" or "day"';

  if (kind === "day") {
    if (staff === undefined) return "a day template needs a staff list";
    return validateScheduleStaff(staff);
  }
  if (days === undefined) return "a weekly template needs a days map";
  return validateTemplateDays(days);
}

module.exports = {
  validateAvailabilityDays,
  validateNote,
  validateScheduleStaff,
  validateScheduleEvents,
  validateDateString,
  validateEventDays,
  validateEventFields,
  validateAssignedStaff,
  validateTemplateDays,
  validateTemplateShape,
  MAX_NOTE_LENGTH,
};
