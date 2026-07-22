import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialStaff } from '../../data/mockData';
import arizonaCampus from '../assets/arizonacampus.jpg';

export default function LoginPage() {
  const { loginAsManager, loginAsEmployee } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('manager');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [error, setError] = useState('');

  function handleManagerLogin(e) {
    e.preventDefault();
    setError('');
    if (loginAsManager(username, password)) {
      navigate('/');
    } else {
      setError('Invalid username or password.');
    }
  }

  function handleEmployeeLogin(e) {
    e.preventDefault();
    setError('');
    if (!selectedStaff) {
      setError('Please select your name.');
      return;
    }
    if (loginAsEmployee(Number(selectedStaff), password)) {
      navigate('/my-schedule');
    } else {
      setError('Invalid password.');
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

        {/* Role tabs */}
        <div
          className="flex rounded-lg p-1 mb-6"
          style={{ background: 'var(--color-bg)' }}
        >
          {[
            { key: 'manager', label: 'Manager' },
            { key: 'employee', label: 'Employee' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError(''); }}
              className="flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
              style={{
                background: tab === key ? 'var(--color-accent)' : 'transparent',
                color: tab === key ? 'white' : 'var(--color-text-dim)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'manager' && (
          <form onSubmit={handleManagerLogin} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="manager"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              />
            </div>
            {error && (
              <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
            )}
            <button
              type="submit"
              className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Login as Manager
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>
              Demo — username: <strong style={{ color: 'var(--color-text)' }}>manager</strong>
              {' '}/ password: <strong style={{ color: 'var(--color-text)' }}>catalyst123</strong>
            </p>
          </form>
        )}

        {tab === 'employee' && (
          <form onSubmit={handleEmployeeLogin} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Select Your Name
              </label>
              <select
                value={selectedStaff}
                onChange={e => setSelectedStaff(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              >
                <option value="">-- Select your name --</option>
                {initialStaff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-sm mb-1.5"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={inputStyle}
              />
            </div>
            {error && (
              <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
            )}
            <button
              type="submit"
              className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Login as Employee
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>
              Demo — password for all staff: <strong style={{ color: 'var(--color-text)' }}>staff123</strong>
            </p>
          </form>
        )}

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
