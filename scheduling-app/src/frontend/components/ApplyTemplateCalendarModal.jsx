import { useState, useEffect } from 'react';
import { schedulesApi } from '../utils/api';

const ALL_DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT      = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const CAL_HEADERS    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const H_START = 7;
const H_END   = 20;
const H_TOTAL = H_END - H_START;

function pct(h)          { return `${((h - H_START) / H_TOTAL) * 100}%`; }
function wid(s, e)       { return `${((e - s)       / H_TOTAL) * 100}%`; }
function getShifts(p)    { return p.shifts?.length ? p.shifts : (p.shiftStart != null ? [{ start: p.shiftStart, end: p.shiftEnd }] : []); }
function getDeskShifts(p){ return p.deskShifts?.length ? p.deskShifts : (p.deskStart != null ? [{ start: p.deskStart, end: p.deskEnd }] : []); }

function getMondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeForSave(person, tplPerson) {
  const shifts     = tplPerson ? (tplPerson.shifts ?? [])     : [];
  const deskShifts = tplPerson ? (tplPerson.deskShifts ?? []) : [];
  return {
    ...person, shifts, deskShifts,
    scheduled: shifts.length > 0,
    shiftStart: shifts[0]?.start ?? null, shiftEnd: shifts[0]?.end ?? null,
    deskStart: deskShifts[0]?.start ?? null, deskEnd: deskShifts[0]?.end ?? null,
  };
}
function buildStaffForDate(allStaff, tplStaff) {
  const map = new Map((tplStaff ?? []).map(s => [s.id, s]));
  return allStaff.map(p => normalizeForSave(p, map.get(p.id)));
}

// ── Mini preview ───────────────────────────────────────────────────────────────

function TimeAxis() {
  const hours = [7, 9, 11, 13, 15, 17, 19];
  return (
    <div style={{ position: 'relative', height: 14, marginBottom: 4, marginLeft: 54 }}>
      {hours.map(h => (
        <span key={h} style={{
          position: 'absolute', left: pct(h), fontSize: 9,
          color: 'var(--color-text-dim)', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        }}>
          {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
        </span>
      ))}
    </div>
  );
}

function StaffRow({ person }) {
  const shifts     = getShifts(person);
  const deskShifts = getDeskShifts(person);
  const firstName  = (person.name ?? '').split(' ')[0];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
      <div style={{ width: 50, fontSize: 10, color: 'var(--color-text-dim)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {firstName}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 14, background: 'var(--color-muted)', borderRadius: 3 }}>
        {shifts.map((sh, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, height: '100%', borderRadius: 3,
            background: 'rgba(74,222,128,0.55)',
            left: pct(sh.start), width: wid(sh.start, sh.end),
          }} />
        ))}
        {deskShifts.map((ds, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: 0, height: '45%', borderRadius: 2,
            background: 'rgba(234,179,8,0.7)',
            left: pct(ds.start), width: wid(ds.start, ds.end),
          }} />
        ))}
      </div>
    </div>
  );
}

function DayPreview({ staff }) {
  const scheduled = (staff ?? []).filter(p => getShifts(p).length > 0);
  if (scheduled.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
        No staff scheduled
      </div>
    );
  }
  return (
    <>
      <TimeAxis />
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {scheduled.map(p => <StaffRow key={p.id} person={p} />)}
      </div>
    </>
  );
}

