import { useState, useEffect, useCallback, useRef } from 'react';
import { initialStaff, initialEvents } from '../../data/mockData';
import { autoAssignDesks } from '../utils/scheduleUtils';
import { staffApi, eventsApi } from '../utils/api';

export function useSchedule() {
  const [staff, setStaff] = useState(initialStaff);

  // Load staff from the API on mount; fall back to mock data if the server is unreachable.
  useEffect(() => {
    staffApi.getAll()
      .then(data => setStaff(data))
      .catch(() => { /* backend not running — mock data stays */ });
  }, []);
  const [events, setEvents] = useState(initialEvents);

  // Load events from the API on mount; fall back to mock data if the server is unreachable.
  useEffect(() => {
    eventsApi.getAll()
      .then(data => setEvents(data))
      .catch(() => { /* backend not running — mock data stays */ });
  }, []);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daySchedules, setDaySchedules] = useState({});

  // Set by the Weekly view (manager) / Team Schedule (employee) while fetching
  // each day's saved schedule, so the persistent sidebar nav can show a loading
  // indicator next to the link.
  const [weeklyViewLoading, setWeeklyViewLoading] = useState(false);
  const [teamScheduleLoading, setTeamScheduleLoading] = useState(false);

  // Keep a live ref of daySchedules so getDaySchedule can stay a stable
  // reference (no dependency on the latest state). This lets React.memo'd
  // consumers like the weekly view skip re-rendering when a sibling saves.
  const daySchedulesRef = useRef(daySchedules);
  useEffect(() => { daySchedulesRef.current = daySchedules; }, [daySchedules]);

  const addEvent = useCallback(async (event) => {
    const created = await eventsApi.create(event);
    setEvents(prev => [...prev, created]);
    return created;
  }, []);

  // updateEvent fires on every mousemove while resizing an event bar, so the
  // network call is debounced per-event — otherwise a single drag would fire
  // dozens of PATCH requests at the live Atlas cluster.
  const updateEventTimersRef = useRef({});
  const updateEvent = useCallback((id, changes) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
    clearTimeout(updateEventTimersRef.current[id]);
    updateEventTimersRef.current[id] = setTimeout(() => {
      eventsApi.update(id, changes).catch(() => {});
    }, 400);
  }, []);

  const removeEvent = useCallback(async (id) => {
    await eventsApi.remove(id);
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const assignStaffToEvent = useCallback((eventId, staffId) => {
    const evt = events.find(e => e.id === eventId);
    if (!evt || evt.assignedStaff.includes(staffId)) return;
    const assignedStaff = [...evt.assignedStaff, staffId];
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, assignedStaff } : e));
    eventsApi.update(eventId, { assignedStaff }).catch(() => {});
  }, [events]);

  const unassignStaffFromEvent = useCallback((eventId, staffId) => {
    const evt = events.find(e => e.id === eventId);
    if (!evt) return;
    const assignedStaff = evt.assignedStaff.filter(id => id !== staffId);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, assignedStaff } : e));
    eventsApi.update(eventId, { assignedStaff }).catch(() => {});
  }, [events]);

  const updateStaffDesk = useCallback((staffId, deskStart, deskEnd) => {
    setStaff(prev =>
      prev.map(s => s.id === staffId ? { ...s, deskStart, deskEnd } : s)
    );
    // Persist to API — add more fields to the body as your schema grows
    staffApi.update(staffId, { deskStart, deskEnd }).catch(() => {});
  }, []);

  const updateStaffMaxHours = useCallback((staffId, maxHoursPerWeek) => {
    setStaff(prev =>
      prev.map(s => s.id === staffId ? { ...s, maxHoursPerWeek } : s)
    );
    staffApi.update(staffId, { maxHoursPerWeek }).catch(() => {});
  }, []);

  const addStaff = useCallback(async (person) => {
    const created = await staffApi.create(person);
    setStaff(prev => [...prev, created]);
    return created;
  }, []);

  const removeStaff = useCallback(async (staffId) => {
    await staffApi.remove(staffId);
    setStaff(prev => prev.filter(s => s.id !== staffId));
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
    updateStaffMaxHours,
    addStaff,
    removeStaff,
    runAutoAssignDesks,
    goToNextDay,
    goToPrevDay,
    goToDate,
    saveDaySchedule,
    getDaySchedule,
    daySchedules,
    weeklyViewLoading,
    setWeeklyViewLoading,
    teamScheduleLoading,
    setTeamScheduleLoading,
  };
}
