import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END } from '../../data/mockData';

const EVENT_TYPES = ['program', 'service', 'meeting', 'workshop', 'other'];

const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = HOURS_START; h <= HOURS_END; h += 0.5) opts.push(h);
  return opts;
})();

const inputStyle = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

export default function AddEventPage() {
  const { addEvent } = useScheduleContext();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    type: 'program',
    start: 10,
    end: 11,
    staffNeeded: 1,
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (form.end <= form.start) {
      setError('End time must be after start time.');
      return;
    }
    addEvent({ ...form, assignedStaff: [] });
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
              {TIME_OPTIONS.map(t => (
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
              {TIME_OPTIONS.map(t => (
                <option key={t} value={t}>{formatTime(t)}</option>
              ))}
            </select>
          </div>
        </div>

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
            className="flex-1 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Add Event
          </button>
        </div>
      </form>
    </div>
  );
}
