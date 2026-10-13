import { Suspense, lazy, useEffect, useState } from "react";

// The dithered wave that fills the page background behind everything.
//
// Sits in the one place --color-bg used to show through: the gaps around the
// surface cards. Every card, the sidebar and the top bar keep their own opaque
// --color-surface, so none of them become transparent — the effect only appears
// where the flat background was.
//
// Lazy, because three + postprocessing is around a megabyte. It loads after the
// app is interactive and lands as its own chunk; until then (and forever, on a
// machine that can't do WebGL) the plain --color-bg from index.css is what shows,
// which is exactly today's appearance.
//
// Layering: position fixed with z-index -1. The root element in AppLayout is not a
// stacking context, so a negative z-index child paints above the body background
// and below all in-flow content. That's why AppLayout's root had to stop painting
// --color-bg itself — an opaque ancestor background would cover this.
//
// To remove the feature: see the header of Dither.jsx.
const Dither = lazy(() => import("./Dither"));

// ── Per-page-load variation ──────────────────────────────────────────────────
// Everything random is computed here at module level, which runs once per page
// load. It can't live in the component: AppBackdrop re-renders every second (the
// clock in AppLayout), so anything random in render would change colour each tick.

/** `value` nudged up or down by at most `pct` of itself. */
function jitter(value, pct) {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

/** Perceived brightness of a 0-1 RGB colour (Rec. 709 weights). */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** HSL — hue 0-360, saturation and lightness 0-1 — to 0-1 RGB. */
function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

// The colour every random pick is matched to for brightness: the forest green
// (#28764a) the backdrop used before it was randomised.
const REFERENCE_BASE = [40 / 255, 118 / 255, 74 / 255];

// Any hue on the wheel, then rescaled so it reads exactly as bright as the
// reference. Matching *perceived* brightness is the point: green carries most of
// it, so an unadjusted random colour would range from barely visible (deep blue)
// to glaring (lime) even with BRIGHTNESS unchanged. The deepest blues can't fully
// reach the target without a channel passing 1, so those land slightly dimmer.
function randomBaseColor() {
  const rgb = hslToRgb(Math.random() * 360, 0.65, 0.5);
  const scale = luminance(REFERENCE_BASE) / luminance(rgb);
  return rgb.map((c) => Math.min(1, c * scale));
}

const WAVE_BASE = randomBaseColor();

// How bright the backdrop is allowed to get, 0 = invisible, 1 = full base colour.
//
// This is the dimmer knob. The shader mixes up from black toward waveColor, so
// the colour it's given *is* the ceiling — nothing else caps the brightness.
// Scaling all three channels by the same factor dims the field without shifting
// its hue.
const BRIGHTNESS = 0.5;

const WAVE_COLOR = WAVE_BASE.map((c) => c * BRIGHTNESS);

// The wave's shape, varied by up to ±6% per load — enough that no two visits look
// identical, small enough that it's always recognisably the same backdrop.
const WAVE_AMPLITUDE = jitter(0.6, 0.06);
const WAVE_FREQUENCY = jitter(7, 0.06);

/** True when the viewer has asked their OS to keep animation to a minimum. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Whether this browser can give us a WebGL context at all. */
function canUseWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl"),
    );
  } catch {
    // Some hardened/headless browsers throw rather than returning null.
    return false;
  }
}

export function AppBackdrop() {
  const reducedMotion = usePrefersReducedMotion();
  // Probed once, via a lazy initializer rather than an effect: the answer can't
  // change for the life of the page, and doing it in an effect would render the
  // canvas host for one frame before removing it again.
  const [webgl] = useState(canUseWebGL);

  if (!webgl) return null;

  return (
    <div className="app-backdrop" aria-hidden="true">
      <Suspense fallback={null}>
        <Dither
          waveColor={WAVE_COLOR}
          // Held still rather than hidden when reduced motion is asked for: the
          // pattern is the background, the movement is the part that's optional.
          disableAnimation={reducedMotion}
          enableMouseInteraction={false}
          mouseRadius={0.6}
          colorNum={27.2}
          waveAmplitude={WAVE_AMPLITUDE}
          waveFrequency={WAVE_FREQUENCY}
          waveSpeed={0.002}
          // Zooms the noise field out for more, smaller waves. 1 is the
          // un-zoomed field; 3-4 gets busy.
          waveScale={2.5}
        />
      </Suspense>
    </div>
  );
}
