import { useState } from 'react';
import { ArrowLeftIcon } from './ArrowLeftIcon';
import { ArrowRightIcon } from './ArrowRightIcon';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parse(str) {
  if (!str) return null;
  const [y, m, d] = String(str).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Month grid for picking a date range: click a start date, then an end date.
 * Clicking again after a complete range starts a new one. Days between the two
 * ends are shaded so the span is visible at a glance.
 *
 *   from / until   'YYYY-MM-DD' | null
 *   onChange       ({ from, until }) => void — until is null mid-selection
 *   highlightDow   0–6, optional: which weekday the event actually recurs on,
 *                  drawn with a marker so the user can see which days are hit
 */
export function RangeCalendar({ from, until, onChange, highlightDow }) {
  const fromDate = parse(from);
  const untilDate = parse(until);
  const [view, setView] = useState(() => {
    const base = fromDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  // Preview of the span while the second end hasn't been clicked yet.
  const [hovered, setHovered] = useState(null);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // While picking the second end, shade against the hovered day instead.
  const pendingEnd = fromDate && !untilDate ? hovered : untilDate;
  const inRange = (d) => {
    if (!fromDate || !pendingEnd) return false;
    const lo = fromDate <= pendingEnd ? fromDate : pendingEnd;
    const hi = fromDate <= pendingEnd ? pendingEnd : fromDate;
    return d > lo && d < hi;
  };

  function handleClick(d) {
    // No start yet, or restarting after a finished range → this is the new start.
    if (!fromDate || untilDate) {
      onChange({ from: toDateStr(d), until: null });
      return;
    }
    // Second click completes it; clicking earlier than the start flips them.
    if (d < fromDate) onChange({ from: toDateStr(d), until: from });
    else onChange({ from, until: toDateStr(d) });
  }

  const navBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 26, borderRadius: 6,
    background: 'var(--color-muted)', border: '1px solid var(--color-border)', cursor: 'pointer',
  };

  return (
    <div
      style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-bg)', padding: 10, userSelect: 'none' }}
      onMouseLeave={() => setHovered(null)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} style={navBtn}>
          <ArrowLeftIcon size={14} color="white" />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} style={navBtn}>
          <ArrowRightIcon size={14} color="white" />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{
            textAlign: 'center', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
            color: highlightDow === i ? 'var(--color-accent-bright)' : 'var(--color-text-dim)',
          }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const isStart = sameDay(d, fromDate);
          const isEnd = sameDay(d, untilDate);
          const isEdge = isStart || isEnd;
          const between = inRange(d);
          // Days the recurrence actually lands on, inside the chosen span.
          const isRecurring = highlightDow === d.getDay() && (between || isEdge);

          return (
            <button
              key={toDateStr(d)}
              type="button"
              onClick={() => handleClick(d)}
              onMouseEnter={() => setHovered(d)}
              style={{
                height: 28, borderRadius: 6, fontSize: 12,
                fontWeight: isEdge || isRecurring ? 700 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                border: sameDay(d, today) && !isEdge ? '1px solid var(--color-accent)' : '1px solid transparent',
                background: isEdge ? 'var(--color-accent)' : between ? 'rgba(176,80,48,0.18)' : 'transparent',
                color: isEdge ? 'white' : isRecurring ? 'var(--color-accent-bright)' : 'var(--color-text)',
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-dim)' }}>
        {!fromDate
          ? 'Click a start date.'
          : !untilDate
            ? 'Now click an end date.'
            : <>Repeats {from} → {until}{' '}
                <button
                  type="button"
                  onClick={() => onChange({ from: null, until: null })}
                  style={{ background: 'none', border: 'none', color: 'var(--color-accent-bright)', cursor: 'pointer', padding: 0, fontSize: 11 }}
                >
                  clear
                </button>
              </>}
      </div>
    </div>
  );
}
