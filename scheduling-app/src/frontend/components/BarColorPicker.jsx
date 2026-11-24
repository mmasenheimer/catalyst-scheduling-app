import { useEffect, useRef, useState } from 'react';
import {
  useBarColors, BAR_KINDS, HUE_PRESETS, barFill, barBright,
} from '../utils/barColors';
import { useSettings } from '../context/SettingsContext';
import paletteIcon from '../assets/palette.png';

// The color picker for the schedule's bar kinds: desk duty, VR duty, 1-1s and
// events. Pick a kind, then pick its color from the presets. Choices are saved
// to the account (see utils/barColors.js), so they follow the manager to any
// device, and every bar of that kind everywhere in the app recolors at once.
//
// Hue only: saturation and lightness are fixed at the vivid pair, which keeps
// every choice equally saturated and every bar dark enough for white label text.
//
// Shift bars aren't offered — they stay green as the base layer the rest sit on.

// The trigger is a paint palette. The PNG is used as a mask over a solid fill
// rather than shown as-is, so the icon takes the button color from the CSS
// variable and follows it if that ever changes.
const PALETTE_MASK = {
  WebkitMaskImage: `url(${paletteIcon})`, maskImage: `url(${paletteIcon})`,
  WebkitMaskSize: 'contain', maskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center', maskPosition: 'center',
};

const SWATCH = 22;   // px, each preset circle

export function BarColorPicker({ align = 'right' }) {
  const { hueFor, setBarHue } = useBarColors();
  const { vrEnabled } = useSettings();
  const [open, setOpen] = useState(false);
  // Which kind the presets recolor. Desk first simply because it's first in the
  // legend; the choice is remembered while the popover stays mounted.
  const [kind, setKind] = useState(BAR_KINDS[0].id);

  // A post the studio has switched off has no bars to color, so it isn't offered.
  const kinds = vrEnabled ? BAR_KINDS : BAR_KINDS.filter(k => k.id !== 'vr');
  // If VR was the selected tab when it was switched off, fall back to the first
  // kind rather than leaving the presets editing something invisible.
  const activeKind = kinds.some(k => k.id === kind) ? kind : kinds[0].id;
  const rootRef = useRef(null);

  const hue = hueFor(activeKind);

  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (!rootRef.current?.contains(e.target)) setOpen(false); }
    function onKey(e)  { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Schedule bar colors"
        title="Bar colors"
        className="hover:opacity-80 transition-opacity"
        style={{
          width: 32, height: 32, padding: 3, cursor: 'pointer',
          display: 'flex', alignItems: 'stretch',
          background: open ? 'var(--color-muted)' : 'transparent',
          border: `1px solid ${open ? 'var(--color-border)' : 'transparent'}`,
        }}
      >
        <span aria-hidden="true" style={{ flex: 1, background: 'var(--color-button)', pointerEvents: 'none', ...PALETTE_MASK }} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Schedule bar colors"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', zIndex: 9999,
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            padding: 14, borderRadius: 12, width: 'max-content',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}
        >
          {/* Which kind to recolor. Each tab is drawn in that kind's current
              color, so this doubles as a legend of the whole palette. The panel
              carries no title of its own — the tabs say what it is. */}
          <div style={{ display: 'flex', gap: 5, alignSelf: 'stretch' }}>
            {kinds.map(k => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={activeKind === k.id}
                title={`Recolor ${k.label} bars`}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: barFill(hueFor(k.id)), color: 'var(--color-bar-text)',
                  border: `2px solid ${activeKind === k.id ? barBright(hueFor(k.id)) : 'transparent'}`,
                  outline: activeKind === k.id ? '1px solid var(--color-text-dim)' : 'none',
                  opacity: activeKind === k.id ? 1 : 0.6,
                }}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(6, ${SWATCH}px)`, gap: 8, alignSelf: 'center',
          }}>
            {HUE_PRESETS.map(({ hue: h, label }) => (
              <button
                key={h}
                type="button"
                className="round-button"
                onClick={() => setBarHue(activeKind, h)}
                title={label}
                aria-label={label}
                aria-pressed={hue === h}
                style={{
                  width: SWATCH, height: SWATCH, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: barFill(h),
                  border: `2px solid ${hue === h ? barBright(h) : 'transparent'}`,
                  boxShadow: hue === h ? '0 0 0 1px var(--color-text-dim)' : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
