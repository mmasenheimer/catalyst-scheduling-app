import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScheduleContext } from '../context/ScheduleContext';
import { buildAlerts, formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';

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
    <div className="flex justify-between items-center p-5 rounded-xl mb-6 border"
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
      <div className="flex items-center gap-3">
        <button onClick={onPrev} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>◀</button>
        <span className="text-sm font-medium min-w-48 text-center">{dateLabel}</span>
        <button onClick={onNext} className="px-3 py-1.5 rounded-md text-sm border cursor-pointer"
          style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>▶</button>
      </div>
      <div className="flex gap-6">
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
                      className="absolute top-3 h-8 rounded border-2 overflow-hidden select-none"
                      style={{
                        ...posStyle(person.deskStart, person.deskEnd),
                        background: '#3d2c18',
                        borderColor: isDeskActive ? '#e0b050' : 'var(--color-yellow)',
                        opacity: isDeskDragging ? 0.3 : (isDeskActive ? 1 : 0.85),
                        cursor: finalized ? 'default' : 'grab',
                        boxShadow: isDeskActive ? '0 0 0 2px var(--color-yellow)' : 'none',
                        transition: isDeskActive || isDeskDragging ? 'none' : 'box-shadow 0.1s',
                        zIndex: isDeskActive ? 10 : 2,
                      }}
                      onDragStart={e => { e.stopPropagation(); !finalized && onDeskBarDragStart(e, i); }}
                      onDragEnd={onBarDragEnd}
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
                        onDragStart={e => { e.stopPropagation(); !finalized && onEventBarDragStart(e, evt.id); }}
                        onDragEnd={onBarDragEnd}
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
        { swatch: <div style={{ width: 28, height: 12, borderRadius: 3, background: '#3d2c18', border: '2px solid var(--color-yellow)' }} />, label: 'Desk' },
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

  const [orderedStaff,    setOrderedStaff]    = useState(() => {
    const ids = getScheduledIds(new Date());
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

  useEffect(() => {
    const ids = getScheduledIds(schedule.currentDate);
    setOrderedStaff(schedule.staff.map(s => ({ ...s, scheduled: ids.has(s.id) })));
    setFinalized(false);
  }, [schedule.currentDate.toDateString()]);

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

  function handleEventBarDragStart(e, eventId) {
    e.dataTransfer.effectAllowed = 'move';
    const evt = schedule.events.find(ev => ev.id === eventId);
    setDraggingBarInfo({ type: 'event', eventId, duration: evt.end - evt.start });
  }

  function handleBarDragEnd() {
    setDraggingBarInfo(null);
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
    } else if (type === 'event') {
      const newStart = snapHalf(clamp(rawHours - duration / 2, HOURS_START, HOURS_END - duration));
      schedule.updateEvent(eventId, { start: newStart, end: newStart + duration });
    }
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

  return (
    <div>
      <StatsHeader
        staff={orderedStaff} events={schedule.events} currentDate={schedule.currentDate}
        onPrev={schedule.goToPrevDay} onNext={schedule.goToNextDay}
        finalized={finalized} onFinalize={() => setFinalized(true)} onUnfinalize={() => setFinalized(false)}
      />
      <AlertsBar staff={orderedStaff.filter(s => s.scheduled)} events={schedule.events} />

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
            {schedule.events.length > 0 && (
              <div className="w-px self-stretch" style={{ background: 'var(--color-border)', margin: '0 2px' }} />
            )}
            {schedule.events.map(evt => (
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
                  schedule.removeEvent(eventId);
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
        staff={orderedStaff} events={schedule.events} finalized={finalized}
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
      />
      <EventsPanel staff={orderedStaff} events={schedule.events} onAddEvent={() => navigate('/add-event')} />
    </div>
  );
}
