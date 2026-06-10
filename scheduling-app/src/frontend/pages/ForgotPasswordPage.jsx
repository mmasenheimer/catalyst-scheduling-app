import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const inputStyle = {
  background: 'var(--color-bg)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSubmitted(true);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="w-full max-w-md p-8 rounded-2xl border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        {submitted ? (
          <div className="text-center py-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-5 mx-auto"
              style={{ border: '2px solid var(--color-accent)', color: 'var(--color-accent-bright)' }}
            >
              ✓
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
              Check your email
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
              If an account exists for <span style={{ color: 'var(--color-text)' }}>{email}</span>,
              a password reset link has been sent.
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-dim)' }}>
              Didn't receive it? Check your spam folder or try again.
            </p>
            <button
              onClick={() => setSubmitted(false)}
              className="mt-5 text-xs cursor-pointer underline underline-offset-2"
              style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none' }}
            >
              Try a different email
            </button>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Reset your password
              </h2>
              <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-dim)' }}>
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  className="block text-sm mb-1.5"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>
              )}

              <button
                type="submit"
                className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Send reset link
              </button>
            </form>
          </>
        )}

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
