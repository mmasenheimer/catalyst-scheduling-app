import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { notificationsApi } from '../utils/api';

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

// The backend stores createdAt; the rest of the app reads notif.timestamp as a Date.
function hydrate(n) {
  return { ...n, timestamp: new Date(n.createdAt) };
}

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  // Load notifications for the current user from the API (server-side filtered
  // by role/staffId); stay empty if the server is unreachable. Refetches when
  // the logged-in user changes.
  useEffect(() => {
    if (!user) return;
    notificationsApi.getAll({ role: user.role, staffId: user.staffId })
      .then(data => setNotifications(data.map(hydrate)))
      .catch(() => { /* backend not running */ });
  }, [user]);

  const visible = notifications
    .filter(n => isVisibleTo(n, user))
    .map(n => user?.role === 'manager' && n.managerMessage ? { ...n, message: n.managerMessage } : n);
  const unreadCount = visible.filter(n => !n.read).length;

  const markRead = useCallback((id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    notificationsApi.update(id, { read: true }).catch(() => {});
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    notificationsApi.remove(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => isVisibleTo(n, user) ? { ...n, read: true } : n));
    visible.filter(n => !n.read).forEach(n => notificationsApi.update(n.id, { read: true }).catch(() => {}));
  }, [user, visible]);

  const dismissAll = useCallback(() => {
    setNotifications(prev => prev.filter(n => !isVisibleTo(n, user)));
    visible.forEach(n => notificationsApi.remove(n.id).catch(() => {}));
  }, [user, visible]);

  const addNotification = useCallback(async (notif) => {
    const created = await notificationsApi.create(notif);
    const hydrated = hydrate(created);
    setNotifications(prev => [hydrated, ...prev]);
    return hydrated;
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications: visible, unreadCount, markRead, dismiss, markAllRead, dismissAll, addNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
