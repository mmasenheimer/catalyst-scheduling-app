import { useSettings } from '../context/SettingsContext';

// A lever switch for the VR studio post. Off, VR disappears from every view in the
// app and the template generator stops assigning it.
//
// Studio-wide, so this changes what everyone sees, staff included — hence the
// explicit label rather than a bare switch, and the title spelling out the reach.
// Nothing is deleted: VR turns already saved stay in the database and come back
// when this is switched on again.
//
// Built on a <button> with role="switch" rather than a <label> wrapping a hidden
// checkbox. Both are accessible, but .ripple-btn (index.css) is written for a
// button — so this way the hover ripple behaves identically to the real buttons
// beside it instead of depending on the class working on a label.
//
// On/off is carried by the lever, not by the button colour: the chrome stays the
// same accent as its neighbours, so it doesn't read as a different control once
// toggled. The track goes light with an accent knob when on, dark with a white
// knob when off.
export function VrToggle() {
  const { vrEnabled, setVrEnabled } = useSettings();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={vrEnabled}
      aria-label="VR enabled for the whole studio"
      onClick={() => setVrEnabled(!vrEnabled)}
      className="ripple-btn"
      title={vrEnabled
        ? 'VR is on for the whole studio. Switch off to remove VR shifts and alerts everywhere — nothing is deleted.'
        : 'VR is off for the whole studio. Switch on to bring VR shifts and alerts back.'}
      style={{
        // Matches the Apply Template / Save as Weekly Template buttons beside it.
        display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        padding: '6px 14px', borderRadius: 8,
        fontSize: 13, fontWeight: 600,
        '--ripple-size': '12em',
      }}
    >
      <span className="ripple-transition" />
      <span className="ripple-gradient" />

      {/* ripple-label so the lever and the text sit above the two overlays. */}
      <span className="ripple-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            // border-box so the knob offsets below are measured against the inner
            // 28x14 box rather than shifting with the border.
            position: 'relative', boxSizing: 'border-box',
            width: 30, height: 16, borderRadius: 999, flexShrink: 0,
            background: vrEnabled ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.3)',
            border: `1px solid ${vrEnabled ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.25)'}`,
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 1, left: vrEnabled ? 15 : 1,
            width: 12, height: 12, borderRadius: '50%',
            background: vrEnabled ? 'var(--color-accent)' : '#fff',
            transition: 'left 0.15s, background 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }} />
        </span>
        VR
      </span>
    </button>
  );
}
