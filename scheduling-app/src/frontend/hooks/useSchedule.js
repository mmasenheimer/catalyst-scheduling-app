import { useState, useEffect, useCallback, useRef } from 'react';
import { initialStaff, initialEvents } from '../../data/mockData';
import mockAvailability from '../../data/mockAvailability';
import { staffApi, eventsApi, availabilityApi } from '../utils/api';
import { useLiveRefetch } from './useLiveRefetch';
import { useAuth } from '../context/AuthContext';

// Returned for anyone with no availability on a given day. A shared constant, not
// a fresh `[]` per call: the weekly view passes these blocks straight into a
// shallow-memoized StaffRow, and a new array each render would defeat the memo.
const NO_AVAILABILITY = Object.freeze([]);

export function useSchedule() {
  const { user } = useAuth();
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

  // Live ref of events so assign/unassignStaffToEvent can stay referentially
  // stable (no [events] dep). Without this, every event edit gives the
  // memoized weekly-view DayEditors new callback props and re-renders all 7
  // days on every mousemove of an event resize.
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  // ── Availability ────────────────────────────────────────────────────────────
  // The single source for "when can this person work", shaped
  // { [staffId]: { [dayOfWeek]: [{ start, end }] } }.
  //
  // This used to be split: the three schedule editors read the hardcoded
  // src/data/mockAvailability.js while the generator, the manager's availability
  // page and the employee's own submissions all used the database. They agreed
  // only until somebody actually changed their availability in the app — after
  // which the editors drew stale blue bars and flagged perfectly valid shifts as
  // "outside availability". Everything reads this now; the mock file is only
  // seed data for the backend's seed:availability script.
  //
  // Starts empty rather than seeded with mock data. An empty map is honest — it
  // says "nothing loaded yet" — whereas pre-seeding means any view reading this
  // before the fetch lands silently gets sample data and looks plausible while
  // being wrong, which is the exact bug this whole source was consolidated to
  // kill. Mock data is used only as an explicit offline fallback below.
  const [availability, setAvailability] = useState({});

  // Scoped to what the caller is allowed to see, mirroring the API: a manager
  // reads the whole roster; an employee reads only their own record. Doing it
  // per-role rather than manager-only matters — gating the fetch entirely would
  // leave employees with a permanently empty (previously: permanently mock) map,
  // so any employee-facing view added later would quietly render the wrong thing.
  const loadAvailability = useCallback(async () => {
    const isManager = user?.role === 'manager';
    const staffId = user?.staffId ?? null;
    if (!isManager && staffId == null) return;

    try {
      let byStaff = {};
      if (isManager) {
        const rows = await availabilityApi.getAll();
        rows.forEach(row => { byStaff[row.staffId] = row.days ?? {}; });
      } else {
        // Employees may read exactly one record — their own. Everyone else
        // correctly resolves to no availability, matching what the server allows.
        const row = await availabilityApi.getOne(staffId).catch(() => null);
        byStaff = row ? { [staffId]: row.days ?? {} } : {};
      }

      // Only swap the object when something actually changed. The identity of
      // this state is what memoized consumers compare, so replacing it on every
      // poll would re-render all seven weekly-view days every 45 seconds for
      // nothing.
      setAvailability(prev =>
        JSON.stringify(prev) === JSON.stringify(byStaff) ? prev : byStaff,
      );
    } catch {
      // Backend unreachable. Sample data keeps the editors usable offline in dev,
      // and only ever a manager sees it — an employee falling back to sample data
      // would be showing them somebody else's hours as their own.
      if (isManager) setAvailability(prev => (prev === mockAvailability ? prev : mockAvailability));
    }
  }, [user?.role, user?.staffId]);

  // Refetched on focus and a slow poll, so a manager building a schedule picks up
  // an availability submission without reloading the page.
  useLiveRefetch(loadAvailability, Boolean(user));

  // Read through a ref so the getter's identity never changes. The weekly view's
  // DayEditor is React.memo'd with a hand-written comparator; an unstable
  // callback prop there re-renders all seven days on every mousemove. Components
  // that need to re-render when availability *arrives* should depend on the
  // `availability` object itself, which this deliberately doesn't close over.
  const availabilityRef = useRef(availability);
  useEffect(() => { availabilityRef.current = availability; }, [availability]);

  const getAvailability = useCallback(
    (staffId, dayOfWeek) =>
      availabilityRef.current?.[staffId]?.[dayOfWeek] ?? NO_AVAILABILITY,
    [],
  );

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
    const evt = eventsRef.current.find(e => e.id === eventId);
    if (!evt || evt.assignedStaff.includes(staffId)) return;
    const assignedStaff = [...evt.assignedStaff, staffId];
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, assignedStaff } : e));
    eventsApi.update(eventId, { assignedStaff }).catch(() => {});
  }, []);

  const unassignStaffFromEvent = useCallback((eventId, staffId) => {
    const evt = eventsRef.current.find(e => e.id === eventId);
    if (!evt) return;
    const assignedStaff = evt.assignedStaff.filter(id => id !== staffId);
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, assignedStaff } : e));
    eventsApi.update(eventId, { assignedStaff }).catch(() => {});
  }, []);

  // VR twin of updateStaffDesk. Both write the legacy scalars on the Staff
  // document; the live model is the per-day vrShifts array.
  const updateStaffVr = useCallback((staffId, vrStart, vrEnd) => {
    setStaff(prev =>
      prev.map(s => s.id === staffId ? { ...s, vrStart, vrEnd } : s)
    );
    staffApi.update(staffId, { vrStart, vrEnd }).catch(() => {});
  }, [setStaff]);

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
    // `availability` is the re-render signal (its identity changes when a fetch
    // lands); `getAvailability` is the stable reader. Memoized consumers need
    // both — see the comment where they're defined.
    availability,
    getAvailability,
    reloadAvailability: loadAvailability,
    currentDate,
    addEvent,
    updateEvent,
    removeEvent,
    assignStaffToEvent,
    unassignStaffFromEvent,
    updateStaffDesk,
    updateStaffVr,
    updateStaffMaxHours,
    addStaff,
    removeStaff,
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
