import { useState, useEffect } from 'react';
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

  function addEvent(event) {
    setEvents(prev => [...prev, { ...event, id: Date.now() }]);
  }

  function updateEvent(id, changes) {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));
  }

  function removeEvent(id) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  function assignStaffToEvent(eventId, staffId) {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId && !e.assignedStaff.includes(staffId)
          ? { ...e, assignedStaff: [...e.assignedStaff, staffId] }
          : e
      )
    );
  }

  function unassignStaffFromEvent(eventId, staffId) {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, assignedStaff: e.assignedStaff.filter(id => id !== staffId) }
          : e
      )
    );
  }

  function updateStaffDesk(staffId, deskStart, deskEnd) {
    setStaff(prev =>
      prev.map(s => s.id === staffId ? { ...s, deskStart, deskEnd } : s)
    );
    // Persist to API — add more fields to the body as your schema grows
    staffApi.update(staffId, { deskStart, deskEnd }).catch(() => {});
  }

  function runAutoAssignDesks() {
    setStaff(prev => autoAssignDesks(prev, events));
  }

  function goToNextDay() {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  }

  function goToPrevDay() {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  }

  function goToDate(date) {
    setCurrentDate(new Date(date));
  }

  function saveDaySchedule(dateString, staffArray) {
    setDaySchedules(prev => ({ ...prev, [dateString]: staffArray }));
  }

  function getDaySchedule(dateString) {
    return daySchedules[dateString] ?? null;
  }

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
  };
}
