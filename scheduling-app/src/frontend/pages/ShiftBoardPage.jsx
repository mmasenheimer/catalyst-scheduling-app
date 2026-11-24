import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestsContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { ShiftCalendar } from '../components/ShiftCalendar';
import { RippleButton } from '../components/RippleButton';
import { schedulesApi } from '../utils/api';
import { buildSavedScheduleMap, personForDate, formatTime, toDateStr } from '../utils/scheduleUtils';

// The shift board. Anyone can put up all or part of one of their shifts; every
// employee sees what's up and can pick one up, which sends it to the manager
// for approval. A post leaves the board once picked up, and comes back if the
// manager says no. See the 'pickup' request type in the backend.

// How far ahead you can post from.
const LOOKAHEAD_DAYS = 90;

const dateOf = ds => new Date(ds + 'T00:00:00');
const dayLabelOf = ds => dateOf(ds).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const longDayOf = ds => dateOf(ds).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const hoursText = r => `${formatTime(r.start)} – ${formatTime(r.end)}`;
const lengthText = r => {
  const h = r.end - r.start;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
};

const card = { borderColor: 'var(--color-border)' };
const sectionTitle = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)' };

// ── Post a shift ──────────────────────────────────────────────────────────────

function PostShiftModal({ me, myName, staff, onPost, onClose }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [savedByDate, setSavedByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [shiftIdx, setShiftIdx] = useState(0);
  const [range, setRange] = useState(null);   // { start, end }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Real saved schedules from today on, so only days you're actually working
  // can be picked.
  useEffect(() => {
    let cancelled = false;
    const end = new Date(today);
    end.setDate(end.getDate() + LOOKAHEAD_DAYS);
    schedulesApi.getRange(toDateStr(today), toDateStr(end))
      .then(list => { if (!cancelled) setSavedByDate(buildSavedScheduleMap(list)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shiftsOn = useMemo(
    () => ds => [...(personForDate(dateOf(ds), savedByDate, staff, me)?.shifts ?? [])].sort((a, b) => a.start - b.start),
    [savedByDate, staff, me],
  );

  const workDays = useMemo(() => {
    const set = new Set();
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      if (shiftsOn(toDateStr(d)).length) set.add(toDateStr(d));
    }
    return set;
  }, [today, shiftsOn]);

  const firstMonth = useMemo(() => {
    const first = [...workDays].sort()[0];
    return first ? dateOf(first) : today;
  }, [workDays, today]);

  const shifts = date ? shiftsOn(date) : [];
  const shift = shifts[shiftIdx] ?? null;

  function pickDate(ds) {
    setDate(ds);
    setShiftIdx(0);
    const first = shiftsOn(ds)[0];
    setRange(first ? { start: first.start, end: first.end } : null);
    setError('');
  }
  function pickShift(i) {
    setShiftIdx(i);
    setRange({ start: shifts[i].start, end: shifts[i].end });
    setError('');
  }

  // Half-hour steps within the chosen shift.
  const steps = shift
    ? Array.from({ length: Math.round((shift.end - shift.start) * 2) + 1 }, (_, i) => shift.start + i * 0.5)
    : [];

  async function submit() {
    if (!date || !shift || !range) { setError('Pick a day and the hours you want to give up.'); return; }
    setSaving(true);
    setError('');
    try {
      await onPost({
        type: 'pickup',
        staffId: me,
        staffName: myName,
        date,
        dayLabel: dayLabelOf(date),
        requesterShift: range,
        requesterShifts: shifts.map(s => ({ start: s.start, end: s.end })),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not post that shift.');
    } finally {
      setSaving(false);
    }
  }

  const select = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13,
    background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  };
  const label = { display: 'block', fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border p-5 overflow-y-auto"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Post a Shift</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label style={label}>Day</label>
            {loading ? (
              <div className="px-3 py-6 rounded-lg border text-sm text-center"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-dim)' }}>
                Loading your upcoming shifts…
              </div>
            ) : workDays.size === 0 ? (
              <div className="px-4 py-4 rounded-lg border text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-dim)' }}>
                You don't have any upcoming shifts to post.
              </div>
            ) : (
              <ShiftCalendar value={date} onChange={pickDate} isSelectable={d => workDays.has(toDateStr(d))} startMonth={firstMonth} />
            )}
          </div>

          {shifts.length > 1 && (
            <div>
              <label style={label}>Which shift</label>
              <div className="flex gap-2 flex-wrap">
                {shifts.map((s, i) => (
                  <button key={`${s.start}-${s.end}`} type="button" onClick={() => pickShift(i)}
                    className="px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    style={{
                      background: i === shiftIdx ? 'var(--color-button)' : 'var(--color-muted)',
                      color: i === shiftIdx ? 'var(--color-button-text)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}>
                    {hoursText(s)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {shift && range && (
            <div>
              <label style={label}>Hours to give up — all of {hoursText(shift)}, or just part of it</label>
              <div className="flex items-center gap-2">
                <select value={range.start} style={select}
                  onChange={e => { const v = Number(e.target.value); setRange(r => ({ start: v, end: Math.max(r.end, v + 0.5) })); }}>
                  {steps.slice(0, -1).map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
                <span style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>to</span>
                <select value={range.end} style={select}
                  onChange={e => setRange(r => ({ ...r, end: Number(e.target.value) }))}>
                  {steps.filter(t => t > range.start).map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-dim)' }}>
                {longDayOf(date)} · {lengthText(range)}. It stays yours until someone picks it up and the manager approves.
              </p>
            </div>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>}
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} style={{ padding: '7px 16px', fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <RippleButton onClick={submit} disabled={saving || !range}
            style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, opacity: saving || !range ? 0.6 : 1 }}>
            {saving ? 'Posting…' : 'Post to Board'}
          </RippleButton>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ShiftBoardPage() {
  const { user } = useAuth();
  const { staff } = useScheduleContext();
  const { requests, submitRequest, claimShift, withdrawRequest } = useRequests();
  const me = user?.staffId ?? null;
  const isManager = user?.role === 'manager';
  const todayStr = toDateStr(new Date());

  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const board = useMemo(() => requests
    .filter(r => r.type === 'pickup' && r.status === 'open' && r.date >= todayStr && r.requesterShift)
    .sort((a, b) => a.date.localeCompare(b.date) || a.requesterShift.start - b.requesterShift.start),
  [requests, todayStr]);

  const waiting = useMemo(() => requests
    .filter(r => r.type === 'pickup' && r.status === 'pending' && r.requesterShift
      && (isManager || r.staffId === me || r.targetStaffId === me))
    .sort((a, b) => a.date.localeCompare(b.date)),
  [requests, isManager, me]);

  // My own saved shifts on the days that have posts, so "Pick up" can be
  // disabled where it would overlap hours I'm already working. The server
  // checks this too; this just saves a click that would be refused.
  const [savedByDate, setSavedByDate] = useState({});
  const dates = board.map(r => r.date);
  const from = dates[0];
  const to = dates[dates.length - 1];
  useEffect(() => {
    if (me == null || !from) return;
    let cancelled = false;
    schedulesApi.getRange(from, to)
      .then(list => { if (!cancelled) setSavedByDate(buildSavedScheduleMap(list)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [me, from, to]);

  function workingDuring(r) {
    if (me == null) return false;
    const mine = personForDate(dateOf(r.date), savedByDate, staff, me)?.shifts ?? [];
    return mine.some(s => s.start < r.requesterShift.end && s.end > r.requesterShift.start);
  }

  async function act(id, fn, failMessage) {
    setBusyId(id);
    setActionError('');
    try {
      await fn(id);
    } catch (err) {
      setActionError(err.message || failMessage);
    } finally {
      setBusyId(null);
    }
  }

  // Board grouped by day.
  const byDay = [];
  for (const r of board) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === r.date) last.posts.push(r);
    else byDay.push({ date: r.date, posts: [r] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-md mb-6 border glass-surface" style={card}>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Shift Board</h2>
        {me != null && (
          <RippleButton onClick={() => setPosting(true)} className="px-4 py-2 rounded-lg text-sm font-semibold">
            + Post a Shift
          </RippleButton>
        )}
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg border text-sm flex items-start justify-between gap-3"
          style={{ background: 'rgba(200,64,64,0.12)', borderColor: 'var(--color-red)', color: '#f07070' }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="cursor-pointer shrink-0"
            style={{ background: 'none', border: 'none', color: '#f07070', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Open shifts */}
      <div className="rounded-md border overflow-hidden glass-surface mb-6" style={card}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span style={sectionTitle}>Open Shifts</span>
        </div>
        {byDay.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--color-text-dim)' }}>
            Nothing on the board right now.
          </div>
        ) : byDay.map(({ date, posts }) => (
          <div key={date}>
            <div className="px-4 py-2 text-sm font-semibold"
              style={{ color: date === todayStr ? 'var(--color-today)' : 'var(--color-text)', background: 'var(--color-muted)' }}>
              {longDayOf(date)}{date === todayStr ? ' · Today' : ''}
            </div>
            {posts.map(r => {
              const mine = r.staffId === me;
              const busy = !mine && workingDuring(r);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {hoursText(r.requesterShift)}
                      <span className="font-normal" style={{ color: 'var(--color-text-dim)' }}> · {lengthText(r.requesterShift)}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                      {mine ? 'Posted by you' : `Posted by ${r.staffName}`}
                    </div>
                  </div>
                  {mine ? (
                    <button
                      onClick={() => act(r.id, withdrawRequest, 'Could not take that down.')}
                      disabled={busyId === r.id}
                      className="px-3 py-1.5 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                      style={{ background: 'transparent', color: 'var(--color-red)', border: '1px solid var(--color-red)', opacity: busyId === r.id ? 0.5 : 1 }}
                    >
                      {busyId === r.id ? 'Taking down…' : 'Take Down'}
                    </button>
                  ) : me != null && (
                    <RippleButton
                      onClick={() => act(r.id, claimShift, 'Could not pick that up.')}
                      disabled={busy || busyId === r.id}
                      title={busy ? "You're already working during those hours" : undefined}
                      className="px-3 py-1.5 text-xs font-semibold shrink-0"
                      style={{ opacity: busy || busyId === r.id ? 0.5 : 1 }}
                    >
                      {busyId === r.id ? 'Picking up…' : busy ? 'You’re working then' : 'Pick Up'}
                    </RippleButton>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Picked up, waiting on the manager */}
      {waiting.length > 0 && (
        <div className="rounded-md border overflow-hidden glass-surface" style={card}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span style={sectionTitle}>Waiting on the Manager</span>
          </div>
          {waiting.map(r => (
            <div key={r.id} className="px-4 py-3 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              <span className="font-semibold">{r.targetStaffId === me ? 'You' : r.targetName}</span>
              {' picked up '}
              <span className="font-semibold">{r.staffId === me ? 'your' : `${r.staffName}'s`}</span>
              {` ${hoursText(r.requesterShift)} on ${dayLabelOf(r.date)}`}
              {isManager && (
                <span style={{ color: 'var(--color-text-dim)' }}> — approve or deny it in Notifications.</span>
              )}
            </div>
          ))}
        </div>
      )}

      {posting && (
        <PostShiftModal
          me={me}
          myName={user?.name}
          staff={staff}
          onPost={submitRequest}
          onClose={() => setPosting(false)}
        />
      )}
    </div>
  );
}
