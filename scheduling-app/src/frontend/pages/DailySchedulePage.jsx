import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { buildAlerts, formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';
import { schedulesApi } from '../utils/api';

const TOTAL_HOURS = HOURS_END - HOURS_START;

function snapHalf(h)        { return Math.round(h * 2) / 2; }
function clamp(v, lo, hi)   { return Math.max(lo, Math.min(hi, v)); }

function getScheduledIds(date) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const tpl = weeklyTemplates[dayName];
  return tpl ? new Set(tpl.staff.map(s => s.id)) : new Set();
}

// ── Stats header ───────────────────────────────────────────────────────────────

function StatsHeader({ staff, events, currentDate, onPrev, onNext, finalized, onFinalize, onUnfinalize }) {
  const scheduled  = staff.filter(s => s.scheduled);
  const deskFilled = scheduled.filter(s => s.deskStart !== null).length;
  const dateLabel  = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-5 rounded-xl mb-6 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Daily Schedule</h2>
        <button onClick={finalized ? onUnfinalize : onFinalize}
          className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
          style={finalized
            ? { background: '#1a2a1a', color: '#6ab888', border: '1px solid #2a4a2a' }
            : { background: 'var(--color-accent)', color: 'white', border: '1px solid transparent' }}>
          {finalized ? '✓ Finalized' : 'Finalize Schedule'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>◀</button>
        <span className="text-sm font-medium min-w-36 sm:min-w-48 text-center">{dateLabel}</span>
        <button onClick={onNext} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>▶</button>
      </div>
      <div className="flex gap-4 sm:gap-6">
        {[
          { label: 'On Shift',     value: scheduled.length },
          { label: 'Desks Filled', value: `${deskFilled}/${scheduled.length}` },
          { label: 'Events',       value: events.length },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold" style={{ color: 'var(--color-accent-bright)' }}>{value}</div>
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Alerts bar ─────────────────────────────────────────────────────────────────

function AlertsBar({ staff, events }) {
  const alerts   = buildAlerts(staff, events);
  const dotColor = { red: 'var(--color-red)', yellow: 'var(--color-yellow)', blue: 'var(--color-accent-bright)' };
  return (
    <div className="p-4 rounded-xl mb-6 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-yellow)' }}>Alerts</h3>
      {alerts.map((a, i) => (
        <div key={i} className="flex items-center gap-2 py-1 text-sm" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[a.type] }} />
          {a.text}
        </div>
      ))}
    </div>
  );
}

// ── Schedule grid ──────────────────────────────────────────────────────────────

function ScheduleGrid({
  staff, events, finalized,
  dragRowIndex, onRowDragStart, onRowDragOver, onRowDrop,
  onBarMouseDown, onDeskBarMouseDown, onEventBarMouseDown, activeBar,
  activeDragType, hoverRow, onTimelineDragOver, onTimelineDrop,
  draggingBarInfo,
  onShiftBarDragStart, onDeskBarDragStart, onEventBarDragStart, onBarDragEnd,
  onBarDragOver, onBarDrop,
  onBarContextMenu,
}) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  function posStyle(start, end) {
    const left  = ((start - HOURS_START) / TOTAL_HOURS) * 100;
    const width = ((end   - start)       / TOTAL_HOURS) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }

  const toolbarHighlight = activeDragType === 'shift'
    ? { background: 'rgba(74,124,94,0.15)',  borderColor: 'var(--color-green)' }
    : activeDragType === 'desk'
      ? { background: 'rgba(200,148,56,0.12)', borderColor: 'var(--color-yellow)' }
      : { background: 'rgba(59,42,110,0.2)',   borderColor: '#7c5cbf' };

  return (
    <>
    <div className="rounded-xl border overflow-x-auto mb-6"
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
      {staff.map((person, i) => {
        const isRowDragging = dragRowIndex === i;
        const isBarActive   = activeBar?.type === 'shift' && activeBar?.staffIndex === i;
        const isDeskActive  = activeBar?.type === 'desk'  && activeBar?.staffIndex === i;
        const isShiftDragging = draggingBarInfo?.type === 'shift' && draggingBarInfo?.staffIndex === i;
        const isDeskDragging  = draggingBarInfo?.type === 'desk'  && draggingBarInfo?.staffIndex === i;

        return (
          <div
            key={person.id}
            draggable={!finalized}
            onDragStart={e => { if (!finalized) { e.stopPropagation(); onRowDragStart(i); } }}
            onDragOver={e => {
              if (activeDragType || draggingBarInfo) return;
              onRowDragOver(e, i);
            }}
            onDrop={() => { if (!activeDragType && !draggingBarInfo) onRowDrop(); }}
            onDragEnd={onRowDrop}
            className="flex border-b last:border-b-0"
            style={{
              borderColor: 'var(--color-border)',
              minWidth: 972,
              opacity: isRowDragging ? 0.35 : (person.scheduled ? 1 : 0.5),
              transition: 'opacity 0.15s',
              cursor: finalized ? 'default' : 'grab',
            }}
          >
            {/* Name column */}
            <div className="w-48 shrink-0 px-2 py-3 text-sm border-r flex items-center gap-2"
              style={{ borderColor: 'var(--color-border)' }}>
              {!finalized && (
                <span className="text-xs select-none shrink-0" style={{ color: 'var(--color-muted)', lineHeight: 1 }}>⠿</span>
              )}
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>
                {person.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{person.name}</div>
                {person.scheduled ? (
                  <div className="text-xs truncate mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                    {formatTime(person.shiftStart)} – {formatTime(person.shiftEnd)}
                  </div>
                ) : (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>Unscheduled</div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div
              className="flex-1 relative"
              data-timeline="true"
              style={{ height: 64 }}
              onDragOver={e => {
                const hasToolbar = !!activeDragType;
                const hasBar     = !!draggingBarInfo;
                if (!hasToolbar && !hasBar) return;
                e.preventDefault();
                e.stopPropagation();
                if (hasToolbar) onTimelineDragOver(i);
                if (hasBar)     onBarDragOver(e, i);
              }}
              onDrop={e => {
                const hasToolbar = !!activeDragType;
                const hasBar     = !!draggingBarInfo;
                if (!hasToolbar && !hasBar) return;
                e.preventDefault();
                e.stopPropagation();
                if (hasToolbar) onTimelineDrop(i);
                if (hasBar)     onBarDrop(e, i);
              }}
            >
              {/* Toolbar-chip drop highlight */}
              {activeDragType && hoverRow === i && (
                <div className="absolute inset-0 pointer-events-none rounded-r-lg"
                  style={{ ...toolbarHighlight, border: '1px dashed', zIndex: 20 }} />
              )}

              {person.scheduled ? (
                <>
                  {/* Shift bar — HTML5 draggable for move/trash, mouse events for resize */}
                  <div
                    draggable={!finalized}
                    className="absolute top-3 h-8 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(person.shiftStart, person.shiftEnd),
                      background: 'var(--color-green)',
                      opacity: isShiftDragging ? 0.3 : (isBarActive ? 0.85 : 0.6),
                      cursor: finalized ? 'default' : 'grab',
                      boxShadow: isBarActive ? '0 0 0 2px var(--color-green)' : 'none',
                      transition: isBarActive || isShiftDragging ? 'none' : 'box-shadow 0.1s',
                      zIndex: isBarActive ? 10 : 1,
                    }}
                    onDragStart={e => { e.stopPropagation(); !finalized && onShiftBarDragStart(e, i); }}
                    onDragEnd={onBarDragEnd}
                    onContextMenu={e => { e.preventDefault(); !finalized && onBarContextMenu(e, { type: 'shift', staffIndex: i }); }}
                  >
                    {/* Left resize handle */}
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, 'left'); }}
                      />
                    )}
                    {/* Right resize handle */}
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, 'right'); }}
                      />
                    )}
                  </div>

                  {/* Desk bar — HTML5 draggable for move/trash, mouse events for resize */}
                  {person.deskStart !== null && (
                    <div
                      draggable={!finalized}
                      className="absolute top-3 h-8 rounded overflow-hidden select-none"
                      style={{
                        ...posStyle(person.deskStart, person.deskEnd),
                        background: 'var(--color-yellow)',
                        opacity: isDeskDragging ? 0.3 : (isDeskActive ? 1 : 0.75),
                        cursor: finalized ? 'default' : 'grab',
                        boxShadow: isDeskActive ? '0 0 0 2px #e0b050' : 'none',
                        transition: isDeskActive || isDeskDragging ? 'none' : 'box-shadow 0.1s',
                        zIndex: isDeskActive ? 10 : 2,
                      }}
                      onDragStart={e => { e.stopPropagation(); !finalized && onDeskBarDragStart(e, i); }}
                      onDragEnd={onBarDragEnd}
                      onContextMenu={e => { e.preventDefault(); !finalized && onBarContextMenu(e, { type: 'desk', staffIndex: i }); }}
                    >
                      {!finalized && (
                        <div
                          style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, 'left'); }}
                        />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: 10, paddingRight: 10 }}>
                        Desk
                      </span>
                      {!finalized && (
                        <div
                          style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, 'right'); }}
                        />
                      )}
                    </div>
                  )}

                  {/* Event bars — HTML5 draggable for move/trash, mouse events for resize */}
                  {events.filter(e => e.assignedStaff.includes(person.id)).map(evt => {
                    const isEvtActive   = activeBar?.type === 'event' && activeBar?.eventId === evt.id;
                    const isEvtDragging = draggingBarInfo?.type === 'event' && draggingBarInfo?.eventId === evt.id;
                    return (
                      <div
                        key={evt.id}
                        draggable={!finalized}
                        className="absolute top-3 h-8 rounded overflow-hidden select-none"
                        style={{
                          ...posStyle(evt.start, evt.end),
                          background: '#3b2a6e',
                          cursor: finalized ? 'default' : 'grab',
                          zIndex: isEvtActive ? 10 : 3,
                          boxShadow: isEvtActive ? '0 0 0 2px #7c5cbf' : 'none',
                          opacity: isEvtDragging ? 0.3 : (isEvtActive ? 1 : 0.9),
                          transition: isEvtActive || isEvtDragging ? 'none' : 'box-shadow 0.1s',
                        }}
                        onDragStart={e => { e.stopPropagation(); !finalized && onEventBarDragStart(e, evt.id, person.id); }}
                        onDragEnd={onBarDragEnd}
                        onContextMenu={e => { e.preventDefault(); !finalized && onBarContextMenu(e, { type: 'event', eventId: evt.id, staffId: person.id }); }}
                        title={evt.name}
                      >
                        {!finalized && (
                          <div
                            style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onEventBarMouseDown(e, evt.id, 'left'); }}
                          />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          style={{ fontSize: 10, paddingLeft: 10, paddingRight: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          {evt.name}
                        </span>
                        {!finalized && (
                          <div
                            style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onEventBarMouseDown(e, evt.id, 'right'); }}
                          />
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 14 }}>
                  <span className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
                    No shift — drag a shift here to schedule
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {/* Legend */}
    <div className="flex items-center gap-5 mt-3 px-1 flex-wrap">
      {[
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-green)', opacity: 0.7 }} />, label: 'Shift' },
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-yellow)', opacity: 0.75 }} />, label: 'Desk' },
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: '#3b2a6e', opacity: 0.9 }} />, label: 'Event' },
      ].map(({ swatch, label }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          {swatch}{label}
        </div>
      ))}
      {!finalized && (
        <div className="flex items-center gap-1.5 text-xs ml-2" style={{ color: 'var(--color-text-dim)' }}>
          <span style={{ opacity: 0.5 }}>—</span>
          <span>Drag bars to move · drag edges to resize · drag rows to reorder · drag bars to trash to remove</span>
        </div>
      )}
    </div>
    </>
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

