// The app's primary action button: solid accent, with the expanding-circle hover
// the Sign In and Log out buttons use.
//
// `.ripple-btn` (index.css) needs a specific three-element structure — two
// absolutely-positioned overlay siblings and a label that sits above them — which
// is easy to get subtly wrong when hand-written at each call site. This wraps it
// so callers just pass children.
//
// `rippleSize` sets how far the circle grows; it has to comfortably cover the
// widest button it's used on, so a long label needs a larger value.
//
// `tone` picks the colour:
//   accent — the default orange, for ordinary actions.
//   green  — the finalize actions, which are green by design.
//   red    — destructive actions, so they read as dangerous before you click.
//   done    — the muted green of an already-finalized state.
// The two green tones override --color-accent-ripple locally, so the expanding
// circle matches the button instead of flashing orange across it.
const TONES = {
  accent: {
    background: 'var(--color-accent)',
    color: 'white',
  },
  green: {
    background: 'var(--color-green)',
    color: 'white',
    '--color-accent-ripple': 'rgba(150, 215, 175, 0.5)',
  },
  red: {
    background: 'var(--color-red)',
    color: 'white',
    '--color-accent-ripple': 'rgba(240, 130, 130, 0.5)',
  },
  done: {
    background: '#1a2a1a',
    color: '#6ab888',
    border: '1px solid #2a4a2a',
    '--color-accent-ripple': 'rgba(106, 184, 136, 0.25)',
  },
};

export function RippleButton({
  children,
  onClick,
  tone = 'accent',
  rippleSize = '14em',
  className = '',
  style,
  ...rest
}) {
  return (
    <button
      onClick={onClick}
      className={`ripple-btn ${className}`.trim()}
      style={{ ...TONES[tone], '--ripple-size': rippleSize, ...style }}
      {...rest}
    >
      <span className="ripple-transition" />
      <span className="ripple-gradient" />
      <span className="ripple-label">{children}</span>
    </button>
  );
}
