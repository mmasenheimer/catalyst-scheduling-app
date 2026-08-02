import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { useRequests } from '../context/RequestsContext';
import { schedulesApi } from '../utils/api';
import {
  formatTime, toDateStr, buildSavedScheduleMap, hasShiftOn, staffForDateFromSaved,
  personForDate, shiftsLabel,
} from '../utils/scheduleUtils';


// How far ahead somebody can ask for cover or propose a swap. Also sets the range
// of saved schedules this page loads, so widening it costs one longer request
// rather than more of them.
const LOOKAHEAD_DAYS = 21;
const LOOKAHEAD_LABEL = '3 weeks';

function getUpcomingDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

/** Monday of the week `date` falls in — the week start used everywhere else. */
function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Split the scheduled days into the weeks they belong to.
 *
 * Three weeks of shifts in one flat row is a lot of buttons to read as a single
 * list. Only weeks that actually contain a shift appear, so this never shows an
 * empty box.
 */
function groupIntoWeeks(dates) {
  const weeks = new Map();
  dates.forEach(date => {
    const start = mondayOf(date);
    const key = start.toDateString();
    if (!weeks.has(key)) weeks.set(key, { key, start, dates: [] });
    weeks.get(key).dates.push(date);
  });
  return [...weeks.values()].sort((a, b) => a.start - b.start);
}

/** "This week" / "Next week", falling back to the date range further out. */
function weekHeading(start) {
  const offset = Math.round((start - mondayOf(new Date())) / (7 * 24 * 60 * 60 * 1000));
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// All of these resolve against real saved schedules (falling back to the
// recurring template only where nothing is saved yet) and against the live
// roster — so staff added/removed via Manage Staff, and any schedule the
// manager actually saved, are reflected here.
function scheduledDates(staffId, savedByDate, roster) {
  return getUpcomingDates().filter(date => hasShiftOn(date, savedByDate, roster, staffId));
}

function notWorkingOnDate(date, staffId, roster, savedByDate) {
  return staffForDateFromSaved(date, savedByDate, roster)
    .filter(s => s.id !== staffId && (s.shifts?.length ?? 0) === 0);
}

function workingOnDate(date, staffId, roster, savedByDate) {
  return staffForDateFromSaved(date, savedByDate, roster)
    .filter(s => s.id !== staffId && (s.shifts?.length ?? 0) > 0);
}

/**
 * Identifies a shift by its hours.
 *
 * Not by `id` — those are regenerated on every drag, by the event-stretch pass,
 * and by the cover approval itself, so an id is meaningless a moment later. The
 * hours are what people actually agree about.
 */
const shiftKey = shift => `${shift.start}-${shift.end}`;

/**
 * Do these two sets of shifts collide at any point?
 *
 * Replaces a comparison of `shiftStart`/`shiftEnd`, which are the *default* hours
 * on a Staff record rather than what anyone actually works on a given date — so
 * the old version answered a question about nobody's real schedule, and couldn't
 * see a second shift at all.
 */
function shiftsOverlap(aShifts, bShifts) {
  return (aShifts ?? []).some(a =>
    (bShifts ?? []).some(b => a.start < b.end && a.end > b.start),
  );
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2);
}

/**
 * The days you're scheduled, grouped by week, one of them selected.
 *
 * Shared by both tabs. The swap tab used to have no picker at all, which meant
 * `activeDay` silently fell back to the first scheduled day in the window — so a
 * swap was submitted for a date the requester never chose and never saw.
 */
