import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { useTemplates } from '../context/TemplatesContext';
import { formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';
import { persistTemplates } from '../../data/mockTemplates';
import { ApplyTemplateCalendarModal } from '../components/ApplyTemplateCalendarModal';

const TOTAL_HOURS = HOURS_END - HOURS_START;
const NAME_COL    = 136;
const ROW_H       = 40;
const ALL_DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DOW_TO_TEMPLATE = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getMondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeStaff(s) {
  const shifts = s.shifts ?? (s.shiftStart != null
    ? [{ id: `s${s.id}-0`, start: s.shiftStart, end: s.shiftEnd }]
    : []);
  const deskShifts = s.deskShifts ?? (s.deskStart != null
    ? [{ id: `d${s.id}-0`, start: s.deskStart, end: s.deskEnd }]
    : []);
  return { ...s, shifts, deskShifts };
}

function getStaffForDate(date, getDaySchedule) {
  const saved = getDaySchedule(toDateStr(date));
  if (saved) return saved.map(normalizeStaff).filter(s => s.shifts?.length > 0);
  const tpl = weeklyTemplates[DOW_TO_TEMPLATE[date.getDay()]];
  if (!tpl?.staff?.length) return [];
  return tpl.staff.map(normalizeStaff).filter(s => s.shifts?.length > 0);
}

function getEventsForDate(date, events) {
  const dateStr = toDateStr(date);
  const dow = date.getDay();
  return events.filter(evt =>
    evt.days?.some(d => {
      if (d === dateStr) return true;
      if (evt.repeating) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day).getDay() === dow;
      }
      return false;
    })
  );
}

function pct(h) {
  return `${((h - HOURS_START) / TOTAL_HOURS) * 100}%`;
}

const navBtnStyle = {
  padding: '4px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-muted)',
  color: 'var(--color-text)',
  fontSize: 13,
  cursor: 'pointer',
};

