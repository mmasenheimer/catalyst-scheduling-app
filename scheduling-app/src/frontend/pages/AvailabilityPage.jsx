import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { formatTime } from '../utils/scheduleUtils';

// Saturday excluded
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'];

// 30-min slots 7:00 → 20:00 (26 slots)
const SLOTS = [];
for (let h = 7; h < 20; h++) {
  SLOTS.push(h);
  SLOTS.push(h + 0.5);
}

function buildMessage(name, grid, note) {
  const dayRanges = [];
  grid.forEach((daySlots, di) => {
    const blocks = [];
    let start = null;
    daySlots.forEach((v, si) => {
      if (v === 'available' && start === null) start = SLOTS[si];
      if (v !== 'available' && start !== null) {
        blocks.push(`${formatTime(start)}–${formatTime(SLOTS[si])}`);
        start = null;
      }
    });
    if (start !== null) blocks.push(`${formatTime(start)}–${formatTime(20)}`);
    if (blocks.length) dayRanges.push(`${DAYS[di]}: ${blocks.join(', ')}`);
  });

  let msg = `${name} submitted their weekly availability template.`;
  msg += dayRanges.length ? ' ' + dayRanges.join(' | ') : ' No availability marked.';
  if (note) msg += ` Note: "${note}"`;
  return msg;
}

function emptyGrid() {
  return Array.from({ length: DAYS.length }, () => new Array(SLOTS.length).fill(null));
}

function cellBg(value, isHovering, mode) {
  if (value === 'available')   return 'rgba(74,124,94,0.55)';
  if (value === 'unavailable') return 'rgba(200,64,64,0.45)';
  if (isHovering) return mode === 'available' ? 'rgba(74,124,94,0.28)' : 'rgba(200,64,64,0.25)';
  return 'var(--color-bg)';
}

