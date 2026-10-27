import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../utils/api';
import { RippleButton } from './RippleButton';

// 'Jamie T.' → jamie.t  (suggested default username)
function suggestUsername(name) {
  return name.toLowerCase().replace(/\./g, '').trim().replace(/\s+/g, '.');
}

/**
 * The owner's view of the manager accounts: add one, reset one's password, or
 * remove one. Rendered on Manage Staff only for the owner — the backend refuses
 * these calls from anyone else, so this is the UI half, not the guard.
 *
 * Temporary passwords are handed up through `onCredentials` so they show in the
 * same one-time login-details dialog the employee flow uses.
 */
export function ManagersPanel({ onCredentials }) {
  const [managers, setManagers] = useState(null);   // null = loading
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', username: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    authApi.listManagers()
      .then(rows => { setManagers(rows ?? []); setLoadError(''); })
      .catch(err => { setManagers([]); setLoadError(err.message || 'Could not load managers.'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    const name = form.name.trim();
    const username = (form.username.trim() || suggestUsername(name)).toLowerCase();
    if (!name) { setFormError('Name is required.'); return; }
    if (!username || /\s/.test(username)) {
      setFormError('A username is required (no spaces) — it becomes their login.'); return;
    }
    setSaving(true);
    try {
      const account = await authApi.provision({ username, name, role: 'manager' });
      setFormOpen(false);
      onCredentials({ title: `${name} is now a manager`, username: account.username, tempPassword: account.tempPassword });
      load();
    } catch (err) {
      setFormError(err.message || 'Failed to add manager.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(m) {
    setBusyId(m.id);
    setActionError('');
    try {
      const account = await authApi.resetManagerPassword(m.username);
      onCredentials({ title: `New password for ${m.name}`, username: account.username, tempPassword: account.tempPassword });
      load();
    } catch (err) {
      setActionError(`Couldn't reset ${m.name}'s password — ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(m) {
    setBusyId(m.id);
    setActionError('');
    try {
      await authApi.removeManager(m.id);
      setManagers(prev => prev.filter(x => x.id !== m.id));
    } catch (err) {
      setActionError(`Couldn't remove ${m.name} — ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const fieldLabel = { display: 'block', fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 };
  const textInput = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
    background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-md mb-3 border glass-surface"
        style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Managers</h2>
        <RippleButton
          onClick={() => { setForm({ name: '', username: '' }); setFormError(''); setFormOpen(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + Add Manager
        </RippleButton>
      </div>

      {(actionError || loadError) && (
        <div className="mb-3 px-4 py-3 rounded-lg border text-sm"
          style={{ background: 'rgba(200,64,64,0.12)', borderColor: 'var(--color-red)', color: '#f07070' }}>
          {actionError || loadError}
        </div>
      )}

      <div className="rounded-md border overflow-hidden glass-surface" style={{ borderColor: 'var(--color-border)' }}>
        {managers === null ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-dim)' }}>Loading…</div>
        ) : managers.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: i < managers.length - 1 ? '1px solid var(--color-border)' : 'none' }}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                {m.name}
                {m.owner && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--color-accent)', color: 'white', fontSize: 10 }}>
                    Owner
                  </span>
                )}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                {m.username}
                {m.mustChangePassword && <span style={{ opacity: 0.7 }}> · hasn't signed in yet</span>}
              </div>
            </div>
            {!m.owner && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleReset(m)}
                  disabled={busyId === m.id}
                  title="Generate a new temporary password for this manager"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ background: 'transparent', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)', opacity: busyId === m.id ? 0.5 : 1 }}
                >
                  Reset Password
                </button>
                <button
                  onClick={() => handleRemove(m)}
                  disabled={busyId === m.id}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ background: 'transparent', color: 'var(--color-red)', border: '1px solid var(--color-red)', opacity: busyId === m.id ? 0.5 : 1 }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-sm mx-4 rounded-xl border p-5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Add Manager</h3>
              <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label style={fieldLabel}>Name</label>
                <input autoFocus type="text" value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="e.g. Jamie T." style={textInput} />
              </div>
              <div>
                <label style={fieldLabel}>Username <span style={{ color: 'var(--color-text-dim)' }}>— becomes their login</span></label>
                <input type="text" value={form.username}
                  onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setFormError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder={form.name ? suggestUsername(form.name) : 'e.g. jamie.t'}
                  autoCapitalize="none" style={textInput} />
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
                Managers can do everything you can except manage other managers.
              </p>
              {formError && <div style={{ fontSize: 12, color: 'var(--color-red)' }}>{formError}</div>}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setFormOpen(false)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <RippleButton onClick={handleAdd} disabled={saving}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : 'Add Manager'}
              </RippleButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
