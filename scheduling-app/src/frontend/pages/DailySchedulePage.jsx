import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { buildAlerts, formatTime, mergeStaffOverrides, orphanedByShiftRemoval, getEventsForDate, toDateStr, stretchShiftsToCoverEvents, mergeStaffShifts, isShiftOutsideAvailability, deskBoundsFor } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, EVENT_TYPES } from '../../data/mockData';
// Availability comes from ScheduleContext (backed by the database), not from a
// hardcoded file — see the note on `availability` in hooks/useSchedule.js.
import { useTemplates } from '../context/TemplatesContext';
import { useDragAutoScroll } from '../hooks/useDragAutoScroll';
import { schedulesApi, isConflict } from '../utils/api';
import { ApplyTemplateCalendarModal } from '../components/ApplyTemplateCalendarModal';
import { RangeCalendar } from '../components/RangeCalendar';
import { ArrowLeftIcon } from '../components/ArrowLeftIcon';
import { ArrowRightIcon } from '../components/ArrowRightIcon';
import { DeleteIcon } from '../components/DeleteIcon';

const TOTAL_HOURS = HOURS_END - HOURS_START;

const DOW_TO_DAY    = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

function snapHalf(h)        { return Math.round(h * 2) / 2; }
function clamp(v, lo, hi)   { return Math.max(lo, Math.min(hi, v)); }

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

// ── Stats header ───────────────────────────────────────────────────────────────

