import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { useAuth } from '../context/AuthContext';
import { weeklyTemplates } from '../../data/mockData';

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

function DayCell({ date, isCurrentMonth, isToday, isSelected, onClick, myShift, myDesk, me, events }) {
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
        background: isSelected ? '#1e1a14' : isToday ? '#181410' : 'transparent',
        opacity: isCurrentMonth ? 1 : 0.3,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (!isSelected && !isToday) e.currentTarget.style.background = '#151210';
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
            style={{ background: 'rgba(74,124,94,0.25)', color: 'white', fontSize: 10 }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--color-green)' }} />
            <span>{fmtT(me.shiftStart)} – {fmtT(me.shiftEnd)}</span>
          </div>
        )}
        {myDesk && me && me.deskStart != null && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded leading-tight"
            style={{ background: 'rgba(176,126,40,0.2)', color: 'white', fontSize: 10 }}
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
            style={{
              background: evt.type === 'program' ? '#1e1040' : '#241a06',
              color: 'white',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5"
              style={{ background: evt.type === 'program' ? '#7c5cbf' : 'var(--color-yellow)' }}
            />
            <div className="flex flex-col min-w-0">
              <span className="truncate" style={{ fontSize: 10 }}>{evt.name}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{fmtT(evt.start)} – {fmtT(evt.end)}</span>
            </div>
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-xs px-1" style={{ color: 'var(--color-text-dim)' }}>
            +{overflow} more
          </div>
        )}
      </div>

      {/* Staff count pill */}
      {staffCount > 0 && isCurrentMonth && (
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
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const { currentDate, goToDate, staff, events } = useScheduleContext();
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

  function handleDayClick(date) {
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

  return (
    <div>
      {/* Page header */}
      <div
        className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Title — order 1 on all sizes */}
        <div className="order-1">
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Calendar</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            {user?.role === 'manager' ? 'Click any day to open the daily schedule' : 'Click any day to view your schedule for that week'}
          </p>
        </div>

        {/* Stats + Today — order 2 on mobile (sits right of title), order 3 on desktop */}
        <div className="order-2 sm:order-3 flex items-center gap-3 sm:gap-6">
          {[
            { label: 'Avg Staff', value: avgStaffThisMonth },
            { label: 'Events', value: totalEventsThisMonth },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
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

        {/* Month navigation — order 3 on mobile (full-width row below), order 2 on desktop */}
        <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-center gap-2 sm:gap-3">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-accent-bright)' }}
          >
            ◀
          </button>
          <span className="text-base font-semibold min-w-36 sm:min-w-44 text-center" style={{ color: 'var(--color-text)' }}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-accent-bright)' }}
          >
            ▶
          </button>
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
                onClick={() => handleDayClick(date)}
                myShift={myShift}
                myDesk={myDesk}
                me={me}
                events={events}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-5 h-2.5 rounded-sm" style={{ background: 'var(--color-green)', opacity: 0.7 }} />
          Shift
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-5 h-2.5 rounded-sm" style={{ background: 'var(--color-yellow)', opacity: 0.75 }} />
          Desk
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: '#7c5cbf' }} />
          Program
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
