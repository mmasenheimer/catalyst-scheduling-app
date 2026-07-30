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

module.exports = { validateAvailabilityDays, validateNote, MAX_NOTE_LENGTH };
