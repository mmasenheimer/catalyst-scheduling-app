import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, managerOnly = false, employeeOnly = false }) {
  const { user, loading } = useAuth();
  // Still restoring a stored session — don't bounce to /login prematurely.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // A freshly-provisioned account can't use the app until it sets its own
  // password. Everything is gated behind the change-password screen.
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (managerOnly && user.role !== 'manager') return <Navigate to="/my-schedule" replace />;
  // Pages built around "my shifts" can't work for a manager — they have no
  // staffId, so the page would render empty with no explanation.
  if (employeeOnly && user.staffId == null) return <Navigate to="/" replace />;
  return children;
}
