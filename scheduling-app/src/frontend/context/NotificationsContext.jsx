import { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { notificationsApi } from '../utils/api';
import { useLiveRefetch } from '../hooks/useLiveRefetch';

// recipients:
//   'all'      — every logged-in user sees it
//   'manager'  — manager only
//   [1, 2, …]  — those staff IDs (manager always sees everything)

// Mirrors the server's filter. One rule for everybody — a notification is
// visible to whoever it's addressed to — rather than a role special-case, which
// is what previously fed every employee's notifications back to the manager.
function isVisibleTo(notif, user) {
  if (!user) return false;
  const { recipients } = notif;
  if (recipients === 'all') return true;
  if (recipients === 'manager') return user.role === 'manager';
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

  // Load notifications for the current user (the server filters by the session's
  // role/staffId). Kept fresh in the background — on mount, when the tab regains
  // focus, and on a slow poll while visible — so a notification raised elsewhere
  // shows up without the user reloading the page.
  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data.map(hydrate));
    } catch { /* offline or backend down — keep whatever we already have */ }
  }, []);

  useLiveRefetch(load, Boolean(user));

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
