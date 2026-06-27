import { useState, useEffect, useCallback, useRef } from 'react';
import { initialStaff, initialEvents } from '../../data/mockData';
import { autoAssignDesks } from '../utils/scheduleUtils';
import { staffApi } from '../utils/api';

export function useSchedule() {
  const [staff, setStaff] = useState(initialStaff);

  // Load staff from the API on mount; fall back to mock data if the server is unreachable.
  useEffect(() => {
    staffApi.getAll()
      .then(data => setStaff(data))
      .catch(() => { /* backend not running — mock data stays */ });
  }, []);
  const [events, setEvents] = useState(initialEvents);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daySchedules, setDaySchedules] = useState({});

  // Keep a live ref of daySchedules so getDaySchedule can stay a stable
  // reference (no dependency on the latest state). This lets React.memo'd
  // consumers like the weekly view skip re-rendering when a sibling saves.
  const daySchedulesRef = useRef(daySchedules);
  useEffect(() => { daySchedulesRef.current = daySchedules; }, [daySchedules]);

  const addEvent = useCallback((event) => {
    setEvents(prev => [...prev, { ...event, id: Date.now() }]);
  }, []);

  const updateEvent = useCallback((id, changes) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
  }, []);

  const removeEvent = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const assignStaffToEvent = useCallback((eventId, staffId) => {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId && !e.assignedStaff.includes(staffId)
          ? { ...e, assignedStaff: [...e.assignedStaff, staffId] }
          : e
      )
    );
  }, []);

  const unassignStaffFromEvent = useCallback((eventId, staffId) => {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, assignedStaff: e.assignedStaff.filter(id => id !== staffId) }
          : e
      )
    );
  }, []);

  const updateStaffDesk = useCallback((staffId, deskStart, deskEnd) => {
    setStaff(prev =>
      prev.map(s => s.id === staffId ? { ...s, deskStart, deskEnd } : s)
    );
    // Persist to API — add more fields to the body as your schema grows
    staffApi.update(staffId, { deskStart, deskEnd }).catch(() => {});
  }, []);

  const runAutoAssignDesks = useCallback(() => {
    setStaff(prev => autoAssignDesks(prev, events));
  }, [events]);

  const goToNextDay = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  }, []);

  const goToPrevDay = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  }, []);

  const goToDate = useCallback((date) => {
    setCurrentDate(new Date(date));
  }, []);

  const saveDaySchedule = useCallback((dateString, staffArray) => {
    setDaySchedules(prev => ({ ...prev, [dateString]: staffArray }));
  }, []);

  const getDaySchedule = useCallback((dateString) => {
    return daySchedulesRef.current[dateString] ?? null;
  }, []);

  return {
    staff,
    events,
    currentDate,
    addEvent,
    updateEvent,
    removeEvent,
    assignStaffToEvent,
    unassignStaffFromEvent,
    updateStaffDesk,
    runAutoAssignDesks,
    goToNextDay,
    goToPrevDay,
    goToDate,
    saveDaySchedule,
    getDaySchedule,
    daySchedules,
  };
}
