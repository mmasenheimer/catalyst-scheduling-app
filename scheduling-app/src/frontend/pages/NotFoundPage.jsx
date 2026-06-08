import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  function handleBack() {
    if (!user) navigate('/login', { replace: true });
    else if (user.role === 'manager') navigate('/', { replace: true });
    else navigate('/my-schedule', { replace: true });
  }

  const backLabel = !user
    ? 'Back to Login'
    : user.role === 'manager'
    ? 'Back to Schedule'
    : 'Back to My Schedule';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="text-center max-w-sm">
        <div
          className="font-bold leading-none mb-6 select-none"
          style={{ fontSize: 96, color: 'var(--color-accent)', opacity: 0.5 }}
        >
          404
        </div>

        <h1 className="text-2xl font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          Page not found
        </h1>

        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--color-text-dim)' }}>
          The page you're looking for doesn't exist or was moved.
        </p>

        <button
          onClick={handleBack}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}
