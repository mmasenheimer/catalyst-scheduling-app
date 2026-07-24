import { useState } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { useRequests } from '../context/RequestsContext';
import { useAuth } from '../context/AuthContext';

const TYPE_CONFIG = {
  coverage:     { label: 'Coverage',     dot: '#e07050', bg: 'rgba(224, 112, 80, 0.12)',  border: 'rgba(224, 112, 80, 0.3)'  },
  shift_change: { label: 'Shift Change', dot: '#c89438', bg: 'rgba(200, 148, 56, 0.12)',  border: 'rgba(200, 148, 56, 0.3)'  },
  new_event:    { label: 'Event',        dot: '#6a9fd8', bg: 'rgba(106, 159, 216, 0.12)', border: 'rgba(106, 159, 216, 0.3)' },
  alert:        { label: 'Alert',        dot: '#c84040', bg: 'rgba(200, 64, 64, 0.12)',   border: 'rgba(200, 64, 64, 0.3)'   },
  approval:     { label: 'Approval',     dot: '#4a7c5e', bg: 'rgba(74, 124, 94, 0.12)',   border: 'rgba(74, 124, 94, 0.3)'   },
  availability: { label: 'Availability', dot: '#7ab0d8', bg: 'rgba(122, 176, 216, 0.12)', border: 'rgba(122, 176, 216, 0.3)' },
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

function NotificationCard({ notif, onDismiss, onApprove, onDeny, isManager, requestStatus }) {
  const cfg = TYPE_CONFIG[notif.type];
  const showActions = isManager && notif.requestId != null && requestStatus === 'pending';

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
          </div>
          <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
            {formatRelativeTime(notif.timestamp)}
          </span>
        </div>

        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--color-text-dim)' }}>
          {notif.message}
        </p>

        {showActions && (
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => onApprove(notif.requestId)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'rgba(74,124,94,0.2)', color: '#6ab888', border: '1px solid rgba(74,124,94,0.4)' }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => onDeny(notif.requestId)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'rgba(200,64,64,0.15)', color: '#f07070', border: '1px solid rgba(200,64,64,0.4)' }}
            >
              ✕ Deny
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
  const { requests, approveRequest, denyRequest } = useRequests();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [actionError, setActionError] = useState('');

  function requestStatusFor(notif) {
    if (notif.requestId == null) return null;
    return requests.find(r => r.id === notif.requestId)?.status ?? null;
  }

  async function handleApprove(id) {
    setActionError('');
    try {
      await approveRequest(id);
    } catch {
      setActionError('Could not fully apply that approval. It may not have saved — please refresh and try again.');
    }
  }

  async function handleDeny(id) {
    setActionError('');
    try {
      await denyRequest(id);
    } catch {
      setActionError('Could not update that request. Please refresh and try again.');
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
              isManager={isManager}
              requestStatus={requestStatusFor(n)}
            />
          ))
        )}
      </div>
    </div>
  );
}
