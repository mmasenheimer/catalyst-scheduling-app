import { createContext, useContext, useState } from 'react';

const MOCK_NOTIFICATIONS = [
  {
    id: 1,
    type: 'coverage',
    title: 'Shift Coverage Needed',
    message: 'Jordan K. needs someone to cover their Wednesday shift (9 AM – 5 PM). Can you help?',
    from: 'Jordan K.',
    timestamp: new Date(Date.now() - 1000 * 60 * 14),
    read: false,
  },
  {
    id: 2,
    type: 'shift_change',
    title: 'Shift Change Request',
    message: 'Taylor R. requested to swap their Thursday shift with Riley B. (Friday 2 PM – 8 PM).',
    from: 'Taylor R.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    read: false,
  },
  {
    id: 3,
    type: 'new_event',
    title: 'New Event Added',
    message: 'Story Time has been scheduled for Wednesday at 10 AM – 11 AM. 2 staff members needed.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    read: false,
  },
  {
    id: 4,
    type: 'alert',
    title: 'Understaffed Day',
    message: 'Sunday is currently understaffed — only 3 staff scheduled. Minimum recommended is 5.',
    from: 'System',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    read: true,
  },
  {
    id: 5,
    type: 'approval',
    title: 'Time Off Approved',
    message: 'Your drop shift request for Saturday June 14th has been approved.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    read: true,
  },
  {
    id: 6,
    type: 'coverage',
    title: 'Shift Coverage Needed',
    message: 'Morgan L. needs coverage for their Monday shift (8 AM – 2 PM). They have a personal conflict.',
    from: 'Morgan L.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
    read: true,
  },
  {
    id: 7,
    type: 'shift_change',
    title: 'Shift Change Approved',
    message: 'The shift swap between Alex M. and Quinn A. on Thursday has been confirmed.',
    from: 'System',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    read: true,
  },
  {
    id: 8,
    type: 'new_event',
    title: 'Event Updated',
    message: 'Tech Help Session on Wednesday has been extended to 3 PM – 6 PM. Check your assignments.',
    from: 'Manager',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
    read: true,
  },
];

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => !n.read).length;

  function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function dismiss(id) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markRead, dismiss, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
