import { createContext, useContext, useState } from 'react';
import { initialStaff } from '../../data/mockData';

const AuthContext = createContext(null);

const MANAGER_USERNAME = 'manager';
const MANAGER_PASSWORD = 'catalyst123';
const EMPLOYEE_PASSWORD = 'staff123';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  function loginAsManager(username, password) {
    if (username === MANAGER_USERNAME && password === MANAGER_PASSWORD) {
      setUser({ name: 'Manager', role: 'manager' });
      return true;
    }
    return false;
  }

  function loginAsEmployee(staffId, password) {
    if (password !== EMPLOYEE_PASSWORD) return false;
    const staff = initialStaff.find(s => s.id === staffId);
    if (!staff) return false;
    setUser({ name: staff.name, role: 'employee', staffId });
    return true;
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loginAsManager, loginAsEmployee, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