function WeekPreview({ template }) {
  return (
    <div>
      {WEEK_ORDER.map(day => {
        const dayStaff  = (template.days?.[day]?.staff ?? []);
        const scheduled = dayStaff.filter(p => getShifts(p).length > 0);
        return (
          <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{ width: 28, fontSize: 10, fontWeight: 600, color: 'var(--color-text-dim)', flexShrink: 0 }}>
              {DAY_SHORT[day]}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 16, background: 'var(--color-muted)', borderRadius: 3 }}>
              {scheduled.map((p, pi) =>
                getShifts(p).map((sh, si) => (
                  <div key={`${pi}-${si}`} style={{
                    position: 'absolute', top: 1, height: 'calc(100% - 2px)', borderRadius: 2,
                    background: 'rgba(74,222,128,0.4)',
                    left: pct(sh.start), width: wid(sh.start, sh.end),
                  }} />
                ))
              )}
            </div>
            <div style={{ width: 20, fontSize: 10, color: 'var(--color-text-dim)', textAlign: 'right', flexShrink: 0 }}>
              {scheduled.length > 0 ? scheduled.length : '–'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniPreview({ template }) {
  if (!template) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>
        Select a template
      </div>
    );
  }
  return (
    <div>
      {template.type === 'day'
        ? <DayPreview staff={template.staff} />
        : <WeekPreview template={template} />
      }
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function ApplyTemplateCalendarModal({ templates, allStaff, saveDaySchedule, onClose, onApplyStaff }) {
  const weeklyTpls = templates.filter(t => !t.type || t.type === 'week');
  const dayTpls    = templates.filter(t => t.type === 'day');
  const allTpls    = [...weeklyTpls, ...dayTpls];

  const [selectedId,   setSelectedId]   = useState(allTpls[0]?.id ?? null);
  const [hoveredDate,  setHoveredDate]  = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [calMonth,     setCalMonth]     = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [applied, setApplied] = useState(false);

  const template = templates.find(t => t.id === selectedId) ?? null;
  const isDay    = template?.type === 'day';

  useEffect(() => { setSelectedDate(null); setSelectedWeek(null); setApplied(false); }, [selectedId]);
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const calYear     = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const firstDay    = new Date(calYear, calMonthIdx, 1);
  const lastDay     = new Date(calYear, calMonthIdx + 1, 0);
  const startOffset = firstDay.getDay();
  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells       = Array.from({ length: totalCells }, (_, i) =>
    new Date(calYear, calMonthIdx, 1 - startOffset + i)
  );
  const todayStr    = toDateStr(new Date());

  function isSelectable(date) {
    if (!template || date.getMonth() !== calMonthIdx) return false;
    return true;
  }
  function inSameWeek(date, weekMon) {
    if (!weekMon) return false;
    const d = date.getTime();
    return d >= weekMon.getTime() && d <= addDays(weekMon, 6).getTime();
  }
  const hoveredWeek = (!isDay && hoveredDate) ? getMondayOf(hoveredDate) : null;

  function handleClick(date) {
    if (!isSelectable(date)) return;
    if (isDay) { setSelectedDate(date); }
    else       { setSelectedWeek(getMondayOf(date)); setSelectedDate(null); }
  }

  // Applying a template is a real edit — it persists to the backend as an
  // unfinalized draft (same as any other schedule change) rather than only
  // updating the local in-memory cache, which was lost on refresh.
  function persistDay(dateStr, newStaff) {
    saveDaySchedule(dateStr, newStaff);
    schedulesApi.saveDay(dateStr, { staff: newStaff, events: [], finalized: false }).catch(() => {});
  }

  function handleApply() {
    if (!template || applied) return;
    if (isDay) {
      if (!selectedDate) return;
      const dateStr  = toDateStr(selectedDate);
      const newStaff = buildStaffForDate(allStaff, template.staff ?? []);
      persistDay(dateStr, newStaff);
      saveDaySchedule(selectedDate.toDateString(), newStaff);
      onApplyStaff?.(newStaff, dateStr);
    } else {
      if (!selectedWeek) return;
      for (let i = 0; i < 7; i++) {
        const date     = addDays(selectedWeek, i);
        const dayName  = ALL_DAY_NAMES[date.getDay()];
        const newStaff = buildStaffForDate(allStaff, template.days?.[dayName]?.staff ?? []);
        const dateStr  = toDateStr(date);
        persistDay(dateStr, newStaff);
        saveDaySchedule(date.toDateString(), newStaff);
        onApplyStaff?.(newStaff, dateStr);
      }
    }
    setApplied(true);
    setTimeout(() => onClose(), 900);
  }

  const canApply = !!template && (isDay ? !!selectedDate : !!selectedWeek);

  function TemplateCard({ t }) {
    const sel = t.id === selectedId;
    return (
      <div
        onClick={() => setSelectedId(t.id)}
        style={{
          padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${sel ? 'var(--color-accent)' : 'var(--color-border)'}`,
          background: sel ? 'rgba(176,80,48,0.1)' : 'transparent',
          transition: 'border-color 0.1s, background 0.1s',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name || 'Untitled'}
        </div>
        {t.type === 'day' && (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Day</div>
        )}
        {t.description && (
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 14, padding: 20, width: '100%', maxWidth: 940, margin: '0 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 16,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Apply Template</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {allTpls.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 14, padding: '24px 0', margin: 0 }}>
            No templates yet. Create one from the Templates page.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 0, minHeight: 0 }}>

            {/* Col 1 — template list */}
            <div style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', paddingRight: 14 }}>
              {weeklyTpls.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)', paddingLeft: 2, marginBottom: 2 }}>Weekly</div>
                  {weeklyTpls.map(t => <TemplateCard key={t.id} t={t} />)}
                </>
              )}
              {dayTpls.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)', paddingLeft: 2, marginTop: weeklyTpls.length > 0 ? 10 : 0, marginBottom: 2 }}>Day Templates</div>
                  {dayTpls.map(t => <TemplateCard key={t.id} t={t} />)}
                </>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: 'var(--color-border)', flexShrink: 0 }} />

            {/* Col 2 — mini preview */}
            <div style={{ width: 260, flexShrink: 0, padding: '0 16px', overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)', marginBottom: 10, textAlign: 'center' }}>Preview</div>
              <MiniPreview template={template} />
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: 'var(--color-border)', flexShrink: 0 }} />

            {/* Col 3 — calendar */}
            <div style={{ flex: 1, minWidth: 0, paddingLeft: 16 }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button
                  onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--color-text)', fontSize: 14 }}
                >◀</button>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                  {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--color-text)', fontSize: 14 }}
                >▶</button>
              </div>

              {template && (
                <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 8, textAlign: 'center' }}>
                  {isDay ? 'Click any date to apply' : 'Click any date to select that week'}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                {CAL_HEADERS.map(h => (
                  <div key={h} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)', padding: '2px 0' }}>{h}</div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {cells.map((date, i) => {
                  const inMonth   = date.getMonth() === calMonthIdx;
                  const dateStr   = toDateStr(date);
                  const isToday   = dateStr === todayStr;
                  const sel       = isSelectable(date);
                  const isSelDay  = isDay && selectedDate && toDateStr(selectedDate) === dateStr;
                  const isSelWeek = !isDay && selectedWeek && inSameWeek(date, selectedWeek);
                  const isHovDay  = isDay && hoveredDate && toDateStr(hoveredDate) === dateStr && sel;
                  const isHovWeek = !isDay && hoveredWeek && inSameWeek(date, hoveredWeek) && inMonth;

                  let bg = 'transparent';
                  let color = inMonth ? 'var(--color-text)' : 'rgba(128,128,128,0.4)';
                  let border = '1px solid transparent';
                  let fontWeight = 400;

                  if (isSelDay || isSelWeek)      { bg = 'var(--color-accent)'; color = 'white'; fontWeight = 600; }
                  else if (isHovDay || isHovWeek) { bg = 'rgba(176,80,48,0.18)'; color = 'var(--color-accent)'; }
                  else if (isToday && inMonth)    { border = '1px solid var(--color-accent)'; }

                  return (
                    <div
                      key={i}
                      onClick={() => inMonth && handleClick(date)}
                      onMouseEnter={() => { if (sel) setHoveredDate(date); }}
                      onMouseLeave={() => setHoveredDate(null)}
                      style={{
                        textAlign: 'center', fontSize: 13, padding: '5px 2px', borderRadius: 6,
                        cursor: sel ? 'pointer' : 'default',
                        background: bg, color, border, fontWeight,
                        opacity: inMonth ? 1 : 0.3,
                        transition: 'background 0.1s',
                        userSelect: 'none',
                      }}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>

              {canApply && !applied && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center' }}>
                  {isDay
                    ? `→ ${selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                    : `→ Week of ${selectedWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${addDays(selectedWeek, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {allTpls.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-dim)', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply || applied}
              style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                background: applied ? '#2a4a2a' : canApply ? 'var(--color-accent)' : 'var(--color-muted)',
                color: canApply || applied ? 'white' : 'var(--color-text-dim)',
                cursor: canApply && !applied ? 'pointer' : 'default',
                transition: 'background 0.2s',
              }}
            >
              {applied ? '✓ Applied!' : 'Apply'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