function StatsHeader({ staff, events, currentDate, onPrev, onNext, finalized, onFinalize, onUnfinalize, onApplyTemplate, onSaveAsTemplate }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const scheduled   = staff.filter(s => s.shifts?.length > 0);
  const nowHour     = now.getHours() + now.getMinutes() / 60;
  const onShiftNow  = scheduled.filter(s => s.shifts.some(sh => sh.start <= nowHour && sh.end > nowHour)).length;
  const dateLabel   = currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
          {finalized ? '✓ Finalized' : 'Finalize'}
        </button>
        {!finalized && (
          <button onClick={onApplyTemplate}
            className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer"
            style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}>
            Apply Template
          </button>
        )}
        <button onClick={onSaveAsTemplate}
          className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer"
          style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text)'; }}>
          Save as Template
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer flex items-center justify-center"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}><ArrowLeftIcon size={16} /></button>
        <span className="text-sm font-medium min-w-36 sm:min-w-48 text-center">{dateLabel}</span>
        <button onClick={onNext} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer flex items-center justify-center"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}><ArrowRightIcon size={16} /></button>
      </div>
      <div className="flex gap-4 sm:gap-6">
        {[
          { label: 'On Shift Today', value: scheduled.length },
          { label: 'On Shift Now', value: onShiftNow },
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

// Memoized so it skips re-rendering (and re-running buildAlerts) while a drag/
// resize is active — the parent freezes its props during a gesture, so this
// only recomputes once the gesture ends.
const AlertsBar = memo(function AlertsBar({ staff, events, dow }) {
  const alerts   = buildAlerts(staff, events, dow);
  const dotColor = { understaffed: 'var(--color-green)', yellow: 'var(--color-yellow)', event: '#a080e0', blue: 'var(--color-accent-bright)' };
  return (
    <div className="p-3 rounded-xl mb-5 border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-yellow)' }}>Alerts</h3>
      {alerts.map((a, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-sm" style={{ color: 'var(--color-text-dim)' }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor[a.type] }} />
          {a.text}
        </div>
      ))}
    </div>
  );
});

// ── Schedule grid ──────────────────────────────────────────────────────────────

function ScheduleGrid({
  staff, events, finalized,
  onBarMouseDown, onDeskBarMouseDown, onEventBarMouseDown, activeBar,
  activeDragType, hoverRow, onTimelineDragOver, onTimelineDrop,
  draggingBarInfo,
  onShiftBarDragStart, onDeskBarDragStart, onEventBarDragStart, onBarDragEnd,
  onBarDragOver, onBarDrop,
  onBarContextMenu,
  getPersonAvailability,
  previewInfo,
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
        <div className="flex-1 flex relative">
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
        return (
          <div
            key={person.id}
            className="flex border-b last:border-b-0"
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
              {!finalized && (
                <span className="text-xs select-none shrink-0" style={{ color: 'var(--color-muted)', lineHeight: 1 }}>⠿</span>
              )}
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
            </div>

            {/* Timeline */}
            <div
              className="flex-1 relative"
              data-timeline="true"
              style={{ height: 46 }}
              onDragOver={e => {
                const hasToolbar = !!activeDragType;
                const hasBar     = !!draggingBarInfo;
                if (!hasToolbar && !hasBar) return;
                e.preventDefault();
                e.stopPropagation();
                if (hasToolbar) onTimelineDragOver(e, i);
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
              {/* Availability background — sits behind all bars */}
              {getPersonAvailability?.(person.id).map((block, bi) => (
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

              {/* Toolbar-chip drop highlight (skip for events — preview ghost is more precise) */}
              {activeDragType && activeDragType !== 'event' && hoverRow === i && (
                <div className="absolute inset-0 pointer-events-none rounded-r-lg"
                  style={{ ...toolbarHighlight, border: '1px dashed', zIndex: 20 }} />
              )}

              {/* Placement preview ghost (shift=green, desk=yellow, event=purple, invalid=red) */}
              {previewInfo?.staffIndex === i && previewInfo.start !== null && (
                <div
                  className="absolute pointer-events-none rounded"
                  style={{
                    top: '50%', transform: 'translateY(-50%)', height: 28,
                    left:  `${((previewInfo.start - HOURS_START) / TOTAL_HOURS) * 100}%`,
                    width: `${((previewInfo.end - previewInfo.start) / TOTAL_HOURS) * 100}%`,
                    background: previewInfo.valid
                      ? (currentDragType === 'shift' ? 'rgba(74,124,94,0.35)' : currentDragType === 'desk' ? 'rgba(200,148,56,0.35)' : 'rgba(59,42,110,0.5)')
                      : 'rgba(200,64,64,0.25)',
                    border: `2px dashed ${previewInfo.valid
                      ? (currentDragType === 'shift' ? 'var(--color-green)' : currentDragType === 'desk' ? 'var(--color-yellow)' : '#7c5cbf')
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
                    draggable={!finalized}
                    className="absolute h-6 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(shift.start, shift.end),
                      top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--color-green)',
                      opacity: isShiftDragging ? 0.3 : (isBarActive ? 0.85 : 0.6),
                      cursor: finalized ? 'default' : 'grab',
                      boxShadow: isBarActive ? '0 0 0 2px var(--color-green)' : 'none',
                      transition: isBarActive || isShiftDragging ? 'none' : 'box-shadow 0.1s',
                      zIndex: isBarActive ? 10 : 1,
                    }}
                    onDragStart={e => { e.stopPropagation(); !finalized && onShiftBarDragStart(e, i, si); }}
                    onDragEnd={onBarDragEnd}
                    onContextMenu={e => { e.preventDefault(); !finalized && onBarContextMenu(e, { type: 'shift', staffIndex: i, shiftIndex: si }); }}
                  >
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, si, 'left'); }}
                      />
                    )}
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.18)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onBarMouseDown(e, i, si, 'right'); }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Desk bars */}
              {person.deskShifts.map((desk, di) => {
                const isDeskActive    = activeBar?.type === 'desk' && activeBar?.staffIndex === i && activeBar?.deskIndex === di;
                const isDeskDragging  = draggingBarInfo?.type === 'desk' && draggingBarInfo?.staffIndex === i && draggingBarInfo?.deskIndex === di;
                return (
                  <div
                    key={desk.id}
                    draggable={!finalized}
                    className="absolute h-6 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(desk.start, desk.end),
                      top: '50%', transform: 'translateY(-50%)',
                      background: 'var(--color-yellow)',
                      opacity: isDeskDragging ? 0.3 : (isDeskActive ? 1 : 0.75),
                      cursor: finalized ? 'default' : 'grab',
                      boxShadow: isDeskActive ? '0 0 0 2px #e0b050' : 'none',
                      transition: isDeskActive || isDeskDragging ? 'none' : 'box-shadow 0.1s',
                      zIndex: isDeskActive ? 10 : 2,
                    }}
                    onDragStart={e => { e.stopPropagation(); !finalized && onDeskBarDragStart(e, i, di); }}
                    onDragEnd={onBarDragEnd}
                    onContextMenu={e => { e.preventDefault(); !finalized && onBarContextMenu(e, { type: 'desk', staffIndex: i, deskIndex: di }); }}
                  >
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', left: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, di, 'left'); }}
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', paddingLeft: 10, paddingRight: 10 }}>
                      Desk
                    </span>
                    {!finalized && (
                      <div
                        style={{ position: 'absolute', right: 0, top: 0, width: 7, height: '100%', cursor: 'ew-resize', background: 'rgba(255,255,255,0.15)', zIndex: 2 }}
                        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDeskBarMouseDown(e, i, di, 'right'); }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Event bars — HTML5 draggable for move/trash, mouse events for resize */}
              {events.filter(e => e.assignedStaff.includes(person.id)).map(evt => {
                const isEvtActive   = activeBar?.type === 'event' && activeBar?.eventId === evt.id;
                const isEvtDragging = draggingBarInfo?.type === 'event' && draggingBarInfo?.eventId === evt.id;
                return (
                  <div
                    key={evt.id}
                    draggable={!finalized}
                    className="absolute h-6 rounded overflow-hidden select-none"
                    style={{
                      ...posStyle(evt.start, evt.end),
                      top: '50%', transform: 'translateY(-50%)',
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
        style={{ ...btn('#f07070'), display: 'flex', alignItems: 'center', gap: 6 }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,64,64,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={onDelete}
      >
        <DeleteIcon size={13} /> Delete
      </button>
    </div>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

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
      const shift = orderedStaff[target.staffIndex].shifts[target.shiftIndex];
      return { shiftStart: shift.start, shiftEnd: shift.end };
    }
    if (target.type === 'desk') {
      const desk = orderedStaff[target.staffIndex].deskShifts[target.deskIndex];
      return { deskStart: desk.start, deskEnd: desk.end };
    }
    const evt = allEvents.find(e => e.id === target.eventId);
    return { name: evt?.name || '', type: evt?.type || 'program', start: evt?.start || 9, end: evt?.end || 10, staffNeeded: evt?.staffNeeded || 1, notes: evt?.notes || '', repeating: !!evt?.repeating, repeatFrom: evt?.repeatFrom ?? null, repeatUntil: evt?.repeatUntil ?? null, days: evt?.days ?? [] };
  });

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = target.type === 'shift' ? 'Edit Shift' : target.type === 'desk' ? 'Edit Desk Shift' : 'Edit Event';
  const staffName = (target.type === 'shift' || target.type === 'desk') ? orderedStaff[target.staffIndex]?.name : null;
  const shiftBounds = null;

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
              {/* Only single-date events can repeat weekly. */}
              <label
                className="flex items-center gap-2 select-none"
                style={{
                  cursor: (form.days?.length ?? 0) > 1 ? 'not-allowed' : 'pointer',
                  opacity: (form.days?.length ?? 0) > 1 ? 0.5 : 1,
                }}
              >
                <input
                  type="checkbox"
                  disabled={(form.days?.length ?? 0) > 1}
                  checked={form.repeating && (form.days?.length ?? 0) <= 1}
                  onChange={e => setForm(f => ({
                    ...f,
                    repeating: e.target.checked,
                    ...(e.target.checked ? {} : { repeatFrom: null, repeatUntil: null }),
                  }))}
                  style={{
                    width: 15, height: 15, accentColor: 'var(--color-accent)',
                    cursor: (form.days?.length ?? 0) > 1 ? 'not-allowed' : 'pointer',
                  }}
                />
                <span className="text-sm" style={{ color: 'var(--color-text-dim)' }}>Repeats weekly</span>
              </label>
              {(form.days?.length ?? 0) > 1 && (
                <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: -6 }}>
                  This event has {form.days.length} dates — repetition is only available for single-date events.
                </p>
              )}
              {form.repeating && (form.days?.length ?? 0) <= 1 && (
                <div>
                  <label style={fieldLabel}>How long should it repeat?</label>
                  <RangeCalendar
                    from={form.repeatFrom}
                    until={form.repeatUntil}
                    onChange={({ from, until }) => setForm(f => ({ ...f, repeatFrom: from, repeatUntil: until }))}
                    highlightDow={form.days?.[0] ? new Date(form.days[0] + 'T00:00:00').getDay() : undefined}
                  />
                  <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 6 }}>
                    Leave empty to repeat indefinitely.
                  </p>
                </div>
              )}
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

// ── Save as day template modal ─────────────────────────────────────────────────

function SaveAsDayTemplateModal({ currentDate, staff, onSave, onClose }) {
  const [name,      setName]      = useState('');
  const [desc,      setDesc]      = useState('');
  const [nameError, setNameError] = useState('');
  const dayName = DOW_TO_DAY[currentDate.getDay()] ?? 'Monday';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Template name is required.'); return; }
    // A duplicate name isn't rejected — addTemplate numbers the copy.
    try {
      await onSave({
        type: 'day',
        day: dayName,
        name: trimmed,
        description: desc.trim(),
        staff: staff.filter(s => s.shifts?.length > 0),
      });
      onClose();
    } catch (err) {
      setNameError(err.message || 'Failed to save template.');
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-xl border p-5"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Save as Day Template</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-dim)' }}>
          Saving {staff.filter(s => s.shifts?.length > 0).length} scheduled staff for <strong style={{ color: 'var(--color-text)' }}>{dayName}</strong>
        </p>

        <div className="mb-3">
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>Template Name *</label>
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setNameError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={`e.g. Busy ${dayName}`}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13,
              background: 'var(--color-muted)', border: `1px solid ${nameError ? 'var(--color-red)' : 'var(--color-border)'}`,
              color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {nameError && <div style={{ fontSize: 11, color: 'var(--color-red)', marginTop: 4 }}>{nameError}</div>}
        </div>
        <div className="mb-5">
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>Description (optional)</label>
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Optional notes"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13,
              background: 'var(--color-muted)', border: '1px solid var(--color-border)',
              color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'var(--color-muted)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--color-accent)', color: 'white', border: 'none' }}>
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Availability warning modal ─────────────────────────────────────────────────

function AvailWarningModal({ staffName, title, message, confirmLabel = 'Schedule Anyway', onConfirm, onCancel }) {
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
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
              {title ?? 'Outside Availability'}
            </h3>
            <p className="text-sm mt-1.5 leading-snug" style={{ color: 'var(--color-text-dim)' }}>
              {message ?? <>This shift falls outside <strong style={{ color: 'var(--color-text)' }}>{staffName}</strong>'s submitted availability for today.</>}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Events panel ───────────────────────────────────────────────────────────────

function EventsPanel({ events, staff, onAddEvent, onDeleteEvent }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-semibold mt-2" style={{ color: 'var(--color-text)' }}>Special Events</h3>
        <button onClick={onAddEvent} className="px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer"
          style={{ background: 'var(--color-accent)', color: 'white' }}>
          + Add Event
        </button>
      </div>
      <div className="grid gap-2">
        {events.map(evt => {
          const assigned = staff.filter(s => evt.assignedStaff.includes(s.id));
          const filled   = assigned.length >= evt.staffNeeded;
          return (
            <div key={evt.id} className="p-3 rounded-xl border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold">{evt.name}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>{evt.type}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: filled ? '#1a2a1a' : '#2a1010', color: filled ? '#6ab888' : '#f07070' }}>
                    {assigned.length}/{evt.staffNeeded} staff
                  </span>
                  <button onClick={() => onDeleteEvent(evt)}
                    title="Delete event"
                    className="text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center"
                    style={{ background: 'transparent', color: 'var(--color-red)', border: '1px solid var(--color-red)' }}>
                    <DeleteIcon size={13} />
                  </button>
                </div>
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
  // Stable reader; `schedule.availability` is what changes identity when a fetch
  // lands, and it's already part of `schedule` so this page re-renders with it.
  const { getAvailability } = schedule;
  const { templates, addTemplate } = useTemplates();
  const navigate = useNavigate();

  const trashRef = useRef(null);

  const currentDow = schedule.currentDate.getDay();
  const dateStr    = toDateStr(schedule.currentDate);

  // Always derived live — events are global and shouldn't freeze just because
  // the day's staff schedule was finalized (unlike shifts, there's no reason
  // a finalized day should show a stale/different event list than reality).
  const todayEvents = getEventsForDate(schedule.currentDate, schedule.events);

  // Nobody is scheduled until the day's saved schedule arrives from the backend.
  const [orderedStaff,    setOrderedStaff]    = useState(() =>
    schedule.staff.map(s => normalizeStaff({ ...s, scheduled: false })),
  );
  const [activeBar,       setActiveBar]        = useState(null);   // resize-only mouse drag
  const [finalized,       setFinalized]        = useState(true);   // days default to finalized until edited
  const [trashHtmlOver,   setTrashHtmlOver]    = useState(false);
  const [activeDragType,  setActiveDragType]   = useState(null);   // toolbar chip drag
  const [draggingEventId, setDraggingEventId]  = useState(null);
  const [hoverRow,        setHoverRow]         = useState(null);
  const [draggingBarInfo, setDraggingBarInfo]  = useState(null);   // bar HTML5 drag

  // Lets a drag reach rows below the fold — the toolbar chips sit at the top, so
  // without this a full roster's lower half is unreachable while dragging.
  useDragAutoScroll(Boolean(activeDragType || draggingBarInfo));
  const [contextMenu,     setContextMenu]      = useState(null);   // { x, y, target }
  const [editModal,       setEditModal]        = useState(null);   // { type, ... }
  const [availWarning,    setAvailWarning]     = useState(null);   // { staffName, onConfirm, onCancel }
  const [applyTplOpen,    setApplyTplOpen]     = useState(false);
  const [saveTplOpen,     setSaveTplOpen]      = useState(false);
  const [finalizeWarning, setFinalizeWarning]  = useState(null);   // alert list when finalizing with issues
  const [previewInfo,     setPreviewInfo]      = useState(null);   // { staffIndex, start, end, valid }

  // Frozen inputs for the Alerts bar so it doesn't recompute/flicker mid-drag.
  const alertsStaffRef  = useRef([]);
  const alertsEventsRef = useRef([]);

  const orderedStaffRef    = useRef(orderedStaff);
  const shiftDragActiveRef = useRef(false);
  useEffect(() => { orderedStaffRef.current = orderedStaff; }, [orderedStaff]);

  // Timeline row rects only change when the layout actually changes (window
  // resize), not on every dragover tick — caching avoids forcing a synchronous
  // reflow on every mousemove-equivalent event during a drag.
  const rowRectCacheRef = useRef(new Map());
  function getRowRect(e, rowIdx) {
    const cached = rowRectCacheRef.current.get(rowIdx);
    if (cached && cached.el === e.currentTarget) return cached.rect;
    const rect = e.currentTarget.getBoundingClientRect();
    rowRectCacheRef.current.set(rowIdx, { el: e.currentTarget, rect });
    return rect;
  }
  useEffect(() => {
    function onResize() { rowRectCacheRef.current.clear(); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function sortByShift(arr) {
    return [...arr].sort((a, b) => {
      const aMin = a.shifts?.length ? Math.min(...a.shifts.map(s => s.start)) : Infinity;
      const bMin = b.shifts?.length ? Math.min(...b.shifts.map(s => s.start)) : Infinity;
      return aMin - bMin;
    });
  }

  // Skips the change-detector's next pass right after a load/finalize, so
  // restoring saved data isn't mistaken for an edit that should unfinalize the day.
  const justLoadedRef  = useRef(true);
  const baselineSigRef = useRef('');
  const autoSaveTimerRef = useRef(null);

  // The version of the day this editor loaded. Every save sends it, and the
  // server refuses the write if the day has moved on since — otherwise a second
  // tab (or a second manager) editing the same date would silently overwrite
  // everything done here, because a save replaces the whole day rather than
  // merging. Held in a ref so the debounced auto-save always reads the current
  // value rather than one captured when the timer was set.
  const versionRef = useRef(0);
  const [conflict, setConflict] = useState(false);

  // The date currently on screen. Unlike the effect closures this is always
  // up to date, which is what lets a save that resolves after the manager has
  // navigated tell whether its result still applies to what they're looking at.
  const currentDateStrRef = useRef(dateStr);
  useEffect(() => { currentDateStrRef.current = dateStr; }, [dateStr]);

  // What the debounced save is going to write, kept alongside the timer so the
  // same payload can be flushed early if the day changes first.
  const pendingSaveRef = useRef(null);

  // A conflict isn't recoverable by retrying: this editor's copy of the day is
  // stale, so every subsequent save would fail the same way. Say so once and stop.
  function handleSaveError(err) {
    if (isConflict(err)) setConflict(true);
    else console.warn('Schedule save failed:', err.message);
  }

  // One place every auto-save goes through. The version is passed in rather than
  // read here, because the two callers disagree about which one is right: the
  // debounce wants the newest (a save may have completed since it was queued),
  // while the flush-on-leave wants the one belonging to the day being left.
  //
  // Both guards below exist because this can resolve after the manager has moved
  // to another day. Adopting the version then would stamp the old day's number
  // onto the new day's editor, and raising the conflict banner would blame the
  // day on screen for a failure that belongs to one they've already left.
  function writeDay({ dateStr: forDate, staff, events }, expectedVersion) {
    return schedulesApi
      .saveDay(forDate, { staff, events, finalized: false, expectedVersion })
      .then(saved => {
        if (currentDateStrRef.current === forDate) {
          versionRef.current = saved.version ?? expectedVersion + 1;
        }
      })
      .catch(err => {
        if (currentDateStrRef.current === forDate) handleSaveError(err);
        else console.warn(`Auto-save for ${forDate} failed after navigating away:`, err.message);
      });
  }

  useEffect(() => {
    const dateStr = toDateStr(schedule.currentDate);

    schedulesApi.getDay(dateStr)
      .then(saved => {
        // Saved schedule found in DB — restore shift/desk overrides, but merge them onto
        // the live staff roster so staff added/removed/edited since this was saved are
        // reflected correctly, respecting the finalized flag (older docs saved before
        // this field existed default to finalized). Events are never restored from the
        // snapshot — they're always derived live (see todayEvents).
        // Sorted on load, the same way the weekly editor does it. A saved array
        // keeps whatever order it was written in, and approving a drop/cover
        // clears someone's shifts without reordering — so without this they'd
        // stay stranded mid-list instead of sinking to the unscheduled group.
        setOrderedStaff(sortByShift(mergeStaffOverrides(schedule.staff, saved.staff).map(normalizeStaff)));
        setFinalized(saved.finalized ?? true);
        versionRef.current = saved.version ?? 0;
        setConflict(false);
        justLoadedRef.current = true;
      })
      .catch(() => {
        // 404 or backend unreachable — fall back to whatever is in memory. With
        // neither, the day is genuinely unscheduled; it used to fall back to the
        // hardcoded weeklyTemplates seed, which showed invented shifts for real
        // people on a day nobody had ever been scheduled.
        const inMemory = schedule.getDaySchedule(schedule.currentDate.toDateString());
        if (inMemory) {
          setOrderedStaff(sortByShift(mergeStaffOverrides(schedule.staff, inMemory).map(normalizeStaff)));
        } else {
          setOrderedStaff(sortByShift(schedule.staff.map(s => normalizeStaff({ ...s, scheduled: false }))));
        }
        // No saved row for this day yet — version 0 means "expect it absent".
        versionRef.current = 0;
        setConflict(false);
        setFinalized(true);
        justLoadedRef.current = true;
      });
  }, [schedule.currentDate.toDateString(), schedule.staff]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-unfinalize: any real edit to staff/events while finalized flips the day
  // back to a draft and persists it, so a refresh doesn't silently revert to "finalized".
  useEffect(() => {
    const sig = JSON.stringify({ staff: orderedStaff, events: todayEvents });
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      baselineSigRef.current = sig;
      return;
    }
    if (sig === baselineSigRef.current) return;
    baselineSigRef.current = sig;

    if (finalized) setFinalized(false);

    // Recorded before the timer so that leaving the day can write exactly what
    // this edit would have written, rather than losing it.
    pendingSaveRef.current = { dateStr, staff: staffForSave(), events: todayEvents };

    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      // Read the version now, not when the timer was set: a save that completed
      // in the meantime has already advanced it.
      if (pending) writeDay(pending, versionRef.current);
    }, 600);
  }, [orderedStaff, todayEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the day with an edit still inside the debounce window.
  //
  // The timer used to simply survive: it fired after the next day had loaded and
  // read `versionRef` then, so it wrote the old day's staff carrying the new
  // day's version. The server rejected that, the edit was gone, and the conflict
  // banner appeared over a day that was never the problem. Whichever way it
  // landed, the last thing the manager did before clicking the arrow was lost.
  //
  // The edit was real, so it gets written now instead. `versionRef` still holds
  // the departing day's version here — the incoming day's fetch is in flight and
  // only overwrites it on resolve, long after this cleanup has run.
  useEffect(() => () => {
    if (!autoSaveTimerRef.current) return;
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) writeDay(pending, versionRef.current);
  }, [dateStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Being assigned to an event means being scheduled to work it, so shifts are
  // widened to cover assigned events on the way out. Dragging an event onto a
  // row already does this; enforcing it at every save is what covers the paths
  // that have no drag — above all repeating events, whose assignedStaff list is
  // shared by every occurrence and so never gets dropped onto a later day's row.
  function staffForSave() {
    // Merge after stretching: widening a shift to cover an event can leave it
    // butted against the next one, which is then the same continuous stretch
    // described twice.
    return mergeStaffShifts(stretchShiftsToCoverEvents(orderedStaff, todayEvents));
  }

  function handlePrevDay() {
    schedule.saveDaySchedule(schedule.currentDate.toDateString(), staffForSave());
    schedule.goToPrevDay();
  }

  function handleNextDay() {
    schedule.saveDaySchedule(schedule.currentDate.toDateString(), staffForSave());
    schedule.goToNextDay();
  }

  function endDrag() {
    setActiveDragType(null);
    setDraggingEventId(null);
    setHoverRow(null);
    setPreviewInfo(null);
  }

  // ── Toolbar chip drag-over: track cursor to show placement preview ───────────
  function handleTimelineDragOver(e, rowIndex) {
    setHoverRow(rowIndex);
    if (activeDragType !== 'shift' && activeDragType !== 'desk' && activeDragType !== 'event') return;
    const rect = getRowRect(e, rowIndex);
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
      const personEvents = todayEvents.filter(ev => ev.assignedStaff.includes(person.id));
      const valid = !person.deskShifts.some(d => start < d.end && end > d.start) &&
                    !personEvents.some(ev => start < ev.end && end > ev.start);
      setPreviewInfo({ staffIndex: rowIndex, start, end, valid });
    } else if (activeDragType === 'event' && draggingEventId !== null) {
      const evt = todayEvents.find(ev => ev.id === draggingEventId);
      if (!evt) return;
      const alreadyAssigned  = evt.assignedStaff.includes(person.id);
      const hasDeskConflict  = person.deskShifts?.some(d => d.start < evt.end && d.end > evt.start);
      const hasEventConflict = todayEvents.some(other =>
        other.id !== evt.id &&
        other.assignedStaff.includes(person.id) &&
        other.start < evt.end && other.end > evt.start
      );
      setPreviewInfo({ staffIndex: rowIndex, start: evt.start, end: evt.end, valid: !alreadyAssigned && !hasDeskConflict && !hasEventConflict });
    }
  }

  // ── Shift bar resize (mouse events only) ─────────────────────────────────────
  function handleBarMouseDown(e, staffIndex, shiftIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX          = e.clientX;
    const shift0          = orderedStaff[staffIndex].shifts[shiftIndex];
    const initialStart    = shift0.start;
    const initialEnd      = shift0.end;
    const otherShifts     = orderedStaff[staffIndex].shifts.filter((_, j) => j !== shiftIndex);
    const draggedPersonId = orderedStaff[staffIndex].id;
    const draggedShiftId  = shift0.id;

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

      const current = orderedStaffRef.current.find(s => s.id === draggedPersonId);
      if (current) {
        const finalShift = current.shifts.find(s => s.id === draggedShiftId);
        const blocks = getAvailability(current.id, currentDow);
        if (finalShift && isShiftOutsideAvailability(finalShift.start, finalShift.end, blocks)) {
          setAvailWarning({
            staffName: current.name,
            onConfirm: () => {
              setOrderedStaff(prev => sortByShift(prev));
              setAvailWarning(null);
            },
            onCancel: () => {
              setOrderedStaff(prev => {
                const pIdx = prev.findIndex(s => s.id === draggedPersonId);
                if (pIdx === -1) return sortByShift(prev);
                const next = [...prev];
                const p = { ...next[pIdx], shifts: [...next[pIdx].shifts] };
                const sIdx = p.shifts.findIndex(s => s.id === draggedShiftId);
                if (sIdx !== -1) p.shifts[sIdx] = { ...p.shifts[sIdx], start: initialStart, end: initialEnd };
                next[pIdx] = p;
                return sortByShift(next);
              });
              setAvailWarning(null);
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

  // ── Desk bar resize (mouse events only) ──────────────────────────────────────
  function handleDeskBarMouseDown(e, staffIndex, deskIndex, mode) {
    const timelineEl = e.currentTarget.closest('[data-timeline]');
    const { width: timelineWidth } = timelineEl.getBoundingClientRect();
    const startX       = e.clientX;
    const desk0        = orderedStaff[staffIndex].deskShifts[deskIndex];
    const initialStart = desk0.start;
    const initialEnd   = desk0.end;
    const otherDesks   = orderedStaff[staffIndex].deskShifts.filter((_, j) => j !== deskIndex);
    const personEvents = todayEvents.filter(ev => ev.assignedStaff.includes(orderedStaff[staffIndex].id));
    // Bounds come from the shift this turn belongs to. Falling back to the whole
    // studio day when none contains it let an already-stranded turn roam further.
    const { lo: shiftLo, hi: shiftHi } = deskBoundsFor(orderedStaff[staffIndex], desk0);

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
        if (!otherDesks.some(od => d.start < od.end && d.end > od.start) &&
            !personEvents.some(ev => d.start < ev.end && d.end > ev.start)) p.deskShifts[deskIndex] = d;
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
  function handleShiftBarDragStart(e, staffIndex, shiftIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const person = orderedStaff[staffIndex];
    const shift = person.shifts[shiftIndex];
    shiftDragActiveRef.current = true;
    setDraggingBarInfo({ type: 'shift', staffIndex, shiftIndex, shiftId: shift.id, personId: person.id, duration: shift.end - shift.start, originalStart: shift.start, originalEnd: shift.end });
  }

  function handleDeskBarDragStart(e, staffIndex, deskIndex) {
    e.dataTransfer.effectAllowed = 'move';
    const desk = orderedStaff[staffIndex].deskShifts[deskIndex];
    setDraggingBarInfo({ type: 'desk', staffIndex, deskIndex, deskId: desk.id, duration: desk.end - desk.start, originalStart: desk.start, originalEnd: desk.end });
  }

  function handleEventBarDragStart(e, eventId, staffId) {
    e.dataTransfer.effectAllowed = 'move';
    const evt = schedule.events.find(ev => ev.id === eventId);
    setDraggingBarInfo({ type: 'event', eventId, staffId, duration: evt.end - evt.start });
  }

  function handleBarDragEnd() {
    shiftDragActiveRef.current = false;
    setPreviewInfo(null);
    if (draggingBarInfo?.type === 'shift') {
      const { personId, shiftId, originalStart, originalEnd } = draggingBarInfo;
      const current = orderedStaffRef.current.find(s => s.id === personId);
      if (current) {
        const finalShift = current.shifts.find(s => s.id === shiftId);
        const blocks = getAvailability(current.id, currentDow);
        if (finalShift && isShiftOutsideAvailability(finalShift.start, finalShift.end, blocks)) {
          setDraggingBarInfo(null);
          setAvailWarning({
            staffName: current.name,
            onConfirm: () => {
              setOrderedStaff(prev => sortByShift(prev));
              setAvailWarning(null);
            },
            onCancel: () => {
              setOrderedStaff(prev => {
                const pIdx = prev.findIndex(s => s.id === personId);
                if (pIdx === -1) return sortByShift(prev);
                const next = [...prev];
                const p = { ...next[pIdx], shifts: [...next[pIdx].shifts] };
                const sIdx = p.shifts.findIndex(s => s.id === shiftId);
                if (sIdx !== -1) p.shifts[sIdx] = { ...p.shifts[sIdx], start: originalStart, end: originalEnd };
                next[pIdx] = p;
                return sortByShift(next);
              });
              setAvailWarning(null);
            },
          });
          return;
        }
      }
    }
    setDraggingBarInfo(null);
    setOrderedStaff(prev => sortByShift(prev));
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
        const p = { ...next[target.staffIndex] };
        p.shifts = p.shifts.filter((_, j) => j !== target.shiftIndex);
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
    } else if (t.type === 'event') {
      schedule.updateEvent(t.eventId, { name: data.name, type: data.type, start: data.start, end: data.end, staffNeeded: data.staffNeeded, notes: data.notes, repeating: data.repeating, repeatFrom: data.repeatFrom, repeatUntil: data.repeatUntil });
    }
  }

  // Live repositioning (same row) or ghost preview (cross-row) while dragging a bar
  function handleBarDragOver(e, rowIndex) {
    if (!draggingBarInfo) return;
    const rect = getRowRect(e, rowIndex);
    const rawHours = HOURS_START + ((e.clientX - rect.left) / rect.width) * TOTAL_HOURS;
    const { type, staffIndex, shiftIndex, deskIndex, eventId, duration } = draggingBarInfo;
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
          const personEvts = todayEvents.filter(ev => ev.assignedStaff.includes(p.id));
          if (!otherDesks.some(od => newStart < od.end && newEnd > od.start) &&
              !personEvts.some(ev => newStart < ev.end && newEnd > ev.start)) {
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
        const targetEvts = todayEvents.filter(ev => ev.assignedStaff.includes(target.id));
        const valid      = !target.deskShifts.some(d => newStart < d.end && newEnd > d.start) &&
                           !targetEvts.some(ev => newStart < ev.end && newEnd > ev.start);
        setPreviewInfo({ staffIndex: rowIndex, start: newStart, end: newEnd, valid });
      }

    } else if (type === 'event') {
      if (!sameRow) {
        const evt    = todayEvents.find(ev => ev.id === eventId);
        if (!evt) return;
        const target = orderedStaff[rowIndex];
        const alreadyAssigned  = evt.assignedStaff.includes(target.id);
        const hasDeskConflict  = target.deskShifts?.some(d => d.start < evt.end && d.end > evt.start);
        const hasEventConflict = todayEvents.some(other =>
          other.id !== evt.id &&
          other.assignedStaff.includes(target.id) &&
          other.start < evt.end && other.end > evt.start
        );
        setPreviewInfo({ staffIndex: rowIndex, start: evt.start, end: evt.end, valid: !alreadyAssigned && !hasDeskConflict && !hasEventConflict });
      }
    }
  }

  function handleBarDrop(e, rowIndex) {
    if (!draggingBarInfo) return;
    const { type, staffIndex, shiftIndex, deskIndex, eventId, staffId } = draggingBarInfo;
    if (staffIndex === rowIndex) return; // same-row position already settled via dragover
    if (!previewInfo || previewInfo.staffIndex !== rowIndex || !previewInfo.valid || previewInfo.start === null) return;

    setPreviewInfo(null);
    setDraggingBarInfo(null);
    const { start, end } = previewInfo;

    if (type === 'shift') {
      const targetPerson = orderedStaff[rowIndex];
      const blocks = getAvailability(targetPerson.id, currentDow);
      const srcId = orderedStaff[staffIndex].id;
      const tgtId = targetPerson.id;
      const capturedShiftIndex = shiftIndex;
      const doTransfer = () => {
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
          return next;
        });
      };
      if (isShiftOutsideAvailability(start, end, blocks)) {
        setAvailWarning({
          staffName: targetPerson.name,
          onConfirm: () => { doTransfer(); setAvailWarning(null); },
          onCancel:  () => setAvailWarning(null),
        });
      } else {
        doTransfer();
      }

    } else if (type === 'desk') {
      const doMove = () => setOrderedStaff(prev => {
        const next = [...prev];
        const src = { ...next[staffIndex] };
        src.deskShifts = src.deskShifts.filter((_, j) => j !== deskIndex);
        next[staffIndex] = src;
        const tgt = { ...next[rowIndex] };
        tgt.deskShifts = [...tgt.deskShifts, { id: `d${Date.now()}`, start, end }];
        next[rowIndex] = tgt;
        return next;
      });
      const conflict = orderedStaff.find((s, i) =>
        i !== rowIndex && i !== staffIndex && s.deskShifts?.some(d => start < d.end && end > d.start)
      );
      if (conflict) {
        setAvailWarning({
          title: 'Desk Conflict',
          message: `${conflict.name} is already on desk ${formatTime(start)}–${formatTime(end)}. Move anyway?`,
          confirmLabel: 'Move Anyway',
          onConfirm: () => { doMove(); setAvailWarning(null); },
          onCancel:  () => setAvailWarning(null),
        });
      } else {
        doMove();
      }

    } else if (type === 'event') {
      assignEventWithShiftCheck(eventId, rowIndex, { alsoUnassignStaffId: staffId });
    }
  }

  // ── Event assignment with shift-coverage check ────────────────────────────────
  function assignEventWithShiftCheck(eventId, targetStaffIndex, { alsoUnassignStaffId = null } = {}) {
    const evt    = todayEvents.find(ev => ev.id === eventId);
    const person = orderedStaff[targetStaffIndex];
    if (!evt || !person) return;

    const isCovered = person.shifts.some(s => s.start <= evt.start && s.end >= evt.end);
    const personId  = person.id;

    const doAssign = () => {
      if (alsoUnassignStaffId) schedule.unassignStaffFromEvent(eventId, alsoUnassignStaffId);
      schedule.assignStaffToEvent(eventId, personId);

      if (!isCovered) {
        setOrderedStaff(prev => {
          const pIdx = prev.findIndex(s => s.id === personId);
          if (pIdx === -1) return prev;
          const next = [...prev];
          const p    = { ...next[pIdx] };
          const hostIdx = p.shifts.findIndex(s => s.start <= evt.end && s.end >= evt.start);
          if (hostIdx !== -1) {
            p.shifts = [...p.shifts];
            p.shifts[hostIdx] = {
              ...p.shifts[hostIdx],
              start: Math.min(p.shifts[hostIdx].start, evt.start),
              end:   Math.max(p.shifts[hostIdx].end,   evt.end),
            };
          } else {
            p.shifts    = [...p.shifts, { id: `s${Date.now()}`, start: evt.start, end: evt.end }];
            p.scheduled = true;
          }
          next[pIdx] = p;
          return next;
        });
      }
    };

    if (!isCovered) {
      const hasPartialShift = person.shifts.some(s => s.start <= evt.end && s.end >= evt.start);
      setAvailWarning({
        staffName:    person.name,
        title:        hasPartialShift ? 'Shift Doesn\'t Cover Event' : 'No Shift During Event',
        message:      hasPartialShift
          ? <><strong style={{ color: 'var(--color-text)' }}>{person.name}</strong>'s shift doesn't fully cover <em>{evt.name}</em> ({formatTime(evt.start)}–{formatTime(evt.end)}). Their shift will be extended to cover it.</>
          : <><strong style={{ color: 'var(--color-text)' }}>{person.name}</strong> has no shift during <em>{evt.name}</em> ({formatTime(evt.start)}–{formatTime(evt.end)}). A new shift will be created.</>,
        confirmLabel: hasPartialShift ? 'Assign & Extend Shift' : 'Assign & Create Shift',
        onConfirm: () => { doAssign(); setAvailWarning(null); },
        onCancel:  () => setAvailWarning(null),
      });
    } else {
      doAssign();
    }
  }

  // ── Timeline drop (toolbar chips) ────────────────────────────────────────────
  function handleTimelineDrop(staffIndex) {
    if (activeDragType === 'shift') {
      const p = orderedStaff[staffIndex];
      // Use preview cursor position if valid; fall back to first free slot
      let newStart, newEnd;
      if (previewInfo?.staffIndex === staffIndex && previewInfo.valid) {
        newStart = previewInfo.start;
        newEnd   = previewInfo.end;
      } else {
        newStart = firstFreeSlot(p.shifts, 2);
        if (newStart === null) { endDrag(); return; }
        newEnd = newStart + 2;
      }
      const doPlace = () => {
        setOrderedStaff(prev => {
          const next = [...prev];
          const pp = { ...next[staffIndex] };
          pp.scheduled = true;
          pp.shifts = [...pp.shifts, { id: `s${Date.now()}`, start: newStart, end: newEnd }];
          next[staffIndex] = pp;
          return sortByShift(next);
        });
      };
      const blocks = getAvailability(p.id, currentDow);
      if (isShiftOutsideAvailability(newStart, newEnd, blocks)) {
        endDrag();
        setAvailWarning({
          staffName: p.name,
          onConfirm: () => { doPlace(); setAvailWarning(null); },
          onCancel: () => setAvailWarning(null),
        });
        return;
      }
      doPlace();
    } else if (activeDragType === 'desk') {
      const p = orderedStaff[staffIndex];
      const personEvents = todayEvents.filter(ev => ev.assignedStaff.includes(p.id));
      let newStart = null;
      if (previewInfo?.staffIndex === staffIndex && previewInfo.valid && previewInfo.start !== null) {
        newStart = previewInfo.start;
      } else {
        for (const shift of p.shifts) {
          const slot = firstFreeSlot(p.deskShifts, 1, shift.start, shift.end, personEvents);
          if (slot !== null) { newStart = slot; break; }
        }
      }
      if (newStart !== null) {
        const newEnd = newStart + 1;
        const doPlace = () => setOrderedStaff(prev => {
          const next = [...prev];
          const pp = { ...next[staffIndex] };
          pp.deskShifts = [...pp.deskShifts, { id: `d${Date.now()}`, start: newStart, end: newEnd }];
          next[staffIndex] = pp;
          return next;
        });
        const conflict = orderedStaff.find((s, i) =>
          i !== staffIndex && s.deskShifts?.some(d => newStart < d.end && newEnd > d.start)
        );
        if (conflict) {
          endDrag();
          setAvailWarning({
            title: 'Desk Conflict',
            message: `${conflict.name} is already on desk ${formatTime(newStart)}–${formatTime(newEnd)}. Place anyway?`,
            confirmLabel: 'Place Anyway',
            onConfirm: () => { doPlace(); setAvailWarning(null); },
            onCancel:  () => setAvailWarning(null),
          });
          return;
        }
        doPlace();
      }
    } else if (activeDragType === 'event' && draggingEventId !== null) {

      assignEventWithShiftCheck(draggingEventId, staffIndex);
    }
    endDrag();
  }

  const trashActive = trashHtmlOver;

  async function handleDeleteEvent(evt) {
    try {
      await schedule.removeEvent(evt.id);
    } catch (err) {
      console.warn('Failed to delete event:', err.message);
    }
  }

  async function doFinalize() {
    const date = toDateStr(schedule.currentDate);
    try {
      const saved = await schedulesApi.saveDay(date, {
        staff: staffForSave(), events: todayEvents, finalized: true,
        expectedVersion: versionRef.current,
      });
      versionRef.current = saved.version ?? versionRef.current + 1;
    } catch (err) {
      handleSaveError(err);
      if (isConflict(err)) return; // don't claim it's published when it isn't
      console.warn('Schedule save failed — finalized locally only:', err.message);
    }
    // This save itself shouldn't be mistaken for the next edit by the auto-unfinalize watcher.
    justLoadedRef.current = true;
    setFinalized(true);
  }

  async function handleUnfinalize() {
    setFinalized(false);
    const date = toDateStr(schedule.currentDate);
    try {
      const saved = await schedulesApi.saveDay(date, {
        staff: staffForSave(), events: todayEvents, finalized: false,
        expectedVersion: versionRef.current,
      });
      versionRef.current = saved.version ?? versionRef.current + 1;
    } catch (err) {
      handleSaveError(err);
      if (!isConflict(err)) console.warn('Schedule save failed — unfinalized locally only:', err.message);
    }
    justLoadedRef.current = true;
  }

  function handleFinalize() {
    const alerts = buildAlerts(orderedStaff.filter(s => s.shifts?.length > 0), todayEvents, currentDow);
    const issues = alerts.filter(a => a.type !== 'blue');
    if (issues.length > 0) {
      setFinalizeWarning(issues);
      return;
    }
    doFinalize();
  }

  return (
    <div>
      {/* Editing this day elsewhere means this copy is stale and nothing further
          will save. Deliberately loud and persistent rather than a toast: every
          subsequent edit is also being discarded, so the manager needs to stop. */}
      {conflict && (
        <div
          className="flex items-center justify-between gap-4 p-4 rounded-xl mb-4 border"
          style={{ background: 'rgba(200,64,64,0.12)', borderColor: 'var(--color-red)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f07070' }}>
              This day was changed somewhere else
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
              Your edits since then aren&apos;t being saved. Reload to pick up the newer version —
              anything you changed here will be lost.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-sm px-4 py-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity shrink-0"
            style={{ background: 'var(--color-red)', color: 'white', border: 'none' }}
          >
            Reload day
          </button>
        </div>
      )}

      <StatsHeader
        staff={orderedStaff} events={todayEvents} currentDate={schedule.currentDate}
        onPrev={handlePrevDay} onNext={handleNextDay}
        finalized={finalized} onFinalize={handleFinalize} onUnfinalize={handleUnfinalize}
        onApplyTemplate={() => setApplyTplOpen(true)}
        onSaveAsTemplate={() => setSaveTplOpen(true)}
      />
      {(() => {
        // Hold the alert inputs steady while a drag/resize is in progress so the
        // strip only updates once the gesture ends (avoids mid-drag layout shift).
        const draggingNow = !!(activeBar || draggingBarInfo || activeDragType);
        if (!draggingNow) {
          alertsStaffRef.current  = orderedStaff.filter(s => s.shifts?.length > 0);
          alertsEventsRef.current = todayEvents;
        }
        return <AlertsBar staff={alertsStaffRef.current} events={alertsEventsRef.current} dow={currentDow} />;
      })()}

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
              // Bar drag → delete/unschedule
              if (draggingBarInfo) {
                const { type, staffIndex, shiftIndex, deskIndex, eventId } = draggingBarInfo;
                if (type === 'shift') {
                  // Deleting a shift also clears the desk time and event
                  // assignments that were sitting on it — otherwise those bars
                  // stay on the row even though the person is now unscheduled.
                  const person    = orderedStaff[staffIndex];
                  const removed   = person.shifts[shiftIndex];
                  const remaining = person.shifts.filter((_, j) => j !== shiftIndex);
                  const orphaned  = orphanedByShiftRemoval(
                    removed,
                    remaining,
                    person.deskShifts ?? [],
                    todayEvents.filter(ev => ev.assignedStaff.includes(person.id)),
                  );
                  const orphanedDeskIds = new Set(orphaned.deskShifts.map(d => d.id));

                  setOrderedStaff(prev => {
                    const next = [...prev];
                    const p = { ...next[staffIndex] };
                    p.shifts = p.shifts.filter((_, j) => j !== shiftIndex);
                    p.scheduled = p.shifts.length > 0;
                    p.deskShifts = (p.deskShifts ?? []).filter(d => !orphanedDeskIds.has(d.id));
                    next[staffIndex] = p;
                    return sortByShift(next);
                  });
                  orphaned.events.forEach(ev => schedule.unassignStaffFromEvent(ev.id, person.id));
                } else if (type === 'desk') {
                  setOrderedStaff(prev => {
                    const next = [...prev];
                    const p = { ...next[staffIndex] };
                    p.deskShifts = p.deskShifts.filter((_, j) => j !== deskIndex);
                    next[staffIndex] = p;
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
            <DeleteIcon size={15} />
            Drop here to remove
          </div>
        </div>
      )}

      <ScheduleGrid
        staff={orderedStaff} events={todayEvents} finalized={finalized}
        onBarMouseDown={handleBarMouseDown}
        onDeskBarMouseDown={handleDeskBarMouseDown}
        onEventBarMouseDown={handleEventBarMouseDown}
        activeBar={activeBar}
        activeDragType={activeDragType} hoverRow={hoverRow}
        onTimelineDragOver={handleTimelineDragOver} onTimelineDrop={handleTimelineDrop}
        previewInfo={previewInfo}
        draggingBarInfo={draggingBarInfo}
        onShiftBarDragStart={handleShiftBarDragStart}
        onDeskBarDragStart={handleDeskBarDragStart}
        onEventBarDragStart={handleEventBarDragStart}
        onBarDragEnd={handleBarDragEnd}
        onBarDragOver={handleBarDragOver}
        onBarDrop={handleBarDrop}
        onBarContextMenu={handleBarContextMenu}
        getPersonAvailability={id => getAvailability(id, currentDow)}
      />
      <EventsPanel staff={orderedStaff} events={todayEvents} onAddEvent={() => navigate('/add-event')} onDeleteEvent={handleDeleteEvent} />

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
      {applyTplOpen && (
        <ApplyTemplateCalendarModal
          templates={templates}
          allStaff={schedule.staff}
          saveDaySchedule={schedule.saveDaySchedule}
          onClose={() => setApplyTplOpen(false)}
          onApplyStaff={(newStaff, dateStr) => {
            if (newStaff && dateStr === schedule.currentDate.toLocaleDateString('en-CA')) {
              setOrderedStaff(sortByShift(newStaff));
            }
          }}
        />
      )}
      {saveTplOpen && (
        <SaveAsDayTemplateModal
          currentDate={schedule.currentDate}
          staff={orderedStaff}
          onSave={addTemplate}
          onClose={() => setSaveTplOpen(false)}
        />
      )}
      {availWarning && (
        <AvailWarningModal
          staffName={availWarning.staffName}
          title={availWarning.title}
          message={availWarning.message}
          confirmLabel={availWarning.confirmLabel}
          onConfirm={availWarning.onConfirm}
          onCancel={availWarning.onCancel}
        />
      )}
      {finalizeWarning && (
        <AvailWarningModal
          title="Schedule Has Issues"
          message={
            <div>
              <p style={{ marginBottom: 8 }}>The following issues were found:</p>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {finalizeWarning.map((a, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.type === 'understaffed' ? 'var(--color-green)' : a.type === 'event' ? '#a080e0' : 'var(--color-yellow)', flexShrink: 0, marginTop: 3 }} />
                    <span style={{ color: 'var(--color-text-dim)' }}>{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          }
          confirmLabel="Finalize Anyway"
          onConfirm={() => { setFinalizeWarning(null); doFinalize(); }}
          onCancel={() => setFinalizeWarning(null)}
        />
      )}
    </div>
  );
}
