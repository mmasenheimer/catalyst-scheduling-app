import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { useRequests } from '../context/RequestsContext';
import { initialStaff, weeklyTemplates } from '../../data/mockData';
import { formatTime, toDateStr } from '../utils/scheduleUtils';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getUpcomingDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

function getDayName(date) {
  return DAY_NAMES[date.getDay()];
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateLong(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function scheduledDates(staffId) {
  return getUpcomingDates().filter(date => {
    const tpl = weeklyTemplates[getDayName(date)];
    return tpl?.staff.some(s => s.id === staffId);
  });
}

function notWorkingOnDate(date, staffId) {
  const tpl = weeklyTemplates[getDayName(date)];
  if (!tpl) return initialStaff.filter(s => s.id !== staffId);
  const busy = new Set(tpl.staff.map(s => s.id));
  return initialStaff.filter(s => s.id !== staffId && !busy.has(s.id));
}

function workingOnDate(date, staffId) {
  const tpl = weeklyTemplates[getDayName(date)];
  if (!tpl) return [];
  return tpl.staff.filter(s => s.id !== staffId);
}

function overlaps(a, b) {
  return a.shiftStart < b.shiftEnd && a.shiftEnd > b.shiftStart;
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2);
}

// ── Staff row ─────────────────────────────────────────────────────────────────

function StaffRow({ person, badge, badgeStyle, actionLabel, onAction, isSelected }) {
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
            Shift {formatTime(person.shiftStart)} – {formatTime(person.shiftEnd)}
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

function StaffList({ people, badge, badgeStyle, actionLabel, onAction, selectedId }) {
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
        />
      ))}
    </div>
  );
}

// ── Request form ──────────────────────────────────────────────────────────────

function RequestForm({ type, target, day, me, note, onNoteChange, onSubmit, onCancel }) {
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

      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          Send Request
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
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(null);

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

  const myDates = scheduledDates(me.id);
  const activeDay = selectedDay ?? myDates[0] ?? null;

  const available = activeDay ? notWorkingOnDate(activeDay, me.id) : [];
  const alreadyWorking = activeDay ? workingOnDate(activeDay, me.id) : [];

  const others = initialStaff.filter(s => s.id !== me.id);
  const noOverlapStaff = others.filter(s => !overlaps(me, s));
  const overlapStaff = others.filter(s => overlaps(me, s));

  function select(person) {
    setPending(person);
    setNote('');
  }

  function handleSubmit() {
    const day = activeDay ?? new Date();
    submitRequest({
      type: tab,
      staffId: me.id,
      staffName: me.name,
      targetStaffId: pending.id,
      targetName: pending.name,
      date: toDateStr(day),
      dayLabel: formatDateLong(day),
      note,
    });
    setSubmitted({ type: tab, target: pending, day: activeDay ? formatDateLong(activeDay) : '', note });
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
              target={pending}
              day={activeDay ? formatDateLong(activeDay) : ''}
              me={me}
              note={note}
              onNoteChange={setNote}
              onSubmit={handleSubmit}
              onCancel={() => setPending(null)}
            />
          )}

          {/* ── Cover tab ─────────────────────────────────────────────────── */}
          {tab === 'cover' && (
            <div className="flex flex-col gap-6">
              {/* Day selector */}
              <div>
                <div
                  className="text-xs font-semibold uppercase tracking-wide mb-2"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  Your scheduled days — next 2 weeks
                </div>
                {myDates.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
                    You have no scheduled shifts in the next 2 weeks.
                  </p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {myDates.map(date => {
                      const isActive = activeDay?.toDateString() === date.toDateString();
                      return (
                        <button
                          key={date.toISOString()}
                          onClick={() => { setSelectedDay(date); setPending(null); }}
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
                )}
              </div>

              {/* Not working that day */}
              {activeDay && (
                <div>
                  <SectionHeading
                    title={`Not working ${activeDay ? formatDateLong(activeDay) : ''}`}
                    sub="available to cover your shift"
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
                      selectedId={pending?.id}
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
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Swap tab ──────────────────────────────────────────────────── */}
          {tab === 'swap' && (
            <div className="flex flex-col gap-6">
              {/* No-overlap staff — ideal candidates */}
              {noOverlapStaff.length > 0 && (
                <div>
                  <SectionHeading
                    title="Different shift hours"
                    sub={`no overlap with your ${formatTime(me.shiftStart)}–${formatTime(me.shiftEnd)} shift`}
                  />
                  <StaffList
                    people={noOverlapStaff}
                    badge="No overlap"
                    badgeStyle={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
                    actionLabel="Propose Swap"
                    onAction={select}
                    selectedId={pending?.id}
                  />
                </div>
              )}

              {/* Overlapping staff */}
              {overlapStaff.length > 0 && (
                <div>
                  <SectionHeading
                    title="Overlapping shifts"
                    sub="you share some working hours"
                  />
                  <StaffList
                    people={overlapStaff}
                    badge="Overlap"
                    badgeStyle={{ background: '#241a06', color: 'var(--color-yellow)' }}
                    actionLabel="Propose Swap"
                    onAction={select}
                    selectedId={pending?.id}
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
