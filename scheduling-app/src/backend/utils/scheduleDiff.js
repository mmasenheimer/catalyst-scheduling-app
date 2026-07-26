"use strict";

// Works out what actually changed about each person's shifts between two saved
// staff snapshots, and phrases it as something worth reading. Used to notify
// employees when a published schedule changes underneath them.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 13.5 → "1:30 PM" (mirrors the frontend's formatTime). */
function formatTime(t) {
  const h = Math.floor(t);
  const min = Math.round((t % 1) * 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${min === 0 ? "00" : String(min).padStart(2, "0")} ${suffix}`;
}

/** "2026-08-13" → "Thu, Aug 13". Parsed by parts to avoid any UTC shift. */
function formatDayLabel(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return String(dateStr);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

// Accepts either the shifts[] model or the legacy shiftStart/shiftEnd scalars,
// and returns a sorted, comparable list.
function normalizeShifts(person) {
  if (Array.isArray(person?.shifts)) {
    return person.shifts
      .filter(s => s && s.start != null && s.end != null)
      .map(s => ({ start: Number(s.start), end: Number(s.end) }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
  }
  if (person?.shiftStart != null && person?.shiftEnd != null) {
    return [{ start: Number(person.shiftStart), end: Number(person.shiftEnd) }];
  }
  return [];
}

function sameShifts(a, b) {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end);
}

/**
 * Per-person shift differences between two staff snapshots.
 * → [{ staffId, kind: 'added' | 'removed' | 'changed', before, after }]
 * People whose shifts are unchanged are omitted, so publishing a schedule that
 * only moved one person doesn't notify the whole roster.
 */
function diffStaffShifts(beforeStaff, afterStaff) {
  const before = new Map((beforeStaff ?? []).filter(p => p?.id != null).map(p => [p.id, normalizeShifts(p)]));
  const after = new Map((afterStaff ?? []).filter(p => p?.id != null).map(p => [p.id, normalizeShifts(p)]));

  const changes = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id) ?? [];
    const a = after.get(id) ?? [];
    if (sameShifts(a, b)) continue;
    if (a.length === 0 && b.length === 0) continue; // never scheduled either way
    changes.push({
      staffId: id,
      kind: b.length === 0 ? "added" : a.length === 0 ? "removed" : "changed",
      before: b,
      after: a,
    });
  }
  return changes;
}

const listTimes = shifts => shifts.map(s => `${formatTime(s.start)} – ${formatTime(s.end)}`).join(", ");

/** One human-readable line carrying the actual delta, e.g.
 *  "Thu, Aug 13: moved to 9:00 AM – 2:00 PM (was 7:30 AM – 12:30 PM)." */
function describeChange(change, dayLabel) {
  if (change.kind === "added") return `${dayLabel}: you're now scheduled ${listTimes(change.after)}.`;
  if (change.kind === "removed") return `${dayLabel}: your shift (${listTimes(change.before)}) was removed.`;
  return `${dayLabel}: moved to ${listTimes(change.after)} (was ${listTimes(change.before)}).`;
}

/** Rolls one or more change lines into a single notification message. */
function messageFromDetails(details) {
  if (details.length === 1) return `Your schedule changed — ${details[0]}`;
  return `Your schedule changed for ${details.length} days. ${details.join(" ")}`;
}

module.exports = {
  formatTime,
  formatDayLabel,
  diffStaffShifts,
  describeChange,
  messageFromDetails,
};
