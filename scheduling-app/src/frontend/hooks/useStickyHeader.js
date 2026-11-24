import { useEffect } from 'react';

/**
 * Keep a header row pinned to the top of the window while its box scrolls past,
 * and let it go once the box's bottom edge arrives — like `position: sticky`.
 *
 * Real sticky positioning can't do this here. It sticks to the nearest scroll
 * container, and the schedules have one that never scrolls vertically between
 * them and the window: the layout's <main> is `overflow: auto` while the window
 * does the scrolling, and the Daily grid is `overflow-x: auto` (which is a
 * scroll container in both directions) so it can scroll sideways. A sticky row
 * would stick to one of those and never move. A transform measured against the
 * window doesn't care, and keeps the row inside its box, so the Daily grid's
 * sideways scroll still carries it.
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
