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

// Random colours are chosen in OKLCH, a colour space built so that equal
// lightness values *look* equally bright whatever the hue.
//
// An earlier version matched brightness with the Rec. 709 luminance formula
// instead. That weights blue at about 7%, so to "match" green it pushed the blue
// channel — and the blue half of every purple — close to full, and saturated blues
// and purples already look brighter than that formula admits. They came out
// glaring. Keeping OKLCH lightness and chroma fixed and varying only the hue gives
// every pick the same visual weight.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Linear sRGB → OKLab [L, a, b]. */
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** OKLab → linear sRGB [r, g, b]; may fall outside 0-1 if out of gamut. */
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// Every random pick shares this colour's lightness and chroma: the forest green
// (#28764a) the backdrop used before it was randomised.
const REFERENCE_BASE = [40 / 255, 118 / 255, 74 / 255];
const [REF_L, REF_A, REF_B] = linearToOklab(REFERENCE_BASE.map(toLinear));
const REF_CHROMA = Math.hypot(REF_A, REF_B);

// A random hue at the reference's lightness and chroma. Some hues can't be shown
// at that chroma on a normal screen, so chroma steps down until the colour fits —
// those hues come out slightly more muted, never brighter. Yellows in particular
// read as olive or amber at this darkness; a dark yellow doesn't look yellow.
function randomBaseColor() {
  const hue = Math.random() * 2 * Math.PI;
  let chroma = REF_CHROMA;
  let rgb = oklabToLinear(REF_L, chroma * Math.cos(hue), chroma * Math.sin(hue));
  for (let i = 0; i < 60 && rgb.some((c) => c < 0 || c > 1); i++) {
    chroma *= 0.95;
    rgb = oklabToLinear(REF_L, chroma * Math.cos(hue), chroma * Math.sin(hue));
  }
  return rgb.map((c) => toGamma(Math.min(1, Math.max(0, c))));
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
//
// These four are the live values — they're passed to <Dither> explicitly, so the
// defaults written in Dither.jsx's own signature never apply to this backdrop.
// Tune here.
const WAVE_AMPLITUDE = jitter(0.6, 0.06);
const WAVE_FREQUENCY = jitter(7, 0.06);
const WAVE_SPEED     = jitter(0.002, 0.06);
const WAVE_SCALE     = jitter(2.5, 0.06);

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
          colorNum={27.2}
          waveAmplitude={WAVE_AMPLITUDE}
          waveFrequency={WAVE_FREQUENCY}
          waveSpeed={WAVE_SPEED}
          // Zooms the noise field out for more, smaller waves. 1 is the
          // un-zoomed field; 3-4 gets busy.
          waveScale={WAVE_SCALE}
        />
      </Suspense>
    </div>
  );
}
