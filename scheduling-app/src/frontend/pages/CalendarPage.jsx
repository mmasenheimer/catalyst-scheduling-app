import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { weeklyTemplates } from '../../data/mockData';

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

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function DayCell({ date, isCurrentMonth, isToday, isSelected, onClick }) {
  const template = getTemplate(date);
  const staffCount = template.staff.length;
  const shown = template.events.slice(0, 2);
  const overflow = template.events.length - shown.length;

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col cursor-pointer"
      style={{
        minHeight: 100,
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

      {/* Events */}
      <div className="flex flex-col gap-0.5 flex-1">
        {shown.map(evt => (
          <div
            key={evt.id}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs leading-tight truncate"
            style={{
              background: evt.type === 'program' ? '#1e1040' : '#241a06',
              color: evt.type === 'program' ? '#a98ee8' : 'var(--color-yellow)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: evt.type === 'program' ? '#7c5cbf' : 'var(--color-yellow)' }}
            />
            <span className="truncate">{evt.name}</span>
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
  const { currentDate, goToDate } = useScheduleContext();
  const navigate = useNavigate();

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
    navigate('/');
  }

  const isViewingCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const totalEventsThisMonth = cells
    .filter(c => c.current)
    .reduce((sum, c) => sum + getTemplate(c.date).events.length, 0);

  const avgStaffThisMonth = Math.round(
    cells.filter(c => c.current).reduce((sum, c) => sum + getTemplate(c.date).staff.length, 0) /
    cells.filter(c => c.current).length
  );

  return (
    <div>
      {/* Page header */}
      <div
        className="flex justify-between items-center p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Calendar</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Click any day to open the daily schedule
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            ◀
          </button>
          <span className="text-base font-semibold min-w-44 text-center" style={{ color: 'var(--color-text)' }}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 rounded-md text-sm border cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            ▶
          </button>
        </div>

        {/* Stats + Today */}
        <div className="flex items-center gap-6">
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
              className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer hover:opacity-80 transition-opacity"
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
          {cells.map(({ date, current }, i) => (
            <DayCell
              key={i}
              date={date}
              isCurrentMonth={current}
              isToday={isSameDay(date, today)}
              isSelected={isSameDay(date, currentDate)}
              onClick={() => handleDayClick(date)}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-5 mt-3 px-1">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: '#7c5cbf' }} />
          Program
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-yellow)' }} />
          Service
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
