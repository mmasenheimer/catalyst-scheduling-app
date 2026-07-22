import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useScheduleContext } from './ScheduleContext';
import { useNotifications } from './NotificationsContext';
import { getStaffForDate } from '../utils/scheduleUtils';
import { requestsApi } from '../utils/api';

// type: 'time_off' | 'cover' | 'swap'
// { id, type, status: 'pending'|'approved'|'denied', staffId, staffName,
//   targetStaffId, targetName, date /* YYYY-MM-DD */, dayLabel, note, createdAt }

const RequestsContext = createContext(null);

const TYPE_LABEL = { time_off: 'drop shift', cover: 'cover', swap: 'swap' };

export function RequestsProvider({ children }) {
  const { staff, getDaySchedule, saveDaySchedule } = useScheduleContext();
  const { addNotification } = useNotifications();
  const [requests, setRequests] = useState([]);

  // Load requests from the API on mount; stay empty if the server is unreachable.
  useEffect(() => {
    requestsApi.getAll()
      .then(data => setRequests(data))
      .catch(() => { /* backend not running */ });
  }, []);

  const submitRequest = useCallback(async (req) => {
    const created = await requestsApi.create(req);
    setRequests(prev => [created, ...prev]);
    addNotification({
      requestId: created.id,
      type: req.type === 'time_off' ? 'coverage' : 'shift_change',
      title: req.type === 'time_off' ? 'Drop Shift Request' : req.type === 'cover' ? 'Cover Request' : 'Swap Proposal',
      message: req.type === 'time_off'
        ? `${req.staffName} requested to drop their ${req.dayLabel} shift.${req.note ? ` "${req.note}"` : ''}`
        : req.type === 'cover'
          ? `${req.staffName} asked ${req.targetName} to cover their ${req.dayLabel} shift.`
          : `${req.staffName} proposed a shift swap with ${req.targetName} on ${req.dayLabel}.`,
      from: req.staffName,
      recipients: 'manager',
    }).catch(() => {});
    return created.id;
  }, [addNotification]);

  const applyScheduleChange = useCallback((dateStr, mutate) => {
    const date = new Date(dateStr + 'T00:00:00');
    const current = getStaffForDate(date, getDaySchedule, staff);
    const next = mutate(current);
    saveDaySchedule(dateStr, next);
    saveDaySchedule(date.toDateString(), next);
  }, [staff, getDaySchedule, saveDaySchedule]);

  const approveRequest = useCallback((id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;

    if (req.type === 'time_off') {
      applyScheduleChange(req.date, list =>
        list.map(s => s.id === req.staffId ? { ...s, shifts: [], deskShifts: [] } : s)
      );
    } else if (req.type === 'cover') {
      applyScheduleChange(req.date, list => {
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
      applyScheduleChange(req.date, list => {
        const aShifts = list.find(s => s.id === req.staffId)?.shifts ?? [];
        const bShifts = list.find(s => s.id === req.targetStaffId)?.shifts ?? [];
        return list.map(s => {
          if (s.id === req.staffId) return { ...s, shifts: bShifts };
          if (s.id === req.targetStaffId) return { ...s, shifts: aShifts };
          return s;
        });
      });
    }

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

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
    requestsApi.update(id, { status: 'approved' }).catch(() => {});
  }, [requests, applyScheduleChange, addNotification]);

  const denyRequest = useCallback((id) => {
    const req = requests.find(r => r.id === id);
    if (!req || req.status !== 'pending') return;

    addNotification({
      type: 'approval',
      title: 'Request Denied',
      message: `Your ${TYPE_LABEL[req.type]} request for ${req.dayLabel} was denied.`,
      from: 'Manager',
      recipients: [req.staffId],
    }).catch(() => {});

    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'denied' } : r));
    requestsApi.update(id, { status: 'denied' }).catch(() => {});
  }, [requests, addNotification]);

  return (
    <RequestsContext.Provider value={{ requests, submitRequest, approveRequest, denyRequest }}>
      {children}
    </RequestsContext.Provider>
  );
}

export function useRequests() {
  return useContext(RequestsContext);
}
