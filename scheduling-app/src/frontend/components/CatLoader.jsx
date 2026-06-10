import { useEffect } from 'react';
import catGif from '../assets/cat-what.gif';

export default function CatLoader({ onDone, fading }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.4s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'auto',
        willChange: 'opacity',
      }}
    >
      <img
        src={catGif}
        alt="loading"
        style={{ width: 250, borderRadius: 8 }}
      />
      <p style={{
        color: 'var(--color-text-dim)',
        fontSize: '12px',
        letterSpacing: '0.1em',
        marginTop: '12px',
      }}>
        loading...
      </p>
    </div>
  );
}
