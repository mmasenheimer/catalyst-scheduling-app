import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';

const EVENT_TYPES = ['program', 'service', 'meeting', 'workshop', 'other'];

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

// Returns scheduled staff objects (with shiftStart/shiftEnd) for a given date.
function getScheduledStaffForDate(dateStr, getDaySchedule, allStaff) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const saved = getDaySchedule(date.toDateString());
  if (saved) {
    return saved.filter(s => s.scheduled);
  }
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const tpl = weeklyTemplates[dayName];
  if (!tpl) return [];
  return tpl.staff.map(ts => allStaff.find(s => s.id === ts.id)).filter(Boolean);
}

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

  function addDate() {
    if (!dateInput || form.days.includes(dateInput)) return;
    const d = dateInput;
    setForm(prev => ({
      ...prev,
      days: [...prev.days, d].sort(),
      assignedByDate: { ...prev.assignedByDate, [d]: prev.assignedByDate[d] ?? [] },
    }));
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

  // Scheduled staff objects (with shiftStart/shiftEnd) for the active date tab
  const activeScheduledStaff = activeStaffDate
    ? getScheduledStaffForDate(activeStaffDate, getDaySchedule, staff)
    : [];
  const activeScheduledMap = new Map(activeScheduledStaff.map(s => [s.id, s]));

  // Availability tiers relative to the current event time window
  function availTier(s) {
    const scheduled = activeScheduledMap.get(s.id);
    if (!scheduled) return 0;                                          // not scheduled
    if (scheduled.shiftStart < form.end && scheduled.shiftEnd > form.start) return 2; // available during event
    return 1;                                                          // scheduled but shift doesn't overlap
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
            <input
              type="date"
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }}
              className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.repeating}
              onChange={e => set('repeating', e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-dim)' }}>Repeats weekly</span>
          </label>
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
            {activeStaffDate && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                {sortedStaff.map((s, i) => {
                  const assigned  = activeAssigned.includes(s.id);
                  const tier      = availTier(s);
                  const scheduled = activeScheduledMap.get(s.id);
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
                      {tier === 2 && scheduled && (
                        <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(74,124,94,0.15)', color: '#6ab888' }}>
                          {formatTime(scheduled.shiftStart)} – {formatTime(scheduled.shiftEnd)}
                        </span>
                      )}
                      {tier === 1 && scheduled && (
                        <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(180,120,40,0.15)', color: '#c8943a' }}>
                          Shift {formatTime(scheduled.shiftStart)} – {formatTime(scheduled.shiftEnd)}
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
