import { useState, useEffect, useRef, useMemo } from 'react';
import { HOURS_START, HOURS_END } from '../../data/mockData';
import { getAvailability } from '../../data/mockAvailability';
import { buildTemplateAlerts, formatTime } from '../utils/scheduleUtils';
import { useTemplates } from '../context/TemplatesContext';
import { useScheduleContext } from '../context/ScheduleContext';

const TOTAL_HOURS = HOURS_END - HOURS_START;

const TEMPLATE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sunday'];
const DAY_DOW = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Sunday: 0 };
const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Sunday: 'Sun' };

function snapHalf(h)      { return Math.round(h * 2) / 2; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function normalizeStaff(s) {
  const shifts = s.shifts ?? (s.scheduled && s.shiftStart != null
    ? [{ id: `s${s.id}-0`, start: s.shiftStart, end: s.shiftEnd }]
    : []);
  const deskShifts = s.deskShifts ?? (s.scheduled && s.deskStart != null
    ? [{ id: `d${s.id}-0`, start: s.deskStart, end: s.deskEnd }]
    : []);
  return {
    ...s,
    shifts,
    deskShifts,
    scheduled: shifts.length > 0,
    shiftStart: s.shiftStart ?? shifts[0]?.start,
    shiftEnd:   s.shiftEnd   ?? shifts[0]?.end,
    deskStart:  s.deskStart  ?? deskShifts[0]?.start ?? null,
    deskEnd:    s.deskEnd    ?? deskShifts[0]?.end   ?? null,
  };
}

function firstFreeSlot(bars, duration, from = HOURS_START, to = HOURS_END, avoid = []) {
  let start = from;
  while (start + duration <= to) {
    if (!bars.some(b => start < b.end && start + duration > b.start) &&
        !avoid.some(b => start < b.end && start + duration > b.start)) return start;
    start = snapHalf(start + 0.5);
  }
  return null;
}

// ── Alerts bar ─────────────────────────────────────────────────────────────────

function AlertsBar({ staff }) {
  const alerts   = buildTemplateAlerts(staff);
  const dotColor = { red: 'var(--color-red)', yellow: 'var(--color-yellow)', blue: 'var(--color-accent-bright)' };
  return (
    <div className="p-3 rounded-xl mb-5 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', minHeight: 72 }}>
      <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-yellow)' }}>Alerts</h3>
      {alerts.map((a, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-sm" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[a.type] }} />
          {a.text}
        </div>
      ))}
    </div>
  );
}

function isShiftOutsideAvailability(start, end, blocks) {
  if (blocks.length === 0) return true;
  const availMin = Math.min(...blocks.map(b => b.start));
  const availMax = Math.max(...blocks.map(b => b.end));
  return start < availMin || end > availMax;
}

