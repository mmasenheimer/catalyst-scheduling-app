import { useState } from 'react';
import { initialStaff, initialEvents } from '../../data/mockData';
import { autoAssignDesks } from '../utils/scheduleUtils';

/**
 * Central state for the scheduling app.
 * In a real app this would be replaced with context + API calls.
 */
export function useSchedule() {
  const [staff, setStaff] = useState(initialStaff);
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
