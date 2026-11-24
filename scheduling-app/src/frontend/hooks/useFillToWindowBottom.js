import { useLayoutEffect } from 'react';

/**
 * Give an element a min-height that reaches the bottom of the window (less the
 * page's bottom padding), so a short page fills the screen instead of leaving
 * the slack below it.
 *
 * Measured from the window rather than from <main>, because <main> grows with
 * its content — sizing from it would never shrink back after a resize. Only a
 * minimum: content taller than the window grows past it and the page scrolls.
 * Written straight to the element, so measuring never re-renders anything.
 */
export function useFillToWindowBottom(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const main = el.closest('main');
    function fit() {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const padBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      el.style.minHeight = `${Math.max(0, window.innerHeight - top - padBottom)}px`;
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
}
