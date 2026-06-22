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

function DayCell({ date, isCurrentMonth, isToday, isSelected, onClick, myShift, myDesk, me, events, isManager }) {
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
          <div className="text-xs px-1" style={{ color: 'var(--color-text-dim)' }}>
            +{overflow} more
          </div>
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
            {user?.role === 'manager' ? 'Click any day to open the daily schedule' : 'Click any day to view your schedule for that week'}
          </p>
        </div>

        {/* Center: month navigation */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-accent-bright)' }}
          >
            ◀
          </button>
          <span className="text-base font-semibold min-w-36 text-center" style={{ color: 'var(--color-text)' }}>
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
                onClick={() => handleDayClick(date)}
                myShift={myShift}
                myDesk={myDesk}
                me={me}
                events={events}
                isManager={user?.role === 'manager'}
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
