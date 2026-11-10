import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DeleteIcon } from './DeleteIcon';

const EDGE = 8;   // px kept between the menu and the window edge

/**
 * The Edit / Delete menu shown when a schedule bar is right-clicked, placed at
 * the pointer.
 *
 * Rendered into document.body rather than where it's declared. The schedule
 * grids sit inside glass cards, and a `backdrop-filter` (or `contain`) on an
 * ancestor turns `position: fixed` into "fixed to that card" — so the menu
 * landed offset from the click by however far the card was from the window's
 * corner. From the body, fixed means the viewport again.
 */
export function ContextMenu({ x, y, onEdit, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  // Keep it on screen when right-clicking near the right or bottom edge. Done on
  // the element before paint, so it never flashes at the clipped position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))}px`;
    el.style.top  = `${Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))}px`;
  }, [x, y]);

  const menuStyle = {
    position: 'fixed', left: x, top: y, zIndex: 9999, minWidth: 140,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden',
  };
  const btn = (color) => ({
    display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 13, color: color || 'var(--color-text)',
  });

  return createPortal(
    <div ref={ref} style={menuStyle} onContextMenu={e => e.preventDefault()}>
      <button
        style={btn()}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={onEdit}
      >
        ✏️  Edit
      </button>
      <div style={{ height: 1, background: 'var(--color-border)' }} />
      <button
        style={{ ...btn('#f07070'), display: 'flex', alignItems: 'center', gap: 6 }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,64,64,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={onDelete}
      >
        <DeleteIcon size={13} /> Delete
      </button>
    </div>,
    document.body,
  );
}
