import { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';

// recipients:
//   'all'      — every logged-in user sees it
//   'manager'  — manager only
//   [1, 2, …]  — those staff IDs (manager always sees everything)

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
  const [notifications, setNotifications] = useState([]);

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

  function dismissAll() {
    setNotifications(prev => prev.filter(n => !isVisibleTo(n, user)));
  }

  function addNotification(notif) {
    setNotifications(prev => [{
      id: Date.now(),
      timestamp: new Date(),
      read: false,
      ...notif,
    }, ...prev]);
  }

  return (
    <NotificationsContext.Provider value={{ notifications: visible, unreadCount, markRead, dismiss, markAllRead, dismissAll, addNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
