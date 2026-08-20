import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import arizonaCampus from '../assets/arizonacampus.jpg';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(username, password);
      // A just-provisioned account must set its own password first.
      if (user.mustChangePassword) {
        navigate('/change-password');
        return;
      }
      navigate(user.role === 'manager' ? '/' : '/my-schedule');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
      setSubmitting(false);
    }
  }

  const inputStyle = {
    background: 'var(--color-bg)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text)',
  };

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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
            CATalyst Studios
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Team Management System
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. alex.c"
              autoComplete="username"
              autoCapitalize="none"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-dim)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={inputStyle}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
          )}

          {/* ripple-btn (see index.css): the overlays are absolutely positioned
              siblings, so the text needs its own element to sit above them. */}
          <button
            type="submit"
            disabled={submitting}
            className="ripple-btn py-2.5 rounded-lg text-sm font-semibold"
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            <span className="ripple-transition" />
            <span className="ripple-gradient" />
            <span className="ripple-label">
              {submitting ? 'Signing in…' : 'Sign In'}
            </span>
          </button>
        </form>

        {/* Dev seed credentials — these come from seed.js, not from any bypass
            in the auth code.

            Shown automatically in local development, and on a deployment only
            when VITE_SHOW_DEMO_CREDENTIALS is explicitly set at build time.
            That flag exists for the managers' sandbox, where the whole point is
            that anyone can sign in and poke around against throwaway data.

            It has to be opt-in rather than opt-out: printing working
            credentials on a login page hands the studio's schedule to anyone
            who finds the URL, so the real deployment must not be able to grow
            this block by accident. Leave the variable unset there and Vite
            drops the entire block from the bundle. */}
        {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true') && (
          <div
            className="mt-6 p-3 rounded-lg text-xs leading-relaxed"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-dim)' }}
          >
            <div className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Dev accounts</div>
            <div>
              Manager: <strong style={{ color: 'var(--color-text)' }}>manager</strong>
              {' / '}<strong style={{ color: 'var(--color-text)' }}>catalyst123</strong>
            </div>
            <div className="mt-0.5">
              Staff: <strong style={{ color: 'var(--color-text)' }}>firstname.l</strong>
              {' / '}<strong style={{ color: 'var(--color-text)' }}>staff123</strong>
            </div>
            <div className="mt-0.5 opacity-80">e.g. alex.c, michael.m</div>
          </div>
        )}

        <div className="mt-5 text-center text-xs">
          <Link
            to="/forgot-password"
            style={{ color: 'var(--color-text-dim)', textDecoration: 'none' }}
            onMouseEnter={e => e.target.style.color = 'var(--color-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--color-text-dim)'}
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
