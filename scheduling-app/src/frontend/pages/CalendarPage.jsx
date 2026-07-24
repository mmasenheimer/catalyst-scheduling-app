import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { useAuth } from '../context/AuthContext';
import { weeklyTemplates } from '../../data/mockData';
import { ArrowLeftIcon } from '../components/ArrowLeftIcon';
import { ArrowRightIcon } from '../components/ArrowRightIcon';

function fmtT(t) {
  const h   = Math.floor(t);
  const m   = Math.round((t % 1) * 60);
  const suf = h >= 12 ? 'p' : 'a';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${h12}${suf}` : `${h12}:${String(m).padStart(2, '0')}${suf}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVENT_TYPES = ['program', 'service', 'meeting', 'workshop'];
const H_START = 7, H_END = 20;
const TIME_STEPS = Array.from({ length: (H_END - H_START) * 2 + 1 }, (_, i) => H_START + i * 0.5);

function getCalendarCells(year, month) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const cells = [];

  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), current: true });
  }

  let nextDay = 1;
  while (cells.length < totalCells) {
    cells.push({ date: new Date(year, month + 1, nextDay++), current: false });
  }

  return cells;
}

function getTemplate(date) {
  return weeklyTemplates[DAY_FULL[date.getDay()]] || { staff: [], events: [] };
}

function getEventsForDate(date, allEvents) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dow = date.getDay();
  return allEvents.filter(evt => {
    if (!evt.days?.length) return true;
    return evt.days.some(d => {
      if (d === dateStr) return true;
      if (evt.repeating) {
        const [y, m, day] = d.split('-').map(Number);
        const eventDate = new Date(y, m - 1, day);
        return eventDate.getDay() === dow &&
               new Date(date.getFullYear(), date.getMonth(), date.getDate()) >= eventDate;
      }
      return false;
    });
  });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function CalTimeSelect({ value, onChange, min, max }) {
  const opts = TIME_STEPS.filter(t => t >= (min ?? H_START) && t <= (max ?? H_END));
  const inp = { width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)' };
  return (
    <select value={value} onChange={e => onChange(parseFloat(e.target.value))} style={inp}>
      {opts.map(t => <option key={t} value={t}>{fmtT(t)}</option>)}
    </select>
  );
}

function EditEventModal({ evt, onSave, onClose }) {
  const [form, setForm] = useState({ name: evt.name, type: evt.type, start: evt.start, end: evt.end, staffNeeded: evt.staffNeeded, notes: evt.notes || '' });
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const inp = { width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 4 };
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} onMouseDown={e => e.stopPropagation()}>
      <div className="w-full max-w-sm mx-4 rounded-xl border p-5" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Edit Event</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div className="flex flex-col gap-3">
          <div><label style={lbl}>Event Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp}/></div>
          <div><label style={lbl}>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><label style={lbl}>Start</label><CalTimeSelect value={form.start} onChange={v => setForm(f => ({ ...f, start: Math.min(v, f.end - 0.5) }))} max={form.end - 0.5}/></div>
            <div className="flex-1"><label style={lbl}>End</label><CalTimeSelect value={form.end} onChange={v => setForm(f => ({ ...f, end: Math.max(v, f.start + 0.5) }))} min={form.start + 0.5}/></div>
          </div>
          <div><label style={lbl}>Staff Needed</label><input type="number" min={1} max={20} value={form.staffNeeded} onChange={e => setForm(f => ({ ...f, staffNeeded: parseInt(e.target.value) || 1 }))} style={inp}/></div>
          <div><label style={lbl}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'none' }}/></div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function EventsPopover({ date, events, x, cellTop, cellBottom, onClose, onEditEvent, onNavigate }) {
  const ref = useRef(null);
  const [top, setTop] = useState(cellBottom + 6);

  useEffect(() => {
    const onKey  = e => { if (e.key === 'Escape') onClose(); };
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  // After mount, flip above the cell if the popover would go off the bottom of the viewport
  useEffect(() => {
    if (ref.current) {
      const h = ref.current.getBoundingClientRect().height;
      if (cellBottom + 6 + h > window.innerHeight - 12) {
        setTop(cellTop - h - 6);
      }
    }
  }, [cellTop, cellBottom]);

  const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const W = 260;
  const left = Math.min(x, window.innerWidth - W - 12);

  return (
    <div ref={ref} style={{
      position: 'fixed', top, left, width: W, zIndex: 9999,
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.45)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{label}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px' }}>
        {events.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-dim)', padding: '6px 4px' }}>No events scheduled.</div>
        )}
        {events.map(evt => (
          <button key={evt.id} onClick={() => onEditEvent(evt)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 8px', borderRadius: 7, background: 'rgba(124,92,191,0.12)', border: '1px solid rgba(124,92,191,0.2)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,92,191,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,92,191,0.12)'}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c5cbf', flexShrink: 0, marginTop: 3 }}/>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{evt.name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 2 }}>
                {fmtT(evt.start)} – {fmtT(evt.end)} · {evt.type}
              </div>
              {evt.staffNeeded > 0 && (
                <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 1 }}>
                  {evt.assignedStaff?.length ?? 0}/{evt.staffNeeded} staff assigned
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: '6px 8px 8px', borderTop: '1px solid var(--color-border)' }}>
        <button onClick={onNavigate}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}>
          Open Daily Schedule →
        </button>
      </div>
    </div>
  );
}