function AvailWarningModal({ staffName, onConfirm, onCancel }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl border p-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span style={{ fontSize: 22, lineHeight: 1.2 }}>⚠️</span>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Outside Availability</h3>
            <p className="text-sm mt-1.5 leading-snug" style={{ color: 'var(--color-text-dim)' }}>
              This shift falls outside <strong style={{ color: 'var(--color-text)' }}>{staffName}</strong>'s submitted availability for this day.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}
          >
            Schedule Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Drag chip (toolbar source) ─────────────────────────────────────────────────

function DragChip({ label, isActive, color, borderColor, bg, icon, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={label}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium select-none transition-all"
      style={{
        borderStyle: 'dashed',
        borderColor: isActive ? color : borderColor,
        color: isActive ? color : 'var(--color-text-dim)',
        background: isActive ? bg : 'transparent',
        cursor: 'grab',
        maxWidth: 160,
      }}
    >
      <span style={{ pointerEvents: 'none' }}>{icon}</span>
      <span className="truncate" style={{ pointerEvents: 'none' }}>{label}</span>
    </div>
  );
}

// ── Context menu ───────────────────────────────────────────────────────────────

function ContextMenu({ x, y, onEdit, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const menuStyle = {
    position: 'fixed', left: x, top: y, zIndex: 9999, minWidth: 140,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'hidden',
  };
  const btn = (color) => ({
    display: 'block', width: '100%', padding: '9px 16px', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 13, color: color || 'var(--color-text)',
  });

  return (
    <div ref={ref} style={menuStyle}>
      <button
        style={btn()}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={onEdit}
      >
        ✏️  Edit
      </button>
      <div style={{ height: 1, background: 'var(--color-border)' }} />
      <button
        style={btn('#f07070')}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,64,64,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={onDelete}
      >
        🗑  Delete
      </button>
    </div>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

const TIME_STEPS = Array.from({ length: (HOURS_END - HOURS_START) * 2 + 1 }, (_, i) => HOURS_START + i * 0.5);

function TimeSelect({ value, onChange, min, max }) {
  const opts = TIME_STEPS.filter(t => t >= (min ?? HOURS_START) && t <= (max ?? HOURS_END));
  return (
    <select
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{
        width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13,
        background: 'var(--color-muted)', border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      {opts.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
    </select>
  );
}

function EditModal({ target, orderedStaff, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (target.type === 'shift') {
      const shift = orderedStaff[target.staffIndex].shifts[target.shiftIndex];
      return { shiftStart: shift.start, shiftEnd: shift.end };
    }
    const desk = orderedStaff[target.staffIndex].deskShifts[target.deskIndex];
    return { deskStart: desk.start, deskEnd: desk.end };
  });

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = target.type === 'shift' ? 'Edit Shift' : 'Edit Desk Shift';
  const staffName = orderedStaff[target.staffIndex]?.name;

  const fieldLabel = { display: 'block', fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl border p-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{title}</h3>
            {staffName && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>{staffName}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div className="flex flex-col gap-3">
          {target.type === 'shift' && (
            <>
              <div>
                <label style={fieldLabel}>Shift Start</label>
                <TimeSelect value={form.shiftStart} onChange={v => setForm(f => ({ ...f, shiftStart: Math.min(v, f.shiftEnd - 0.5) }))} max={form.shiftEnd - 0.5} />
              </div>
              <div>
                <label style={fieldLabel}>Shift End</label>
                <TimeSelect value={form.shiftEnd} onChange={v => setForm(f => ({ ...f, shiftEnd: Math.max(v, f.shiftStart + 0.5) }))} min={form.shiftStart + 0.5} />
              </div>
            </>
          )}
          {target.type === 'desk' && (
            <>
              <div>
                <label style={fieldLabel}>Desk Start</label>
                <TimeSelect value={form.deskStart} onChange={v => setForm(f => ({ ...f, deskStart: Math.min(v, f.deskEnd - 0.5) }))} max={form.deskEnd - 0.5} />
              </div>
              <div>
                <label style={fieldLabel}>Desk End</label>
                <TimeSelect value={form.deskEnd} onChange={v => setForm(f => ({ ...f, deskEnd: Math.max(v, f.deskStart + 0.5) }))} min={form.deskStart + 0.5} />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template grid ──────────────────────────────────────────────────────────────

function TemplateGrid({
  staff, currentDow, poolDragId, onPoolDrop,
  onBarMouseDown, onDeskBarMouseDown, activeBar,
  activeDragType, hoverRow, onTimelineDragOver, onTimelineDrop,
  draggingBarInfo, onShiftBarDragStart, onDeskBarDragStart, onBarDragEnd,
  onBarDragOver, onBarDrop, onBarContextMenu,
  getPersonAvailability, previewInfo, onRemoveFromDay,
}) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  function posStyle(start, end) {
    const left  = ((start - HOURS_START) / TOTAL_HOURS) * 100;
    const width = ((end   - start)       / TOTAL_HOURS) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }

  const currentDragType = activeDragType ?? draggingBarInfo?.type;

  const toolbarHighlight = activeDragType === 'shift'
    ? { background: 'rgba(74,124,94,0.15)',  borderColor: 'var(--color-green)' }
    : { background: 'rgba(200,148,56,0.12)', borderColor: 'var(--color-yellow)' };

  return (
    <>
    <div className="rounded-xl border overflow-x-auto mb-4"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>

      {/* Time header */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-border)', minWidth: 972 }}>
        <div className="w-48 shrink-0 p-3 text-xs uppercase tracking-wide border-r"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}>Staff</div>
        <div className="flex-1 flex">
          {hours.map(h => (
            <div key={h} className="flex-1 p-2 text-xs text-center border-r last:border-r-0"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}>
              {formatTime(h)}
            </div>
          ))}
        </div>
      </div>

      {/* Staff rows */}
      {staff.length === 0 ? (
        <div
          onDragOver={e => { if (poolDragId) e.preventDefault(); }}
          onDrop={() => { if (poolDragId) onPoolDrop(poolDragId); }}
          style={{
            minWidth: 972, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160,
            background: poolDragId ? 'rgba(176,80,48,0.1)' : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          <span style={{ color: poolDragId ? 'var(--color-accent)' : 'var(--color-text-dim)', fontSize: 14, transition: 'color 0.15s' }}>
            {poolDragId ? '+ Drop to add to this day' : 'No staff added yet — drag from the pool above to get started'}
          </span>
        </div>
      ) : (
        staff.map((person, i) => (
          <div
            key={person.id}
            className="flex border-b"
            style={{
              borderColor: 'var(--color-border)',
              minWidth: 972,
              opacity: person.shifts.length > 0 ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Name column */}
            <div className="w-48 shrink-0 px-2 py-1.5 text-xs border-r flex items-center gap-1.5"
              style={{ borderColor: 'var(--color-border)' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>
                {person.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{person.name}</div>
                {person.shifts.length > 0 ? (
                  <div className="truncate mt-0.5" style={{ color: 'var(--color-text-dim)', fontSize: 10 }}>
                    {person.shifts.length === 1
                      ? `${formatTime(person.shifts[0].start)} – ${formatTime(person.shifts[0].end)}`
                      : `${person.shifts.length} shifts`}
                  </div>
                ) : (
                  <div className="mt-0.5" style={{ color: 'var(--color-muted)', fontSize: 10 }}>Unscheduled</div>
                )}
              </div>
              <button
                onClick={() => onRemoveFromDay(person.id)}
                title="Remove from this day"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-dim)', fontSize: 14, lineHeight: 1,
                  padding: '0 2px', flexShrink: 0,
                  transition: 'color 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#f07070'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-dim)'}
              >
                ×
              </button>
            </div>

            {/* Timeline */}
            <div
              className="flex-1 relative"
              data-timeline="true"
              style={{ height: 46 }}
              onDragOver={e => {
                const hasToolbar = !!activeDragType;
                const hasBar     = !!draggingBarInfo;
                const hasPool    = !!poolDragId;
                if (!hasToolbar && !hasBar && !hasPool) return;
                e.preventDefault();
                e.stopPropagation();
                if (hasToolbar) onTimelineDragOver(e, i);
                if (hasBar)     onBarDragOver(e, i);
              }}
              onDrop={e => {
                const hasToolbar = !!activeDragType;
                const hasBar     = !!draggingBarInfo;
                const hasPool    = !!poolDragId;
                if (!hasToolbar && !hasBar && !hasPool) return;
                e.preventDefault();
                e.stopPropagation();
                if (hasPool)    { onPoolDrop(poolDragId); return; }
                if (hasToolbar) onTimelineDrop(i);
                if (hasBar)     onBarDrop(e, i);
              }}
            >
              {/* Availability background */}
              {getPersonAvailability?.(person.id, currentDow).map((block, bi) => (
                <div
                  key={`avail-${bi}`}
                  style={{
                    position: 'absolute',
                    top: 0, bottom: 0,
                    ...posStyle(block.start, block.end),
                    background: 'rgba(96, 165, 250, 0.10)',
                    border: '1px solid rgba(96, 165, 250, 0.22)',
                    borderRadius: 4,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Toolbar-chip drop highlight */}
              {activeDragType && hoverRow === i && (
                <div className="absolute inset-0 pointer-events-none rounded-r-lg"
                  style={{ ...toolbarHighlight, border: '1px dashed', zIndex: 20 }} />
              )}

              {/* Placement preview ghost */}
              {previewInfo?.staffIndex === i && previewInfo.start !== null && (
                <div
                  className="absolute pointer-events-none rounded"
                  style={{
                    top: '50%', transform: 'translateY(-50%)', height: 28,
                    left:  `${((previewInfo.start - HOURS_START) / TOTAL_HOURS) * 100}%`,
                    width: `${((previewInfo.end - previewInfo.start) / TOTAL_HOURS) * 100}%`,
                    background: previewInfo.valid
                      ? (currentDragType === 'shift' ? 'rgba(74,124,94,0.35)' : 'rgba(200,148,56,0.35)')
                      : 'rgba(200,64,64,0.25)',
                    border: `2px dashed ${previewInfo.valid
                      ? (currentDragType === 'shift' ? 'var(--color-green)' : 'var(--color-yellow)')
                      : 'var(--color-red)'}`,
                    zIndex: 22,
                  }}
                />
              )}

              {/* Shift bars */}
              {person.shifts.map((shift, si) => {
                const isBarActive     = activeBar?.type === 'shift' && activeBar?.staffIndex === i && activeBar?.shiftIndex === si;
                const isShiftDragging = draggingBarInfo?.type === 'shift' && draggingBarInfo?.staffIndex === i && draggingBarInfo?.shiftIndex === si;
                return (
                  <div
                    key={shift.id}
                    draggable
                    className="absolute h-6 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(shift.start, shift.end),
                      top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--color-green)',
                      opacity: isShiftDragging ? 0.3 : (isBarActive ? 0.85 : 0.6),
                      cursor: 'grab',
                      boxShadow: isBarActive ? '0 0 0 2px var(--color-green)' : 'none',
                      transition: isBarActive || isShiftDragging ? 'none' : 'box-shadow 0.1s',
                      zIndex: isBarActive ? 10 : 1,
                    }}
                    onDragStart={e => { e.stopPropagation(); onShiftBarDragStart(e, i, si); }}
                    onDragEnd={onBarDragEnd}
                    onContextMenu={e => { e.preventDefault(); onBarContextMenu(e, { type: 'shift', staffIndex: i, shiftIndex: si }); }}
                  >
                    <div
                      style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, si, 'left'); }}
                    />
                    <div
                      style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, si, 'right'); }}
                    />
                  </div>
                );
              })}

              {/* Desk bars */}
              {person.deskShifts.map((desk, di) => {
                const isDeskActive   = activeBar?.type === 'desk' && activeBar?.staffIndex === i && activeBar?.deskIndex === di;
                const isDeskDragging = draggingBarInfo?.type === 'desk' && draggingBarInfo?.staffIndex === i && draggingBarInfo?.deskIndex === di;
                return (
                  <div
                    key={desk.id}
                    draggable
                    className="absolute h-6 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(desk.start, desk.end),
                      top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--color-yellow)',
                      opacity: isDeskDragging ? 0.3 : (isDeskActive ? 1 : 0.75),
                      cursor: 'grab',
                      boxShadow: isDeskActive ? '0 0 0 2px #e0b050' : 'none',
                      transition: isDeskActive || isDeskDragging ? 'none' : 'box-shadow 0.1s',
                      zIndex: isDeskActive ? 10 : 2,
                    }}
                    onDragStart={e => { e.stopPropagation(); onDeskBarDragStart(e, i, di); }}
                    onDragEnd={onBarDragEnd}
                    onContextMenu={e => { e.preventDefault(); onBarContextMenu(e, { type: 'desk', staffIndex: i, deskIndex: di }); }}
                  >
                    <div
                      style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, di, 'left'); }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: 10, paddingRight: 10 }}>
                      Desk
                    </span>
                    <div
                      style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, di, 'right'); }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

    </div>

    {/* Legend */}
    <div className="flex items-center gap-5 px-1 flex-wrap mb-4">
      {[
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-green)', opacity: 0.7 }} />, label: 'Shift' },
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-yellow)', opacity: 0.75 }} />, label: 'Desk' },
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'rgba(96,165,250,0.18)', border: '1px solid rgba(96,165,250,0.35)' }} />, label: 'Available' },
      ].map(({ swatch, label }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          {swatch}{label}
        </div>
      ))}
    </div>

    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WeeklyTemplatesPage() {
  const { templates, selectedId, setSelectedId, triggerNew, addTemplate, updateTemplate, removeTemplate } = useTemplates();
  const { staff } = useScheduleContext();
  const [templateName,  setTemplateName]  = useState('');
  const [templateDesc,  setTemplateDesc]  = useState('');
  const [nameError,     setNameError]     = useState('');
  const [justSaved,     setJustSaved]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [currentDay,    setCurrentDay]    = useState('Monday');
  const [orderedStaff,  setOrderedStaff]  = useState([]);
  const templateDaysRef    = useRef({});
  const savedFlashRef      = useRef(null);
  const lastTriggerRef     = useRef(triggerNew); // tracks the last-processed triggerNew to avoid firing on remount

  const [poolDragId,    setPoolDragId]    = useState(null);
  const [activeBar,     setActiveBar]     = useState(null);
  const [activeDragType, setActiveDragType] = useState(null);
  const [hoverRow,      setHoverRow]      = useState(null);
  const [draggingBarInfo, setDraggingBarInfo] = useState(null);
  const [contextMenu,   setContextMenu]   = useState(null);
  const [editModal,     setEditModal]     = useState(null);
  const [previewInfo,   setPreviewInfo]   = useState(null);
  const [availWarning,  setAvailWarning]  = useState(null);
  const [trashOver,     setTrashOver]     = useState(false);

  const trashRef = useRef(null);
  const orderedStaffRef    = useRef(orderedStaff);
  const shiftDragActiveRef = useRef(false);
  useEffect(() => { orderedStaffRef.current = orderedStaff; }, [orderedStaff]);

  const currentDow = DAY_DOW[currentDay] ?? 1;

  // When the panel selects a template, load it
  useEffect(() => {
    if (!selectedId) return;
    const tpl = templates.find(t => t.id === selectedId);
    if (tpl) selectTemplate(tpl);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the panel clicks "New Template" — only fire on actual increments, not on remount
  useEffect(() => {
    if (triggerNew === lastTriggerRef.current) return;
    lastTriggerRef.current = triggerNew;
    createTemplate();
  }, [triggerNew]); // eslint-disable-line react-hooks/exhaustive-deps

  function sortByShift(arr) {
    return [...arr].sort((a, b) => {
      const aMin = a.shifts?.length ? Math.min(...a.shifts.map(s => s.start)) : Infinity;
      const bMin = b.shifts?.length ? Math.min(...b.shifts.map(s => s.start)) : Infinity;
      return aMin - bMin;
    });
  }

  // ── Pool ──────────────────────────────────────────────────────────────────────
  const poolStaff = useMemo(
    () => staff.filter(s => !orderedStaff.some(os => os.id === s.id)),
    [staff, orderedStaff]
  );

  function addToDay(personId) {
    const person = staff.find(s => s.id === personId);
    if (!person || orderedStaff.some(s => s.id === personId)) return;
    setOrderedStaff(prev => sortByShift([...prev, normalizeStaff(person)]));
  }

  function removeFromDay(personId) {
    setOrderedStaff(prev => sortByShift(prev.filter(s => s.id !== personId)));
  }

  // ── Day switching ─────────────────────────────────────────────────────────────
  function switchDay(newDay) {
    templateDaysRef.current[currentDay] = orderedStaff;
    setCurrentDay(newDay);
    setOrderedStaff((templateDaysRef.current[newDay] ?? []).map(normalizeStaff));
  }

  // ── Template selection ────────────────────────────────────────────────────────
  // Reconcile a saved template day's placed staff against the live roster — drops
  // anyone removed since, and uses current identity/metadata (name, maxHoursPerWeek)
  // rather than whatever was captured when the template was saved.
  function reconcileTemplateStaff(tplStaff, liveStaff) {
    const liveMap = new Map(liveStaff.map(s => [s.id, s]));
    return (tplStaff ?? [])
      .filter(s => liveMap.has(s.id))
      .map(s => normalizeStaff({ ...liveMap.get(s.id), shifts: s.shifts, deskShifts: s.deskShifts }));
  }

  function selectTemplate(tpl) {
    setSelectedId(tpl.id);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description ?? '');
    setNameError('');
    setDeleteConfirm(false);
    if (tpl.type === 'day') {
      setCurrentDay('_day');
      templateDaysRef.current = { '_day': reconcileTemplateStaff(tpl.staff, staff) };
      setOrderedStaff(templateDaysRef.current['_day']);
    } else {
      const day = 'Monday';
      setCurrentDay(day);
      templateDaysRef.current = Object.fromEntries(
        TEMPLATE_DAYS.map(d => [d, reconcileTemplateStaff(tpl.days?.[d]?.staff, staff)])
      );
      setOrderedStaff(templateDaysRef.current[day]);
    }
  }

  // ── Create new template ───────────────────────────────────────────────────────
  async function createTemplate() {
    const created = await addTemplate({
      type: 'week',
      name: '',
      description: '',
      days: Object.fromEntries(TEMPLATE_DAYS.map(d => [d, { staff: [] }])),
    });
    setSelectedId(created.id);
    setTemplateName('');
    setTemplateDesc('');
    setNameError('');
    setDeleteConfirm(false);
    setCurrentDay('Monday');
    templateDaysRef.current = Object.fromEntries(TEMPLATE_DAYS.map(d => [d, []]));
    setOrderedStaff([]);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const trimmed = templateName.trim();
    if (!trimmed) { setNameError('Template name is required.'); return; }
    const duplicate = templates.some(t => t.id !== selectedId && t.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setNameError('A template with this name already exists.'); return; }
    setNameError('');
    templateDaysRef.current[currentDay] = orderedStaff;
    const existingTpl = templates.find(t => t.id === selectedId);
    const changes = existingTpl?.type === 'day'
      ? { name: trimmed, description: templateDesc.trim(), staff: templateDaysRef.current[currentDay] ?? orderedStaff }
      : { name: trimmed, description: templateDesc.trim(), days: Object.fromEntries(TEMPLATE_DAYS.map(d => [d, { staff: templateDaysRef.current[d] ?? [] }])) };
    try {
      await updateTemplate(selectedId, changes);
    } catch (err) {
      setNameError(err.message || 'Failed to save template.');
      return;
    }
    clearTimeout(savedFlashRef.current);
    setJustSaved(true);
    savedFlashRef.current = setTimeout(() => setJustSaved(false), 1200);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    try {
      await removeTemplate(selectedId);
    } catch (err) {
      window.alert(err.message || 'Failed to delete template.');
      return;
    }
    setSelectedId(null);
    setTemplateName('');
    setTemplateDesc('');
    setOrderedStaff([]);
    setDeleteConfirm(false);
  }

  // ── Toolbar drag ──────────────────────────────────────────────────────────────
  function endDrag() {
    setActiveDragType(null);
    setHoverRow(null);
    setPreviewInfo(null);
  }

  // ── Timeline drag-over (toolbar chips) ───────────────────────────────────────
  function handleTimelineDragOver(e, rowIndex) {
    setHoverRow(rowIndex);
    if (activeDragType !== 'shift' && activeDragType !== 'desk') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawHours = HOURS_START + ((e.clientX - rect.left) / rect.width) * TOTAL_HOURS;
    const person = orderedStaff[rowIndex];

    if (activeDragType === 'shift') {
      const duration = 2;
      const start = snapHalf(clamp(rawHours - duration / 2, HOURS_START, HOURS_END - duration));
      const end = start + duration;
      const valid = !person.shifts.some(s => start < s.end && end > s.start);
      setPreviewInfo({ staffIndex: rowIndex, start, end, valid });
    } else if (activeDragType === 'desk') {
      const duration = 1;
      const host = person.shifts.find(sh => rawHours >= sh.start && rawHours <= sh.end);
      if (!host) {
        setPreviewInfo({ staffIndex: rowIndex, start: null, end: null, valid: false });
        return;
      }
      const start = snapHalf(clamp(rawHours - duration / 2, host.start, host.end - duration));
      const end = start + duration;
      const valid = !person.deskShifts.some(d => start < d.end && end > d.start);
      setPreviewInfo({ staffIndex: rowIndex, start, end, valid });
    }
  }

  // ── Timeline drop (toolbar chips) ────────────────────────────────────────────
  function handleTimelineDrop(staffIndex) {
    if (activeDragType === 'shift') {
      const p = orderedStaff[staffIndex];
      let newStart, newEnd;
      if (previewInfo?.staffIndex === staffIndex && previewInfo.valid) {
        newStart = previewInfo.start;
        newEnd   = previewInfo.end;
      } else {
        newStart = firstFreeSlot(p.shifts, 2);
        if (newStart === null) { endDrag(); return; }
        newEnd = newStart + 2;
      }
      function doPlace() {
        setOrderedStaff(prev => {
          const next = [...prev];
          const pp = { ...next[staffIndex] };
          pp.scheduled = true;
          pp.shifts = [...pp.shifts, { id: `s${Date.now()}`, start: newStart, end: newEnd }];
          next[staffIndex] = pp;
          return sortByShift(next);
        });
      }
      const blocks = getAvailability(p.id, currentDow);
      if (isShiftOutsideAvailability(newStart, newEnd, blocks)) {
        endDrag();
        setAvailWarning({ staffName: p.name, onConfirm: () => { doPlace(); setAvailWarning(null); }, onCancel: () => setAvailWarning(null) });
        return;
      }
      doPlace();
    } else if (activeDragType === 'desk') {
      const p = orderedStaff[staffIndex];
      let newStart = null;
      if (previewInfo?.staffIndex === staffIndex && previewInfo.valid && previewInfo.start !== null) {
        newStart = previewInfo.start;
      } else {
        for (const shift of p.shifts) {
          const slot = firstFreeSlot(p.deskShifts, 1, shift.start, shift.end);
          if (slot !== null) { newStart = slot; break; }
        }
      }
      if (newStart !== null) {
        const newEnd = newStart + 1;
        setOrderedStaff(prev => {
          const next = [...prev];
          const pp = { ...next[staffIndex] };
          pp.deskShifts = [...pp.deskShifts, { id: `d${Date.now()}`, start: newStart, end: newEnd }];
          next[staffIndex] = pp;
          return next;
        });
      }
    }
    endDrag();
  }

  // ── Shift bar resize (mouse) ──────────────────────────────────────────────────
  function handleBarMouseDown(e, staffIndex, shiftIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const shift0       = orderedStaff[staffIndex].shifts[shiftIndex];
    const initialStart = shift0.start;
    const initialEnd   = shift0.end;
    const otherShifts  = orderedStaff[staffIndex].shifts.filter((_, j) => j !== shiftIndex);

    shiftDragActiveRef.current = true;
    setActiveBar({ type: 'shift', staffIndex, shiftIndex, mode });
    document.body.style.cursor     = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(me) {
      const delta = ((me.clientX - startX) / timelineWidth) * TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex], shifts: [...next[staffIndex].shifts] };
        const s = { ...p.shifts[shiftIndex] };
        if (mode === 'left')  s.start = snapHalf(clamp(initialStart + delta, HOURS_START, initialEnd - 0.5));
        else                   s.end   = snapHalf(clamp(initialEnd   + delta, initialStart + 0.5, HOURS_END));
        if (!otherShifts.some(os => s.start < os.end && s.end > os.start)) p.shifts[shiftIndex] = s;
        next[staffIndex] = p;
        return next;
      });
    }
    function onUp() {
      shiftDragActiveRef.current = false;
      setActiveBar(null);
      document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const current = orderedStaffRef.current[staffIndex];
      const finalShift = current?.shifts[shiftIndex];
      if (finalShift) {
        const blocks = getAvailability(current.id, currentDow);
        if (isShiftOutsideAvailability(finalShift.start, finalShift.end, blocks)) {
          setAvailWarning({
            staffName: current.name,
            onConfirm: () => { setAvailWarning(null); setOrderedStaff(prev => sortByShift(prev)); },
            onCancel: () => {
              setAvailWarning(null);
              setOrderedStaff(prev => {
                const next = [...prev];
                const p = { ...next[staffIndex], shifts: [...next[staffIndex].shifts] };
                p.shifts[shiftIndex] = { ...p.shifts[shiftIndex], start: initialStart, end: initialEnd };
                next[staffIndex] = p;
                return sortByShift(next);
              });
            },
          });
          return;
        }
      }
      setOrderedStaff(prev => sortByShift(prev));
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Desk bar resize (mouse) ───────────────────────────────────────────────────
  function handleDeskBarMouseDown(e, staffIndex, deskIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const desk0        = orderedStaff[staffIndex].deskShifts[deskIndex];
    const initialStart = desk0.start;
    const initialEnd   = desk0.end;
    const otherDesks   = orderedStaff[staffIndex].deskShifts.filter((_, j) => j !== deskIndex);
    const host         = orderedStaff[staffIndex].shifts.find(sh => sh.start <= desk0.start && sh.end >= desk0.end);
    const shiftLo      = host?.start ?? HOURS_START;
    const shiftHi      = host?.end   ?? HOURS_END;

    setActiveBar({ type: 'desk', staffIndex, deskIndex, mode });
    document.body.style.cursor     = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(me) {
      const delta = ((me.clientX - startX) / timelineWidth) * TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex], deskShifts: [...next[staffIndex].deskShifts] };
        const d = { ...p.deskShifts[deskIndex] };
        if (mode === 'left')  d.start = snapHalf(clamp(initialStart + delta, shiftLo, initialEnd - 0.5));
        else                   d.end   = snapHalf(clamp(initialEnd   + delta, initialStart + 0.5, shiftHi));
        if (!otherDesks.some(od => d.start < od.end && d.end > od.start)) p.deskShifts[deskIndex] = d;
        next[staffIndex] = p;
        return next;
      });
    }
    function onUp() {
      setActiveBar(null);
      document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Bar HTML5 drag (move + trash) ─────────────────────────────────────────────
  function handleShiftBarDragStart(e, staffIndex, shiftIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const person = orderedStaff[staffIndex];
    const shift  = person.shifts[shiftIndex];
    shiftDragActiveRef.current = true;
    setDraggingBarInfo({ type: 'shift', staffIndex, shiftIndex, shiftId: shift.id, personId: person.id, duration: shift.end - shift.start, originalStart: shift.start, originalEnd: shift.end });
  }

  function handleDeskBarDragStart(e, staffIndex, deskIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const desk = orderedStaff[staffIndex].deskShifts[deskIndex];
    setDraggingBarInfo({ type: 'desk', staffIndex, deskIndex, deskId: desk.id, duration: desk.end - desk.start, originalStart: desk.start, originalEnd: desk.end });
  }

  function handleBarDragEnd() {
    shiftDragActiveRef.current = false;
    setPreviewInfo(null);
    const info = draggingBarInfo;
    if (info?.type === 'shift' && info.personId) {
      const person = orderedStaffRef.current.find(s => s.id === info.personId);
      const shift  = person?.shifts.find(s => s.id === info.shiftId);
      if (shift) {
        const blocks = getAvailability(person.id, currentDow);
        if (isShiftOutsideAvailability(shift.start, shift.end, blocks)) {
          setDraggingBarInfo(null);
          setAvailWarning({
            staffName: person.name,
            onConfirm: () => { setAvailWarning(null); setOrderedStaff(prev => sortByShift(prev)); },
            onCancel: () => {
              setAvailWarning(null);
              setOrderedStaff(prev => {
                const next = [...prev];
                const pi = next.findIndex(s => s.id === info.personId);
                if (pi === -1) return prev;
                const p = { ...next[pi], shifts: [...next[pi].shifts] };
                const si = p.shifts.findIndex(s => s.id === info.shiftId);
                if (si === -1) return prev;
                p.shifts[si] = { ...p.shifts[si], start: info.originalStart, end: info.originalEnd };
                next[pi] = p;
                return sortByShift(next);
              });
            },
          });
          return;
        }
      }
    }
    setDraggingBarInfo(null);
    setOrderedStaff(prev => sortByShift(prev));
  }

  // ── Bar drag-over ─────────────────────────────────────────────────────────────
  function handleBarDragOver(e, rowIndex) {
    if (!draggingBarInfo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawHours = HOURS_START + ((e.clientX - rect.left) / rect.width) * TOTAL_HOURS;
    const { type, staffIndex, shiftIndex, deskIndex, duration } = draggingBarInfo;
    const sameRow = staffIndex === rowIndex;

    if (type === 'shift') {
      const newStart = snapHalf(clamp(rawHours - duration / 2, HOURS_START, HOURS_END - duration));
      const newEnd   = newStart + duration;
      if (sameRow) {
        setPreviewInfo(null);
        setOrderedStaff(prev => {
          const next = [...prev];
          const p = { ...next[staffIndex], shifts: [...next[staffIndex].shifts] };
          const otherShifts = p.shifts.filter((_, j) => j !== shiftIndex);
          if (!otherShifts.some(os => newStart < os.end && newEnd > os.start)) {
            p.shifts[shiftIndex] = { ...p.shifts[shiftIndex], start: newStart, end: newEnd };
          }
          next[staffIndex] = p;
          return next;
        });
      } else {
        const target = orderedStaff[rowIndex];
        const valid  = !target.shifts.some(s => newStart < s.end && newEnd > s.start);
        setPreviewInfo({ staffIndex: rowIndex, start: newStart, end: newEnd, valid });
      }

    } else if (type === 'desk') {
      if (sameRow) {
        setPreviewInfo(null);
        setOrderedStaff(prev => {
          const next = [...prev];
          const p = { ...next[staffIndex], deskShifts: [...next[staffIndex].deskShifts] };
          const host = p.shifts.find(sh => rawHours >= sh.start && rawHours <= sh.end);
          if (!host) return prev;
          const newStart   = snapHalf(clamp(rawHours - duration / 2, host.start, host.end - duration));
          const newEnd     = newStart + duration;
          const otherDesks = p.deskShifts.filter((_, j) => j !== deskIndex);
          if (!otherDesks.some(od => newStart < od.end && newEnd > od.start)) {
            p.deskShifts[deskIndex] = { ...p.deskShifts[deskIndex], start: newStart, end: newEnd };
          }
          next[staffIndex] = p;
          return next;
        });
      } else {
        const target = orderedStaff[rowIndex];
        const host   = target.shifts.find(sh => rawHours >= sh.start && rawHours <= sh.end);
        if (!host) {
          setPreviewInfo({ staffIndex: rowIndex, start: null, end: null, valid: false });
          return;
        }
        const newStart   = snapHalf(clamp(rawHours - duration / 2, host.start, host.end - duration));
        const newEnd     = newStart + duration;
        const valid      = !target.deskShifts.some(d => newStart < d.end && newEnd > d.start);
        setPreviewInfo({ staffIndex: rowIndex, start: newStart, end: newEnd, valid });
      }
    }
  }

  // ── Bar drop ──────────────────────────────────────────────────────────────────
  function handleBarDrop(e, rowIndex) {
    if (!draggingBarInfo) return;
    const { type, staffIndex, shiftIndex, deskIndex, duration } = draggingBarInfo;
    if (staffIndex === rowIndex) return;
    if (!previewInfo || previewInfo.staffIndex !== rowIndex || !previewInfo.valid || previewInfo.start === null) return;

    setPreviewInfo(null);
    setDraggingBarInfo(null);
    const { start, end } = previewInfo;

    if (type === 'shift') {
      const srcId = orderedStaff[staffIndex].id;
      const tgtId = orderedStaff[rowIndex].id;
      const targetPerson = orderedStaff[rowIndex];
      const capturedShiftIndex = shiftIndex;
      function doTransfer() {
        setOrderedStaff(prev => {
          const next = [...prev];
          const si = prev.findIndex(s => s.id === srcId);
          const ti = prev.findIndex(s => s.id === tgtId);
          if (si === -1 || ti === -1) return prev;
          const src = { ...next[si] };
          src.shifts    = src.shifts.filter((_, j) => j !== capturedShiftIndex);
          src.scheduled = src.shifts.length > 0;
          next[si] = src;
          const tgt = { ...next[ti] };
          tgt.shifts    = [...tgt.shifts, { id: `s${Date.now()}`, start, end }];
          tgt.scheduled = true;
          next[ti] = tgt;
          return sortByShift(next);
        });
      }
      const blocks = getAvailability(targetPerson.id, currentDow);
      if (isShiftOutsideAvailability(start, end, blocks)) {
        setAvailWarning({ staffName: targetPerson.name, onConfirm: () => { doTransfer(); setAvailWarning(null); }, onCancel: () => setAvailWarning(null) });
        return;
      }
      doTransfer();

    } else if (type === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const src = { ...next[staffIndex] };
        src.deskShifts = src.deskShifts.filter((_, j) => j !== deskIndex);
        next[staffIndex] = src;
        const tgt = { ...next[rowIndex] };
        tgt.deskShifts = [...tgt.deskShifts, { id: `d${Date.now()}`, start, end }];
        next[rowIndex] = tgt;
        return next;
      });
    }
  }

  // ── Bar context menu ──────────────────────────────────────────────────────────
  function handleBarContextMenu(e, target) {
    setContextMenu({ x: e.clientX, y: e.clientY, target });
  }

  function handleContextMenuDelete() {
    const { target } = contextMenu;
    setContextMenu(null);
    if (target.type === 'shift') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[target.staffIndex] };
        p.shifts    = p.shifts.filter((_, j) => j !== target.shiftIndex);
        p.scheduled = p.shifts.length > 0;
        next[target.staffIndex] = p;
        return sortByShift(next);
      });
    } else if (target.type === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[target.staffIndex] };
        p.deskShifts = p.deskShifts.filter((_, j) => j !== target.deskIndex);
        next[target.staffIndex] = p;
        return next;
      });
    }
  }

  function handleContextMenuEdit() {
    setEditModal(contextMenu.target);
    setContextMenu(null);
  }

  function handleEditSave(data) {
    const t = editModal;
    setEditModal(null);
    if (t.type === 'shift') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[t.staffIndex], shifts: [...next[t.staffIndex].shifts] };
        p.shifts[t.shiftIndex] = { ...p.shifts[t.shiftIndex], start: data.shiftStart, end: data.shiftEnd };
        next[t.staffIndex] = p;
        return sortByShift(next);
      });
    } else if (t.type === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[t.staffIndex], deskShifts: [...next[t.staffIndex].deskShifts] };
        p.deskShifts[t.deskIndex] = { ...p.deskShifts[t.deskIndex], start: data.deskStart, end: data.deskEnd };
        next[t.staffIndex] = p;
        return next;
      });
    }
  }

  // ── Trash handlers ────────────────────────────────────────────────────────────
  function handleTrashDragEnter() { setTrashOver(true); }
  function handleTrashDragLeave(e) {
    if (!trashRef.current?.contains(e.relatedTarget)) setTrashOver(false);
  }
  function handleTrashDrop() {
    setTrashOver(false);
    if (draggingBarInfo) {
      const { type, staffIndex, shiftIndex, deskIndex } = draggingBarInfo;
      if (type === 'shift') {
        setOrderedStaff(prev => {
          const next = [...prev];
          const p = { ...next[staffIndex] };
          p.shifts    = p.shifts.filter((_, j) => j !== shiftIndex);
          p.scheduled = p.shifts.length > 0;
          next[staffIndex] = p;
          return sortByShift(next);
        });
      } else if (type === 'desk') {
        setOrderedStaff(prev => {
          const next = [...prev];
          const p = { ...next[staffIndex] };
          p.deskShifts = p.deskShifts.filter((_, j) => j !== deskIndex);
          next[staffIndex] = p;
          return next;
        });
      }
      setDraggingBarInfo(null);
    }
    endDrag();
  }

  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;
  const visibleDays = selectedTemplate?.type === 'day'
    ? [] // day templates have no day tabs — single generic day
    : TEMPLATE_DAYS;

  return (
    <div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div>
        {!selectedId ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 'calc(100vh - 120px)',
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '56px 72px', gap: 12,
              border: '1px solid var(--color-border)', borderRadius: 14,
              background: 'var(--color-surface)',
            }}>
              {templates.length === 0 ? (
                <>
                  <span style={{ fontSize: 28 }}>📋</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-accent)' }}>Nothing here… yet.</span>
                </>
              ) : (
              <>
                <span style={{ fontSize: 32 }}>🗂️</span>
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-accent)' }}>Select a template to get started.</span>
              </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Template header */}
            <div className="p-4 rounded-xl border mb-4"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-start gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    placeholder="Template name…"
                    value={templateName}
                    onChange={e => { setTemplateName(e.target.value); setNameError(''); }}
                    style={{
                      fontSize: 20, fontWeight: 700, background: 'transparent', border: 'none',
                      borderBottom: `1px solid ${nameError ? 'var(--color-red)' : 'var(--color-border)'}`,
                      color: 'var(--color-text)', width: '100%', padding: '4px 0',
                      outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--color-accent)'; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = nameError ? 'var(--color-red)' : 'var(--color-border)'; }}
                  />
                  {nameError && (
                    <div style={{ color: 'var(--color-red)', fontSize: 11, marginTop: 4 }}>{nameError}</div>
                  )}
                  <textarea
                    placeholder="Description (optional)…"
                    value={templateDesc}
                    onChange={e => setTemplateDesc(e.target.value)}
                    rows={2}
                    style={{
                      marginTop: 8, fontSize: 13, background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-text)', width: '100%', padding: '4px 0',
                      outline: 'none', resize: 'none', fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.currentTarget.style.borderBottomColor = 'var(--color-accent)'; }}
                    onBlur={e => { e.currentTarget.style.borderBottomColor = 'var(--color-border)'; }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start', paddingTop: 4 }}>
                  <button
                    onClick={handleSave}
                    style={{
                      padding: '7px 18px', borderRadius: 8, border: 'none',
                      background: justSaved ? '#1a2a1a' : 'var(--color-accent)',
                      color: justSaved ? '#6ab888' : 'white',
                      fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { if (!justSaved) e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                  >
                    {justSaved ? '✓ Saved' : 'Save'}
                  </button>
                  <button
                    onClick={handleDelete}
                    style={{
                      padding: '7px 18px', borderRadius: 8, border: '1px solid',
                      borderColor: deleteConfirm ? 'var(--color-red)' : 'var(--color-border)',
                      background: deleteConfirm ? 'rgba(200,64,64,0.12)' : 'transparent',
                      color: deleteConfirm ? '#f07070' : 'var(--color-text-dim)',
                      fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {deleteConfirm ? 'Confirm Delete' : 'Delete'}
                  </button>
                  {deleteConfirm && (
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      style={{
                        padding: '7px 14px', borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'transparent', color: 'var(--color-text-dim)',
                        fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Day tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {visibleDays.map(day => {
                const isActive = day === currentDay;
                return (
                  <button
                    key={day}
                    onClick={() => switchDay(day)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      border: isActive ? 'none' : '1px solid var(--color-border)',
                      background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: isActive ? 'white' : 'var(--color-text-dim)',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.15s',
                    }}
                  >
                    {DAY_SHORT[day]}
                  </button>
                );
              })}
            </div>

            {/* Alerts */}
            <AlertsBar staff={orderedStaff.filter(s => s.shifts?.length > 0)} />

            {/* Staff pool */}
            <div className="p-3 rounded-xl border mb-4"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Staff Pool — drag to add
              </div>
              {poolStaff.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-dim)', fontStyle: 'italic' }}>All staff added to this day.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {poolStaff.map(s => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setPoolDragId(s.id); }}
                      onDragEnd={() => setPoolDragId(null)}
                      className="px-3 py-1.5 rounded-full text-sm border cursor-grab select-none"
                      style={{
                        background: 'var(--color-muted)', borderColor: 'var(--color-accent)',
                        color: 'var(--color-text)',
                        fontWeight: 600,
                        opacity: poolDragId === s.id ? 0.5 : 1,
                        transition: 'opacity 0.1s',
                      }}
                      title={`Drag to add ${s.name}`}
                    >
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <DragChip
                  label="New Shift" isActive={activeDragType === 'shift'}
                  color="var(--color-green)" borderColor="#2a4a38" bg="rgba(74,124,94,0.15)"
                  icon={<div style={{ width: 14, height: 10, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setActiveDragType('shift'); }}
                  onDragEnd={endDrag}
                />
                <DragChip
                  label="New Desk Shift" isActive={activeDragType === 'desk'}
                  color="var(--color-yellow)" borderColor="#5a4428" bg="rgba(61,44,24,0.4)"
                  icon={<div style={{ width: 14, height: 10, borderRadius: 2, border: '1.5px solid currentColor' }} />}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setActiveDragType('desk'); }}
                  onDragEnd={endDrag}
                />
              </div>

              {/* Trash zone */}
              <div
                ref={trashRef}
                onDragOver={e => e.preventDefault()}
                onDragEnter={handleTrashDragEnter}
                onDragLeave={handleTrashDragLeave}
                onDrop={handleTrashDrop}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
                style={{
                  borderStyle: 'dashed',
                  borderColor: trashOver ? 'var(--color-red)' : 'var(--color-border)',
                  color:       trashOver ? '#f07070' : 'var(--color-text-dim)',
                  background:  trashOver ? 'rgba(200,64,64,0.12)' : 'transparent',
                  cursor: 'default',
                }}
              >
                <span style={{ fontSize: 14 }}>🗑</span>
                Drop here to remove
              </div>
            </div>

            {/* Grid */}
            <TemplateGrid
              staff={orderedStaff}
              currentDow={currentDow}
              poolDragId={poolDragId}
              onPoolDrop={personId => { addToDay(personId); setPoolDragId(null); }}
              onBarMouseDown={handleBarMouseDown}
              onDeskBarMouseDown={handleDeskBarMouseDown}
              activeBar={activeBar}
              activeDragType={activeDragType}
              hoverRow={hoverRow}
              onTimelineDragOver={handleTimelineDragOver}
              onTimelineDrop={handleTimelineDrop}
              draggingBarInfo={draggingBarInfo}
              onShiftBarDragStart={handleShiftBarDragStart}
              onDeskBarDragStart={handleDeskBarDragStart}
              onBarDragEnd={handleBarDragEnd}
              onBarDragOver={handleBarDragOver}
              onBarDrop={handleBarDrop}
              onBarContextMenu={handleBarContextMenu}
              getPersonAvailability={(id, dow) => getAvailability(id, dow ?? currentDow)}
              previewInfo={previewInfo}
              onRemoveFromDay={removeFromDay}
            />
          </>
        )}
      </div>

      {/* ── Context menu ──────────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          onEdit={handleContextMenuEdit}
          onDelete={handleContextMenuDelete}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Edit modal ─────────────────────────────────────────────────────────── */}
      {editModal && (
        <EditModal
          target={editModal}
          orderedStaff={orderedStaff}
          onSave={handleEditSave}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* ── Availability warning modal ────────────────────────────────────────── */}
      {availWarning && (
        <AvailWarningModal
          staffName={availWarning.staffName}
          onConfirm={availWarning.onConfirm}
          onCancel={availWarning.onCancel}
        />
      )}
    </div>
  );
}
