import { useState, useEffect, useMemo } from 'react';
import { availabilityApi } from '../utils/api';
import { generateWeeklyTemplate, summarizeGaps, TEMPLATE_DAYS } from '../utils/generateTemplate';
import { formatTime, WEEK_DAY_NAMES } from '../utils/scheduleUtils';
import mockAvailability from '../../data/mockAvailability';

/**
 * Builds a weekly template from submitted availability and shows what it came
 * up with before anything is saved — coverage, hours per person, and any
 * problems. Auto-generating straight into a saved template would give the
 * manager no chance to sanity-check the result.
 */
export function GenerateTemplateModal({ staff, onCreate, onClose }) {
  const [availability, setAvailability] = useState(null);   // null = still loading
  const [usedFallback, setUsedFallback] = useState(false);
  const [name, setName] = useState('Generated from Availability');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Real submissions win; anyone who hasn't submitted falls back to the sample
  // availability so the generator still has something to work with in dev.
  useEffect(() => {
    let cancelled = false;
    availabilityApi.getAll()
      .then(rows => {
        if (cancelled) return;
        const byStaff = {};
        (rows ?? []).forEach(r => { if (r?.staffId != null) byStaff[r.staffId] = r.days ?? {}; });
        let fellBack = false;
        staff.forEach(s => {
          const submitted = byStaff[s.id];
          const hasAny = submitted && Object.values(submitted).some(w => w?.length);
          if (!hasAny && mockAvailability[s.id]) { byStaff[s.id] = mockAvailability[s.id]; fellBack = true; }
        });
        setUsedFallback(fellBack);
        setAvailability(byStaff);
      })
      .catch(() => { if (!cancelled) { setUsedFallback(true); setAvailability(mockAvailability); } });
    return () => { cancelled = true; };
  }, [staff]);

  // padding defaults to 1 in the generator — one extra person above the
  // minimum at all times.
  const result = useMemo(
    () => (availability ? generateWeeklyTemplate({ staff, availabilityByStaff: availability }) : null),
    [availability, staff],
  );

  async function handleCreate() {
    if (!result) return;
    setError('');
    setSaving(true);
    try {
      await onCreate({
        name: name.trim() || 'Generated from Availability',
        // Every weekday, not just the ones the generator schedules — see
        // WEEK_DAY_NAMES for why Saturday is recorded despite being closed.
        days: Object.fromEntries(WEEK_DAY_NAMES.map(name => [name, { staff: result.days[name] ?? [] }])),
      });
    } catch (err) {
      setError(err.message || 'Could not create the template.');
      setSaving(false);
    }
  }

  const gapLines = result ? summarizeGaps(result.gaps) : [];
  const scheduled = result ? result.stats.filter(s => s.hours > 0) : [];
  const totalHours = scheduled.reduce((sum, s) => sum + s.hours, 0);
  const totalShifts = result
    ? TEMPLATE_DAYS.reduce((n, d) => n + (result.days[d.name] ?? []).reduce((m, p) => m + p.shifts.length, 0), 0)
    : 0;

  const card = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px' };
  const label = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-dim)' };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border flex flex-col"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Generate Template from Availability</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
              Builds shifts that meet the minimum staffing targets using only submitted availability.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          {!result ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--color-text-dim)' }}>Reading availability…</p>
          ) : (
            <>
              {/* Headline numbers */}
              <div className="grid grid-cols-4 gap-2">
                <div style={card}>
                  <div style={label}>Coverage</div>
                  <div className="text-lg font-bold" style={{ color: gapLines.length ? 'var(--color-red)' : 'var(--color-green)' }}>
                    {gapLines.length ? `${gapLines.length} gap${gapLines.length > 1 ? 's' : ''}` : 'Complete'}
                  </div>
                </div>
                <div style={card}>
                  <div style={label}>Shifts</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{totalShifts}</div>
                </div>
                <div style={card}>
                  <div style={label}>Total Hours</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{Math.round(totalHours)}</div>
                </div>
                <div style={card}>
                  <div style={label}>Staff Used</div>
                  <div className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{scheduled.length}/{staff.length}</div>
                </div>
              </div>

              {gapLines.length > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(200,64,64,0.12)', border: '1px solid var(--color-red)', color: '#f07070' }}>
                  <strong>Not enough availability to fully cover:</strong>
                  <ul className="mt-1 ml-4 list-disc">{gapLines.slice(0, 6).map(g => <li key={g}>{g}</li>)}</ul>
                  {gapLines.length > 6 && <div className="mt-1">…and {gapLines.length - 6} more.</div>}
                </div>
              )}

              {(result.warnings.length > 0 || usedFallback) && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(176,126,40,0.12)', border: '1px solid var(--color-yellow)', color: 'var(--color-yellow)' }}>
                  <ul className="ml-4 list-disc">
                    {usedFallback && <li>Some staff had no availability on file — sample availability was used for them.</li>}
                    {result.warnings.map(w => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Per-day breakdown */}
              <div>
                <div style={label} className="mb-1.5">Proposed schedule</div>
                <div className="flex flex-col gap-2">
                  {TEMPLATE_DAYS.map(({ name: day }) => {
                    const people = result.days[day] ?? [];
                    return (
                      <div key={day} style={card}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{day}</span>
                          <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
                            {people.length} staff · {people.reduce((n, p) => n + p.shifts.length, 0)} shifts
                            {' · '}
                            {people.reduce((n, p) => n + (p.deskShifts?.length ?? 0), 0)} desk
                            {', '}
                            {people.reduce((n, p) => n + (p.vrShifts?.length ?? 0), 0)} VR
                          </span>
                        </div>
                        {people.length === 0
                          ? <div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>No staffing required.</div>
                          : (
                            <div className="flex flex-col gap-0.5">
                              {people.map(p => (
                                <div key={p.id} className="flex justify-between text-xs gap-3">
                                  <span style={{ color: 'var(--color-text)' }}>{p.name}</span>
                                  <span className="text-right" style={{ color: 'var(--color-accent-bright)' }}>
                                    {p.shifts.map(s => `${formatTime(s.start)}–${formatTime(s.end)}`).join(', ')}
                                    {p.vrShifts?.length > 0 && (
                                      <>
                                        {' · VR '}
                                        {p.vrShifts.map(v => `${formatTime(v.start)}–${formatTime(v.end)}`).join(', ')}
                                      </>
                                    )}
                                    {p.deskShifts?.length > 0 && (
                                      <span style={{ color: 'var(--color-yellow)' }}>
                                        {' · desk '}
                                        {p.deskShifts.map(d => `${formatTime(d.start)}–${formatTime(d.end)}`).join(', ')}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hours per person, so an unfair split is visible before saving */}
              <div>
                <div style={label} className="mb-1.5">Weekly hours per person</div>
                <div style={card} className="flex flex-col gap-0.5">
                  {result.stats.map(s => (
                    <div key={s.id} className="flex justify-between text-xs gap-3">
                      <span style={{ color: s.hours === 0 ? 'var(--color-text-dim)' : 'var(--color-text)' }}>{s.name}</span>
                      <span style={{ color: s.cap != null && s.hours >= s.cap ? 'var(--color-yellow)' : 'var(--color-text-dim)' }}>
                        {s.hours}h{s.cap != null && ` / ${s.cap}h cap`}
                        {s.desk > 0 && ` · ${s.desk}h desk`}
                        {s.vr > 0 && ` · ${s.vr}h VR`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={label} className="block mb-1">Template name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>

              {error && <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>}
            </>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!result || saving}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none', opacity: !result || saving ? 0.6 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
