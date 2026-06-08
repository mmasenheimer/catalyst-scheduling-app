import { createContext, useContext } from 'react';
import { useSchedule } from '../hooks/useSchedule';

const ScheduleContext = createContext(null);

export function ScheduleProvider({ children }) {
  const schedule = useSchedule();
  return (
    <ScheduleContext.Provider value={schedule}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useScheduleContext() {
  return useContext(ScheduleContext);
}
