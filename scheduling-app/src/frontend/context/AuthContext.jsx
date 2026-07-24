import { createContext, useContext, useState, useEffect } from 'react';
import { initialStaff } from '../../data/mockData';
import { staffApi } from '../utils/api';

const AuthContext = createContext(null);

const MANAGER_USERNAME = 'manager';
const MANAGER_PASSWORD = 'catalyst123';
const EMPLOYEE_PASSWORD = 'staff123';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Live staff roster used for employee login (dropdown + validation). Starts
  // from the bundled mock list so login still works if the backend is down,
  // then swaps in the real roster from the API — so staff added/removed via
  // Manage Staff are reflected at login instead of the frozen mock list.
  const [staffRoster, setStaffRoster] = useState(initialStaff);

  useEffect(() => {
    staffApi.getAll()
      .then(data => { if (Array.isArray(data) && data.length) setStaffRoster(data); })
      .catch(() => { /* backend unreachable — keep the mock roster */ });
  }, []);

  function loginAsManager(username, password) {
    if (username === MANAGER_USERNAME && password === MANAGER_PASSWORD) {
      setUser({ name: 'Manager', role: 'manager' });
      return true;
    }
    return false;
  }

  function loginAsEmployee(staffId, password) {
    if (password !== EMPLOYEE_PASSWORD) return false;
    const staff = staffRoster.find(s => s.id === staffId);
    if (!staff) return false;
    setUser({ name: staff.name, role: 'employee', staffId });
    return true;
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, staffRoster, loginAsManager, loginAsEmployee, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