export default function WeeklyViewPage() {
  const { events, currentDate, goToDate, getDaySchedule, staff, saveDaySchedule } = useScheduleContext();
  const { templates, setTemplates } = useTemplates();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getMondayOf(currentDate));
  const [saveModal,     setSaveModal]     = useState(false);
  const [applyTplOpen,  setApplyTplOpen]  = useState(false);
  const [tplName,       setTplName]       = useState('');
  const [tplDesc,       setTplDesc]       = useState('');
  const [nameError,     setNameError]     = useState('');

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today    = toDateStr(new Date());

  // Build a lookup of maxHoursPerWeek from the live staff list
  const maxHoursById = useMemo(() => {
    const m = new Map();
    staff.forEach(s => { if (s.maxHoursPerWeek != null) m.set(s.id, s.maxHoursPerWeek); });
    return m;
  }, [staff]);

  // Sum each person's scheduled hours across the full week
  const overHoursAlerts = useMemo(() => {
    const totals = new Map(); // id -> { name, total }
    weekDays.forEach(date => {
      getStaffForDate(date, getDaySchedule).forEach(person => {
        const hrs = (person.shifts ?? []).reduce((sum, s) => sum + (s.end - s.start), 0);
        if (hrs > 0) {
          const prev = totals.get(person.id) ?? { name: person.name, total: 0 };
          totals.set(person.id, { name: person.name, total: prev.total + hrs });
        }
      });
    });
    return [...totals.entries()]
      .filter(([id, { total }]) => {
        const max = maxHoursById.get(id);
        return max != null && total > max;
      })
      .map(([id, { name, total }]) => ({ name, total, max: maxHoursById.get(id) }))
      .sort((a, b) => (b.total - b.max) - (a.total - a.max));
  }, [weekDays, getDaySchedule, maxHoursById]);

  const hours = [];
  for (let h = HOURS_START; h <= HOURS_END; h++) hours.push(h);

  const halfHours = [];
  for (let h = HOURS_START + 0.5; h < HOURS_END; h++) halfHours.push(h);

  function prevWeek() { setWeekStart(d => addDays(d, -7)); }
  function nextWeek() { setWeekStart(d => addDays(d, 7)); }

  function handleDayClick(date) {
    goToDate(date);
    navigate('/');
  }

  function handleSaveTemplate() {
    const trimmed = tplName.trim();
    if (!trimmed) { setNameError('Template name is required.'); return; }
    if (templates.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setNameError('A template with this name already exists.'); return;
    }
    const days = Object.fromEntries(
      weekDays.map((date, i) => [ALL_DAYS[i], { staff: getStaffForDate(date, getDaySchedule) }])
    );
    const newTpl = {
      id: Date.now(),
      type: 'week',
      name: trimmed,
      description: tplDesc.trim(),
      createdAt: new Date().toISOString(),
      days,
    };
    const updated = [...templates, newTpl];
    setTemplates(updated);
    persistTemplates(updated);
    setSaveModal(false);
    setTplName('');
    setTplDesc('');
    setNameError('');
  }

  const weekLabel = (() => {
    const s = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${s} – ${e}`;
  })();

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Page header */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <h2 style={{ position: 'absolute', left: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Weekly View</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prevWeek} style={navBtnStyle}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', minWidth: 190, textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button onClick={nextWeek} style={navBtnStyle}>▶</button>
        </div>
        <div style={{ position: 'absolute', right: 0, display: 'flex', gap: 8 }}>
          <button
            onClick={() => setApplyTplOpen(true)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: 'var(--color-muted)', color: 'var(--color-text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}
          >
            Apply Template
          </button>
          <button
            onClick={() => { setTplName(''); setTplDesc(''); setNameError(''); setSaveModal(true); }}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none',
              background: 'var(--color-accent)', color: 'white',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Save as Weekly Template
          </button>
        </div>
      </div>

      {overHoursAlerts.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 10,
          border: '1px solid rgba(220,80,60,0.4)',
          background: 'rgba(200,60,40,0.08)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-red)', marginBottom: 2 }}>
            ⚠ Over Weekly Hour Limit
          </div>
          {overHoursAlerts.map(({ name, total, max }) => (
            <div key={name} style={{ fontSize: 12, color: 'var(--color-text-dim)', display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{name}</span>
              <span>is scheduled for <strong style={{ color: 'var(--color-red)' }}>{total % 1 === 0 ? total : total.toFixed(1)}h</strong> — limit is {max}h</span>
            </div>
          ))}
        </div>
      )}

      <div>

          {/* Day sections */}
          {weekDays.map(date => {
            const dateStr   = toDateStr(date);
            const isToday   = dateStr === today;
            const dayStaff  = getStaffForDate(date, getDaySchedule);
            const dayEvents = getEventsForDate(date, events);
            const dayName   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            const monthDay  = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <div
                key={dateStr}
                onClick={() => handleDayClick(date)}
                title={`Open daily schedule for ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
                style={{
                  marginBottom: 8,
                  borderRadius: 10,
                  border: `1px solid ${isToday ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: 'var(--color-surface)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'border-color 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent)';
                  e.currentTarget.style.borderColor = 'var(--color-accent)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = isToday ? 'var(--color-accent)' : 'var(--color-border)';
                }}
              >
                {/* Day header — name column + inline time axis */}
                <div style={{
                  display: 'flex',
                  background: isToday ? 'rgba(176,80,48,0.08)' : 'var(--color-muted)',
                  borderBottom: `1px solid var(--color-border)`,
                }}>
                  {/* Day label (aligned with name column) */}
                  <div style={{
                    width: NAME_COL, flexShrink: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    padding: '5px 8px',
                    borderRight: `1px solid var(--color-border)`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--color-accent)' : 'var(--color-text)', lineHeight: 1.2 }}>
                      {dayName} · {monthDay}
                    </span>
                    {isToday && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                        Today
                      </span>
                    )}
                  </div>
                  {/* Time axis (aligned with timeline column) */}
                  <div style={{ flex: 1, position: 'relative', height: 28 }}>
                    {hours.map(h => (
                      <div key={h} style={{
                        position: 'absolute',
                        top: '50%', transform: 'translate(-50%, -50%)',
                        left: pct(h),
                        fontSize: 9,
                        color: 'var(--color-text-dim)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}>
                        {formatTime(h)}
                      </div>
                    ))}
                    {halfHours.map(h => (
                      <div key={h} style={{
                        position: 'absolute',
                        bottom: 0,
                        left: pct(h),
                        width: 1,
                        height: 5,
                        background: 'var(--color-text-dim)',
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }} />
                    ))}
                  </div>
                </div>

                {/* Staff rows */}
                {dayStaff.length === 0 ? (
                  <div style={{ height: 36, display: 'flex', alignItems: 'center', paddingLeft: 16, fontSize: 12, color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                    No staff scheduled
                  </div>
                ) : (
                  <div>
                    {dayStaff.map((person, i) => (
                      <div
                        key={person.id}
                        style={{
                          display: 'flex',
                          borderBottom: i < dayStaff.length - 1 ? `1px solid var(--color-border)` : (dayEvents.length > 0 ? `1px solid var(--color-border)` : 'none'),
                        }}
                      >
                        {/* Name column */}
                        <div style={{
                          width: NAME_COL,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 8px',
                          height: ROW_H,
                          borderRight: `1px solid var(--color-border)`,
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--color-muted)',
                            color: 'var(--color-text-dim)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, flexShrink: 0,
                          }}>
                            {person.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {person.name}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--color-text-dim)', marginTop: 1 }}>
                              {person.shifts.length === 1
                                ? `${formatTime(person.shifts[0].start)}–${formatTime(person.shifts[0].end)}`
                                : `${person.shifts.length} shifts`}
                            </div>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div style={{ flex: 1, position: 'relative', height: ROW_H }}>
                          {/* Hour grid lines */}
                          {hours.map(h => h > HOURS_START && (
                            <div key={h} style={{
                              position: 'absolute', top: 0, bottom: 0,
                              left: pct(h), width: 1,
                              background: 'var(--color-border)',
                              opacity: 0.4,
                              pointerEvents: 'none',
                            }} />
                          ))}
                          {/* Half-hour tick lines */}
                          {halfHours.map(h => (
                            <div key={h} style={{
                              position: 'absolute',
                              top: '25%', height: '50%',
                              left: pct(h), width: 1,
                              background: 'var(--color-border)',
                              opacity: 0.25,
                              pointerEvents: 'none',
                            }} />
                          ))}

                          {/* Shift bars */}
                          {person.shifts.map(sh => (
                            <div
                              key={sh.id}
                              title={`${person.name}: ${formatTime(sh.start)}–${formatTime(sh.end)}`}
                              style={{
                                position: 'absolute',
                                top: '50%', transform: 'translateY(-50%)',
                                height: 22,
                                left: pct(sh.start),
                                width: `${((sh.end - sh.start) / TOTAL_HOURS) * 100}%`,
                                background: 'var(--color-green)',
                                opacity: 0.6,
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            />
                          ))}

                          {/* Desk shift bars */}
                          {person.deskShifts?.map(ds => (
                            <div
                              key={ds.id}
                              title={`${person.name} (desk): ${formatTime(ds.start)}–${formatTime(ds.end)}`}
                              style={{
                                position: 'absolute',
                                top: '50%', transform: 'translateY(-50%)',
                                height: 22,
                                left: pct(ds.start),
                                width: `${((ds.end - ds.start) / TOTAL_HOURS) * 100}%`,
                                background: 'var(--color-yellow)',
                                opacity: 0.75,
                                borderRadius: 4,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <span style={{ fontSize: 9, color: 'white', fontWeight: 600, pointerEvents: 'none' }}>Desk</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Events strip */}
                    {dayEvents.length > 0 && (
                      <div style={{ display: 'flex', height: 22 }}>
                        <div style={{
                          width: NAME_COL, flexShrink: 0,
                          display: 'flex', alignItems: 'center',
                          paddingLeft: 8,
                          borderRight: `1px solid var(--color-border)`,
                          fontSize: 9, fontWeight: 600, color: 'var(--color-text-dim)',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                          Events
                        </div>
                        <div style={{ flex: 1, position: 'relative' }}>
                          {dayEvents.map(evt => (
                            <div
                              key={evt.id}
                              title={`${evt.name}: ${formatTime(evt.start)}–${formatTime(evt.end)}`}
                              style={{
                                position: 'absolute',
                                top: '50%', transform: 'translateY(-50%)',
                                height: 14,
                                left: pct(evt.start),
                                width: `${((evt.end - evt.start) / TOTAL_HOURS) * 100}%`,
                                background: '#3b2a6e',
                                opacity: 0.85,
                                borderRadius: 3,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: 4,
                              }}
                            >
                              <span style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {evt.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

      </div>

      {/* Save as Template modal */}
      {saveModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) setSaveModal(false); }}
        >
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 28, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
              Save as Weekly Template
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>
                Template Name *
              </label>
              <input
                autoFocus
                value={tplName}
                onChange={e => { setTplName(e.target.value); setNameError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                placeholder="e.g. Summer Schedule"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13,
                  background: 'var(--color-muted)', border: `1px solid ${nameError ? 'var(--color-red)' : 'var(--color-border)'}`,
                  color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {nameError && <div style={{ fontSize: 11, color: 'var(--color-red)', marginTop: 4 }}>{nameError}</div>}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>
                Description (optional)
              </label>
              <input
                value={tplDesc}
                onChange={e => setTplDesc(e.target.value)}
                placeholder="e.g. Default staffing for summer weeks"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13,
                  background: 'var(--color-muted)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSaveModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-muted)', color: 'var(--color-text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {applyTplOpen && (
        <ApplyTemplateCalendarModal
          templates={templates}
          allStaff={staff}
          saveDaySchedule={saveDaySchedule}
          onClose={() => setApplyTplOpen(false)}
        />
      )}
    </div>
  );
}

