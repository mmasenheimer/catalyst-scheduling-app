import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useScheduleContext } from './ScheduleContext';
import { useNotifications } from './NotificationsContext';
import { useAuth } from './AuthContext';
import {
  getStaffForDate, getEventsForDate, mergeStaffOverrides,
  coveredBy, notCoveredBy, sortByShift, formatTime,
} from '../utils/scheduleUtils';
import { requestsApi, schedulesApi } from '../utils/api';
import { useLiveRefetch } from '../hooks/useLiveRefetch';

// type: 'time_off' | 'cover' | 'swap'
// { id, type, status: 'pending_peer'|'pending'|'approved'|'denied'|'declined',
//   staffId, staffName,
//   targetStaffId, targetName, date /* YYYY-MM-DD */, dayLabel, note, createdAt }

const RequestsContext = createContext(null);

const TYPE_LABEL = { time_off: 'drop shift', cover: 'cover', swap: 'swap' };

/** Same hours, ignoring order and the shift ids (which are regenerated freely). */
function sameHours(a, b) {
  const norm = list => (list ?? [])
    .map(s => ({ start: Number(s.start), end: Number(s.end) }))
    .sort((x, y) => x.start - y.start || x.end - y.end);
  const [A, B] = [norm(a), norm(b)];
  return A.length === B.length && A.every((s, i) => s.start === B[i].start && s.end === B[i].end);
}

const describeHours = list =>
  (list ?? []).length
    ? list.map(s => `${formatTime(s.start)}–${formatTime(s.end)}`).join(', ')
    : 'no shift';

/**
 * Throws if the day no longer matches what the request was agreed on.
 *
 * Requests carry a snapshot of the hours involved (see the Request model). Older
 * requests predate it and carry nothing, so they're allowed through rather than
 * being made permanently un-approvable.
 */
function assertStillMatchesAgreement(req, currentStaff) {
  const shiftsOf = id => currentStaff.find(p => p.id === id)?.shifts ?? [];

  if (req.requesterShifts && !sameHours(req.requesterShifts, shiftsOf(req.staffId))) {
    throw new Error(
      `${req.staffName}'s ${req.dayLabel} shift has changed since this was requested `
      + `(now ${describeHours(shiftsOf(req.staffId))}, was ${describeHours(req.requesterShifts)}). `
      + `Deny it and ask them to send a new one.`,
    );
  }

  if (req.targetStaffId != null && req.targetShifts
      && !sameHours(req.targetShifts, shiftsOf(req.targetStaffId))) {
    throw new Error(
      `${req.targetName}'s ${req.dayLabel} shift has changed since this was agreed `
      + `(now ${describeHours(shiftsOf(req.targetStaffId))}, was ${describeHours(req.targetShifts)}). `
      + `Deny it and ask them to send a new one.`,
    );
  }
}

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

  // The day as it actually stands, resolved from the saved schedule.
  //
  // This deliberately fetches rather than reading the in-memory cache. That cache
  // is only filled by the editors, so a manager approving from the notifications
  // page for a day they never opened would find it empty — and the template
  // fallback would then be treated as the current schedule. The approval would be
  // applied on top of template data and saved, silently overwriting the real day.
  const resolveDay = useCallback(async (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const existing = await schedulesApi.getDay(dateStr).catch(() => null);
    const current = existing?.staff
      ? sortByShift(mergeStaffOverrides(staff, existing.staff))
      // Genuinely never saved — the template is the right answer here.
      : getStaffForDate(date, getDaySchedule, staff);
    return { existing, current };
  }, [staff, getDaySchedule]);

  // Returns a promise that resolves once the change is persisted to the
  // backend, so callers can await it and detect a persistence failure. The
  // in-memory cache is still updated synchronously for an immediate UI.
  //
  // `mutate` may throw to abort: nothing is written before it runs, so a rejected
  // mutation leaves the day exactly as it was.
  const applyScheduleChange = useCallback(async (dateStr, mutate) => {
    const date = new Date(dateStr + 'T00:00:00');
    const { existing, current } = await resolveDay(dateStr);

    // Re-sorted after the mutation, matching what the editors write: earliest
    // shift first, anyone left unscheduled at the bottom. Approving a drop or a
    // cover empties somebody's shifts, and without this they'd keep their old
    // position in the saved snapshot instead of joining the unscheduled group.
    const next = sortByShift(mutate(current));

    // Update the in-memory cache under both key formats readers check.
    saveDaySchedule(dateStr, next);
    saveDaySchedule(date.toDateString(), next);

    // Preserve the day's existing events snapshot and finalized flag; a day with
    // no saved doc yet defaults to finalized.
    //
    // suppressNotify: approving a request already notifies the people involved,
    // so the server's schedule-change diff must not fire a second notification
    // for the same change.
    return schedulesApi.saveDay(dateStr, {
      staff: next,
      events: existing?.events ?? [],
      finalized: existing?.finalized ?? true,
      suppressNotify: true,
      // Guards against the day being edited between resolveDay and here. A 409
      // surfaces to the manager as "could not apply", which is right — approving
      // must not silently discard whatever the other writer just did.
      expectedVersion: existing?.version ?? 0,
    });
  }, [resolveDay, saveDaySchedule]);

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

  // Taking back your own request, from either waiting state. Nothing has touched
  // the schedule yet — that only happens on manager approval — so this is always
  // safe up until a decision is made. The server authorizes it by matching on
  // staffId, and raises the notification to whoever was waiting on it.
  const withdrawRequest = useCallback(async (id) => {
    const req = requests.find(r => r.id === id);
    if (!req || !['pending_peer', 'pending'].includes(req.status)) return;
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    try {
      await requestsApi.update(id, { status: 'withdrawn' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'withdrawn' } : r));
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
      // 1. Check the shifts still look like what was agreed to, before anything
      //    is recorded. A request can sit for days; if the schedule moved
      //    underneath it, approving would exchange hours nobody consented to —
      //    or, when the requester's shift was already removed, silently do
      //    nothing while telling everyone it went through. Deliberately ahead of
      //    the status write so a refusal leaves the request untouched and still
      //    decidable.
      const { current } = await resolveDay(req.date);
      assertStillMatchesAgreement(req, current);

      // 2. Record the decision. This is authoritative and idempotent, so if a
      //    later step fails the request can't be approved a second time —
      //    important because the 'cover' schedule mutation below is not
      //    idempotent (it appends the requester's shifts to the target).
      await requestsApi.update(id, { status: 'approved' });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));

      // 3. Apply + persist the schedule change (awaited so a failure surfaces).
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
  }, [requests, resolveDay, applyScheduleChange, releaseOrphanedEvents, addNotification]);

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
      value={{ requests, submitRequest, acceptPeerRequest, declinePeerRequest, withdrawRequest, approveRequest, denyRequest }}
    >
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  return useContext(RequestsContext);
}