function ScheduledDayPicker({ myDates, activeDay, onPick }) {
  return (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: 'var(--color-text-dim)' }}
      >
        Your scheduled days — next {LOOKAHEAD_LABEL}
      </div>
      {myDates.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
          You have no scheduled shifts in the next {LOOKAHEAD_LABEL}.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groupIntoWeeks(myDates).map(week => (
            <div
              key={week.key}
              className="rounded-lg border p-3"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--color-text-dim)' }}
              >
                {weekHeading(week.start)}
              </div>
              <div className="flex gap-2 flex-wrap">
                {week.dates.map(date => {
                  const isActive = activeDay?.toDateString() === date.toDateString();
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => onPick(date)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                      style={{
                        background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                        color: isActive ? 'white' : 'var(--color-text)',
                      }}
                    >
                      {formatDateLabel(date)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Which shift on the chosen day is being offered.
 *
 * Renders nothing when there's only one — asking somebody to choose between a
 * single option is just an extra click. Only a genuinely split day gets a picker.
 */
function ShiftPicker({ shifts, selected, onPick }) {
  if ((shifts?.length ?? 0) < 2) return null;
  return (
    <div>
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: 'var(--color-text-dim)' }}
      >
        Which shift?
      </div>
      <div className="flex gap-2 flex-wrap">
        {shifts.map(shift => {
          const isActive = selected && shiftKey(selected) === shiftKey(shift);
          return (
            <button
              key={shiftKey(shift)}
              onClick={() => onPick(shift)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
              style={{
                background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                color: isActive ? 'white' : 'var(--color-text)',
              }}
            >
              {formatTime(shift.start)} – {formatTime(shift.end)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Staff row ─────────────────────────────────────────────────────────────────

function StaffRow({ person, badge, badgeStyle, actionLabel, onAction, isSelected, subLabel }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ background: isSelected ? '#1c1710' : 'var(--color-bg)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
        >
          {initials(person.name)}
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {person.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
            {subLabel ?? `Shift ${formatTime(person.shiftStart)} – ${formatTime(person.shiftEnd)}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded" style={badgeStyle}>
            {badge}
          </span>
        )}
        {actionLabel && (
          <button
            onClick={() => onAction(person)}
            className="text-xs px-3 py-1.5 rounded-md font-medium cursor-pointer transition-opacity hover:opacity-80"
            style={{
              background: isSelected ? 'var(--color-muted)' : 'var(--color-accent)',
              color: isSelected ? 'var(--color-text-dim)' : 'white',
            }}
          >
            {isSelected ? 'Selected' : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function StaffList({ people, badge, badgeStyle, actionLabel, onAction, selectedId, subLabelFor }) {
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col gap-px"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-border)' }}
    >
      {people.map(p => (
        <StaffRow
          key={p.id}
          person={p}
          badge={badge}
          badgeStyle={badgeStyle}
          actionLabel={actionLabel}
          onAction={onAction}
          isSelected={selectedId === p.id}
          subLabel={subLabelFor?.(p)}
        />
      ))}
    </div>
  );
}

/**
 * One row per colleague *shift*, rather than per colleague.
 *
 * Somebody working twice that day offers two different trades, and a proposal has
 * to name which one — so they appear as two rows. Reuses StaffRow by closing over
 * the candidate, since selection here is per person-and-shift rather than per id.
 */
function SwapCandidateList({ candidates, badge, badgeStyle, onPick, pending }) {
  const isPicked = c =>
    pending?.person?.id === c.person.id
    && pending?.shift
    && shiftKey(pending.shift) === shiftKey(c.shift);

  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col gap-px"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-border)' }}
    >
      {candidates.map(c => (
        <StaffRow
          key={c.key}
          person={c.person}
          badge={badge}
          badgeStyle={badgeStyle}
          actionLabel="Propose Swap"
          onAction={() => onPick(c.person, c.shift)}
          isSelected={isPicked(c)}
          subLabel={`${formatTime(c.shift.start)} – ${formatTime(c.shift.end)}`}
        />
      ))}
    </div>
  );
}

// ── Request form ──────────────────────────────────────────────────────────────

function RequestForm({ type, target, day, me, note, onNoteChange, onSubmit, onCancel, saving, submitError }) {
  return (
    <div
      className="p-5 rounded-xl border mb-6"
      style={{ background: '#1c1410', borderColor: 'var(--color-accent)' }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-accent-bright)' }}>
            {type === 'cover' ? 'Cover Request' : 'Swap Proposal'}
          </div>
          <div className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
            {type === 'cover'
              ? `Asking ${target.name} to cover your ${day} shift`
              : `Proposing a swap with ${target.name}`}
          </div>
          {type === 'swap' && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
              >
                Your shift: {formatTime(me.shiftStart)} – {formatTime(me.shiftEnd)}
              </span>
              <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>⇄</span>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
              >
                Their shift: {formatTime(target.shiftStart)} – {formatTime(target.shiftEnd)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-lg leading-none cursor-pointer shrink-0"
          style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
        >
          ×
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
          Note (optional)
        </label>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Add context or a message..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={{
            background: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      {submitError && (
        <p className="text-sm mb-3" style={{ color: 'var(--color-red)' }}>{submitError}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: 'var(--color-accent)', color: 'white', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Sending…' : 'Send Request'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────────

function SuccessState({ request, onReset }) {
  return (
    <div
      className="p-5 rounded-xl border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="text-center py-6">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-5 mx-auto"
          style={{ border: '2px solid var(--color-accent)', color: 'var(--color-accent-bright)' }}
        >
          ✓
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
          Request Sent
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
          {request.type === 'cover'
            ? `${request.target.name} will be notified to cover your ${request.day} shift.`
            : `${request.target.name} will be notified about your shift swap proposal.`}
        </p>
        {request.note && (
          <p className="text-xs mt-2 italic" style={{ color: 'var(--color-text-dim)' }}>
            "{request.note}"
          </p>
        )}
        <button
          onClick={onReset}
          className="mt-6 text-xs cursor-pointer underline underline-offset-2 hover:opacity-80"
          style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
        >
          Submit another request
        </button>
      </div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ title, sub }) {
  return (
    <div className="mb-2">
      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </span>
      {sub && (
        <span className="ml-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          — {sub}
        </span>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      className="px-4 py-3 rounded-xl border text-sm"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-dim)',
      }}
    >
      {text}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShiftRequestPage() {
  const { user } = useAuth();
  const { staff } = useScheduleContext();
  const { submitRequest } = useRequests();
  const [tab, setTab] = useState('cover');
  const [selectedDay, setSelectedDay] = useState(null);
  // Which of that day's shifts is being offered. Null means "the day only has
  // one", which the resolver below fills in — so the common case never asks.
  const [selectedShiftKey, setSelectedShiftKey] = useState(null);
  // { person, shift } — `shift` is the colleague's shift being traded for, and is
  // null for a cover, where they aren't giving anything up.
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedByDate, setSavedByDate] = useState({});

  // Pull the real saved schedules covering the 2-week window this page offers,
  // so "who's working that day" reflects the actual schedule.
  useEffect(() => {
    const dates = getUpcomingDates();
    let cancelled = false;
    schedulesApi.getRange(toDateStr(dates[0]), toDateStr(dates[dates.length - 1]))
      .then(list => { if (!cancelled) setSavedByDate(buildSavedScheduleMap(list)); })
      .catch(() => { /* unreachable — fall back to template-only resolution */ });
    return () => { cancelled = true; };
  }, []);

  const me = staff.find(s => s.id === user?.staffId);

  if (!me) {
    return (
      <div>
        <div
          className="flex items-center p-5 rounded-xl border mb-4"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Shift Requests</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
              This feature is for scheduled staff members. Manager accounts do not have shift assignments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const myDates = scheduledDates(me.id, savedByDate, staff);
  const activeDay = selectedDay ?? myDates[0] ?? null;

  const available = activeDay ? notWorkingOnDate(activeDay, me.id, staff, savedByDate) : [];
  const alreadyWorking = activeDay ? workingOnDate(activeDay, me.id, staff, savedByDate) : [];

  const myShiftsThatDay = activeDay
    ? personForDate(activeDay, savedByDate, staff, me.id)?.shifts ?? []
    : [];

  // The shift being offered. Falls back to the first when the day holds only one,
  // or when a previous selection no longer exists because the day changed.
  const myShift =
    myShiftsThatDay.find(s => shiftKey(s) === selectedShiftKey) ?? myShiftsThatDay[0] ?? null;

  // Swap candidates are one row per colleague *shift*, not per colleague: if they
  // work twice that day, those are two different trades and the proposal has to
  // say which. Split by whether their shift collides with the one being offered.
  const swapCandidates = alreadyWorking.flatMap(person =>
    (person.shifts ?? []).map(shift => ({ key: `${person.id}:${shiftKey(shift)}`, person, shift })),
  );
  const noOverlapCandidates = swapCandidates.filter(c => !shiftsOverlap(myShift ? [myShift] : [], [c.shift]));
  const overlapCandidates   = swapCandidates.filter(c =>  shiftsOverlap(myShift ? [myShift] : [], [c.shift]));

  function select(person, shift = null) {
    setPending({ person, shift });
    setNote('');
  }

  function pickDay(date) {
    setSelectedDay(date);
    setSelectedShiftKey(null);
    setPending(null);
  }

  function pickShift(shift) {
    setSelectedShiftKey(shiftKey(shift));
    setPending(null);
  }

  async function handleSubmit() {
    const day = activeDay ?? new Date();
    setSubmitError('');
    setSaving(true);
    try {
      await submitRequest({
        type: tab,
        staffId: me.id,
        staffName: me.name,
        targetStaffId: pending.person.id,
        targetName: pending.person.name,
        date: toDateStr(day),
        dayLabel: formatDateLong(day),
        note,
        // The single shift changing hands, recorded as it stands right now.
        // Approval can come days later and refuses if this shift is no longer on
        // the schedule — otherwise it would move whatever happens to be there by
        // then, which is not what anyone agreed to. `targetShift` is null for a
        // cover, where the colleague isn't giving anything up.
        requesterShift: myShift ?? undefined,
        targetShift: pending.shift ?? undefined,
      });
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit request. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setSubmitted({ type: tab, target: pending.person, day: activeDay ? formatDateLong(activeDay) : '', note });
    setPending(null);
    setNote('');
  }

  return (
    <div>
      {/* Page header */}
      <div
        className="flex justify-between items-start p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Shift Requests</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Request coverage for a shift or propose a swap with a coworker
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {me.name}
          </div>
        </div>
      </div>

      {submitted ? (
        <SuccessState request={submitted} onReset={() => setSubmitted(null)} />
      ) : (
        <>
          {/* Tabs */}
          <div
            className="flex rounded-lg p-1 mb-6 w-fit border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            {[
              { key: 'cover', label: 'Request Cover' },
              { key: 'swap',  label: 'Propose Swap'  },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setPending(null); }}
                className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors"
                style={{
                  background: tab === key ? 'var(--color-accent)' : 'transparent',
                  color: tab === key ? 'white' : 'var(--color-text-dim)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Inline request form */}
          {pending && (
            <RequestForm
              type={tab}
              target={pending.person}
              day={activeDay ? formatDateLong(activeDay) : ''}
              me={me}
              note={note}
              onNoteChange={setNote}
              onSubmit={handleSubmit}
              onCancel={() => { setPending(null); setSubmitError(''); }}
              saving={saving}
              submitError={submitError}
            />
          )}

          {/* ── Cover tab ─────────────────────────────────────────────────── */}
          {tab === 'cover' && (
            <div className="flex flex-col gap-6">
              <ScheduledDayPicker myDates={myDates} activeDay={activeDay} onPick={pickDay} />
              <ShiftPicker shifts={myShiftsThatDay} selected={myShift} onPick={pickShift} />

              {/* Not working that day */}
              {activeDay && (
                <div>
                  <SectionHeading
                    title={`Not working ${activeDay ? formatDateLong(activeDay) : ''}`}
                    sub={myShift
                      ? `available to cover your ${formatTime(myShift.start)}–${formatTime(myShift.end)} shift`
                      : 'available to cover your shift'}
                  />
                  {available.length === 0 ? (
                    <EmptyState text={`Everyone is already scheduled on ${activeDay ? formatDateLong(activeDay) : 'that day'}.`} />
                  ) : (
                    <StaffList
                      people={available}
                      badge="Not scheduled"
                      badgeStyle={{ background: '#1a2a1a', color: '#6ab888' }}
                      actionLabel="Ask to Cover"
                      onAction={select}
                      selectedId={pending?.person?.id}
                      subLabelFor={() => 'Not scheduled this day'}
                    />
                  )}
                </div>
              )}

              {/* Already working that day */}
              {activeDay && alreadyWorking.length > 0 && (
                <div>
                  <SectionHeading
                    title={`Already working ${activeDay ? formatDateLong(activeDay) : ''}`}
                    sub="can't cover — already scheduled"
                  />
                  <StaffList
                    people={alreadyWorking}
                    badge="Scheduled"
                    badgeStyle={{ background: '#2a1010', color: '#f07070' }}
                    subLabelFor={p => shiftsLabel(p) ?? ''}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Swap tab ──────────────────────────────────────────────────── */}
          {tab === 'swap' && (
            <div className="flex flex-col gap-6">
              <ScheduledDayPicker myDates={myDates} activeDay={activeDay} onPick={pickDay} />
              <ShiftPicker shifts={myShiftsThatDay} selected={myShift} onPick={pickShift} />

              {activeDay && swapCandidates.length === 0 && (
                <EmptyState text={`Nobody else is scheduled on ${formatDateLong(activeDay)}, so there's no shift to swap with.`} />
              )}

              {/* Working that day, hours that don't collide with the one offered */}
              {activeDay && noOverlapCandidates.length > 0 && (
                <div>
                  <SectionHeading
                    title="Different shift hours"
                    sub={myShift
                      ? `no overlap with your ${formatTime(myShift.start)}–${formatTime(myShift.end)} on ${formatDateLong(activeDay)}`
                      : `on ${formatDateLong(activeDay)}`}
                  />
                  <SwapCandidateList
                    candidates={noOverlapCandidates}
                    badge="No overlap"
                    badgeStyle={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
                    onPick={select}
                    pending={pending}
                  />
                </div>
              )}

              {/* Working that day, but their hours collide with the one offered */}
              {activeDay && overlapCandidates.length > 0 && (
                <div>
                  <SectionHeading
                    title="Overlapping shifts"
                    sub="these clash with the shift you're offering"
                  />
                  <SwapCandidateList
                    candidates={overlapCandidates}
                    badge="Overlap"
                    badgeStyle={{ background: '#241a06', color: 'var(--color-yellow)' }}
                    onPick={select}
                    pending={pending}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
