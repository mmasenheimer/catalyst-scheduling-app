import { useNavigate } from 'react-router-dom';
import arizonaCampus from '../assets/arizonacampus.jpg';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-bg)', position: 'relative', overflow: 'hidden' }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${arizonaCampus})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.15,
          zIndex: 0,
        }}
      />

      <div
        className="w-full max-w-md p-8 rounded-2xl border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', position: 'relative', zIndex: 1 }}
      >
        <div className="mb-2">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Forgot your password?
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
          Ask your manager to reset it. They'll generate a new temporary password
          for you from the Manage Staff page — sign in with it, and you'll be asked
          to choose a new password of your own.
        </p>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="text-xs cursor-pointer"
            style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
            onMouseEnter={e => e.target.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--color-text-dim)'}
          >
            ← Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