function DayCell({ date, isCurrentMonth, isToday, isSelected, onClick, myShift, myDesk, me, events, isManager, onOverflowClick }) {
  const template = getTemplate(date);
  const staffCount = template.staff.length;
  const dateEvents = getEventsForDate(date, events);
  const shown = dateEvents.slice(0, 2);
  const overflow = dateEvents.length - shown.length;

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col cursor-pointer"
      style={{
        minHeight: 110,
        padding: '8px',
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        background: isSelected ? 'var(--color-muted)' : isToday ? 'rgba(176,80,48,0.08)' : 'transparent',
        opacity: isCurrentMonth ? 1 : 0.3,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (!isSelected && !isToday) e.currentTarget.style.background = 'var(--color-muted)';
      }}
      onMouseLeave={e => {
        if (!isSelected && !isToday) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Day number */}
      <div className="flex justify-end mb-1.5">
        {isToday ? (
          <span
            className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold leading-none"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {date.getDate()}
          </span>
        ) : (
          <span
            className="w-6 h-6 flex items-center justify-center text-xs leading-none"
            style={{
              fontWeight: isCurrentMonth ? 500 : 400,
              color: isCurrentMonth ? 'var(--color-text)' : 'var(--color-text-dim)',
            }}
          >
            {date.getDate()}
          </span>
        )}
      </div>

      {/* Shift / desk indicators */}
      <div className="flex flex-col gap-0.5 mb-0.5">
        {myShift && me && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded leading-tight"
            style={{ background: 'rgba(74,124,94,0.6)', color: 'white', fontSize: 10 }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-green)' }} />
            <span>{fmtT(me.shiftStart)} – {fmtT(me.shiftEnd)}</span>
          </div>
        )}
        {myDesk && me && me.deskStart != null && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded leading-tight"
            style={{ background: 'rgba(176,126,40,0.65)', color: 'white', fontSize: 10 }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-yellow)' }} />
            <span>Desk {fmtT(me.deskStart)} – {fmtT(me.deskEnd)}</span>
          </div>
        )}
      </div>

      {/* Events */}
      <div className="flex flex-col gap-0.5 flex-1">
        {shown.map(evt => (
          <div
            key={evt.id}
            className="flex items-start gap-1 px-1.5 py-0.5 rounded leading-tight"
            style={{ background: 'rgba(124,92,191,0.65)', color: 'white' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5"
              style={{ background: '#7c5cbf' }}
            />
            <div className="flex flex-col min-w-0">
              <span className="truncate" style={{ fontSize: 10 }}>{evt.name}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{fmtT(evt.start)} – {fmtT(evt.end)}</span>
            </div>
          </div>
        ))}
        {overflow > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onOverflowClick(e, date, dateEvents); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '1px 4px', borderRadius: 4, fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 600 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-dim)'}
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Staff count pill — manager only */}
      {isManager && staffCount > 0 && isCurrentMonth && (
        <div className="mt-1.5">
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
          >
            {staffCount} staff
          </span>
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [popover,    setPopover]    = useState(null); // { date, events, x, y }
  const [editingEvt, setEditingEvt] = useState(null);
  const { currentDate, goToDate, staff, events, updateEvent } = useScheduleContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const me = user?.staffId ? staff.find(s => s.id === user.staffId) : null;

  const cells = getCalendarCells(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  function handleDayClick(e, date) {
    const dateEvts = getEventsForDate(date, events);
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ date, events: dateEvts, x: rect.left, cellTop: rect.top, cellBottom: rect.bottom });
  }

  function handleOverflowClick(e, date, evts) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ date, events: evts, x: rect.left, cellTop: rect.top, cellBottom: rect.bottom });
  }

  function navigateToDay(date) {
    setPopover(null);
    setEditingEvt(null);
    goToDate(date);
    navigate(user?.role === 'manager' ? '/' : '/my-schedule');
  }

  const isViewingCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const totalEventsThisMonth = cells
    .filter(c => c.current)
    .reduce((sum, c) => sum + getEventsForDate(c.date, events).length, 0);

  const avgStaffThisMonth = Math.round(
    cells.filter(c => c.current).reduce((sum, c) => sum + getTemplate(c.date).staff.length, 0) /
    cells.filter(c => c.current).length
  );

  const myShiftsThisMonth = me
    ? cells.filter(c => c.current && getTemplate(c.date).staff.some(s => s.id === me.id)).length
    : 0;

  const myHoursThisMonth = me
    ? cells
        .filter(c => c.current && getTemplate(c.date).staff.some(s => s.id === me.id))
        .reduce((sum) => sum + (me.shiftEnd - me.shiftStart), 0)
    : 0;

  return (
    <div>
      {/* Page header */}
      <div
        className="flex items-center gap-3 p-4 sm:p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Left: title */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Calendar</h2>
          <p className="text-sm mt-1 hidden sm:block" style={{ color: 'var(--color-text-dim)' }}>
            {user?.role === 'manager' ? 'Click any day to see events and open the daily schedule' : 'Click any day to view your schedule for that week'}
          </p>
        </div>

        {/* Center: month navigation */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <ArrowLeftIcon size={16} />
          </button>
          <span className="text-base font-semibold min-w-36 text-center" style={{ color: 'var(--color-text)' }}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <ArrowRightIcon size={16} />
          </button>
        </div>

        {/* Right: stats + today */}
        <div className="flex-1 flex items-center justify-end gap-3 sm:gap-6 sm:pr-8">
          {[
            ...(user?.role === 'manager'
              ? [{ label: 'Avg Staff', value: avgStaffThisMonth }]
              : [{ label: 'Shifts', value: myShiftsThisMonth }, { label: 'Hours', value: myHoursThisMonth }]
            ),
            { label: 'Events', value: totalEventsThisMonth },
          ].map(({ label, value }) => (
            <div key={label} className="text-center hidden sm:block">
              <div className="text-xl font-bold" style={{ color: 'var(--color-accent-bright)' }}>{value}</div>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
            </div>
          ))}
          {!isViewingCurrentMonth && (
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Day-of-week header row */}
        <div
          className="grid grid-cols-7 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {DAY_HEADERS.map((day, i) => (
            <div
              key={day}
              className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider"
              style={{
                color: 'var(--color-text-dim)',
                borderRight: i < 6 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map(({ date, current }, i) => {
            const tpl = getTemplate(date);
            const myShift = me ? tpl.staff.some(s => s.id === me.id) : false;
            const myDesk  = myShift && me?.deskStart != null;
            return (
              <DayCell
                key={i}
                date={date}
                isCurrentMonth={current}
                isToday={isSameDay(date, today)}
                isSelected={isSameDay(date, currentDate)}
                onClick={e => handleDayClick(e, date)}
                myShift={myShift}
                myDesk={myDesk}
                me={me}
                events={events}
                isManager={user?.role === 'manager'}
                onOverflowClick={handleOverflowClick}
              />
            );
          })}
        </div>
      </div>

      {popover && (
        <EventsPopover
          date={popover.date}
          events={popover.events}
          x={popover.x}
          cellTop={popover.cellTop}
          cellBottom={popover.cellBottom}
          onClose={() => setPopover(null)}
          onEditEvent={evt => { setEditingEvt(evt); }}
          onNavigate={() => navigateToDay(popover.date)}
        />
      )}
      {editingEvt && (
        <EditEventModal
          evt={editingEvt}
          onSave={form => { updateEvent(editingEvt.id, form); setEditingEvt(null); }}
          onClose={() => setEditingEvt(null)}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-5 h-2.5 rounded-sm" style={{ background: 'var(--color-green)', opacity: 0.7 }} />
          Shift
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-5 h-2.5 rounded-sm" style={{ background: '#7c5cbf', opacity: 0.8 }} />
          Event
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center font-bold"
            style={{ background: 'var(--color-accent)', color: 'white', fontSize: 8 }}
          >
            {today.getDate()}
          </span>
          Today
        </div>
      </div>
    </div>
  );
}
