import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialStaff, initialEvents } from '../../data/mockData';
import { formatTime } from '../utils/scheduleUtils';

function ShiftCard({ shift }) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
            {shift.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            {formatTime(shift.shiftStart)} – {formatTime(shift.shiftEnd)}
          </div>
        </div>
        <span
          className="text-xs px-2 py-1 rounded font-medium"
          style={{ background: '#1a2a1a', color: '#6ab888' }}
        >
          Scheduled
        </span>
      </div>

      {shift.deskStart !== null && (
        <div
          className="mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
          style={{ background: '#2a1e14' }}
        >
          <span>Desk: {formatTime(shift.deskStart)} – {formatTime(shift.deskEnd)}</span>
        </div>
      )}

      {shift.events.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {shift.events.map(evt => (
            <div
              key={evt.id}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
              style={{ background: '#1e1040' }}
            >
              <span>{evt.name} — {formatTime(evt.start)} – {formatTime(evt.end)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MySchedulePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.staffId;
  const me = initialStaff.find(s => s.id === userId);

  if (!me) {
    return (
      <div className="max-w-xl mx-auto">
        <div
          className="p-6 rounded-xl border text-center"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Manager Account</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Manager accounts don't have personal shift assignments.
            Use Daily Schedule to manage the full team.
          </p>
        </div>
      </div>
    );
  }

  const myEvents = initialEvents.filter(e => e.assignedStaff.includes(userId));

  const today = new Date();
  const myShifts = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: d,
      shiftStart: me.shiftStart,
      shiftEnd: me.shiftEnd,
      deskStart: me.deskStart,
      deskEnd: me.deskEnd,
      events: i === 0 ? myEvents : [],
    };
  });

  const hoursThisWeek = myShifts.reduce((sum, s) => sum + (s.shiftEnd - s.shiftStart), 0);

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
          Hi, {me.name.split(' ')[0]}!
        </h2>
      </div>

      {/* Profile header */}
      <div
        className="p-5 rounded-xl border mb-6"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ background: 'var(--color-accent)', color: 'white' }}
          >
            {me.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>{me.name}</div>
            <div className="text-sm" style={{ color: 'var(--color-text-dim)' }}>{me.role}</div>
          </div>
        </div>

        <div className="flex justify-center gap-10 mt-4">
          {[
            { label: 'Shifts This Week', value: myShifts.length },
            { label: 'Hours This Week', value: hoursThisWeek },
            { label: 'Events Today', value: myEvents.length },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-xl font-bold" style={{ color: 'var(--color-accent-bright)' }}>{value}</div>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming shifts */}
      <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Upcoming Shifts</h3>
      <div className="flex flex-col gap-3">
        {myShifts.map((shift, i) => (
          <ShiftCard key={i} shift={shift} />
        ))}
      </div>

      <div className="mt-6">
        <button
          onClick={() => navigate('/request-time-off')}
          className="w-full py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)', background: 'transparent' }}
        >
          + Request Time Off
        </button>
      </div>
    </div>
  );
}