function cellBorderColor(value) {
  if (value === 'available')   return 'rgba(74,124,94,0.45)';
  if (value === 'unavailable') return 'rgba(200,64,64,0.4)';
  return 'var(--color-border)';
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const [grid, setGrid]           = useState(emptyGrid);
  const [mode, setMode]           = useState('available');
  const [hoverCell, setHoverCell] = useState(null);
  const [note, setNote]           = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isPaintingRef = useRef(false);
  const paintValRef   = useRef(null);

  useEffect(() => {
    function stop() { isPaintingRef.current = false; }
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  function paint(d, s, value) {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[d][s] = value;
      return next;
    });
  }

  function handleCellDown(d, s) {
    const newVal = grid[d][s] === mode ? null : mode;
    isPaintingRef.current = true;
    paintValRef.current   = newVal;
    paint(d, s, newVal);
  }

  function handleCellEnter(d, s) {
    setHoverCell({ d, s });
    if (isPaintingRef.current) paint(d, s, paintValRef.current);
  }

  function clearDay(d) {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[d] = new Array(SLOTS.length).fill(null);
      return next;
    });
  }

  function handleSubmit() {
    addNotification({
      type: 'availability',
      title: 'Availability Template Submitted',
      message: buildMessage(user?.name ?? 'Staff', grid, note),
      from: user?.name ?? 'Staff',
      recipients: 'manager',
    });
    setSubmitted(true);
  }

  // ── Manager guard ─────────────────────────────────────────────────────────────

  if (user?.role === 'manager') {
    return (
      <div className="p-5 rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Availability</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
          Availability submissions are for staff members. View submitted availability in Notifications.
        </p>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="p-8 rounded-xl border text-center" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-5 mx-auto"
          style={{ border: '2px solid var(--color-accent)', color: 'var(--color-accent-bright)' }}
        >✓</div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Availability Sent</h3>
        <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
          Your weekly availability template has been sent to the manager.
        </p>
        {note && <p className="text-xs mt-2 italic" style={{ color: 'var(--color-text-dim)' }}>"{note}"</p>}
        <button
          onClick={() => { setSubmitted(false); setGrid(emptyGrid()); setNote(''); }}
          className="mt-6 text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
          style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
        >Update availability</button>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="mr-1">
          <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--color-text)' }}>My Availability</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>Click and drag to paint your weekly template</p>
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--color-border)', flexShrink: 0 }} />

        {/* Paint mode */}
        {[
          { val: 'available',   label: 'Available',   activeBg: 'rgba(74,124,94,0.18)',  color: 'var(--color-green)', activeBorder: 'rgba(74,124,94,0.6)',  swatch: 'rgba(74,124,94,0.75)',  swatchBorder: 'rgba(74,124,94,1)'  },
          { val: 'unavailable', label: 'Unavailable', activeBg: 'rgba(200,64,64,0.15)',  color: 'var(--color-red)',   activeBorder: 'rgba(200,64,64,0.55)', swatch: 'rgba(200,64,64,0.65)', swatchBorder: 'rgba(200,64,64,1)'  },
        ].map(({ val, label, activeBg, color, activeBorder, swatch, swatchBorder }) => (
          <button
            key={val}
            onClick={() => setMode(val)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
            style={{
              background: mode === val ? activeBg      : 'var(--color-surface)',
              color:      mode === val ? color         : 'var(--color-text-dim)',
              border:     `1px solid ${mode === val ? activeBorder : 'var(--color-border)'}`,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{ background: swatch, border: `1px solid ${swatchBorder}` }} />
            {label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setGrid(emptyGrid())}
          className="text-xs px-3 py-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}
        >Clear all</button>
      </div>

      {/* Grid */}
      <div
        className="rounded-xl border mb-4"
        style={{
          borderColor: 'var(--color-border)',
          background:  'var(--color-surface)',
          userSelect:  'none',
          WebkitUserSelect: 'none',
          overflowX: 'auto',
        }}
        onMouseLeave={() => setHoverCell(null)}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 52 }} />
            {DAYS.map(d => <col key={d} />)}
          </colgroup>

          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '8px 8px 6px' }} />
              {DAYS.map((day, di) => (
                <th key={day} style={{ padding: '8px 4px 6px', textAlign: 'center' }}>
                  <div className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{day}</div>
                  <button
                    onClick={() => clearDay(di)}
                    title={`Clear ${day}`}
                    className="text-[10px] cursor-pointer hover:opacity-70 mt-1"
                    style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', lineHeight: 1, display: 'block', margin: '4px auto 0' }}
                  >✕</button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {SLOTS.map((t, si) => {
              const isHour = Number.isInteger(t);
              return (
                <tr key={t} style={{ borderTop: isHour ? '1px solid var(--color-border)' : '1px solid transparent' }}>
                  <td style={{ padding: '0 8px', height: 18, verticalAlign: 'top', paddingTop: 2 }}>
                    {isHour && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)', whiteSpace: 'nowrap', lineHeight: 1 }}>
                        {formatTime(t)}
                      </span>
                    )}
                  </td>
                  {DAYS.map((_, di) => {
                    const value = grid[di][si];
                    const isHov = hoverCell?.d === di && hoverCell?.s === si;
                    return (
                      <td
                        key={di}
                        onMouseDown={e => { e.preventDefault(); handleCellDown(di, si); }}
                        onMouseEnter={() => handleCellEnter(di, si)}
                        style={{
                          height: 18,
                          cursor: 'crosshair',
                          background:   cellBg(value, isHov, mode),
                          borderLeft:   `1px solid ${cellBorderColor(value)}`,
                          borderBottom: `1px solid ${cellBorderColor(value)}`,
                          transition:   'background 0.04s',
                        }}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom: legend + note + send */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3 text-xs pt-2 shrink-0" style={{ color: 'var(--color-text-dim)' }}>
          {[
            { bg: 'rgba(74,124,94,0.55)',  border: 'rgba(74,124,94,0.7)',  label: 'Available'   },
            { bg: 'rgba(200,64,64,0.45)',  border: 'rgba(200,64,64,0.65)', label: 'Unavailable' },
            { bg: 'var(--color-bg)',        border: 'var(--color-border)',  label: 'Not set'     },
          ].map(({ bg, border, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: bg, border: `1px solid ${border}` }} />
              {label}
            </div>
          ))}
          <span style={{ opacity: 0.5 }}>· re-click to erase</span>
        </div>

        <div className="flex-1 flex gap-3 items-end min-w-0" style={{ minWidth: 240 }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note to manager..."
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border text-xs outline-none resize-none min-w-0"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          />
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            style={{ background: 'var(--color-accent)', color: 'white', alignSelf: 'flex-end' }}
          >Send</button>
        </div>
      </div>
    </div>
  );
}
