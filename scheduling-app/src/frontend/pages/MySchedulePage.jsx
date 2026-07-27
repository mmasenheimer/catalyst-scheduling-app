import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';
import { formatTime, getEventsForDate } from '../utils/scheduleUtils';
import { ArrowLeftIcon } from '../components/ArrowLeftIcon';
import { ArrowRightIcon } from '../components/ArrowRightIcon';

const TOTAL_HOURS = HOURS_END - HOURS_START;

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function posStyle(start, end) {
  const left  = ((start - HOURS_START) / TOTAL_HOURS) * 100;
  const width = ((end   - start)       / TOTAL_HOURS) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() &&
         date.getMonth()    === t.getMonth()    &&
         date.getDate()     === t.getDate();
}

function isScheduledOn(date, staffId) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const tpl = weeklyTemplates[dayName];
  return tpl ? tpl.staff.some(s => s.id === staffId) : false;
}


// ── Week header ────────────────────────────────────────────────────────────────

function WeekHeader({ me, weekDays, onPrev, onNext, shiftsCount, hoursCount, eventsCount }) {
  const start = weekDays[0];
  const end   = weekDays[6];
  const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtYear = d => d.getFullYear();

  return (
    <div
      className="flex flex-wrap justify-between items-center gap-4 p-4 sm:p-5 rounded-xl mb-6 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {me.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div className="font-bold text-lg leading-tight" style={{ color: 'var(--color-text)' }}>
            {me.name}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          className="px-3 py-1.5 rounded-md text-sm border cursor-pointer flex items-center justify-center"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
        >
          <ArrowLeftIcon size={16} color="white" />
        </button>
        <span className="text-sm font-medium min-w-44 text-center" style={{ color: 'var(--color-text)' }}>
          {fmtDate(start)} – {fmtDate(end)}, {fmtYear(end)}
        </span>
        <button
          onClick={onNext}
          className="px-3 py-1.5 rounded-md text-sm border cursor-pointer flex items-center justify-center"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
        >
          <ArrowRightIcon size={16} color="white" />
        </button>
      </div>

      <div className="flex gap-6">
        {[
          { label: 'Shifts',  value: shiftsCount },
          { label: 'Hours',   value: hoursCount },
          { label: 'Events',  value: eventsCount },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold" style={{ color: 'var(--color-accent-bright)' }}>{value}</div>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Schedule grid (read-only) ──────────────────────────────────────────────────

function MyScheduleGrid({ me, weekDays, events }) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  return (
    <>
      <div
        className="rounded-xl border overflow-x-auto mb-4"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex border-b" style={{ borderColor: 'var(--color-border)', minWidth: 900 }}>
          <div
            className="w-40 shrink-0 p-3 text-xs uppercase tracking-wide border-r"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}
          >
            Date
          </div>
          <div className="flex-1 flex">
            {hours.map(h => (
              <div
                key={h}
                className="flex-1 p-2 text-xs text-center border-r last:border-r-0"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}
              >
                {formatTime(h)}
              </div>
            ))}
          </div>
        </div>

        {weekDays.map(date => {
          const scheduled = isScheduledOn(date, me.id);
          const dayEvents = getEventsForDate(date, events).filter(e => e.assignedStaff.includes(me.id));
          const today     = isToday(date);

          return (
            <div
              key={date.toDateString()}
              className="flex border-b last:border-b-0"
              style={{
                borderColor: 'var(--color-border)',
                minWidth: 900,
                background: today ? 'rgba(176, 80, 48, 0.04)' : 'transparent',
                opacity: scheduled ? 1 : 0.45,
              }}
            >
              <div
                className="w-40 shrink-0 px-3 py-3 border-r flex flex-col justify-center gap-0.5"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: today ? 'var(--color-accent-bright)' : 'var(--color-text)' }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  {today && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'var(--color-accent)', color: 'white', fontSize: 9 }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {scheduled && (
                  <span className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                    {formatTime(me.shiftStart)} – {formatTime(me.shiftEnd)}
                  </span>
                )}
                {!scheduled && (
                  <span className="text-xs mt-0.5" style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>
                    Off
                  </span>
                )}
              </div>

              <div className="flex-1 relative" style={{ height: 64 }}>
                {scheduled ? (
                  <>
                    <div
                      className="absolute top-3 h-8 rounded select-none"
                      style={{ ...posStyle(me.shiftStart, me.shiftEnd), background: 'var(--color-green)', opacity: 0.65 }}
                    />
                    {me.deskStart !== null && (
                      <div
                        className="absolute top-3 h-8 rounded select-none"
                        style={{ ...posStyle(me.deskStart, me.deskEnd), background: 'var(--color-yellow)', opacity: 0.75, zIndex: 2 }}
                      >
                        <span
                          className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          style={{ fontSize: 9, color: 'white', fontWeight: 600 }}
                        >
                          Desk
                        </span>
                      </div>
                    )}
                    {dayEvents.map(evt => {
                      return (
                        <div
                          key={evt.id}
                          className="absolute top-3 h-8 rounded select-none"
                          title={`${evt.name} — you're working this`}
                          style={{
                            ...posStyle(evt.start, evt.end),
                            background: '#3b2a6e',
                            opacity: 0.9,
                            zIndex: 3,
                          }}
                        >
                          <span
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{ fontSize: 10, color: 'white', paddingLeft: 6, paddingRight: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}
                          >
                            {evt.name}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 14 }}>
                    <span className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
                      Not scheduled
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-5 px-1 flex-wrap">
        {[
          { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-green)', opacity: 0.7 }} />, label: 'Shift' },
          { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-yellow)', opacity: 0.75 }} />, label: 'Desk' },
          { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: '#3b2a6e', opacity: 0.9 }} />, label: 'Event' },
        ].map(({ swatch, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
            {swatch}{label}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Events this week ───────────────────────────────────────────────────────────

function MyEventsPanel({ me, weekDays, events }) {
  const myEvents = weekDays.flatMap(date => {
    const dayEvents = getEventsForDate(date, events).filter(e => e.assignedStaff.includes(me.id));
    return dayEvents.map(e => ({ ...e, date }));
  });

  if (myEvents.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
        Events This Week
      </h3>
      <div className="flex flex-col gap-3">
        {myEvents.map((evt, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border flex justify-between items-start"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--color-text)' }}>{evt.name}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
                {formatTime(evt.start)} – {formatTime(evt.end)}
                {evt.notes && <span className="ml-2">· {evt.notes}</span>}
              </div>
            </div>
            <div className="text-sm shrink-0 ml-2" style={{ color: 'var(--color-text)' }}>
              {evt.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MySchedulePage() {
  const { user } = useAuth();
  const { staff, events } = useScheduleContext();
  const navigate = useNavigate();
  const me = staff.find(s => s.id === user?.staffId);

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDays = getWeekDays(weekStart);

  if (!me) {
    return (
      <div className="max-w-xl mx-auto">
        <div
          className="p-6 rounded-xl border text-center"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Manager Account</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Manager accounts don't have personal shift assignments.
            Use Daily Schedule to manage the full team.
          </p>
        </div>
      </div>
    );
  }

  const scheduledDays = weekDays.filter(d => isScheduledOn(d, me.id));
  const hoursCount    = scheduledDays.length * (me.shiftEnd - me.shiftStart);
  const eventsCount   = weekDays.reduce(
    (sum, d) => sum + getEventsForDate(d, events).filter(e => e.assignedStaff.includes(me.id)).length,
    0
  );

  function prevWeek() {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  }
  function nextWeek() {
    setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  }

  return (
    <div>
      <WeekHeader
        me={me}
        weekDays={weekDays}
        onPrev={prevWeek}
        onNext={nextWeek}
        shiftsCount={scheduledDays.length}
        hoursCount={hoursCount}
        eventsCount={eventsCount}
      />
      <MyScheduleGrid me={me} weekDays={weekDays} events={events} />
      <MyEventsPanel me={me} weekDays={weekDays} events={events} />
    </div>
  );
}
