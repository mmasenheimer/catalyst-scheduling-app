import { useState } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { useRequests } from '../context/RequestsContext';
import { useAuth } from '../context/AuthContext';

const TYPE_CONFIG = {
  coverage:      { label: 'Coverage',      dot: '#e07050', bg: 'rgba(224, 112, 80, 0.12)',  border: 'rgba(224, 112, 80, 0.3)'  },
  shift_change:  { label: 'Shift Change',  dot: '#c89438', bg: 'rgba(200, 148, 56, 0.12)',  border: 'rgba(200, 148, 56, 0.3)'  },
  // Losing a shift is a different kind of news from having one moved — red
  // rather than amber, because it's something taken away rather than adjusted.
  shift_removed: { label: 'Dropped Shift', dot: '#c84040', bg: 'rgba(200, 64, 64, 0.12)',   border: 'rgba(200, 64, 64, 0.3)'   },
  new_event:     { label: 'Event',         dot: '#6a9fd8', bg: 'rgba(106, 159, 216, 0.12)', border: 'rgba(106, 159, 216, 0.3)' },
  // Purple, matching how event bars are drawn in the schedule editors. Losing one
  // is muted rather than alarming — it's work taken off your plate, not a problem.
  event_assigned:  { label: 'Event Assigned', dot: '#a080e0', bg: 'rgba(124, 92, 191, 0.14)', border: 'rgba(124, 92, 191, 0.35)' },
  event_unassigned:{ label: 'Event Removed',  dot: 'var(--color-text-dim)', bg: 'var(--color-muted)', border: 'var(--color-border)' },
  alert:         { label: 'Alert',         dot: '#c84040', bg: 'rgba(200, 64, 64, 0.12)',   border: 'rgba(200, 64, 64, 0.3)'   },
  approval:      { label: 'Approval',      dot: '#4a7c5e', bg: 'rgba(74, 124, 94, 0.12)',   border: 'rgba(74, 124, 94, 0.3)'   },
  availability:  { label: 'Availability',  dot: '#7ab0d8', bg: 'rgba(122, 176, 216, 0.12)', border: 'rgba(122, 176, 216, 0.3)' },
};

// Every field here is read unguarded when a card renders, so an unrecognised type
// would take the whole notifications page down rather than look slightly wrong.
const FALLBACK_CONFIG = {
  label: 'Update', dot: 'var(--color-text-dim)',
  bg: 'var(--color-muted)', border: 'var(--color-border)',
};


function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)   return 'Just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)   return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// What a card lets you do, if anything. A request waits on the coworker it names
// first ('pending_peer'), then on the manager ('pending'), and the person who
// raised it can take it back from either — so this depends on both the request's
// stage and who's looking at it.
function actionModeFor(request, user) {
  if (!request) return null;
  const waiting = request.status === 'pending_peer' || request.status === 'pending';

  // Checked first: on a request you raised yourself, withdrawing is the only
  // thing you could do, whichever stage it's reached.
  if (waiting && request.staffId === user?.staffId) return 'requester';

  if (request.status === 'pending_peer') {
    return request.targetStaffId === user?.staffId ? 'peer' : null;
  }
  if (request.status === 'pending') {
    return user?.role === 'manager' ? 'manager' : null;
  }
  return null;
}

