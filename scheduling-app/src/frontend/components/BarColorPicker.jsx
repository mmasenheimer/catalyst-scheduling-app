import { useEffect, useRef, useState } from 'react';
import {
  useBarColors, BAR_KINDS, HUE_PRESETS, barFill, barBright,
} from '../utils/barColors';
import { useSettings } from '../context/SettingsContext';

// The color picker for the schedule's bar kinds: desk duty, VR duty, 1-1s and
// events. Pick a kind, then pick its hue from the wheel or a preset. Choices are
// saved to the account (see utils/barColors.js), so they follow the manager to any
// device, and every bar of that kind everywhere in the app recolors at once.
//
// Hue only: saturation and lightness are fixed at the vivid pair, which keeps
// every choice equally saturated and every bar dark enough for white label text.
//
// Shift bars aren't offered — they stay green as the base layer the rest sit on.

const WHEEL_SIZE  = 132;
const RING_WIDTH  = 20;
const KNOB_RADIUS = (WHEEL_SIZE - RING_WIDTH) / 2;

// Stops every 20° — enough that the RGB interpolation between them reads as a
// continuous sweep. Built once; the ring is the same for every kind.
const RING_GRADIENT = `conic-gradient(${
  Array.from({ length: 19 }, (_, i) => `${barBright(i * 20)} ${i * 20}deg`).join(', ')
})`;

// Clockwise from 12 o'clock, which is how `conic-gradient(from 0deg, …)` lays its
// stops out — so the angle under the pointer is the hue directly.
function hueAt(el, clientX, clientY) {
  const r = el.getBoundingClientRect();
  const dx = clientX - (r.left + r.width / 2);
  const dy = clientY - (r.top + r.height / 2);
  return Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360);
}

export function BarColorPicker({ align = 'right' }) {
  const { hueFor, setBarHue } = useBarColors();
  const { vrEnabled } = useSettings();
  const [open, setOpen] = useState(false);
  // Which kind the wheel is editing. Desk first simply because it's first in the
  // legend; the choice is remembered while the popover stays mounted.
  const [kind, setKind] = useState(BAR_KINDS[0].id);

  // A post the studio has switched off has no bars to color, so it isn't offered.
  const kinds = vrEnabled ? BAR_KINDS : BAR_KINDS.filter(k => k.id !== 'vr');
  // If VR was the selected tab when it was switched off, fall back to the first
  // kind rather than leaving the wheel editing something invisible.
  const activeKind = kinds.some(k => k.id === kind) ? kind : kinds[0].id;
  const rootRef  = useRef(null);
  const wheelRef = useRef(null);

  const hue = hueFor(activeKind);
  const kindLabel = BAR_KINDS.find(k => k.id === activeKind)?.label ?? activeKind;

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

  // Pointer capture keeps the drag alive once it leaves the ring, so the hue
  // follows the cursor all the way round instead of stopping at the edge.
  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setBarHue(activeKind, hueAt(wheelRef.current, e.clientX, e.clientY));
  }
  function handlePointerMove(e) {
    if (!(e.buttons & 1)) return;
    setBarHue(activeKind, hueAt(wheelRef.current, e.clientX, e.clientY));
  }
  function handleKeyDown(e) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')       { e.preventDefault(); setBarHue(activeKind, hue + step); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setBarHue(activeKind, hue - step); }
    else if (e.key === 'Home')                               { e.preventDefault(); setBarHue(activeKind, null); }
  }

  const knobX = WHEEL_SIZE / 2 + KNOB_RADIUS * Math.sin(hue * Math.PI / 180);
  const knobY = WHEEL_SIZE / 2 - KNOB_RADIUS * Math.cos(hue * Math.PI / 180);
  const presetLabel = HUE_PRESETS.find(p => p.hue === hue)?.label;

  const sectionLabel = {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: 'var(--color-text-dim)', alignSelf: 'center',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      {/* A hue ring around a single dot. The dot is the kind the wheel is
          currently set to, so the button stays one clear swatch rather than a
          four-way split nobody can read at 28px. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Schedule bar colors"
        title="Bar colors"
        style={{
          width: 28, height: 28, padding: 3, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'stretch',
          background: RING_GRADIENT,
          border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: open ? '0 0 0 2px var(--color-accent-ripple)' : 'none',
        }}
      >
        <span style={{
          flex: 1, borderRadius: '50%', background: barFill(hue),
          border: '1.5px solid var(--color-surface)', pointerEvents: 'none',
        }} />
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11,
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

          <div
            ref={wheelRef}
            role="slider"
            tabIndex={0}
            aria-label={`${kindLabel} bar hue`}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={hue}
            aria-valuetext={presetLabel ?? `Hue ${hue}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onKeyDown={handleKeyDown}
            style={{
              position: 'relative', width: WHEEL_SIZE, height: WHEEL_SIZE,
              borderRadius: '50%', background: RING_GRADIENT,
              cursor: 'crosshair', touchAction: 'none', outline: 'none',
            }}
          >
            {/* Punches the ring out of the disc and previews the real bar — the
                selected kind's fill, with its label in the weight the grid uses. */}
            <div style={{
              position: 'absolute', inset: RING_WIDTH, borderRadius: '50%',
              background: barFill(hue),
              border: '2px solid var(--color-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-bar-text)' }}>{kindLabel}</span>
            </div>

            <div style={{
              position: 'absolute', left: knobX, top: knobY,
              width: 16, height: 16, marginLeft: -8, marginTop: -8,
              borderRadius: '50%', background: barBright(hue),
              border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }} />
          </div>

          <div style={{ ...sectionLabel, marginTop: 1 }}>Presets</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(6, 18px)', gap: 6, alignSelf: 'center',
          }}>
            {HUE_PRESETS.map(({ hue: h, label }) => (
              <button
                key={h}
                type="button"
                onClick={() => setBarHue(activeKind, h)}
                title={label}
                aria-label={label}
                aria-pressed={hue === h}
                style={{
                  width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: barFill(h),
                  border: `2px solid ${hue === h ? barBright(h) : 'transparent'}`,
                  boxShadow: hue === h ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                }}
              />
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
