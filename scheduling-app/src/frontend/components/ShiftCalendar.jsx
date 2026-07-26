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
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Month-grid date picker where only days matching `isSelectable(date)` can be
 * chosen — every other day is shown greyed out and can't be clicked. Unlike a
 * native <input type="date">, this can disable arbitrary (non-contiguous) days.
 *
 *   value        'YYYY-MM-DD' | ''      currently selected day
 *   onChange     (dateStr) => void      fired when a selectable day is clicked
 *   isSelectable (Date) => boolean      whether a given day can be picked
 *   startMonth   Date                   which month to open on (default: today)
 */
export function ShiftCalendar({ value, onChange, isSelectable, startMonth }) {
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [view, setView] = useState(() => {
    const base = selected ?? startMonth ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Don't let them page back before the current month — nothing there is ever
  // selectable anyway.
  const now = new Date();
  const atFloor = year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());

  const navBtn = (disabled) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 28, borderRadius: 6,
    background: 'var(--color-muted)', border: '1px solid var(--color-border)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  });

  return (
    <div
      style={{
        border: '1px solid var(--color-border)', borderRadius: 10,
        background: 'var(--color-bg)', padding: 12, userSelect: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button
          type="button"
          disabled={atFloor}
          onClick={() => setView(new Date(year, month - 1, 1))}
          style={navBtn(atFloor)}
        >
          <ArrowLeftIcon size={16} color="white" />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          style={navBtn(false)}
        >
          <ArrowRightIcon size={16} color="white" />
        </button>
      </div>

      {/* Weekday labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-dim)' }}>
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />;
          const selectable = isSelectable(cell);
          const isSel = selected && sameDay(cell, selected);
          const isToday = sameDay(cell, now);

          return (
            <button
              key={toDateStr(cell)}
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onChange(toDateStr(cell))}
              title={selectable ? 'You have a shift this day' : undefined}
              style={{
                height: 34, borderRadius: 7, fontSize: 13, fontWeight: isSel ? 700 : 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: selectable ? 'pointer' : 'default',
                border: isToday && !isSel ? '1px solid var(--color-accent)' : '1px solid transparent',
                background: isSel
                  ? 'var(--color-accent)'
                  : selectable ? 'rgba(176,80,48,0.14)' : 'transparent',
                color: isSel
                  ? 'white'
                  : selectable ? 'var(--color-accent-bright)' : 'var(--color-text-dim)',
                opacity: selectable || isSel ? 1 : 0.35,
                transition: 'background 0.12s, opacity 0.12s',
              }}
              onMouseEnter={e => { if (selectable && !isSel) e.currentTarget.style.background = 'rgba(176,80,48,0.28)'; }}
              onMouseLeave={e => { if (selectable && !isSel) e.currentTarget.style.background = 'rgba(176,80,48,0.14)'; }}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--color-text-dim)' }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(176,80,48,0.14)', border: '1px solid var(--color-accent)', display: 'inline-block' }} />
        Days you're scheduled
      </div>
    </div>
  );
}
