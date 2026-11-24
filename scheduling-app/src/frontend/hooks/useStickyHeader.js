import { useEffect } from 'react';

/**
 * Keep a header row pinned to the top of the window while its box scrolls past,
 * and let it go once the box's bottom edge arrives — like `position: sticky`.
 *
 * For grids that can't use real sticky positioning: the Daily schedule scrolls
 * sideways on narrow windows, and a box with `overflow-x: auto` is a scroll
 * container in both directions, so a sticky child would stick to that box (which
 * never scrolls vertically) instead of the window. Moving the header with a
 * transform keeps it inside the box, so the sideways scroll still carries it.
 *
 * Listens in the capture phase so a scroll of any container counts, not only
 * the window, and re-measures when the box changes size (rows added/removed).
 */
export function useStickyHeader(boxRef, headerRef) {
  useEffect(() => {
    const box = boxRef.current;
    const head = headerRef.current;
    if (!box || !head) return;

    let frame = 0;
    function update() {
      frame = 0;
      const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0;
      const rect = box.getBoundingClientRect();
      // How far the box's top has gone above the stick line, held so the header
      // never slides past the box's last row.
      const shift = Math.min(Math.max(top - rect.top, 0), Math.max(rect.height - head.offsetHeight, 0));
      head.style.transform = shift > 0 ? `translateY(${shift}px)` : '';
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }

    update();
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      resize.disconnect();
    };
  }, [boxRef, headerRef]);
}
