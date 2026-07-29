import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useScheduleContext } from './ScheduleContext';
import { useNotifications } from './NotificationsContext';
import { useAuth } from './AuthContext';
import { getStaffForDate } from '../utils/scheduleUtils';
import { requestsApi, schedulesApi } from '../utils/api';
import { useLiveRefetch } from '../hooks/useLiveRefetch';

// type: 'time_off' | 'cover' | 'swap'
// { id, type, status: 'pending_peer'|'pending'|'approved'|'denied'|'declined',
//   staffId, staffName,
//   targetStaffId, targetName, date /* YYYY-MM-DD */, dayLabel, note, createdAt }

const RequestsContext = createContext(null);

const TYPE_LABEL = { time_off: 'drop shift', cover: 'cover', swap: 'swap' };

export function RequestsProvider({ children }) {
  const { staff, getDaySchedule, saveDaySchedule } = useScheduleContext();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  // Load requests for the current user (the server filters: a manager gets all,
  // an employee only the ones they're involved in). Refreshed in the background
  // on focus and a slow poll, so a manager sees new drop/cover requests without
  // reloading the page.
  const load = useCallback(async () => {
    try {
      setRequests(await requestsApi.getAll());
    } catch { /* offline or backend down — keep whatever we already have */ }
  }, []);

  useLiveRefetch(load, Boolean(user));

  // A request that names a coworker goes to that coworker first — they have to
  // accept before the manager ever sees it. A drop-shift request has nobody to
  // ask, so it goes straight to the manager as before.
  const submitRequest = useCallback(async (req) => {
    const created = await requestsApi.create(req);
    setRequests(prev => [created, ...prev]);

    const notif = req.type === 'time_off'
      ? {
          type: 'coverage',
          title: 'Drop Shift Request',
          message: `${req.staffName} requested to drop their ${req.dayLabel} shift.${req.note ? ` "${req.note}"` : ''}`,
          recipients: 'manager',
        }
      : {
          type: 'shift_change',
          title: req.type === 'cover' ? 'Cover Request' : 'Swap Proposal',
          message: req.type === 'cover'
            ? `${req.staffName} asked you to cover their ${req.dayLabel} shift.${req.note ? ` "${req.note}"` : ''} Accept to send it to the manager for approval.`
            : `${req.staffName} proposed swapping shifts with you on ${req.dayLabel}.${req.note ? ` "${req.note}"` : ''} Accept to send it to the manager for approval.`,
          recipients: [req.targetStaffId],
        };

    addNotification({ ...notif, requestId: created.id, from: req.staffName }).catch(() => {});
    return created.id;
  }, [addNotification]);

  // Returns a promise that resolves once the change is persisted to the
  // backend, so callers can await it and detect a persistence failure. The
  // in-memory cache is still updated synchronously for an immediate UI.
  const applyScheduleChange = useCallback((dateStr, mutate) => {
    const date = new Date(dateStr + 'T00:00:00');
    const current = getStaffForDate(date, getDaySchedule, staff);
    const next = mutate(current);
    // Update the in-memory cache under both key formats readers check.
    saveDaySchedule(dateStr, next);
    saveDaySchedule(date.toDateString(), next);
    // Persist to the backend so the approved change survives a refresh and is
    // picked up by the Daily view (which loads schedules from the DB, not from
    // this in-memory cache). Preserve the day's existing events snapshot and
    // finalized flag; a day with no saved doc yet defaults to finalized.
    return schedulesApi.getDay(dateStr)
      .then(
        existing => ({ events: existing.events ?? [], finalized: existing.finalized ?? true }),
        () => ({ events: [], finalized: true }), // 404 / unreachable → sensible defaults
      )
      // suppressNotify: approving a request already notifies the people
      // involved, so the server's schedule-change diff must not fire a second
      // notification for the same change.
      .then(({ events, finalized }) => schedulesApi.saveDay(
        dateStr, { staff: next, events, finalized, suppressNotify: true },
      ));
  }, [staff, getDaySchedule, saveDaySchedule]);

  // Ids currently being approved/denied — guards against a double-click or two
  // managers acting at once from both running the (non-idempotent) approval.
  const processingRef = useRef(new Set());

  // ── Peer stage ──────────────────────────────────────────────────────────────
  // The coworker a cover/swap request names accepts or declines it before the
  // manager sees it. Neither of these touches the schedule — accepting only
  // moves the request onto the manager's desk.

  const acceptPeerRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending_peer') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      await requestsApi.update(id, { status: 'pending' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'pending' } : r));

      // Now it's the manager's call — this is the notification they act on.
      addNotification({
        requestId: id,
        type: 'shift_change',
        title: req.type === 'cover' ? 'Cover Request' : 'Swap Proposal',
        message: req.type === 'cover'
          ? `${req.targetName} accepted ${req.staffName}'s request to cover their ${req.dayLabel} shift. Approve to apply it to the schedule.`
          : `${req.targetName} accepted ${req.staffName}'s shift swap for ${req.dayLabel}. Approve to apply it to the schedule.`,
        from: req.targetName,
        recipients: 'manager',
      }).catch(() => {});

      addNotification({
        requestId: id,
        type: 'shift_change',
        title: 'Request Accepted',
        message: `${req.targetName} accepted your ${TYPE_LABEL[req.type]} request for ${req.dayLabel}. It's now waiting on manager approval.`,
        from: req.targetName,
        recipients: [req.staffId],
      }).catch(() => {});
    } finally {
      processingRef.current.delete(id);
    }
  }, [requests, addNotification]);

  const declinePeerRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending_peer') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      await requestsApi.update(id, { status: 'declined' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'declined' } : r));

      // Declining ends the request — the manager is never asked.
      addNotification({
        requestId: id,
        type: 'shift_change',
        title: 'Request Declined',
        message: `${req.targetName} declined your ${TYPE_LABEL[req.type]} request for ${req.dayLabel}.`,
        from: req.targetName,
        recipients: [req.staffId],
      }).catch(() => {});
    } finally {
      processingRef.current.delete(id);
    }
  }, [requests, addNotification]);

  const approveRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      // 1. Record the decision first. This is authoritative and idempotent, so
      //    if a later step fails the request can't be approved a second time —
      //    important because the 'cover' schedule mutation below is not
      //    idempotent (it appends the requester's shifts to the target).
      await requestsApi.update(id, { status: 'approved' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));

      // 2. Apply + persist the schedule change (awaited so a failure surfaces).
      if (req.type === 'time_off') {
        await applyScheduleChange(req.date, list =>
          list.map(s => s.id === req.staffId ? { ...s, shifts: [], deskShifts: [] } : s)
        );
      } else if (req.type === 'cover') {
        await applyScheduleChange(req.date, list => {
          const requesterShifts = list.find(s => s.id === req.staffId)?.shifts ?? [];
          return list.map(s => {
            if (s.id === req.staffId) return { ...s, shifts: [], deskShifts: [] };
            if (s.id === req.targetStaffId) {
              return { ...s, shifts: [...s.shifts, ...requesterShifts.map(sh => ({ ...sh, id: `s${Date.now()}-${sh.id}` }))] };
            }
            return s;
          });
        });
      } else if (req.type === 'swap') {
        await applyScheduleChange(req.date, list => {
          const aShifts = list.find(s => s.id === req.staffId)?.shifts ?? [];
          const bShifts = list.find(s => s.id === req.targetStaffId)?.shifts ?? [];
          return list.map(s => {
            if (s.id === req.staffId) return { ...s, shifts: bShifts };
            if (s.id === req.targetStaffId) return { ...s, shifts: aShifts };
            return s;
          });
        });
      }

      // 3. Notify affected staff — best-effort; a failed notification must not
      //    fail the approval that already went through.
      addNotification({
        type: 'approval',
        title: 'Request Approved',
        message: `Your ${TYPE_LABEL[req.type]} request for ${req.dayLabel} has been approved.`,
        from: 'Manager',
        recipients: [req.staffId],
      }).catch(() => {});
      if (req.targetStaffId) {
        addNotification({
          type: 'shift_change',
          title: req.type === 'cover' ? "You're Covering a Shift" : 'Shift Swap Confirmed',
          message: req.type === 'cover'
            ? `You are now covering ${req.staffName}'s shift on ${req.dayLabel}.`
            : `Your shift swap with ${req.staffName} on ${req.dayLabel} has been confirmed.`,
          from: 'Manager',
          recipients: [req.targetStaffId],
        }).catch(() => {});
      }
    } finally {
      // Always clear the in-flight guard; a thrown error propagates to the
      // caller (NotificationsPage) so it can surface the failure to the manager
      // instead of the approval silently looking like it succeeded.
      processingRef.current.delete(id);
    }
  }, [requests, applyScheduleChange, addNotification]);

  const denyRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      await requestsApi.update(id, { status: 'denied' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'denied' } : r));
      addNotification({
        type: 'approval',
        title: 'Request Denied',
        message: `Your ${TYPE_LABEL[req.type]} request for ${req.dayLabel} was denied.`,
        from: 'Manager',
        recipients: [req.staffId],
      }).catch(() => {});
    } finally {
      processingRef.current.delete(id);
    }
  }, [requests, addNotification]);

  return (
    <RequestsContext.Provider
      value={{ requests, submitRequest, acceptPeerRequest, declinePeerRequest, approveRequest, denyRequest }}
    >
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  return useContext(RequestsContext);
}
