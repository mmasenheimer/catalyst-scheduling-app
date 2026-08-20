import { useState, useEffect, useMemo } from 'react';
import { schedulesApi, isConflict } from '../utils/api';
import { shiftsOf, deskShiftsOf, vrShiftsOf } from '../utils/scheduleUtils';

const ALL_DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT      = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const CAL_HEADERS    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const H_START = 7;
const H_END   = 20;
const H_TOTAL = H_END - H_START;

function pct(h)          { return `${((h - H_START) / H_TOTAL) * 100}%`; }
function wid(s, e)       { return `${((e - s)       / H_TOTAL) * 100}%`; }
// Shared accessors rather than a local pair: the version that used to live here
// treated an empty shifts array as "fall back to the legacy scalars", which
// drew shifts for people who had none.
const getShifts     = shiftsOf;
const getDeskShifts = deskShiftsOf;
const getVrShifts = vrShiftsOf;

function getMondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function dayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeForSave(person, tplPerson) {
  const shifts     = tplPerson ? (tplPerson.shifts ?? [])     : [];
  const deskShifts = tplPerson ? (tplPerson.deskShifts ?? []) : [];
  const vrShifts = tplPerson ? (tplPerson.vrShifts ?? []) : [];
  return {
    ...person, shifts, deskShifts, vrShifts,
    scheduled: shifts.length > 0,
    shiftStart: shifts[0]?.start ?? null, shiftEnd: shifts[0]?.end ?? null,
    deskStart: deskShifts[0]?.start ?? null, deskEnd: deskShifts[0]?.end ?? null,
    vrStart: vrShifts[0]?.start ?? null, vrEnd: vrShifts[0]?.end ?? null,
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
  const vrShifts   = getVrShifts(person);
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
        {vrShifts.map((vs, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: 0, height: '45%', borderRadius: 2,
            background: 'rgba(181,51,58,0.75)',
            left: pct(vs.start), width: wid(vs.start, vs.end),
          }} />
        ))}
      </div>
    </div>
  );
}

// A template stores a snapshot of the people who were on the roster when it was
// saved, so it can name someone who has since been deleted. `buildStaffForDate`
// walks the live roster and never reads an entry that isn't on it, so applying
// the template is already correct — but the preview reads the snapshot directly,
// and without this filter it would show a departed employee with shifts and
// count them in the day headcount. The manager would be previewing one thing and
// applying another.
//
// `liveIds` rather than the roster array because both call sites only need
// membership, and the headcount runs once per day chip on every render.
const onRoster = (staff, liveIds) =>
  (staff ?? []).filter(p => liveIds.has(p.id));

