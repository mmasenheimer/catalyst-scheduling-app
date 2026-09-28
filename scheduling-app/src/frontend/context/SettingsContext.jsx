import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../utils/api';

// Studio-wide settings. Shared by everyone, unlike the per-viewer preferences in
// utils/barColors.js — whether the studio runs a VR post is a fact about the
// studio, so an employee's Team Schedule and the manager's Weekly view have to
// agree on it.
//
// `vrEnabled` starts true and stays true until told otherwise. Defaulting to
// "off" while the fetch is in flight would blink every VR bar out of an otherwise
// normal schedule on each page load, which reads as data loss; defaulting to "on"
// means the only wrong state is a brief one on a studio that has turned VR off.

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [vrEnabled, setVrEnabled] = useState(true);
  // Distinguishes "not fetched yet" from "fetched, and VR is on" for anything
  // that would rather wait than guess.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsApi.get()
      .then(s => { if (!cancelled) setVrEnabled(s.vrEnabled !== false); })
      // Unreachable backend leaves the optimistic default in place: a studio that
      // uses VR keeps working, rather than the whole post vanishing on a blip.
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  /**
   * Flip VR on or off for the whole studio.
   *
   * Applied locally first so the switch responds immediately, then persisted. A
   * failed save rolls the switch back rather than leaving the manager believing a
   * studio-wide change landed when it didn't — the opposite call from the bar
   * colors, where a lost save costs nothing but a color.
   */
  const setVr = useCallback(async (next) => {
    setVrEnabled(next);
    try {
      const saved = await settingsApi.update({ vrEnabled: next });
      setVrEnabled(saved.vrEnabled !== false);
      return true;
    } catch (err) {
      setVrEnabled(!next);
      console.warn('VR setting not saved:', err.message);
      return false;
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ vrEnabled, setVrEnabled: setVr, settingsLoaded: loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Studio settings. Safe to call outside the provider — VR reads as on and the
 * setter is a no-op, so a component rendered in isolation still works.
 */
export function useSettings() {
  return useContext(SettingsContext) ?? {
    vrEnabled: true,
    setVrEnabled: () => false,
    settingsLoaded: false,
  };
}