function NotificationCard({ notif, onDismiss, onApprove, onDeny, onWithdraw, user, request }) {
  const cfg = TYPE_CONFIG[notif.type] ?? FALLBACK_CONFIG;
  const requestStatus = request?.status ?? null;
  const mode = notif.requestId != null ? actionModeFor(request, user) : null;
  const isManager = user?.role === 'manager';

  return (
    <div
      className="flex gap-4 p-4 rounded-xl border transition-all"
      style={{
        background: notif.read ? 'var(--color-surface)' : cfg.bg,
        borderColor: notif.read ? 'var(--color-border)' : cfg.border,
        opacity: notif.read ? 0.7 : 1,
      }}
    >
      <div className="pt-1 shrink-0">
        <div
          className="w-2 h-2 rounded-full mt-0.5"
          style={{ background: notif.read ? 'transparent' : cfg.dot }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {notif.title}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: cfg.bg, color: cfg.dot, border: `1px solid ${cfg.border}` }}
            >
              {cfg.label}
            </span>
            {requestStatus === 'approved' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(74,124,94,0.15)', color: '#6ab888', border: '1px solid rgba(74,124,94,0.4)' }}
              >
                ✓ Approved
              </span>
            )}
            {requestStatus === 'denied' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(200,64,64,0.15)', color: '#f07070', border: '1px solid rgba(200,64,64,0.4)' }}
              >
                ✕ Denied
              </span>
            )}
            {requestStatus === 'withdrawn' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
              >
                ↩ Withdrawn
              </span>
            )}
            {requestStatus === 'declined' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(200,64,64,0.15)', color: '#f07070', border: '1px solid rgba(200,64,64,0.4)' }}
              >
                ✕ Declined by {request.targetName}
              </span>
            )}
            {/* Waiting states, shown to anyone who can't act on it right now. */}
            {requestStatus === 'pending_peer' && mode !== 'peer' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(200,148,56,0.15)', color: '#d8a848', border: '1px solid rgba(200,148,56,0.4)' }}
              >
                Awaiting {request.targetName}
              </span>
            )}
            {requestStatus === 'pending' && !isManager && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(200,148,56,0.15)', color: '#d8a848', border: '1px solid rgba(200,148,56,0.4)' }}
              >
                Awaiting manager
              </span>
            )}
          </div>
          <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
            {formatRelativeTime(notif.timestamp)}
          </span>
        </div>

        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--color-text-dim)' }}>
          {notif.message}
        </p>

        {mode === 'requester' && (
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => onWithdraw(notif.requestId)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
            >
              ↩ Withdraw request
            </button>
          </div>
        )}

        {mode && mode !== 'requester' && (
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => onApprove(notif.requestId, mode)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'rgba(74,124,94,0.2)', color: '#6ab888', border: '1px solid rgba(74,124,94,0.4)' }}
            >
              {mode === 'peer' ? '✓ Accept' : '✓ Approve'}
            </button>
            <button
              onClick={() => onDeny(notif.requestId, mode)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'rgba(200,64,64,0.15)', color: '#f07070', border: '1px solid rgba(200,64,64,0.4)' }}
            >
              {mode === 'peer' ? '✕ Decline' : '✕ Deny'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
            From: {notif.from}
          </span>
          <button
            onClick={() => onDismiss(notif.id)}
            className="text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-accent-bright)', background: 'transparent', border: 'none' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, dismiss, dismissAll } = useNotifications();
  const { requests, acceptPeerRequest, declinePeerRequest, withdrawRequest, approveRequest, denyRequest } = useRequests();
  const { user } = useAuth();
  const [actionError, setActionError] = useState('');

  function requestFor(notif) {
    if (notif.requestId == null) return null;
    return requests.find(r => r.id === notif.requestId) ?? null;
  }

  // 'peer' accepts on the coworker's behalf and only moves the request along;
  // 'manager' is the decision that actually rewrites the schedule.
  async function handleApprove(id, mode) {
    setActionError('');
    try {
      if (mode === 'peer') await acceptPeerRequest(id);
      else await approveRequest(id);
    } catch {
      setActionError(mode === 'peer'
        ? 'Could not accept that request. Please refresh and try again.'
        : 'Could not fully apply that approval. It may not have saved — please refresh and try again.');
    }
  }

  async function handleDeny(id, mode) {
    setActionError('');
    try {
      if (mode === 'peer') await declinePeerRequest(id);
      else await denyRequest(id);
    } catch {
      setActionError('Could not update that request. Please refresh and try again.');
    }
  }

  async function handleWithdraw(id) {
    setActionError('');
    try {
      await withdrawRequest(id);
    } catch {
      setActionError('Could not withdraw that request — it may have just been decided. Please refresh.');
    }
  }

  return (
    <div>
      {/* Header */}
      <div
        className="flex justify-between items-center p-5 rounded-xl border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            Notifications
            {unreadCount > 0 && (
              <span
                className="ml-2 text-sm px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                {unreadCount}
              </span>
            )}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Shift changes, coverage requests, new events, and alerts
          </p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={dismissAll}
            className="text-sm px-4 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-accent)', color: 'white', border: 'none' }}
          >
            Dismiss all
          </button>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--color-accent)', opacity: 0.5, margin: '14px 0' }} />

      {actionError && (
        <div
          className="mb-3 px-4 py-3 rounded-lg border text-sm"
          style={{ background: 'rgba(200,64,64,0.12)', borderColor: 'var(--color-red)', color: '#f07070' }}
        >
          {actionError}
        </div>
      )}

      {/* Notification list */}
      <div className="flex flex-col gap-3">
        {notifications.length === 0 ? (
          <div
            className="p-10 rounded-xl border text-center"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <p style={{ color: 'var(--color-text-dim)' }}>No notifications here.</p>
          </div>
        ) : (
          notifications.map(n => (
            <NotificationCard
              key={n.id}
              notif={n}
              onDismiss={dismiss}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onWithdraw={handleWithdraw}
              user={user}
              request={requestFor(n)}
            />
          ))
        )}
      </div>
    </div>
  );
}
