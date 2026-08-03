import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import {
  formatTime,
  staffForDateFromSaved,
  stretchShiftsToCoverEvents,
  mergeStaffShifts,
} from '../utils/scheduleUtils';
import { schedulesApi } from '../utils/api';
import { HOURS_START, HOURS_END, EVENT_TYPES } from '../../data/mockData';
import { DateInput } from '../components/DateInput';
import { RangeCalendar } from '../components/RangeCalendar';


function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ALL_TIMES = (() => {
  const opts = [];
  for (let h = HOURS_START; h <= HOURS_END; h += 0.5) opts.push(h);
  return opts;
})();
const START_TIMES = ALL_TIMES.filter(t => t < HOURS_END);
const endTimesAfter = start => ALL_TIMES.filter(t => t > start);

const inputStyle = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

/** A person's shifts for a day, tolerating the legacy scalar pair. */
function shiftsOf(person) {
  if (person.shifts?.length) return person.shifts;
  return person.shiftStart != null ? [{ start: person.shiftStart, end: person.shiftEnd }] : [];
}

const shiftLabel = shifts =>
  shifts.map(sh => `${formatTime(sh.start)} – ${formatTime(sh.end)}`).join(', ');

export default function AddEventPage() {
  const { addEvent, staff, getDaySchedule } = useScheduleContext();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    type: 'program',
    start: 10,
    end: 11,
    staffNeeded: 1,
    notes: '',
    days: [],
    repeating: false,
    repeatFrom: null,
    repeatUntil: null,
    assignedByDate: {},
  });
  const [dateInput, setDateInput] = useState('');
  const [activeStaffDate, setActiveStaffDate] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'start' && next.end <= value) {
        next.end = Math.min(value + 0.5, HOURS_END);
      }
      return next;
    });
  }

  // Weekly repetition is only meaningful for a single date, so a second date
  // disables it.
  const multiDate = form.days.length > 1;

  function addDate() {
    if (!dateInput || form.days.includes(dateInput)) return;
    const d = dateInput;
    setForm(prev => {
      const days = [...prev.days, d].sort();
      return {
        ...prev,
        days,
        assignedByDate: { ...prev.assignedByDate, [d]: prev.assignedByDate[d] ?? [] },
        // Turn repetition off rather than submit a combination the server rejects.
        ...(days.length > 1 ? { repeating: false, repeatFrom: null, repeatUntil: null } : {}),
      };
    });
    setActiveStaffDate(d);
    setDateInput('');
  }

  function removeDate(d) {
    setForm(prev => {
      const { [d]: _, ...rest } = prev.assignedByDate;
      return { ...prev, days: prev.days.filter(x => x !== d), assignedByDate: rest };
    });
    setActiveStaffDate(prev => {
      if (prev !== d) return prev;
      const remaining = form.days.filter(x => x !== d);
      return remaining[0] ?? null;
    });
  }

  function toggleStaff(id) {
    if (!activeStaffDate) return;
    setForm(prev => {
      const current = prev.assignedByDate[activeStaffDate] ?? [];
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      return { ...prev, assignedByDate: { ...prev.assignedByDate, [activeStaffDate]: next } };
    });
  }

  // Who is on shift for the date being assigned. Fetched rather than read from
  // the in-memory day cache: that cache is only written when a manager edits or
  // navigates a day, so arriving here directly found it empty and offered a
  // roster with nobody scheduled for any date. The submit handler below has
  // always fetched — this makes the list agree with what actually gets saved.
  // Stored with the date it belongs to, so "still loading" is derived by
  // comparing rather than tracked as a second piece of state that has to be
  // reset in step with this one.
  const [loadedDay, setLoadedDay] = useState({ date: null, staff: [] });

  useEffect(() => {
    if (!activeStaffDate) return undefined;
    let cancelled = false;
    schedulesApi.getDay(activeStaffDate)
      .then(saved => {
        if (!cancelled) setLoadedDay({ date: activeStaffDate, staff: saved?.staff ?? [] });
      })
      .catch(() => {
        // 404 (never saved) or the backend is unreachable. Anything the cache
        // holds beats nothing, and empty is the honest answer otherwise.
        if (cancelled) return;
        const [y, m, d] = activeStaffDate.split('-').map(Number);
        const cached = getDaySchedule(new Date(y, m - 1, d).toDateString()) ?? [];
        setLoadedDay({ date: activeStaffDate, staff: cached });
      });
    // A quick series of date-tab clicks can land out of order, so a superseded
    // response must not overwrite the current one.
    return () => { cancelled = true; };
  }, [activeStaffDate, getDaySchedule]);

  const scheduledForDate = loadedDay.date === activeStaffDate ? loadedDay.staff : null;
  const loadingStaff     = activeStaffDate != null && scheduledForDate === null;

  // id -> that person's shifts for the day. Keyed on shifts rather than the
  // legacy scalar pair so somebody working a split day is represented by both
  // blocks instead of only the first.
  const activeScheduledMap = useMemo(() => {
    const map = new Map();
    (scheduledForDate ?? []).forEach(p => {
      const shifts = shiftsOf(p);
      if (shifts.length) map.set(p.id, shifts);
    });
    return map;
  }, [scheduledForDate]);

  // Availability tiers relative to the current event time window
  function availTier(s) {
    const shifts = activeScheduledMap.get(s.id);
    if (!shifts?.length) return 0;                                     // not scheduled
    // Any one shift covering the event is enough: somebody working 8–11 and
    // 2–6 can staff a 3pm event even though their first block can't.
    return shifts.some(sh => sh.start < form.end && sh.end > form.start)
      ? 2                                                              // available during event
      : 1;                                                             // working, but not then
  }

  const activeAssigned = activeStaffDate ? (form.assignedByDate[activeStaffDate] ?? []) : [];

  const sortedStaff = [...staff].sort((a, b) => availTier(b) - availTier(a));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (form.days.length === 0) {
      setError('Add at least one date.');
      return;
    }
    if (form.end <= form.start) {
      setError('End time must be after start time.');
      return;
    }
    const assignedStaff = [...new Set(Object.values(form.assignedByDate).flat())];
    setSaving(true);
    try {
      await addEvent({ ...form, assignedStaff });
    } catch (err) {
      setError(err.message || 'Failed to save event.');
      setSaving(false);
      return;
    }
    // Assigning someone to an event means scheduling them to work it, so widen
    // their shifts on each date to cover it. The per-date selections are used
    // here rather than the flattened list, so somebody picked for Tuesday only
    // doesn't get Thursday's shift stretched too. Best-effort: the event itself
    // is already saved, and a failure here leaves a coverage warning for the
    // manager rather than losing the event.
    await Promise.all(
      Object.entries(form.assignedByDate).map(async ([dateStr, ids]) => {
        if (!ids?.length || !form.days.includes(dateStr)) return;
        const evt = { start: form.start, end: form.end, assignedStaff: ids };
        try {
          const existing = await schedulesApi.getDay(dateStr).catch(() => null);
          // Saved day if there is one, otherwise the day's template — the same
          // resolution every other view uses, always merged onto the live roster.
          const savedByDate = existing?.staff ? { [dateStr]: existing.staff } : {};
          const base = staffForDateFromSaved(new Date(dateStr + 'T00:00:00'), savedByDate, staff);
          const next = mergeStaffShifts(stretchShiftsToCoverEvents(base, [evt]));
          if (next === base) return; // already covered — nothing to write
          await schedulesApi.saveDay(dateStr, {
            staff: next,
            events: existing?.events ?? [],
            finalized: existing?.finalized ?? true,
            expectedVersion: existing?.version ?? 0,
          });
        } catch { /* leave it to the manager's coverage warnings */ }
      }),
    );
    setSaving(false);
    setSubmitted(true);
    setTimeout(() => navigate('/'), 1500);
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-4 mx-auto"
            style={{ border: '2px solid var(--color-accent)', color: 'var(--color-accent-bright)' }}
          >
            ✓
          </div>
          <p className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Event added!
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Redirecting to Daily Schedule…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          Add Special Event
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
          Create a new event. Assign staff from the Daily Schedule view after saving.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-xl border flex flex-col gap-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Event Name */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Event Name <span style={{ color: 'var(--color-red)' }}>*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Author Reading, Board Game Night"
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Event Type
          </label>
          <select
            value={form.type}
            onChange={e => set('type', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          >
            {EVENT_TYPES.map(t => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Time range */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
              Start Time
            </label>
            <select
              value={form.start}
              onChange={e => set('start', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            >
              {START_TIMES.map(t => (
                <option key={t} value={t}>{formatTime(t)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
              End Time
            </label>
            <select
              value={form.end}
              onChange={e => set('end', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            >
              {endTimesAfter(form.start).map(t => (
                <option key={t} value={t}>{formatTime(t)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date(s) */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Date(s) <span style={{ color: 'var(--color-red)' }}>*</span>
          </label>
          <div className="flex gap-2 mb-2">
            <DateInput
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
              wrapperClassName="flex-1"
            />
            <button
              type="button"
              onClick={addDate}
              disabled={!dateInput}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'var(--color-accent)', color: 'white', opacity: dateInput ? 1 : 0.45 }}
            >
              Add
            </button>
          </div>
          {form.days.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {form.days.map(d => (
                <span
                  key={d}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(176,80,48,0.12)',
                    color: 'var(--color-accent-bright)',
                    border: '1px solid var(--color-accent)',
                  }}
                >
                  {formatDateLabel(d)}
                  <button
                    type="button"
                    onClick={() => removeDate(d)}
                    style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0, fontSize: 14 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Weekly repetition applies to one date only — see the note below. */}
          <label
            className="flex items-center gap-2 select-none"
            style={{ cursor: multiDate ? 'not-allowed' : 'pointer', opacity: multiDate ? 0.5 : 1 }}
          >
            <input
              type="checkbox"
              disabled={multiDate}
              checked={form.repeating && !multiDate}
              onChange={e => {
                set('repeating', e.target.checked);
                // Clearing the bounds when unchecked keeps a stale range from
                // silently applying if it's switched back on later.
                if (!e.target.checked) setForm(f => ({ ...f, repeatFrom: null, repeatUntil: null }));
              }}
              style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: multiDate ? 'not-allowed' : 'pointer' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-dim)' }}>Repeats weekly</span>
          </label>
          {multiDate && (
            <p className="text-xs" style={{ color: 'var(--color-text-dim)', marginTop: -6 }}>
              Only available with a single date — create a separate event for each day it repeats on.
            </p>
          )}

          {form.repeating && !multiDate && (
            <div className="mt-2">
              <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
                How long should it repeat?
              </label>
              <RangeCalendar
                from={form.repeatFrom}
                until={form.repeatUntil}
                onChange={({ from, until }) => setForm(f => ({ ...f, repeatFrom: from, repeatUntil: until }))}
                highlightDow={form.days[0] ? new Date(form.days[0] + 'T00:00:00').getDay() : undefined}
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
                Leave empty to repeat indefinitely.
              </p>
            </div>
          )}
        </div>

        {/* Staff Assignment */}
        {form.days.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
              Assign Staff
            </label>
            <p className="text-xs mb-2.5" style={{ color: 'var(--color-text-dim)' }}>
              Showing availability for {formatTime(form.start)} – {formatTime(form.end)}.
            </p>

            {/* Date tabs */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {form.days.map(d => {
                const count = (form.assignedByDate[d] ?? []).length;
                const isActive = d === activeStaffDate;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setActiveStaffDate(d)}
                    className="text-xs px-2.5 py-1 rounded-md cursor-pointer transition-all"
                    style={{
                      border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: isActive ? 'rgba(176,80,48,0.12)' : 'transparent',
                      color: isActive ? 'var(--color-accent-bright)' : 'var(--color-text-dim)',
                    }}
                  >
                    {formatDateLabel(d)}{count > 0 ? ` · ${count}` : ''}
                  </button>
                );
              })}
            </div>

            {/* Staff list for active date */}
            {/* An in-flight fetch must not render as a roster where nobody is
                scheduled — that reads as a real answer rather than a pending one. */}
            {loadingStaff && (
              <div
                className="rounded-lg border px-3 py-4 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}
              >
                Checking who&apos;s working…
              </div>
            )}

            {activeStaffDate && !loadingStaff && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                {sortedStaff.map((s, i) => {
                  const assigned = activeAssigned.includes(s.id);
                  const tier     = availTier(s);
                  const shifts   = activeScheduledMap.get(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                      style={{
                        borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                        background: assigned ? 'rgba(176,80,48,0.08)' : 'transparent',
                        opacity: tier === 0 ? 0.45 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() => toggleStaff(s.id)}
                        style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {s.name}
                      </span>
                      {tier === 2 && shifts && (
                        <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(74,124,94,0.15)', color: '#6ab888' }}>
                          {shiftLabel(shifts)}
                        </span>
                      )}
                      {tier === 1 && shifts && (
                        <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(180,120,40,0.15)', color: '#c8943a' }}>
                          Shift {shiftLabel(shifts)}
                        </span>
                      )}
                      {tier === 0 && (
                        <span className="text-xs shrink-0" style={{ color: 'var(--color-muted)' }}>
                          Not scheduled
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {activeAssigned.length > 0 && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>
                {activeAssigned.length} staff assigned for {formatDateLabel(activeStaffDate)}
              </p>
            )}
          </div>
        )}

        {/* Staff Needed */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Staff Needed
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={form.staffNeeded}
            onChange={e => set('staffNeeded', Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Location / Notes
          </label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="e.g. Meeting room B, bring supplies…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-2 rounded-lg text-sm font-medium border cursor-pointer"
            style={{ background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'white', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Adding…' : 'Add Event'}
          </button>
        </div>
      </form>
    </div>
  );
}
