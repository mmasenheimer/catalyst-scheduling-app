import { useState } from 'react';
import { useNotifications } from '../context/NotificationsContext';
import { useAuth } from '../context/AuthContext';

const TYPE_CONFIG = {
  coverage:     { label: 'Coverage',     dot: '#e07050', bg: 'rgba(224, 112, 80, 0.12)',  border: 'rgba(224, 112, 80, 0.3)'  },
  shift_change: { label: 'Shift Change', dot: '#c89438', bg: 'rgba(200, 148, 56, 0.12)',  border: 'rgba(200, 148, 56, 0.3)'  },
  new_event:    { label: 'Event',        dot: '#6a9fd8', bg: 'rgba(106, 159, 216, 0.12)', border: 'rgba(106, 159, 216, 0.3)' },
  alert:        { label: 'Alert',        dot: '#c84040', bg: 'rgba(200, 64, 64, 0.12)',   border: 'rgba(200, 64, 64, 0.3)'   },
  approval:     { label: 'Approval',     dot: '#4a7c5e', bg: 'rgba(74, 124, 94, 0.12)',   border: 'rgba(74, 124, 94, 0.3)'   },
};

const FILTERS = ['All', 'Coverage', 'Shift Change', 'Event', 'Alert', 'Approval'];

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

function NotificationCard({ notif, onMarkRead, onDismiss, onApprove, isManager }) {
  const cfg = TYPE_CONFIG[notif.type];
  const showApproveButton = isManager && notif.type === 'shift_change' && !notif.approved;

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
            {notif.approved && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(74,124,94,0.15)', color: '#6ab888', border: '1px solid rgba(74,124,94,0.4)' }}
              >
                ✓ Approved
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

        {showApproveButton && (
          <div className="mb-2">
            <button
              onClick={() => onApprove(notif.id)}
              className="text-xs px-3 py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ background: 'rgba(74,124,94,0.2)', color: '#6ab888', border: '1px solid rgba(74,124,94,0.4)' }}
            >
              ✓ Approve
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
            From: {notif.from}
          </span>
          <div className="flex gap-2">
            {!notif.read && (
              <button
                onClick={() => onMarkRead(notif.id)}
                className="text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-accent-bright)', background: 'transparent', border: 'none' }}
              >
                Mark read
              </button>
            )}
            <button
              onClick={() => onDismiss(notif.id)}
              className="text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: 'var(--color-text-dim)', background: 'transparent', border: 'none' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, dismiss, markAllRead, approve } = useNotifications();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [activeFilter, setActiveFilter] = useState('All');

  const filtered = notifications.filter(n => {
    if (activeFilter === 'All') return true;
    return TYPE_CONFIG[n.type].label === activeFilter;
  });

  return (
    <div>
      {/* Header */}
      <div
        className="flex justify-between items-center p-5 rounded-xl mb-5 border"
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
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm px-4 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-accent)', color: 'white', border: 'none' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(f => {
          const isActive = activeFilter === f;
          const count = f === 'All'
            ? notifications.filter(n => !n.read).length
            : notifications.filter(n => TYPE_CONFIG[n.type].label === f && !n.read).length;
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-all"
              style={{
                background: isActive ? 'rgba(176, 80, 48, 0.15)' : 'var(--color-surface)',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-dim)',
                border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              {f}
              {count > 0 && (
                <span
                  className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--color-accent)', color: 'white' }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div
            className="p-10 rounded-xl border text-center"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <p style={{ color: 'var(--color-text-dim)' }}>No notifications here.</p>
          </div>
        ) : (
          filtered.map(n => (
            <NotificationCard
              key={n.id}
              notif={n}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onApprove={approve}
              isManager={isManager}
            />
          ))
        )}
      </div>
    </div>
  );
}
