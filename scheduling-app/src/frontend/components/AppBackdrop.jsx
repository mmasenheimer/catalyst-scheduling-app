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

// The wave's hue: a forest green, #28764a, as the shader wants it — 0-1 per
// channel. Chosen so that at the same BRIGHTNESS it reads about as bright as the
// orange it replaced did (green dominates perceived luminance, so a pure green
// here would have come out noticeably brighter).
const WAVE_BASE = [40 / 255, 118 / 255, 74 / 255];

// How bright the backdrop is allowed to get, 0 = invisible, 1 = full base colour.
//
// This is the dimmer knob. The shader mixes up from black toward waveColor, so
// the colour it's given *is* the ceiling — nothing else caps the brightness.
// Scaling all three channels by the same factor dims the field without shifting
// its hue.
const BRIGHTNESS = 0.4;

const WAVE_COLOR = WAVE_BASE.map((c) => c * BRIGHTNESS);

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
          waveAmplitude={0.6}
          waveFrequency={7}
          waveSpeed={0.002}
          // Zooms the noise field out for more, smaller waves. 1 is the
          // un-zoomed field; 3-4 gets busy.
          waveScale={2.5}
        />
      </Suspense>
    </div>
  );
}
