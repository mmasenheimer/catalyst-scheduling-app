import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import arizonaCampus from '../assets/arizonacampus.jpg';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(email, password);
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
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@catalyst.dev"
              autoComplete="username"
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

          <button
            type="submit"
            disabled={submitting}
            className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-accent)', color: 'white', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Dev seed credentials — these come from seed.js, not from any bypass
            in the auth code. Remove this block once real accounts exist. */}
        <div
          className="mt-6 p-3 rounded-lg text-xs leading-relaxed"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text-dim)' }}
        >
          <div className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Dev accounts</div>
          <div>
            Manager: <strong style={{ color: 'var(--color-text)' }}>manager@catalyst.dev</strong>
            {' / '}<strong style={{ color: 'var(--color-text)' }}>catalyst123</strong>
          </div>
          <div className="mt-0.5">
            Staff: <strong style={{ color: 'var(--color-text)' }}>firstname.l@catalyst.dev</strong>
            {' / '}<strong style={{ color: 'var(--color-text)' }}>staff123</strong>
          </div>
          <div className="mt-0.5 opacity-80">e.g. alex.c@catalyst.dev, michael.m@catalyst.dev</div>
        </div>

        <div className="mt-5 text-center">
          <Link
            to="/forgot-password"
            className="text-xs"
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