function DayPreview({ staff, liveIds }) {
  const scheduled = onRoster(staff, liveIds).filter(p => getShifts(p).length > 0);
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

// A week template used to render as one track per day with every person's shift
// stacked on it, which at fifteen people is an unreadable green block. Instead the
// manager picks a day and gets the same per-person view a day template shows. The
// pills keep the at-a-glance week shape by carrying each day's headcount.
function WeekPreview({ template, liveIds }) {
  const days = WEEK_ORDER.filter(d => template.days?.[d]);
  const headcount = day =>
    onRoster(template.days?.[day]?.staff, liveIds)
      .filter(p => getShifts(p).length > 0).length;

  // Open on a day that actually has people, so the preview is never blank on
  // arrival. Remounted per template (see the key in MiniPreview), so this
  // re-runs whenever the selection changes.
  const [day, setDay] = useState(() => days.find(d => headcount(d) > 0) ?? days[0] ?? null);

  if (days.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
        This template has no days
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10, justifyContent: 'center' }}>
        {days.map(d => {
          const n   = headcount(d);
          const sel = d === day;
          return (
            <button
              key={d}
              onClick={() => setDay(d)}
              title={`${d} — ${n === 0 ? 'nobody scheduled' : `${n} staff`}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 6px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${sel ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: sel ? 'var(--color-accent)' : 'transparent',
                color: sel ? 'white' : n === 0 ? 'rgba(128,128,128,0.6)' : 'var(--color-text-dim)',
                fontSize: 10, fontWeight: 600, lineHeight: 1,
                transition: 'background 0.1s, border-color 0.1s',
              }}
            >
              {DAY_SHORT[d]}
              <span style={{ fontSize: 9, fontWeight: 500, opacity: sel ? 0.85 : 0.7 }}>
                {n || '–'}
              </span>
            </button>
          );
        })}
      </div>
      <DayPreview staff={template.days?.[day]?.staff} liveIds={liveIds} />
    </div>
  );
}

function MiniPreview({ template, liveIds }) {
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
        ? <DayPreview staff={template.staff} liveIds={liveIds} />
        : <WeekPreview key={template.id} template={template} liveIds={liveIds} />
      }
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

export function ApplyTemplateCalendarModal({ templates, allStaff, saveDaySchedule, onClose, onApplyStaff }) {
  const weeklyTpls = templates.filter(t => !t.type || t.type === 'week');
  const dayTpls    = templates.filter(t => t.type === 'day');
  const allTpls    = [...weeklyTpls, ...dayTpls];

  // The roster the preview is allowed to show — the same set `buildStaffForDate`
  // applies, so what's previewed is what gets saved.
  const liveIds = useMemo(() => new Set(allStaff.map(p => p.id)), [allStaff]);

  const [selectedId,   setSelectedId]   = useState(allTpls[0]?.id ?? null);
  const [hoveredDate,  setHoveredDate]  = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [calMonth,     setCalMonth]     = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [applied, setApplied] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  const template = templates.find(t => t.id === selectedId) ?? null;
  const isDay    = template?.type === 'day';

  // Choosing a different template drops whatever date was pending against the old
  // one. This lives in the click handler rather than an effect on `selectedId`
  // because that click is the only thing that changes it — an effect would just
  // render once with a stale selection and then again to clear it.
  function selectTemplate(id) {
    setSelectedId(id);
    setSelectedDate(null);
    setSelectedWeek(null);
    setApplied(false);
    setError('');
  }

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
    if (!isSelectable(date) || busy) return;
    setError('');
    if (isDay) { setSelectedDate(date); }
    else       { setSelectedWeek(getMondayOf(date)); setSelectedDate(null); }
  }

  // Applying a template is a real edit — it persists to the backend as an
  // unfinalized draft (same as any other schedule change) rather than only
  // updating the local in-memory cache, which was lost on refresh.
  // The server write goes first; the local cache and the parent are only told
  // once it has been accepted. This used to run the other way round with the
  // failure swallowed, so a rejected save — a conflict, a dead session, the
  // backend being down — still flipped the button to "Applied!" and left every
  // view showing a schedule that was never stored. The manager found out on the
  // next refresh, by which point the edit was gone.
  async function persistDay(date, newStaff) {
    const dateStr = toDateStr(date);

    // Read the day before overwriting it, for two reasons.
    //
    // `expectedVersion` makes the write conditional: if somebody edited this day
    // between the read and the write, the server rejects it with a 409 rather
    // than letting the template quietly bury their work. Applying a template is
    // the bluntest write in the app — it replaces a whole day, or seven — and it
    // was the one write still going in unconditionally, so a concurrent edit
    // vanished with no error and no trace. A 404 here means the day has never
    // been saved, which is exactly what version 0 asserts.
    //
    // Carrying `events` through also stops the apply from blanking the day's
    // event snapshot, which it did by sending an empty array. A template holds
    // no events, so it has nothing to say about them and shouldn't clear them.
    const existing = await schedulesApi.getDay(dateStr).catch(() => null);
    await schedulesApi.saveDay(dateStr, {
      staff: newStaff,
      events: existing?.events ?? [],
      finalized: false,
      expectedVersion: existing?.version ?? 0,
    });

    saveDaySchedule(dateStr, newStaff);
    saveDaySchedule(date.toDateString(), newStaff);
    onApplyStaff?.(newStaff, dateStr);
  }

  async function handleApply() {
    if (!template || applied || busy) return;

    const targets = isDay
      ? (selectedDate ? [{ date: selectedDate, tpl: template.staff ?? [] }] : [])
      : (selectedWeek
        // Only the days this template actually defines. Templates cover the six
        // days the studio opens, so a blind seven-day loop wrote Saturday as
        // "nobody scheduled" — turning "the template doesn't model this day"
        // into an instruction to clear it, and silently dropping anyone who had
        // been put on a Saturday event.
        //
        // A day that exists with an empty staff list is still applied: that is a
        // deliberate "nobody works this day". Only an absent day is left alone.
        ? Array.from({ length: 7 }, (_, i) => addDays(selectedWeek, i))
          .map(date => ({ date, day: template.days?.[ALL_DAY_NAMES[date.getDay()]] }))
          .filter(t => t.day)
          .map(({ date, day }) => ({ date, tpl: day.staff ?? [] }))
        : []);
    if (targets.length === 0) return;

    setBusy(true);
    setError('');
    // allSettled rather than all: a week is several independent writes, and one
    // failing shouldn't hide whether the others landed.
    const results = await Promise.allSettled(
      targets.map(t => persistDay(t.date, buildStaffForDate(allStaff, t.tpl))),
    );
    setBusy(false);

    const failures = results
      .map((r, i) => (r.status === 'rejected' ? { date: targets[i].date, err: r.reason } : null))
      .filter(Boolean);

    if (failures.length > 0) {
      let reason = failures[0].err?.message || 'The server rejected the change.';
      // A conflict isn't a failure to retry blindly — the day moved underneath
      // the apply, so the manager needs to see the current state before deciding
      // whether they still want the template over the top of it.
      if (failures.some(f => isConflict(f.err))) {
        reason += ' Close this and reopen the day to see the current schedule before applying again.';
      }
      setError(
        failures.length === targets.length
          ? `Nothing was saved. ${reason}`
          : `Saved ${targets.length - failures.length} of ${targets.length} days. `
            + `${failures.map(f => dayLabel(f.date)).join(', ')} failed. ${reason}`,
      );
      return;
    }

    setApplied(true);
    setTimeout(() => onClose(), 900);
  }

  const canApply = !!template && (isDay ? !!selectedDate : !!selectedWeek);

  // Days of the week this template has nothing to say about — left as they are
  // rather than cleared. Named on the confirmation line so it is clear before
  // committing that they won't be touched.
  const untouchedDays = !isDay && template
    ? WEEK_ORDER.filter(d => !template.days?.[d]).map(d => DAY_SHORT[d])
    : [];

  function TemplateCard({ t }) {
    const sel = t.id === selectedId;
    return (
      <div
        onClick={() => selectTemplate(t.id)}
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
              <MiniPreview template={template} liveIds={liveIds} />
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
                    ? `→ ${dayLabel(selectedDate)}`
                    : `→ Week of ${selectedWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${addDays(selectedWeek, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }
                  {untouchedDays.length > 0 && (
                    <div style={{ marginTop: 3, fontSize: 11, opacity: 0.75 }}>
                      {untouchedDays.join(', ')} left unchanged
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {allTpls.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
            {error && (
              <div style={{
                flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.35,
                color: 'var(--color-red)', textAlign: 'left',
              }}>
                {error}
              </div>
            )}
            <button
              onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-dim)', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply || applied || busy}
              style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0,
                background: applied ? '#2a4a2a' : canApply ? 'var(--color-accent)' : 'var(--color-muted)',
                color: canApply || applied ? 'white' : 'var(--color-text-dim)',
                cursor: canApply && !applied && !busy ? 'pointer' : 'default',
                opacity: busy ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
            >
              {applied ? '✓ Applied!' : busy ? 'Applying…' : error ? 'Retry' : 'Apply'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
