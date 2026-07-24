import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, managerOnly = false }) {
  const { user, loading } = useAuth();
  // Still restoring a stored session — don't bounce to /login prematurely.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (managerOnly && user.role !== 'manager') return <Navigate to="/my-schedule" replace />;
  return children;
}
