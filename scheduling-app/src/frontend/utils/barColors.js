import { useSyncExternalStore } from 'react';
import { authApi } from './api';

// The color of each kind of bar on the schedule: desk duty, VR duty, events and
// 1-1s. Shift bars are deliberately not here — they stay --color-green as the
// neutral base layer the other four sit on top of.
//
// Each kind is stored as a single hue. Saturation and lightness are fixed (the
// vivid pair, 70% / 44%) identically for every kind, so no choice can come out
// washed out and every bar stays dark enough to carry white label text. Those two
// live in index.css; this module only ever writes hues.
//
// Where the value lives, and why it's in two places at once:
//   • The server, per account (User.barColors), so a manager's palette follows
//     them to any device. This is the source of truth.
//   • localStorage, as a cache. A fetch can't finish before the first paint, so
//     without it every page load would flash the default colors and then snap to
//     the chosen ones. The cache is written on every change and replaced by the
//     server's copy once /auth/me lands.
//
// A change is applied and cached immediately and the save is fired off behind it:
// the picker has to feel instant, and a failed save is worth a console warning
// rather than reverting a color under the manager's cursor.

const STORAGE_KEY = 'barColors';

/** Every bar kind that can be recolored. Order drives the picker's tabs. */
export const BAR_KINDS = [
  { id: 'desk',     label: 'Desk',  cssVar: '--bar-desk-hue',   defaultHue: 38 },
  { id: 'vr',       label: 'VR',    cssVar: '--bar-vr-hue',     defaultHue: 357 },
  { id: 'oneOnOne', label: '1-1',   cssVar: '--bar-oneone-hue', defaultHue: 186 },
  { id: 'event',    label: 'Event', cssVar: '--bar-event-hue',  defaultHue: 257 },
];

/** Defaults as a plain map, matching the :root values in index.css. */
export const DEFAULT_HUES = Object.fromEntries(BAR_KINDS.map(k => [k.id, k.defaultHue]));

// Kept in step with the fixed saturation/lightness in index.css, so the picker's
// swatches match what the grid actually draws.
const SAT        = 70;
const LUM        = 44;   // the bar itself
const LUM_BRIGHT = 62;   // active outline, ghost border

/** Bar fill for a hue — matches `--color-bar-<kind>`. */
export function barFill(hue) { return `hsl(${hue} ${SAT}% ${LUM}%)`; }

/** The outline shade — matches `--color-bar-<kind>-bright`. */
export function barBright(hue) { return `hsl(${hue} ${SAT}% ${LUM_BRIGHT}%)`; }

/** Twelve one-click hues, evenly spread so each reads as a distinct color. */
export const HUE_PRESETS = [
  { hue: 257, label: 'Purple' },
  { hue: 230, label: 'Indigo' },
  { hue: 209, label: 'Blue' },
  { hue: 190, label: 'Cyan' },
  { hue: 172, label: 'Teal' },
  { hue: 146, label: 'Green' },
  { hue: 100, label: 'Olive' },
  { hue:  52, label: 'Amber' },
  { hue:  28, label: 'Orange' },
  { hue:   4, label: 'Red' },
  { hue: 330, label: 'Pink' },
  { hue: 292, label: 'Magenta' },
];

export function normalizeHue(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return ((n % 360) + 360) % 360;
}

/** Keep only known kinds with usable hues — anything else is dropped. */
function sanitize(raw) {
  const out = {};
  if (raw == null || typeof raw !== 'object') return out;
  for (const { id } of BAR_KINDS) {
    const value = raw[id];
    if (value === undefined || value === null) continue;
    const hue = normalizeHue(value, null);
    if (hue !== null) out[id] = hue;
  }
  return out;
}

function readCache() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    // Absent, unparseable, or blocked site data — defaults are perfectly usable.
    return {};
  }
}

function writeCache(hues) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hues)); } catch { /* not worth failing the change over */ }
}

// Only the kinds actually chosen are held. An absent kind means "use the default",
// which has to stay distinguishable from a deliberate choice that happens to equal
// the default — that's what lets a reset clear the value server-side.
let current = readCache();
const listeners = new Set();

function paint(hues) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  for (const { id, cssVar, defaultHue } of BAR_KINDS) {
    root.setProperty(cssVar, String(hues[id] ?? defaultHue));
  }
}

// Applied at import time, not from an effect, so the cached palette is on the root
// element before the first schedule paints rather than a frame after it.
paint(current);

export function getBarHues() { return current; }

/** The hue in effect for one kind, chosen or default. */
export function hueFor(kind) {
  return current[kind] ?? DEFAULT_HUES[kind];
}

function commit(next) {
  current = next;
  paint(next);
  writeCache(next);
  listeners.forEach(fn => fn());
}

/**
 * Set one kind's hue, or clear it back to the default with null.
 *
 * Sends only the kind that changed, so a second tab's picker can't have its
 * choices clobbered by this one posting a whole palette.
 */
export function setBarHue(kind, hue) {
  // `in`, not truthiness: hue 0 is a valid default (pure red) and would fail a
  // truthy check.
  if (!(kind in DEFAULT_HUES)) return;
  const next = { ...current };
  if (hue === null) delete next[kind];
  else next[kind] = normalizeHue(hue, DEFAULT_HUES[kind]);
  if (next[kind] === current[kind]) return;
  commit(next);
  authApi.saveBarColors({ [kind]: hue === null ? null : next[kind] })
    .catch(err => console.warn(`Bar color not saved to your account (${kind}):`, err.message));
}

/**
 * Adopt the palette stored on the account, called once the user is known.
 *
 * The server wins over the cache — it's the source of truth, and a stale cache is
 * exactly what this is here to correct (a color changed on another device). No
 * save is fired: this *is* the server's copy.
 */
export function adoptServerBarHues(raw) {
  const fromServer = sanitize(raw);
  const same = Object.keys(fromServer).length === Object.keys(current).length
    && Object.entries(fromServer).every(([k, v]) => current[k] === v);
  if (same) return;
  current = fromServer;
  paint(fromServer);
  writeCache(fromServer);
  listeners.forEach(fn => fn());
}

/** Drop the cached palette — called on logout so the next account starts clean. */
export function clearBarHues() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
  if (Object.keys(current).length === 0) return;
  current = {};
  paint(current);
  listeners.forEach(fn => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SERVER_SNAPSHOT = {};

/**
 * `{ hues, hueFor, setBarHue }` — every mounted picker stays in sync with every
 * other.
 *
 * `setBarHue(kind, null)` still clears one kind back to the app default; the
 * picker reaches it with the Home key, having no reset button of its own.
 */
export function useBarColors() {
  const hues = useSyncExternalStore(subscribe, getBarHues, () => SERVER_SNAPSHOT);
  return {
    hues,
    hueFor: kind => hues[kind] ?? DEFAULT_HUES[kind],
    setBarHue,
  };
}
