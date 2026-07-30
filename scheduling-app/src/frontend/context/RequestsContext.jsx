import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useScheduleContext } from './ScheduleContext';
import { useNotifications } from './NotificationsContext';
import { useAuth } from './AuthContext';
import { getStaffForDate, getEventsForDate, coveredBy, notCoveredBy, sortByShift } from '../utils/scheduleUtils';
import { requestsApi, schedulesApi } from '../utils/api';
import { useLiveRefetch } from '../hooks/useLiveRefetch';

// type: 'time_off' | 'cover' | 'swap'
// { id, type, status: 'pending_peer'|'pending'|'approved'|'denied'|'declined',
//   staffId, staffName,
//   targetStaffId, targetName, date /* YYYY-MM-DD */, dayLabel, note, createdAt }

const RequestsContext = createContext(null);

const TYPE_LABEL = { time_off: 'drop shift', cover: 'cover', swap: 'swap' };

export function RequestsProvider({ children }) {
  const { staff, events, getDaySchedule, saveDaySchedule, unassignStaffFromEvent } = useScheduleContext();
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
  //
  // The notification is raised by the server (see backend utils/notify.js): it's
  // addressed to somebody else and carries the requestId that puts Accept and
  // Approve buttons on their card, so the submitter doesn't get to write it.
  const submitRequest = useCallback(async (req) => {
    const created = await requestsApi.create(req);
    setRequests(prev => [created, ...prev]);
    return created.id;
  }, []);

  // Returns a promise that resolves once the change is persisted to the
  // backend, so callers can await it and detect a persistence failure. The
  // in-memory cache is still updated synchronously for an immediate UI.
  const applyScheduleChange = useCallback((dateStr, mutate) => {
    const date = new Date(dateStr + 'T00:00:00');
    const current = getStaffForDate(date, getDaySchedule, staff);
    // Re-sorted after the mutation, matching what the editors write: earliest
    // shift first, anyone left unscheduled at the bottom. Approving a drop or a
    // cover empties somebody's shifts, and without this they'd keep their old
    // position in the saved snapshot instead of joining the unscheduled group.
    const next = sortByShift(mutate(current));
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

  // Approving a request rewrites somebody's shifts for the day, but their event
  // assignments live on the Event documents and don't move with them. Without
  // this, dropping or handing off a shift left the person still assigned to that
  // day's events — showing on their schedule with no shift to work it. This is
  // the same cleanup the editor does when a manager deletes a shift by hand.
  const releaseOrphanedEvents = useCallback((dateStr, staffId, remainingShifts) => {
    if (staffId == null) return;
    const date = new Date(dateStr + 'T00:00:00');
    const assigned = getEventsForDate(date, events)
      .filter(evt => (evt.assignedStaff ?? []).includes(staffId));
    notCoveredBy(remainingShifts, assigned)
      .forEach(evt => unassignStaffFromEvent(evt.id, staffId));
  }, [events, unassignStaffFromEvent]);

  // Ids currently being approved/denied — guards against a double-click or two
  // managers acting at once from both running the (non-idempotent) approval.
  const processingRef = useRef(new Set());

  // ── Peer stage ──────────────────────────────────────────────────────────────
  // The coworker a cover/swap request names accepts or declines it before the
  // manager sees it. Neither of these touches the schedule — accepting only
  // moves the request onto the manager's desk.
  //
  // Both notify from the server (backend utils/notify.js). Accepting is what puts
  // the request in front of the manager with an Approve button, so an employee
  // must not be the one writing that message.

  const acceptPeerRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending_peer') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      await requestsApi.update(id, { status: 'pending' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'pending' } : r));
    } finally {
      processingRef.current.delete(id);
    }
  }, [requests]);

  const declinePeerRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending_peer') return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      // Declining ends the request — the manager is never asked.
      await requestsApi.update(id, { status: 'declined' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'declined' } : r));
    } finally {
      processingRef.current.delete(id);
    }
  }, [requests]);

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
        // No shifts left, so nothing that day can still be covered.
        releaseOrphanedEvents(req.date, req.staffId, []);
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
        // The requester is off the day entirely. The person covering is not
        // auto-assigned to those events — taking a shift isn't agreeing to run
        // someone's event — so the event shows short and the manager is alerted.
        releaseOrphanedEvents(req.date, req.staffId, []);
      } else if (req.type === 'swap') {
        // Captured from inside the mutation so the release step below can check
        // each person's assignments against the shifts they ended up with.
        let requesterEndsWith = [];
        let targetEndsWith = [];
        await applyScheduleChange(req.date, list => {
          const aShifts = list.find(s => s.id === req.staffId)?.shifts ?? [];
          const bShifts = list.find(s => s.id === req.targetStaffId)?.shifts ?? [];
          requesterEndsWith = bShifts;
          targetEndsWith = aShifts;
          // Only the shifts trade hands. Desk duty doesn't transfer — picking up
          // someone's shift isn't agreeing to their desk slot — but desk time
          // that no longer sits on a shift is dropped rather than left orphaned
          // on a row the person isn't working. The manager then sees a desk
          // coverage gap and reassigns deliberately. Same test the editor uses
          // when a shift is deleted by hand.
          return list.map(s => {
            if (s.id === req.staffId) {
              return { ...s, shifts: bShifts, deskShifts: coveredBy(bShifts, s.deskShifts) };
            }
            if (s.id === req.targetStaffId) {
              return { ...s, shifts: aShifts, deskShifts: coveredBy(aShifts, s.deskShifts) };
            }
            return s;
          });
        });
        // A swap can leave either side outside an event they were assigned to.
        releaseOrphanedEvents(req.date, req.staffId, requesterEndsWith);
        releaseOrphanedEvents(req.date, req.targetStaffId, targetEndsWith);
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
  }, [requests, applyScheduleChange, releaseOrphanedEvents, addNotification]);

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
