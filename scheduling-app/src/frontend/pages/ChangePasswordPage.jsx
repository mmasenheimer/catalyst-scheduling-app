import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import arizonaCampus from '../assets/arizonacampus.jpg';

const inputStyle = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordPage() {
  const { user, loading, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only reachable while authenticated.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // First-login accounts are required to set a password; anyone else landing
  // here is doing a voluntary change.
  const forced = user.mustChangePassword;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await changePassword(password);
      navigate(updated.role === 'manager' ? '/' : '/my-schedule');
    } catch (err) {
      setError(err.message || 'Could not update your password. Please try again.');
      setSubmitting(false);
    }
  }

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
        <div className="mb-7">
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
            {forced ? 'Set your password' : 'Change your password'}
          </h2>
          <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
            {forced
              ? `Welcome, ${user.name}. Choose your own password to finish setting up your account — you won't need the temporary one again.`
              : 'Choose a new password for your account.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-accent)', color: 'white', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Saving…' : 'Save Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-xs cursor-pointer"
            style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
            onMouseEnter={e => e.target.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--color-text-dim)'}
          >
            ← Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
