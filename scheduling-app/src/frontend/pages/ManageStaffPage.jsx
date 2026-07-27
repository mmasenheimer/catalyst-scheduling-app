import { useState } from 'react';
import { useScheduleContext } from '../context/ScheduleContext';
import { studioHours } from '../../data/mockData';
import { authApi } from '../utils/api';

const emptyForm = { name: '', username: '', maxHoursPerWeek: '' };

// 'Jamie T.' → jamie.t  (suggested default username)
function suggestUsername(name) {
  return name.toLowerCase().replace(/\./g, '').trim().replace(/\s+/g, '.');
}

export default function ManageStaffPage() {
  const { staff, addStaff, removeStaff, updateStaffMaxHours } = useScheduleContext();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  // Set after adding an employee → shows their username + one-time temp password.
  // Errors from the per-row actions (reset / remove), shown inline above the
  // list rather than in a browser alert.
  const [actionError, setActionError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  function openForm() { setForm(emptyForm); setError(''); setFormOpen(true); }
  function closeForm() { setFormOpen(false); }

  async function handleAdd() {
    const name = form.name.trim();
    // Default the username from the name if the manager left it blank.
    const username = (form.username.trim() || suggestUsername(name)).toLowerCase();
    if (!name) { setError('Name is required.'); return; }
    if (staff.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setError('A staff member with this name already exists.'); return;
    }
    if (!username || /\s/.test(username)) {
      setError('A username is required (no spaces) — it becomes their login.'); return;
    }
    const maxHoursPerWeek = parseFloat(form.maxHoursPerWeek);
    if (form.maxHoursPerWeek === '' || Number.isNaN(maxHoursPerWeek) || maxHoursPerWeek <= 0) {
      setError('Max hours per week is required.'); return;
    }
    setSaving(true);
    try {
      const created = await addStaff({
        name,
        shiftStart: studioHours.open,
        shiftEnd: studioHours.close,
        maxHoursPerWeek,
      });
      // Create their login account and get the one-time temp password to hand off.
      const account = await authApi.provision({ username, name, staffId: created.id, role: 'employee' });
      setFormOpen(false);
      setCopied(false);
      setInviteResult({ name, username: account.username, tempPassword: account.tempPassword });
    } catch (err) {
      setError(err.message || 'Failed to add staff member.');
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(`Username: ${inviteResult.username}\nTemporary password: ${inviteResult.tempPassword}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the values are visible to read off anyway */ }
  }

  async function handleReset(person) {
    setResettingId(person.id);
    setActionError('');
    try {
      const account = await authApi.resetPassword(person.id);
      setCopied(false);
      setInviteResult({ name: person.name, username: account.username, tempPassword: account.tempPassword });
    } catch (err) {
      setActionError(`Couldn't reset ${person.name}'s password — ${err.message}`);
    } finally {
      setResettingId(null);
    }
  }

  async function handleRemove(person) {
    setRemovingId(person.id);
    setActionError('');
    try {
      await removeStaff(person.id);
    } catch (err) {
      // Previously this failed silently — the row just stayed put with no
      // indication anything had gone wrong.
      setActionError(`Couldn't remove ${person.name} — ${err.message}`);
    } finally {
      setRemovingId(null);
    }
  }

  function startEdit(person) {
    setEditingId(person.id);
    setEditValue(person.maxHoursPerWeek != null ? String(person.maxHoursPerWeek) : '');
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  function saveEdit(person) {
    const maxHoursPerWeek = parseFloat(editValue);
    if (editValue === '' || Number.isNaN(maxHoursPerWeek) || maxHoursPerWeek <= 0) {
      setEditError('Enter a valid number of hours.'); return;
    }
    updateStaffMaxHours(person.id, maxHoursPerWeek);
    setEditingId(null);
    setEditError('');
  }

  const fieldLabel = { display: 'block', fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 };
  const textInput = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
    background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Manage Staff</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Add new employees to the roster or remove ones who no longer work here
          </p>
        </div>
        <button
          onClick={openForm}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-85 transition-opacity"
          style={{ background: 'var(--color-accent)', color: 'white', border: 'none' }}
        >
          + Add Employee
        </button>
      </div>

      {actionError && (
        <div
          className="mb-3 px-4 py-3 rounded-lg border text-sm flex items-start justify-between gap-3"
          style={{ background: 'rgba(200,64,64,0.12)', borderColor: 'var(--color-red)', color: '#f07070' }}
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError('')}
            className="cursor-pointer shrink-0"
            style={{ background: 'none', border: 'none', color: '#f07070', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Staff list */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        {staff.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-dim)' }}>
            No staff on the roster yet.
          </div>
        ) : (
          staff.map((person, i) => {
            const isEditing = editingId === person.id;
            return (
              <div
                key={person.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ borderBottom: i < staff.length - 1 ? '1px solid var(--color-border)' : 'none' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>
                    {person.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{person.name}</div>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          autoFocus
                          className="no-spinner"
                          type="number"
                          value={editValue}
                          onChange={e => { setEditValue(e.target.value); setEditError(''); }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(person); if (e.key === 'Escape') cancelEdit(); }}
                          style={{ ...textInput, width: 70, padding: '3px 6px', fontSize: 12 }}
                        />
                        <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>h/week</span>
                        <button onClick={() => saveEdit(person)} className="text-xs font-semibold cursor-pointer hover:opacity-80" style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: '2px 4px' }}>Save</button>
                        <button onClick={cancelEdit} className="text-xs cursor-pointer hover:opacity-80" style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', padding: '2px 4px' }}>Cancel</button>
                        {editError && <span className="text-xs" style={{ color: 'var(--color-red)' }}>{editError}</span>}
                      </div>
                    ) : (
                      <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-dim)' }}>
                        <span>up to {person.maxHoursPerWeek ?? '—'}h/week</span>
                        <button
                          onClick={() => startEdit(person)}
                          className="cursor-pointer hover:opacity-80"
                          style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 600 }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReset(person)}
                    disabled={resettingId === person.id}
                    title="Generate a new temporary password for this employee"
                    className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ background: 'transparent', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)', opacity: resettingId === person.id ? 0.5 : 1 }}
                  >
                    {resettingId === person.id ? 'Resetting…' : 'Reset Password'}
                  </button>
                  <button
                    onClick={() => handleRemove(person)}
                    disabled={removingId === person.id}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ background: 'transparent', color: 'var(--color-red)', border: '1px solid var(--color-red)', opacity: removingId === person.id ? 0.5 : 1 }}
                  >
                    {removingId === person.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add employee modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={closeForm}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-xl border p-5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Add Employee</h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label style={fieldLabel}>Name</label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="e.g. Jamie T."
                  style={textInput}
                />
              </div>
              <div>
                <label style={fieldLabel}>Username <span style={{ color: 'var(--color-text-dim)' }}>— becomes their login</span></label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder={form.name ? suggestUsername(form.name) : 'e.g. jamie.t'}
                  autoCapitalize="none"
                  style={textInput}
                />
              </div>
              <div>
                <label style={fieldLabel}>Max Hours / Week</label>
                <input className="no-spinner" type="number" value={form.maxHoursPerWeek} onChange={e => { setForm(f => ({ ...f, maxHoursPerWeek: e.target.value })); setError(''); }} style={textInput} />
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--color-red)' }}>{error}</div>}
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={closeForm} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login credentials — shown once after adding an employee */}
      {inviteResult && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setInviteResult(null)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-xl border p-5"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              {inviteResult.name} is on the roster
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-dim)' }}>
              Give them these login details. On first sign-in they'll be asked to
              set their own password (this temporary one won't work after that).
            </p>

            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Username</div>
            <div
              className="mb-3 px-3 py-2 rounded-lg border"
              style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                {inviteResult.username}
              </span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>Temporary password</div>
            <div
              className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-lg border"
              style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-text)' }}>
                {inviteResult.tempPassword}
              </span>
              <button
                onClick={copyCode}
                className="cursor-pointer hover:opacity-80"
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'var(--color-accent)', color: 'white', border: 'none' }}
              >
                {copied ? 'Copied' : 'Copy both'}
              </button>
            </div>

            <div className="text-xs mb-4" style={{ color: 'var(--color-text-dim)' }}>
              This temporary password is shown only once. If it's lost, re-add the
              employee to generate a new one.
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setInviteResult(null)}
                style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
