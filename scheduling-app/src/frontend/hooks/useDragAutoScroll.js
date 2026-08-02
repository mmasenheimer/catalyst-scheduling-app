import { useEffect, useRef } from 'react';

// How close to an edge the pointer has to get before the page starts moving.
const EDGE_PX = 90;
// Pixels per frame at the very edge; ramps up from 0 across the zone above.
const MAX_SPEED = 22;

/**
 * Scrolls the page while a drag is in progress and the pointer nears an edge.
 *
 * Native HTML5 drag doesn't scroll anything. With a full roster the rows run past
 * the bottom of the window while the toolbar chips stay at the top, so there was
 * no way to drag a new shift onto somebody who wasn't already on screen — you
 * couldn't scroll, because scrolling means letting go.
 *
 * Two things make this awkward enough to need a hook:
 *
 *  1. `dragover` only fires while the pointer *moves*. Hold it steady at the
 *     bottom edge — exactly what you do when waiting for the page to come to you
 *     — and the events stop. So the scrolling runs on an animation loop off the
 *     last known position, and `dragover` only records where that is.
 *
 *  2. The scrolling element is the layout's <main>, not the window, so
 *     window.scrollBy() does nothing here. The container is resolved by walking
 *     up from whatever the drag started on, which also keeps this working if the
 *     layout changes.
 *
 * @param active whether a drag is currently happening
 */
export function useDragAutoScroll(active) {
  const pointerYRef = useRef(null);
  const containerRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    const findScrollParent = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const { overflowY } = getComputedStyle(n);
        if (/(auto|scroll|overlay)/.test(overflowY) && n.scrollHeight > n.clientHeight) return n;
      }
      return document.scrollingElement ?? document.documentElement;
    };

    // The visible band to measure the pointer against. For a real scrolling box
    // that's its own rectangle — but when the page itself is the scroller, the
    // root element's rect is the height of the *whole document*, so its "bottom"
    // sits far below the screen and the pointer could never reach the trigger
    // zone. The viewport is the right frame of reference there.
    const isPageScroller = box =>
      box === document.scrollingElement || box === document.documentElement || box === document.body;
    const visibleBand = (box) => {
      if (isPageScroller(box)) return { top: 0, bottom: window.innerHeight };
      const r = box.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };

    const onDragOver = (e) => {
      pointerYRef.current = e.clientY;
      if (!containerRef.current) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        containerRef.current = findScrollParent(under ?? e.target);
      }
    };

    const step = () => {
      const y = pointerYRef.current;
      const box = containerRef.current;
      if (y != null && box) {
        const { top, bottom } = visibleBand(box);
        // Distance into the trigger zone, 0 → 1, so the page eases in rather
        // than lurching the moment the pointer crosses the threshold.
        const above = (top + EDGE_PX) - y;
        const below = y - (bottom - EDGE_PX);
        if (above > 0) box.scrollTop -= MAX_SPEED * Math.min(above / EDGE_PX, 1);
        else if (below > 0) box.scrollTop += MAX_SPEED * Math.min(below / EDGE_PX, 1);
      }
      frameRef.current = requestAnimationFrame(step);
    };

    // Capture phase, and this is load-bearing: the row drop targets call
    // stopPropagation() in their own dragover handler, and React calls that on
    // the native event too. Since React listens at the root container, a bubbling
    // listener on document never hears anything while the pointer is over a row —
    // which is the entire time that matters. Capture runs before any of it.
    //
    // Passive: this only reads clientY. The drop targets still call preventDefault
    // themselves, which is what actually permits the drop.
    document.addEventListener('dragover', onDragOver, { capture: true, passive: true });
    frameRef.current = requestAnimationFrame(step);

    return () => {
      document.removeEventListener('dragover', onDragOver, { capture: true });
      cancelAnimationFrame(frameRef.current);
      pointerYRef.current = null;
      containerRef.current = null;
    };
  }, [active]);
}
