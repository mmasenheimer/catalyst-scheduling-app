import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestsContext';

const REASONS = ['Personal', 'Appointment', 'Family', 'Other'];

const inputStyle = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

function getMinDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function formatDisplay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function RequestTimeOffPage() {
  const { user } = useAuth();
  const { submitRequest } = useRequests();
  const navigate = useNavigate();
  const [minDate] = useState(getMinDate);
  const [shiftDate, setShiftDate] = useState(getMinDate);
  const [reason, setReason] = useState('Personal');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dateError, setDateError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const selected = new Date(shiftDate + 'T00:00:00');
    const cutoff   = new Date();
    cutoff.setDate(cutoff.getDate() + 14);
    cutoff.setHours(0, 0, 0, 0);
    if (selected < cutoff) {
      setDateError('Drop requests must be at least 2 weeks from today.');
      return;
    }
    setDateError('');
    setSubmitError('');
    setSaving(true);
    try {
      await submitRequest({
        type: 'time_off',
        staffId: user.staffId,
        staffName: user.name,
        targetStaffId: null,
        targetName: null,
        date: shiftDate,
        dayLabel: formatDisplay(shiftDate),
        note: notes,
      });
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit request. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setSubmitted(true);
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
            Drop Request Submitted
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            {formatDisplay(shiftDate)}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>
            Your manager will be notified to find coverage.
          </p>
          <button
            onClick={() => navigate('/my-schedule')}
            className="mt-6 px-6 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            Back to My Schedule
          </button>
        </div>
      </div>
    );
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('') ?? '?';

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Drop Shift</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
          Select a shift to drop. Requests must be at least 2 weeks out.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-xl border flex flex-col gap-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {/* Submitting as */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg"
          style={{ background: 'var(--color-bg)' }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{user?.name}</div>
          </div>
        </div>

        {/* Shift date */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Shift to Drop <span style={{ color: 'var(--color-red)' }}>*</span>
          </label>
          <input
            type="date"
            value={shiftDate}
            min={minDate}
            onChange={e => { setShiftDate(e.target.value); setDateError(''); }}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={{ ...inputStyle, borderColor: dateError ? 'var(--color-red)' : 'var(--color-border)' }}
          />
          {dateError && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-red)' }}>{dateError}</p>
          )}
          {shiftDate && !dateError && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
              {formatDisplay(shiftDate)}
            </p>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Reason
          </label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={inputStyle}
          >
            {REASONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>
            Notes{' '}
            <span style={{ color: 'var(--color-text-dim)', fontWeight: 'normal' }}>(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any context for your manager…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {submitError && (
          <p className="text-sm" style={{ color: 'var(--color-red)' }}>{submitError}</p>
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
            className="flex-1 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-accent)', color: 'white', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