const EVENT_TYPES = ['program', 'service', 'meeting', 'workshop'];
const TIME_STEPS  = Array.from({ length: (HOURS_END - HOURS_START) * 2 + 1 }, (_, i) => HOURS_START + i * 0.5);

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

function EditModal({ target, orderedStaff, allEvents, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (target.type === 'shift') {
      const p = orderedStaff[target.staffIndex];
      return { shiftStart: p.shiftStart, shiftEnd: p.shiftEnd };
    }
    if (target.type === 'desk') {
      const p = orderedStaff[target.staffIndex];
      return { deskStart: p.deskStart, deskEnd: p.deskEnd };
    }
    const evt = allEvents.find(e => e.id === target.eventId);
    return { name: evt?.name || '', type: evt?.type || 'program', start: evt?.start || 9, end: evt?.end || 10, staffNeeded: evt?.staffNeeded || 1, notes: evt?.notes || '' };
  });

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = target.type === 'shift' ? 'Edit Shift' : target.type === 'desk' ? 'Edit Desk Shift' : 'Edit Event';
  const staffName = (target.type === 'shift' || target.type === 'desk') ? orderedStaff[target.staffIndex]?.name : null;
  const shiftBounds = target.type === 'desk' ? { min: orderedStaff[target.staffIndex]?.shiftStart, max: orderedStaff[target.staffIndex]?.shiftEnd } : null;

  const fieldLabel = { display: 'block', fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 4 };
  const textInput = {
    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
    background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
  };

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
                <TimeSelect value={form.deskStart} onChange={v => setForm(f => ({ ...f, deskStart: Math.min(v, f.deskEnd - 0.5) }))} min={shiftBounds?.min} max={form.deskEnd - 0.5} />
              </div>
              <div>
                <label style={fieldLabel}>Desk End</label>
                <TimeSelect value={form.deskEnd} onChange={v => setForm(f => ({ ...f, deskEnd: Math.max(v, f.deskStart + 0.5) }))} min={form.deskStart + 0.5} max={shiftBounds?.max} />
              </div>
            </>
          )}
          {target.type === 'event' && (
            <>
              <div>
                <label style={fieldLabel}>Event Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={textInput} />
              </div>
              <div>
                <label style={fieldLabel}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={textInput}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label style={fieldLabel}>Start</label>
                  <TimeSelect value={form.start} onChange={v => setForm(f => ({ ...f, start: Math.min(v, f.end - 0.5) }))} max={form.end - 0.5} />
                </div>
                <div className="flex-1">
                  <label style={fieldLabel}>End</label>
                  <TimeSelect value={form.end} onChange={v => setForm(f => ({ ...f, end: Math.max(v, f.start + 0.5) }))} min={form.start + 0.5} />
                </div>
              </div>
              <div>
                <label style={fieldLabel}>Staff Needed</label>
                <input type="number" min={1} max={20} value={form.staffNeeded} onChange={e => setForm(f => ({ ...f, staffNeeded: parseInt(e.target.value) || 1 }))} style={textInput} />
              </div>
              <div>
                <label style={fieldLabel}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...textInput, resize: 'none' }} />
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

