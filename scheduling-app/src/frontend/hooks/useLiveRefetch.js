import { useEffect, useRef } from 'react';

// How often to re-check while the user is actually looking at the app.
const POLL_MS = 45 * 1000;

/**
 * Keeps server-owned data fresh without a page reload.
 *
 * Runs `fetcher` on mount, again whenever the tab regains focus, and on a slow
 * interval while the tab is visible. This is a background fetch — it only
 * replaces data in state, so the page, scroll position, open modals and any
 * in-progress input are all untouched.
 *
 * Nothing runs while the tab is hidden (no point polling a backgrounded tab at
 * the database), and overlapping calls are skipped so rapid tab-switching can't
 * stack up requests.
 *
 * @param fetcher async () => void — should update state itself and swallow its
 *                own errors; a failed refresh must never disturb the UI.
 * @param enabled whether to run at all (e.g. false when logged out)
 */
export function useLiveRefetch(fetcher, enabled = true) {
  // Held in a ref so a fetcher redefined each render doesn't restart the timer.
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function run() {
      if (cancelled || inFlightRef.current) return;
      if (document.visibilityState !== 'visible') return;
      inFlightRef.current = true;
      try {
        await fetcherRef.current();
      } finally {
        inFlightRef.current = false;
      }
    }

    run(); // initial load

    const onFocus = () => run();
    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(run, POLL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [enabled]);
}
