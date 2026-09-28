import { useSettings } from '../context/SettingsContext';

// A lever switch for the VR studio post. Off, VR disappears from every view in the
// app and the template generator stops assigning it.
//
// Studio-wide, so this changes what everyone sees, staff included — hence the
// explicit label rather than a bare switch, and the title spelling out the reach.
// Nothing is deleted: VR turns already saved stay in the database and come back
// when this is switched on again.
export function VrToggle() {
  const { vrEnabled, setVrEnabled } = useSettings();

  return (
    <label
      title={vrEnabled
        ? 'VR is on for the whole studio. Switch off to remove VR shifts and alerts everywhere — nothing is deleted.'
        : 'VR is off for the whole studio. Switch on to bring VR shifts and alerts back.'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
        padding: '4px 10px 4px 8px', borderRadius: 8, cursor: 'pointer', userSelect: 'none',
        // The app's accent, matching the Save as Weekly Template button beside it,
        // rather than the VR bar's own colour — which the manager can recolour, and
        // which would drag this control's appearance along with it.
        border: `1px solid ${vrEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
        background: vrEnabled ? 'rgba(176,80,48,0.08)' : 'transparent',
      }}
    >
      <input
        type="checkbox"
        role="switch"
        checked={vrEnabled}
        onChange={e => setVrEnabled(e.target.checked)}
        aria-label="VR enabled for the whole studio"
        // Visually replaced by the lever below, but kept in the DOM so the control
        // is a real checkbox for keyboard and screen readers.
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: 'none' }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'relative', width: 26, height: 14, borderRadius: 999, flexShrink: 0,
          background: vrEnabled ? 'var(--color-accent)' : 'var(--color-muted)',
          border: `1px solid ${vrEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
          transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 1, left: vrEnabled ? 13 : 1,
          width: 10, height: 10, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
        }} />
      </span>
      <span style={{
        fontSize: 12, fontWeight: 600,
        color: vrEnabled ? 'var(--color-accent-bright)' : 'var(--color-text-dim)',
      }}>
        VR
      </span>
    </label>
  );
}
