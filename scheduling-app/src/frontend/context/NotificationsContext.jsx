import { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';

// recipients:
//   'all'      — every logged-in user sees it
//   'manager'  — manager only
//   [1, 2, …]  — those staff IDs (manager always sees everything)

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: 'coverage',
    title: 'Shift Coverage Needed',
    message: 'Jordan K. needs someone to cover their Wednesday shift (9 AM – 5 PM). Can you help?',
    managerMessage: 'Jordan K. needs someone to cover their Wednesday shift (9 AM – 5 PM).',
    from: 'Jordan K.',
    timestamp: new Date(Date.now() - 1000 * 60 * 14),
    read: false,
    recipients: 'all',           // any employee can volunteer
  },
  {
    id: 2,
    type: 'shift_change',
    title: 'Shift Change Request',
    message: 'Taylor R. requested to swap their Thursday shift with Riley B. (Friday 2 PM – 8 PM).',
    from: 'Taylor R.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    read: false,
    recipients: [4, 7],          // only Taylor R. (4) and Riley B. (7)
  },
  {
    id: 3,
    type: 'new_event',
    title: 'New Event Added',
    message: 'Story Time has been scheduled for Wednesday at 10 AM – 11 AM. You are assigned.',
    managerMessage: 'Story Time has been scheduled for Wednesday at 10 AM – 11 AM.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    read: false,
    recipients: [1, 5],          // Alex M. (1) and Morgan L. (5) — assigned staff
  },
  {
    id: 4,
    type: 'alert',
    title: 'Understaffed Day',
    message: 'Sunday is currently understaffed — only 3 staff scheduled. Minimum recommended is 5.',
    from: 'System',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    read: true,
    recipients: 'manager',       // operational alert, manager only
  },
  {
    id: 5,
    type: 'approval',
    title: 'Time Off Approved',
    message: 'Your drop shift request for Saturday June 14th has been approved.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    read: true,
    recipients: [3],             // Sam P. (3) — the one who requested it
  },
  {
    id: 6,
    type: 'coverage',
    title: 'Shift Coverage Needed',
    message: 'Morgan L. needs coverage for their Monday shift (8 AM – 2 PM). They have a personal conflict.',
    from: 'Morgan L.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
    read: true,
    recipients: 'all',           // any employee can volunteer
  },
  {
    id: 7,
    type: 'shift_change',
    title: 'Shift Swap Confirmed',
    message: 'Your shift swap on Thursday has been confirmed.',
    from: 'System',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    read: true,
    recipients: [1, 8],          // Alex M. (1) and Quinn A. (8) — the two parties
  },
  {
    id: 8,
    type: 'new_event',
    title: 'Event Updated',
    message: 'Tech Help Session on Wednesday has been extended to 3 PM – 6 PM. Check your schedule.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
    read: true,
    recipients: [4],             // Taylor R. (4) — assigned staff
  },
];

function isVisibleTo(notif, user) {
  if (!user) return false;
  if (user.role === 'manager') {
    if (notif.type === 'approval') return false;
    return true;
  }
  const { recipients } = notif;
  if (recipients === 'all') return true;
  if (recipients === 'manager') return false;
  if (Array.isArray(recipients)) return recipients.includes(user.staffId);
  return false;
}

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const visible = notifications
    .filter(n => isVisibleTo(n, user))
    .map(n => user?.role === 'manager' && n.managerMessage ? { ...n, message: n.managerMessage } : n);
  const unreadCount = visible.filter(n => !n.read).length;

  function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function dismiss(id) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function markAllRead() {
    setNotifications(prev =>
      prev.map(n => isVisibleTo(n, user) ? { ...n, read: true } : n)
    );
  }

  function approve(id) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, approved: true, read: true } : n)
    );
  }

  return (
    <NotificationsContext.Provider value={{ notifications: visible, unreadCount, markRead, dismiss, markAllRead, approve }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