// ── Events panel ───────────────────────────────────────────────────────────────

function EventsPanel({ events, staff, onAddEvent }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Special Events</h3>
        <button onClick={onAddEvent} className="px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer"
          style={{ background: 'var(--color-accent)', color: 'white' }}>
          + Add Event
        </button>
      </div>
      <div className="grid gap-3">
        {events.map(evt => {
          const assigned = staff.filter(s => evt.assignedStaff.includes(s.id));
          const filled   = assigned.length >= evt.staffNeeded;
          return (
            <div key={evt.id} className="p-4 rounded-xl border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold">{evt.name}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>{evt.type}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ background: filled ? '#1a2a1a' : '#2a1010', color: filled ? '#6ab888' : '#f07070' }}>
                  {assigned.length}/{evt.staffNeeded} staff
                </span>
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
                {formatTime(evt.start)} – {formatTime(evt.end)}
              </div>
              {evt.notes && <div className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>{evt.notes}</div>}
              {assigned.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {assigned.map(s => (
                    <span key={s.id} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}>{s.name}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DailySchedulePage() {
  const schedule = useScheduleContext();
  const navigate = useNavigate();

  const trashRef = useRef(null);

  const currentDateStr = (() => {
    const d = schedule.currentDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const currentDow = schedule.currentDate.getDay();
  const [localEvents, setLocalEvents] = useState(null); // non-null when a DB schedule is loaded

  const todayEvents = localEvents ?? schedule.events.filter(evt => {
    if (!evt.days?.length) return true;
    return evt.days.some(dateStr => {
      if (dateStr === currentDateStr) return true;
      if (evt.repeating) {
        const [y, m, day] = dateStr.split('-').map(Number);
        const eventDate = new Date(y, m - 1, day);
        const currentMidnight = new Date(
          schedule.currentDate.getFullYear(),
          schedule.currentDate.getMonth(),
          schedule.currentDate.getDate()
        );
        return eventDate.getDay() === currentDow && currentMidnight >= eventDate;
      }
      return false;
    });
  });

  const [orderedStaff,    setOrderedStaff]    = useState(() => {
    const ids = getScheduledIds(schedule.currentDate);
    return schedule.staff.map(s => ({ ...s, scheduled: ids.has(s.id) }));
  });
  const [dragRowIndex,    setDragRowIndex]     = useState(null);
  const [activeBar,       setActiveBar]        = useState(null);   // resize-only mouse drag
  const [finalized,       setFinalized]        = useState(false);
  const [trashHtmlOver,   setTrashHtmlOver]    = useState(false);
  const [activeDragType,  setActiveDragType]   = useState(null);   // toolbar chip drag
  const [draggingEventId, setDraggingEventId]  = useState(null);
  const [hoverRow,        setHoverRow]         = useState(null);
  const [draggingBarInfo, setDraggingBarInfo]  = useState(null);   // bar HTML5 drag
  const [contextMenu,     setContextMenu]      = useState(null);   // { x, y, target }
  const [editModal,       setEditModal]        = useState(null);   // { type, ... }

  useEffect(() => {
    const dateStr = schedule.currentDate.toISOString().split('T')[0];

    schedulesApi.getDay(dateStr)
      .then(saved => {
        // Finalized schedule found in DB — restore it exactly
        setOrderedStaff(saved.staff);
        setLocalEvents(saved.events);
        setFinalized(true);
      })
      .catch(() => {
        // 404 or backend unreachable — fall back to in-memory / weekly template
        setLocalEvents(null);
        const inMemory = schedule.getDaySchedule(schedule.currentDate.toDateString());
        if (inMemory) {
          setOrderedStaff(inMemory);
        } else {
          const ids = getScheduledIds(schedule.currentDate);
          setOrderedStaff(schedule.staff.map(s => ({ ...s, scheduled: ids.has(s.id) })));
        }
        setFinalized(false);
      });
  }, [schedule.currentDate.toDateString(), schedule.staff]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePrevDay() {
    schedule.saveDaySchedule(schedule.currentDate.toDateString(), orderedStaff);
    schedule.goToPrevDay();
  }

  function handleNextDay() {
    schedule.saveDaySchedule(schedule.currentDate.toDateString(), orderedStaff);
    schedule.goToNextDay();
  }

  function endDrag() {
    setActiveDragType(null);
    setDraggingEventId(null);
    setHoverRow(null);
  }

  // ── Row drag (reorder) ───────────────────────────────────────────────────────
  function handleRowDragStart(i) { setDragRowIndex(i); }

  function handleRowDragOver(e, i) {
    e.preventDefault();
    if (dragRowIndex === null || dragRowIndex === i) return;
    setOrderedStaff(prev => {
      const next = [...prev];
      const [item] = next.splice(dragRowIndex, 1);
      next.splice(i, 0, item);
      return next;
    });
    setDragRowIndex(i);
  }

  function handleRowDrop() { setDragRowIndex(null); }

  // ── Shift bar resize (mouse events only) ─────────────────────────────────────
  function handleBarMouseDown(e, staffIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const initialStart = orderedStaff[staffIndex].shiftStart;
    const initialEnd   = orderedStaff[staffIndex].shiftEnd;

    setActiveBar({ type: 'shift', staffIndex, mode });
    document.body.style.cursor     = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(me) {
      const delta = ((me.clientX - startX) / timelineWidth) * TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        if (mode === 'left')  p.shiftStart = snapHalf(clamp(initialStart + delta, HOURS_START, initialEnd - 0.5));
        else                   p.shiftEnd   = snapHalf(clamp(initialEnd   + delta, initialStart + 0.5, HOURS_END));
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

  // ── Desk bar resize (mouse events only) ──────────────────────────────────────
  function handleDeskBarMouseDown(e, staffIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const person0      = orderedStaff[staffIndex];
    const initialStart = person0.deskStart;
    const initialEnd   = person0.deskEnd;

    setActiveBar({ type: 'desk', staffIndex, mode });
    document.body.style.cursor     = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(me) {
      const delta = ((me.clientX - startX) / timelineWidth) * TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        if (mode === 'left')  p.deskStart = snapHalf(clamp(initialStart + delta, person0.shiftStart, initialEnd - 0.5));
        else                   p.deskEnd   = snapHalf(clamp(initialEnd   + delta, initialStart + 0.5, person0.shiftEnd));
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

  // ── Event bar resize (mouse events only) ─────────────────────────────────────
  function handleEventBarMouseDown(e, eventId, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const evt          = schedule.events.find(ev => ev.id === eventId);
    const initialStart = evt.start;
    const initialEnd   = evt.end;
    const updateEvent  = schedule.updateEvent;

    setActiveBar({ type: 'event', eventId, mode });
    document.body.style.cursor     = 'ew-resize';
    document.body.style.userSelect = 'none';

    function onMove(me) {
      const delta = ((me.clientX - startX) / timelineWidth) * TOTAL_HOURS;
      if (mode === 'left') updateEvent(eventId, { start: snapHalf(clamp(initialStart + delta, HOURS_START, initialEnd - 0.5)) });
      else                  updateEvent(eventId, { end:   snapHalf(clamp(initialEnd   + delta, initialStart + 0.5, HOURS_END)) });
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

  // ── Bar HTML5 drag — move + trash ────────────────────────────────────────────
  function handleShiftBarDragStart(e, staffIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const p = orderedStaff[staffIndex];
    setDraggingBarInfo({ type: 'shift', staffIndex, duration: p.shiftEnd - p.shiftStart });
  }

  function handleDeskBarDragStart(e, staffIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const p = orderedStaff[staffIndex];
    setDraggingBarInfo({ type: 'desk', staffIndex, duration: p.deskEnd - p.deskStart, shiftStart: p.shiftStart, shiftEnd: p.shiftEnd });
  }

  function handleEventBarDragStart(e, eventId, staffId) {
    e.dataTransfer.effectAllowed = 'move';
    const evt = schedule.events.find(ev => ev.id === eventId);
    setDraggingBarInfo({ type: 'event', eventId, staffId, duration: evt.end - evt.start });
  }

  function handleBarDragEnd() {
    setDraggingBarInfo(null);
  }

  // ── Bar right-click context menu ─────────────────────────────────────────────
  function handleBarContextMenu(e, target) {
    setContextMenu({ x: e.clientX, y: e.clientY, target });
  }

  function handleContextMenuDelete() {
    const { target } = contextMenu;
    setContextMenu(null);
    if (target.type === 'shift') {
      setOrderedStaff(prev => {
        const next = [...prev];
        next[target.staffIndex] = { ...next[target.staffIndex], scheduled: false };
        return next;
      });
    } else if (target.type === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        next[target.staffIndex] = { ...next[target.staffIndex], deskStart: null, deskEnd: null };
        return next;
      });
    } else if (target.type === 'event') {
      schedule.unassignStaffFromEvent(target.eventId, target.staffId);
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
        next[t.staffIndex] = { ...next[t.staffIndex], shiftStart: data.shiftStart, shiftEnd: data.shiftEnd };
        return next;
      });
    } else if (t.type === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        next[t.staffIndex] = { ...next[t.staffIndex], deskStart: data.deskStart, deskEnd: data.deskEnd };
        return next;
      });
    } else if (t.type === 'event') {
      schedule.updateEvent(t.eventId, { name: data.name, type: data.type, start: data.start, end: data.end, staffNeeded: data.staffNeeded, notes: data.notes });
    }
  }

  // Live repositioning while dragging a bar over a timeline
  function handleBarDragOver(e, rowIndex) {
    if (!draggingBarInfo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawHours = HOURS_START + ((e.clientX - rect.left) / rect.width) * TOTAL_HOURS;
    const { type, staffIndex, eventId, duration } = draggingBarInfo;

    if (type === 'shift' && staffIndex === rowIndex) {
      const newStart = snapHalf(clamp(rawHours - duration / 2, HOURS_START, HOURS_END - duration));
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        p.shiftStart = newStart;
        p.shiftEnd   = newStart + duration;
        next[staffIndex] = p;
        return next;
      });
    } else if (type === 'desk' && staffIndex === rowIndex) {
      const { shiftStart, shiftEnd } = draggingBarInfo;
      const newStart = snapHalf(clamp(rawHours - duration / 2, shiftStart, shiftEnd - duration));
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        p.deskStart = newStart;
        p.deskEnd   = newStart + duration;
        next[staffIndex] = p;
        return next;
      });
    }
    // Event bars: no live repositioning — drag is only used to drop to trash (unassign).
    // Use the resize handles on the bar edges to change event timing instead.
  }

  function handleBarDrop() { /* position already settled via dragover */ }

  // ── Timeline drop (toolbar chips) ────────────────────────────────────────────
  function handleTimelineDrop(staffIndex) {
    if (activeDragType === 'shift') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        if (p.scheduled) return prev;
        p.scheduled = true;
        next[staffIndex] = p;
        return next;
      });
    } else if (activeDragType === 'desk') {
      setOrderedStaff(prev => {
        const next = [...prev];
        const p = { ...next[staffIndex] };
        if (!p.scheduled || p.deskStart !== null) return prev;
        p.deskStart = p.shiftStart;
        p.deskEnd   = Math.min(p.shiftStart + 2, p.shiftEnd);
        next[staffIndex] = p;
        return next;
      });
    } else if (activeDragType === 'event' && draggingEventId !== null) {
      schedule.assignStaffToEvent(draggingEventId, orderedStaff[staffIndex].id);
    }
    endDrag();
  }

  const trashActive = trashHtmlOver;

  async function handleFinalize() {
    const date = schedule.currentDate.toISOString().split('T')[0];
    try {
      await schedulesApi.saveDay(date, { staff: orderedStaff, events: todayEvents });
    } catch (err) {
      console.warn('Schedule save failed — finalized locally only:', err.message);
    }
    setFinalized(true);
  }

  return (
    <div>
      <StatsHeader
        staff={orderedStaff} events={todayEvents} currentDate={schedule.currentDate}
        onPrev={handlePrevDay} onNext={handleNextDay}
        finalized={finalized} onFinalize={handleFinalize} onUnfinalize={() => setFinalized(false)}
      />
      <AlertsBar staff={orderedStaff.filter(s => s.scheduled)} events={todayEvents} />

      {/* Toolbar */}
      {!finalized && (
        <div className="flex items-start justify-between gap-4 mb-4 px-1">
          <div className="flex items-center gap-2 flex-wrap flex-1">
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
            {todayEvents.length > 0 && (
              <div className="w-px self-stretch" style={{ background: 'var(--color-border)', margin: '0 2px' }} />
            )}
            {todayEvents.map(evt => (
              <DragChip
                key={evt.id} label={evt.name}
                isActive={activeDragType === 'event' && draggingEventId === evt.id}
                color="#a080e0" borderColor="#3b2a6e" bg="rgba(59,42,110,0.25)"
                icon={<div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; setActiveDragType('event'); setDraggingEventId(evt.id); }}
                onDragEnd={endDrag}
              />
            ))}
          </div>

          {/* Trash zone */}
          <div
            ref={trashRef}
            onDragOver={e => e.preventDefault()}
            onDragEnter={() => setTrashHtmlOver(true)}
            onDragLeave={e => { if (!trashRef.current?.contains(e.relatedTarget)) setTrashHtmlOver(false); }}
            onDrop={() => {
              setTrashHtmlOver(false);
              // Row drag → unschedule
              if (dragRowIndex !== null) {
                setOrderedStaff(prev => {
                  const next = [...prev];
                  next[dragRowIndex] = { ...next[dragRowIndex], scheduled: false };
                  return next;
                });
                setDragRowIndex(null);
              }
              // Bar drag → delete/unschedule
              if (draggingBarInfo) {
                const { type, staffIndex, eventId } = draggingBarInfo;
                if (type === 'shift') {
                  setOrderedStaff(prev => {
                    const next = [...prev];
                    next[staffIndex] = { ...next[staffIndex], scheduled: false };
                    return next;
                  });
                } else if (type === 'desk') {
                  setOrderedStaff(prev => {
                    const next = [...prev];
                    next[staffIndex] = { ...next[staffIndex], deskStart: null, deskEnd: null };
                    return next;
                  });
                } else if (type === 'event') {
                  schedule.unassignStaffFromEvent(eventId, draggingBarInfo.staffId);
                }
                setDraggingBarInfo(null);
              }
              endDrag();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium shrink-0 transition-all"
            style={{
              borderColor: trashActive ? 'var(--color-red)' : 'var(--color-border)',
              color:        trashActive ? '#f07070' : 'var(--color-text-dim)',
              background:   trashActive ? 'rgba(200,64,64,0.12)' : 'transparent',
            }}
          >
            <span style={{ fontSize: 15 }}>🗑</span>
            Drop here to remove
          </div>
        </div>
      )}

      <ScheduleGrid
        staff={orderedStaff} events={todayEvents} finalized={finalized}
        dragRowIndex={dragRowIndex}
        onRowDragStart={handleRowDragStart} onRowDragOver={handleRowDragOver} onRowDrop={handleRowDrop}
        onBarMouseDown={handleBarMouseDown}
        onDeskBarMouseDown={handleDeskBarMouseDown}
        onEventBarMouseDown={handleEventBarMouseDown}
        activeBar={activeBar}
        activeDragType={activeDragType} hoverRow={hoverRow}
        onTimelineDragOver={setHoverRow} onTimelineDrop={handleTimelineDrop}
        draggingBarInfo={draggingBarInfo}
        onShiftBarDragStart={handleShiftBarDragStart}
        onDeskBarDragStart={handleDeskBarDragStart}
        onEventBarDragStart={handleEventBarDragStart}
        onBarDragEnd={handleBarDragEnd}
        onBarDragOver={handleBarDragOver}
        onBarDrop={handleBarDrop}
        onBarContextMenu={handleBarContextMenu}
      />
      <EventsPanel staff={orderedStaff} events={todayEvents} onAddEvent={() => navigate('/add-event')} />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          onEdit={handleContextMenuEdit}
          onDelete={handleContextMenuDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
      {editModal && (
        <EditModal
          target={editModal}
          orderedStaff={orderedStaff}
          allEvents={schedule.events}
          onSave={handleEditSave}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
