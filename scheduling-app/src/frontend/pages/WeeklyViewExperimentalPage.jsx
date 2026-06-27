import React, { useState, useEffect, useRef, useMemo, useImperativeHandle } from 'react';
import { useScheduleContext } from '../context/ScheduleContext';
import { useTemplates } from '../context/TemplatesContext';
import { buildAlerts, formatTime } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END, weeklyTemplates } from '../../data/mockData';
import { getAvailability } from '../../data/mockAvailability';
import { persistTemplates } from '../../data/mockTemplates';
import { schedulesApi } from '../utils/api';
import { ApplyTemplateCalendarModal } from '../components/ApplyTemplateCalendarModal';

const TOTAL_HOURS = HOURS_END - HOURS_START;
const NAME_COL    = 140;
const ROW_H       = 46;
const ALL_DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DOW_TO_TPL  = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const EVENT_TYPES = ['program', 'service', 'meeting', 'workshop'];
const TIME_STEPS  = Array.from({ length: (HOURS_END - HOURS_START) * 2 + 1 }, (_, i) => HOURS_START + i * 0.5);

// ── Utilities ──────────────────────────────────────────────────────────────────
function snapHalf(h)      { return Math.round(h * 2) / 2; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toDateStr(date)  { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }

function getMondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function normalizeStaff(s) {
  const shifts = s.shifts ?? (s.shiftStart != null ? [{ id: `s${s.id}-0`, start: s.shiftStart, end: s.shiftEnd }] : []);
  const deskShifts = s.deskShifts ?? (s.deskStart != null ? [{ id: `d${s.id}-0`, start: s.deskStart, end: s.deskEnd }] : []);
  return { ...s, shifts, deskShifts, scheduled: shifts.length > 0 };
}

function blankStaff(s) {
  return normalizeStaff({ ...s, shifts: [], deskShifts: [], scheduled: false, shiftStart: null, shiftEnd: null, deskStart: null, deskEnd: null });
}

function sortByShift(arr) {
  return [...arr].sort((a, b) => {
    const aMin = a.shifts?.length ? Math.min(...a.shifts.map(s => s.start)) : Infinity;
    const bMin = b.shifts?.length ? Math.min(...b.shifts.map(s => s.start)) : Infinity;
    return aMin - bMin;
  });
}

function getStaffForDate(date, getDaySchedule, allStaff) {
  const saved = getDaySchedule(toDateStr(date)) ?? getDaySchedule(date.toDateString());
  const tplStaff = weeklyTemplates[DOW_TO_TPL[date.getDay()]]?.staff ?? [];
  const sourceMap = new Map();
  (saved ?? tplStaff).forEach(s => sourceMap.set(s.id, normalizeStaff(s)));
  return sortByShift(allStaff.map(s => sourceMap.get(s.id) ?? blankStaff(s)));
}

function getEventsForDate(date, events) {
  const dateStr = toDateStr(date);
  const dow = date.getDay();
  return events.filter(evt =>
    evt.days?.some(d => {
      if (d === dateStr) return true;
      if (evt.repeating) {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m - 1, day).getDay() === dow;
      }
      return false;
    })
  );
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

function isShiftOutsideAvailability(start, end, blocks) {
  if (blocks.length === 0) return true;
  return start < Math.min(...blocks.map(b => b.start)) || end > Math.max(...blocks.map(b => b.end));
}

function pct(h) { return `${((h - HOURS_START) / TOTAL_HOURS) * 100}%`; }

// ── Shared sub-components ──────────────────────────────────────────────────────

function DragChip({ label, isActive, color, borderColor, bg, icon, onDragStart, onDragEnd }) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title={label}
      style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius:7, border:`1px dashed ${isActive ? color : borderColor}`, color: isActive ? color : 'var(--color-text-dim)', background: isActive ? bg : 'transparent', cursor:'grab', fontSize:11, fontWeight:500, userSelect:'none', maxWidth:140 }}>
      <span style={{ pointerEvents:'none' }}>{icon}</span>
      <span style={{ pointerEvents:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
}

function ContextMenu({ x, y, onEdit, onDelete, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);
  const btn = (color) => ({ display:'block', width:'100%', padding:'9px 16px', textAlign:'left', background:'transparent', border:'none', cursor:'pointer', fontSize:13, color: color || 'var(--color-text)' });
  return (
    <div ref={ref} style={{ position:'fixed', left:x, top:y, zIndex:9999, minWidth:140, background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:8, boxShadow:'0 4px 20px rgba(0,0,0,0.5)', overflow:'hidden' }}>
      <button style={btn()} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} onClick={onEdit}>✏️  Edit</button>
      <div style={{ height:1, background:'var(--color-border)' }} />
      <button style={btn('#f07070')} onMouseEnter={e=>e.currentTarget.style.background='rgba(200,64,64,0.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} onClick={onDelete}>🗑  Delete</button>
    </div>
  );
}

function TimeSelect({ value, onChange, min, max }) {
  const opts = TIME_STEPS.filter(t => t >= (min ?? HOURS_START) && t <= (max ?? HOURS_END));
  return (
    <select value={value} onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width:'100%', padding:'6px 8px', borderRadius:6, fontSize:13, background:'var(--color-muted)', border:'1px solid var(--color-border)', color:'var(--color-text)' }}>
      {opts.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
    </select>
  );
}

function EditModal({ target, orderedStaff, dayEvents, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (target.type === 'shift') { const sh = orderedStaff[target.staffIndex].shifts[target.shiftIndex]; return { shiftStart: sh.start, shiftEnd: sh.end }; }
    if (target.type === 'desk')  { const dk = orderedStaff[target.staffIndex].deskShifts[target.deskIndex]; return { deskStart: dk.start, deskEnd: dk.end }; }
    const evt = dayEvents.find(e => e.id === target.eventId);
    return { name: evt?.name||'', type: evt?.type||'program', start: evt?.start||9, end: evt?.end||10, staffNeeded: evt?.staffNeeded||1, notes: evt?.notes||'' };
  });
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const title = target.type === 'shift' ? 'Edit Shift' : target.type === 'desk' ? 'Edit Desk Shift' : 'Edit Event';
  const staffName = (target.type === 'shift' || target.type === 'desk') ? orderedStaff[target.staffIndex]?.name : null;
  const fl = { display:'block', fontSize:12, color:'var(--color-text-dim)', marginBottom:4 };
  const ti = { width:'100%', padding:'6px 8px', borderRadius:6, fontSize:13, boxSizing:'border-box', background:'var(--color-muted)', border:'1px solid var(--color-border)', color:'var(--color-text)' };
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background:'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-xl border p-5" style={{ background:'var(--color-surface)', borderColor:'var(--color-border)', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold" style={{ color:'var(--color-text)' }}>{title}</h3>
            {staffName && <p className="text-xs mt-0.5" style={{ color:'var(--color-text-dim)' }}>{staffName}</p>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--color-text-dim)', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div className="flex flex-col gap-3">
          {target.type === 'shift' && (<>
            <div><label style={fl}>Shift Start</label><TimeSelect value={form.shiftStart} onChange={v=>setForm(f=>({...f,shiftStart:Math.min(v,f.shiftEnd-0.5)}))} max={form.shiftEnd-0.5}/></div>
            <div><label style={fl}>Shift End</label><TimeSelect value={form.shiftEnd} onChange={v=>setForm(f=>({...f,shiftEnd:Math.max(v,f.shiftStart+0.5)}))} min={form.shiftStart+0.5}/></div>
          </>)}
          {target.type === 'desk' && (<>
            <div><label style={fl}>Desk Start</label><TimeSelect value={form.deskStart} onChange={v=>setForm(f=>({...f,deskStart:Math.min(v,f.deskEnd-0.5)}))} max={form.deskEnd-0.5}/></div>
            <div><label style={fl}>Desk End</label><TimeSelect value={form.deskEnd} onChange={v=>setForm(f=>({...f,deskEnd:Math.max(v,f.deskStart+0.5)}))} min={form.deskStart+0.5}/></div>
          </>)}
          {target.type === 'event' && (<>
            <div><label style={fl}>Event Name</label><input type="text" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={ti}/></div>
            <div><label style={fl}>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={ti}>{EVENT_TYPES.map(t=><option key={t} value={t}>{t[0].toUpperCase()+t.slice(1)}</option>)}</select></div>
            <div className="flex gap-3">
              <div className="flex-1"><label style={fl}>Start</label><TimeSelect value={form.start} onChange={v=>setForm(f=>({...f,start:Math.min(v,f.end-0.5)}))} max={form.end-0.5}/></div>
              <div className="flex-1"><label style={fl}>End</label><TimeSelect value={form.end} onChange={v=>setForm(f=>({...f,end:Math.max(v,f.start+0.5)}))} min={form.start+0.5}/></div>
            </div>
            <div><label style={fl}>Staff Needed</label><input type="number" min={1} max={20} value={form.staffNeeded} onChange={e=>setForm(f=>({...f,staffNeeded:parseInt(e.target.value)||1}))} style={ti}/></div>
            <div><label style={fl}>Notes</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...ti,resize:'none'}}/></div>
          </>)}
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, cursor:'pointer', background:'var(--color-muted)', color:'var(--color-text-dim)', border:'1px solid var(--color-border)' }}>Cancel</button>
          <button onClick={()=>onSave(form)} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', background:'var(--color-accent)', color:'white', border:'none' }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function AvailWarningModal({ staffName, title, message, confirmLabel='Schedule Anyway', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background:'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-sm mx-4 rounded-xl border p-5" style={{ background:'var(--color-surface)', borderColor:'var(--color-border)', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <span style={{ fontSize:22, lineHeight:1.2 }}>⚠️</span>
          <div>
            <h3 className="text-base font-bold" style={{ color:'var(--color-text)' }}>{title ?? 'Outside Availability'}</h3>
            <p className="text-sm mt-1.5 leading-snug" style={{ color:'var(--color-text-dim)' }}>
              {message ?? <><strong style={{ color:'var(--color-text)' }}>{staffName}</strong>'s shift falls outside their submitted availability.</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, cursor:'pointer', background:'var(--color-muted)', color:'var(--color-text-dim)', border:'1px solid var(--color-border)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', background:'var(--color-accent)', color:'white', border:'none' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function SaveAsDayTemplateModal({ date, staff, templates, onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [nameError, setNameError] = useState('');
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Template name is required.'); return; }
    if (templates.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) { setNameError('A template with this name already exists.'); return; }
    onSave({ id: Date.now(), type: 'day', name: trimmed, description: desc.trim(), createdAt: new Date().toISOString(), staff: staff.filter(s => s.shifts?.length > 0) });
    onClose();
  }
  const ti = { width:'100%', padding:'8px 10px', borderRadius:7, fontSize:13, background:'var(--color-muted)', border:'1px solid var(--color-border)', color:'var(--color-text)', outline:'none', boxSizing:'border-box' };
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ background:'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm mx-4 rounded-xl border p-5" style={{ background:'var(--color-surface)', borderColor:'var(--color-border)', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color:'var(--color-text)' }}>Save as Day Template</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--color-text-dim)', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <p className="text-xs mb-4" style={{ color:'var(--color-text-dim)' }}>
          Saving {staff.filter(s=>s.shifts?.length>0).length} scheduled staff for <strong style={{ color:'var(--color-text)' }}>{date.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</strong>
        </p>
        <div className="mb-3">
          <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--color-text-dim)', marginBottom:5 }}>Template Name *</label>
          <input autoFocus value={name} onChange={e=>{setName(e.target.value);setNameError('');}} onKeyDown={e=>e.key==='Enter'&&handleSave()} placeholder="e.g. Busy Day" style={{...ti, border:`1px solid ${nameError?'var(--color-red)':'var(--color-border)'}`}}/>
          {nameError && <div style={{ fontSize:11, color:'var(--color-red)', marginTop:4 }}>{nameError}</div>}
        </div>
        <div className="mb-5">
          <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--color-text-dim)', marginBottom:5 }}>Description (optional)</label>
          <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional notes" style={ti}/>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, cursor:'pointer', background:'var(--color-muted)', color:'var(--color-text-dim)', border:'1px solid var(--color-border)' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', background:'var(--color-accent)', color:'white', border:'none' }}>Save Template</button>
        </div>
      </div>
    </div>
  );
}

// ── DayEditor ──────────────────────────────────────────────────────────────────

const DayEditor = React.memo(React.forwardRef(function DayEditor({ date, allStaff, dayEvents, getDaySchedule, saveDaySchedule, assignStaffToEvent, unassignStaffFromEvent, updateEvent, templates, setTemplates }, ref) {
  const dow     = date.getDay();
  const dateStr = toDateStr(date);
  const isToday = dateStr === toDateStr(new Date());

  const [orderedStaff,   setOrderedStaff]   = useState(() => getStaffForDate(date, getDaySchedule, allStaff));
  const [finalized,      setFinalized]      = useState(false);
  const [activeBar,      setActiveBar]      = useState(null);
  const [activeDragType, setActiveDragType] = useState(null);
  const [draggingEvtId,  setDraggingEvtId]  = useState(null);
  const [hoverRow,       setHoverRow]       = useState(null);
  const [draggingBarInfo,setDraggingBarInfo]= useState(null);
  const [contextMenu,    setContextMenu]    = useState(null);
  const [editModal,      setEditModal]      = useState(null);
  const [availWarning,   setAvailWarning]   = useState(null);
  const [trashOver,      setTrashOver]      = useState(false);
  const [previewInfo,    setPreviewInfo]    = useState(null);
  const [applyTplOpen,   setApplyTplOpen]   = useState(false);
  const [saveTplOpen,    setSaveTplOpen]    = useState(false);
  const [finalizeWarn,   setFinalizeWarn]   = useState(null);   // alert list

  const staffRef = useRef(orderedStaff);
  const trashRef = useRef(null);
  useEffect(() => { staffRef.current = orderedStaff; }, [orderedStaff]);

  // Commit this day: persist to in-memory schedule state (both key formats the
  // rest of the app reads) and push to the backend. Only called on Finalize —
  // there is no auto-save, so edits live in local state until the user commits.
  function commitFinalize() {
    saveDaySchedule(dateStr, orderedStaff);
    saveDaySchedule(date.toDateString(), orderedStaff);
    schedulesApi.saveDay(dateStr, { staff: orderedStaff, events: dayEvents })
      .catch(err => console.warn('Schedule save failed — finalized locally only:', err.message));
    setFinalized(true);
  }

  // Let the parent's "Finalize All" inspect and commit this day without lifting
  // its (local) editing state up. The handle is rebuilt every render, so each
  // method always closes over the day's current state.
  useImperativeHandle(ref, () => ({
    isFinalized: () => finalized,
    getIssues:   () => buildAlerts(orderedStaff.filter(s => s.shifts?.length > 0), dayEvents, dow).filter(a => a.type !== 'blue'),
    commit:      commitFinalize,
    label:       `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]} · ${date.toLocaleDateString('en-US', { month:'short', day:'numeric' })}`,
  }));

  const hours     = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);
  const halfHours = Array.from({ length: (TOTAL_HOURS) * 2 - 1 }, (_, i) => HOURS_START + 0.5 + i * 0.5).filter(h => h < HOURS_END);

  function posStyle(start, end) {
    return { left: `${((start-HOURS_START)/TOTAL_HOURS)*100}%`, width: `${((end-start)/TOTAL_HOURS)*100}%` };
  }

  function endDrag() { setActiveDragType(null); setDraggingEvtId(null); setHoverRow(null); setPreviewInfo(null); }

  // ── Toolbar drag-over preview ───────────────────────────────────────────────
  function handleTimelineDragOver(e, rowIdx) {
    setHoverRow(rowIdx);
    if (!activeDragType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw  = HOURS_START + ((e.clientX - rect.left) / rect.width) * TOTAL_HOURS;
    const p    = orderedStaff[rowIdx];
    if (activeDragType === 'shift') {
      const dur = 2;
      const start = snapHalf(clamp(raw - dur/2, HOURS_START, HOURS_END - dur));
      setPreviewInfo({ staffIndex: rowIdx, start, end: start+dur, valid: !p.shifts.some(s => start < s.end && start+dur > s.start) });
    } else if (activeDragType === 'desk') {
      const dur  = 1;
      const host = p.shifts.find(sh => raw >= sh.start && raw <= sh.end);
      if (!host) { setPreviewInfo({ staffIndex: rowIdx, start: null, end: null, valid: false }); return; }
      const start = snapHalf(clamp(raw - dur/2, host.start, host.end - dur));
      const end   = start + dur;
      const pEvts = dayEvents.filter(ev => ev.assignedStaff.includes(p.id));
      setPreviewInfo({ staffIndex: rowIdx, start, end, valid: !p.deskShifts.some(d => start < d.end && end > d.start) && !pEvts.some(ev => start < ev.end && end > ev.start) });
    } else if (activeDragType === 'event' && draggingEvtId != null) {
      const evt = dayEvents.find(ev => ev.id === draggingEvtId); if (!evt) return;
      const hasDeskConflict  = p.deskShifts?.some(d => d.start < evt.end && d.end > evt.start);
      const hasEventConflict = dayEvents.some(o => o.id !== evt.id && o.assignedStaff.includes(p.id) && o.start < evt.end && o.end > evt.start);
      setPreviewInfo({ staffIndex: rowIdx, start: evt.start, end: evt.end, valid: !evt.assignedStaff.includes(p.id) && !hasDeskConflict && !hasEventConflict });
    }
  }

  // ── Shift resize ────────────────────────────────────────────────────────────
  function handleBarMouseDown(e, si, shIdx, mode) {
    const tl = e.currentTarget.closest('[data-timeline]');
    const tw  = tl.getBoundingClientRect().width;
    const sx  = e.clientX;
    const sh0 = orderedStaff[si].shifts[shIdx];
    const i0  = sh0.start; const e0 = sh0.end;
    const others = orderedStaff[si].shifts.filter((_,j) => j !== shIdx);
    const pid  = orderedStaff[si].id; const shid = sh0.id;
    setActiveBar({ type:'shift', staffIndex:si, shiftIndex:shIdx, mode });
    document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
    function onMove(me) {
      const d = ((me.clientX-sx)/tw)*TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next = [...prev]; const p = {...next[si], shifts:[...next[si].shifts]}; const s = {...p.shifts[shIdx]};
        if (mode==='left') s.start = snapHalf(clamp(i0+d, HOURS_START, e0-0.5));
        else               s.end   = snapHalf(clamp(e0+d, i0+0.5, HOURS_END));
        if (!others.some(o => s.start < o.end && s.end > o.start)) p.shifts[shIdx] = s;
        next[si] = p; return next;
      });
    }
    function onUp() {
      setActiveBar(null); document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      const cur = staffRef.current.find(s => s.id === pid);
      if (cur) {
        const fs = cur.shifts.find(s => s.id === shid);
        const blocks = getAvailability(cur.id, dow);
        if (fs && isShiftOutsideAvailability(fs.start, fs.end, blocks)) {
          setAvailWarning({
            staffName: cur.name,
            onConfirm: () => { setOrderedStaff(p => sortByShift(p)); setAvailWarning(null); },
            onCancel: () => {
              setOrderedStaff(prev => {
                const pIdx = prev.findIndex(s => s.id === pid); if (pIdx===-1) return sortByShift(prev);
                const next=[...prev]; const pp={...next[pIdx],shifts:[...next[pIdx].shifts]};
                const sIdx=pp.shifts.findIndex(s=>s.id===shid);
                if (sIdx!==-1) pp.shifts[sIdx]={...pp.shifts[sIdx],start:i0,end:e0};
                next[pIdx]=pp; return sortByShift(next);
              });
              setAvailWarning(null);
            },
          }); return;
        }
      }
      setOrderedStaff(p => sortByShift(p));
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  // ── Desk resize ─────────────────────────────────────────────────────────────
  function handleDeskBarMouseDown(e, si, di, mode) {
    const tl  = e.currentTarget.closest('[data-timeline]');
    const tw  = tl.getBoundingClientRect().width;
    const sx  = e.clientX;
    const dk0 = orderedStaff[si].deskShifts[di];
    const i0  = dk0.start; const e0 = dk0.end;
    const others  = orderedStaff[si].deskShifts.filter((_,j) => j !== di);
    const pEvts   = dayEvents.filter(ev => ev.assignedStaff.includes(orderedStaff[si].id));
    const host    = orderedStaff[si].shifts.find(sh => sh.start <= dk0.start && sh.end >= dk0.end);
    const lo = host?.start ?? HOURS_START; const hi = host?.end ?? HOURS_END;
    setActiveBar({ type:'desk', staffIndex:si, deskIndex:di, mode });
    document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
    function onMove(me) {
      const d = ((me.clientX-sx)/tw)*TOTAL_HOURS;
      setOrderedStaff(prev => {
        const next=[...prev]; const p={...next[si],deskShifts:[...next[si].deskShifts]}; const dk={...p.deskShifts[di]};
        if (mode==='left') dk.start = snapHalf(clamp(i0+d, lo, e0-0.5));
        else               dk.end   = snapHalf(clamp(e0+d, i0+0.5, hi));
        if (!others.some(o=>dk.start<o.end&&dk.end>o.start) && !pEvts.some(ev=>dk.start<ev.end&&dk.end>ev.start)) p.deskShifts[di]=dk;
        next[si]=p; return next;
      });
    }
    function onUp() {
      setActiveBar(null); document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  // ── Event resize ────────────────────────────────────────────────────────────
  function handleEventBarMouseDown(e, evtId, mode) {
    const tl  = e.currentTarget.closest('[data-timeline]');
    const tw  = tl.getBoundingClientRect().width;
    const sx  = e.clientX;
    const evt = dayEvents.find(ev => ev.id === evtId);
    const i0  = evt.start; const e0 = evt.end;
    setActiveBar({ type:'event', eventId:evtId, mode });
    document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
    function onMove(me) {
      const d = ((me.clientX-sx)/tw)*TOTAL_HOURS;
      if (mode==='left') updateEvent(evtId, { start: snapHalf(clamp(i0+d, HOURS_START, e0-0.5)) });
      else               updateEvent(evtId, { end:   snapHalf(clamp(e0+d, i0+0.5, HOURS_END)) });
    }
    function onUp() {
      setActiveBar(null); document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  // ── Bar drag start ──────────────────────────────────────────────────────────
  function handleShiftBarDragStart(e, si, shIdx) {
    e.dataTransfer.effectAllowed = 'move';
    const p = orderedStaff[si]; const sh = p.shifts[shIdx];
    setDraggingBarInfo({ type:'shift', staffIndex:si, shiftIndex:shIdx, shiftId:sh.id, personId:p.id, duration:sh.end-sh.start, originalStart:sh.start, originalEnd:sh.end });
  }
  function handleDeskBarDragStart(e, si, di) {
    e.dataTransfer.effectAllowed = 'move';
    const dk = orderedStaff[si].deskShifts[di];
    setDraggingBarInfo({ type:'desk', staffIndex:si, deskIndex:di, deskId:dk.id, duration:dk.end-dk.start, originalStart:dk.start, originalEnd:dk.end });
  }
  function handleEventBarDragStart(e, evtId, staffId) {
    e.dataTransfer.effectAllowed = 'move';
    const evt = dayEvents.find(ev => ev.id === evtId);
    setDraggingBarInfo({ type:'event', eventId:evtId, staffId, duration:evt.end-evt.start });
  }

  // ── Bar drag end ─────────────────────────────────────────────────────────────
  function handleBarDragEnd() {
    setPreviewInfo(null);
    if (draggingBarInfo?.type === 'shift') {
      const { personId, shiftId, originalStart, originalEnd } = draggingBarInfo;
      const cur = staffRef.current.find(s => s.id === personId);
      if (cur) {
        const fs = cur.shifts.find(s => s.id === shiftId);
        const blocks = getAvailability(cur.id, dow);
        if (fs && isShiftOutsideAvailability(fs.start, fs.end, blocks)) {
          setDraggingBarInfo(null);
          setAvailWarning({
            staffName: cur.name,
            onConfirm: () => { setOrderedStaff(p => sortByShift(p)); setAvailWarning(null); },
            onCancel: () => {
              setOrderedStaff(prev => {
                const pIdx=prev.findIndex(s=>s.id===personId); if(pIdx===-1) return sortByShift(prev);
                const next=[...prev]; const pp={...next[pIdx],shifts:[...next[pIdx].shifts]};
                const sIdx=pp.shifts.findIndex(s=>s.id===shiftId);
                if(sIdx!==-1) pp.shifts[sIdx]={...pp.shifts[sIdx],start:originalStart,end:originalEnd};
                next[pIdx]=pp; return sortByShift(next);
              });
              setAvailWarning(null);
            },
          }); return;
        }
      }
    }
    setDraggingBarInfo(null);
    setOrderedStaff(p => sortByShift(p));
  }

  // ── Context menu ────────────────────────────────────────────────────────────
  function handleBarContextMenu(e, target) { setContextMenu({ x:e.clientX, y:e.clientY, target }); }
  function handleContextMenuDelete() {
    const { target } = contextMenu; setContextMenu(null);
    if (target.type === 'shift') {
      setOrderedStaff(prev => {
        const next=[...prev]; const p={...next[target.staffIndex]};
        p.shifts=p.shifts.filter((_,j)=>j!==target.shiftIndex); p.scheduled=p.shifts.length>0;
        next[target.staffIndex]=p; return sortByShift(next);
      });
    } else if (target.type === 'desk') {
      setOrderedStaff(prev => {
        const next=[...prev]; const p={...next[target.staffIndex]};
        p.deskShifts=p.deskShifts.filter((_,j)=>j!==target.deskIndex); next[target.staffIndex]=p; return next;
      });
    } else if (target.type === 'event') {
      unassignStaffFromEvent(target.eventId, target.staffId);
    }
  }
  function handleContextMenuEdit() { setEditModal(contextMenu.target); setContextMenu(null); }
  function handleEditSave(data) {
    const t = editModal; setEditModal(null);
    if (t.type === 'shift') {
      setOrderedStaff(prev => {
        const next=[...prev]; const p={...next[t.staffIndex],shifts:[...next[t.staffIndex].shifts]};
        p.shifts[t.shiftIndex]={...p.shifts[t.shiftIndex],start:data.shiftStart,end:data.shiftEnd};
        next[t.staffIndex]=p; return sortByShift(next);
      });
    } else if (t.type === 'desk') {
      setOrderedStaff(prev => {
        const next=[...prev]; const p={...next[t.staffIndex],deskShifts:[...next[t.staffIndex].deskShifts]};
        p.deskShifts[t.deskIndex]={...p.deskShifts[t.deskIndex],start:data.deskStart,end:data.deskEnd};
        next[t.staffIndex]=p; return next;
      });
    } else if (t.type === 'event') {
      updateEvent(t.eventId, { name:data.name, type:data.type, start:data.start, end:data.end, staffNeeded:data.staffNeeded, notes:data.notes });
    }
  }

  // ── Bar drag-over (live reposition + cross-row ghost) ───────────────────────
  function handleBarDragOver(e, rowIdx) {
    if (!draggingBarInfo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw  = HOURS_START + ((e.clientX-rect.left)/rect.width)*TOTAL_HOURS;
    const { type, staffIndex:si, shiftIndex:shIdx, deskIndex:di, eventId, staffId, duration } = draggingBarInfo;
    const same = si === rowIdx;
    if (type === 'shift') {
      const ns = snapHalf(clamp(raw-duration/2, HOURS_START, HOURS_END-duration)); const ne = ns+duration;
      if (same) {
        setPreviewInfo(null);
        setOrderedStaff(prev => {
          const next=[...prev]; const p={...next[si],shifts:[...next[si].shifts]};
          const others=p.shifts.filter((_,j)=>j!==shIdx);
          if (!others.some(o=>ns<o.end&&ne>o.start)) p.shifts[shIdx]={...p.shifts[shIdx],start:ns,end:ne};
          next[si]=p; return next;
        });
      } else {
        setPreviewInfo({ staffIndex:rowIdx, start:ns, end:ne, valid:!orderedStaff[rowIdx].shifts.some(s=>ns<s.end&&ne>s.start) });
      }
    } else if (type === 'desk') {
      if (same) {
        setPreviewInfo(null);
        setOrderedStaff(prev => {
          const next=[...prev]; const p={...next[si],deskShifts:[...next[si].deskShifts]};
          const host=p.shifts.find(sh=>raw>=sh.start&&raw<=sh.end); if (!host) return prev;
          const ns=snapHalf(clamp(raw-duration/2,host.start,host.end-duration)); const ne=ns+duration;
          const others=p.deskShifts.filter((_,j)=>j!==di);
          const pEvts=dayEvents.filter(ev=>ev.assignedStaff.includes(p.id));
          if (!others.some(o=>ns<o.end&&ne>o.start)&&!pEvts.some(ev=>ns<ev.end&&ne>ev.start)) p.deskShifts[di]={...p.deskShifts[di],start:ns,end:ne};
          next[si]=p; return next;
        });
      } else {
        const tgt=orderedStaff[rowIdx]; const host=tgt.shifts.find(sh=>raw>=sh.start&&raw<=sh.end);
        if (!host) { setPreviewInfo({staffIndex:rowIdx,start:null,end:null,valid:false}); return; }
        const ns=snapHalf(clamp(raw-duration/2,host.start,host.end-duration)); const ne=ns+duration;
        const tEvts=dayEvents.filter(ev=>ev.assignedStaff.includes(tgt.id));
        setPreviewInfo({staffIndex:rowIdx,start:ns,end:ne,valid:!tgt.deskShifts.some(d=>ns<d.end&&ne>d.start)&&!tEvts.some(ev=>ns<ev.end&&ne>ev.start)});
      }
    } else if (type === 'event' && !same) {
      const evt=dayEvents.find(ev=>ev.id===eventId); if (!evt) return;
      const tgt=orderedStaff[rowIdx];
      setPreviewInfo({staffIndex:rowIdx,start:evt.start,end:evt.end,valid:!evt.assignedStaff.includes(tgt.id)&&!tgt.deskShifts?.some(d=>d.start<evt.end&&d.end>evt.start)&&!dayEvents.some(o=>o.id!==eventId&&o.assignedStaff.includes(tgt.id)&&o.start<evt.end&&o.end>evt.start)});
    }
  }

  // ── Bar drop (cross-row) ────────────────────────────────────────────────────
  function handleBarDrop(e, rowIdx) {
    if (!draggingBarInfo) return;
    const { type, staffIndex:si, shiftIndex:shIdx, deskIndex:di, eventId, staffId } = draggingBarInfo;
    if (si === rowIdx) return;
    if (!previewInfo || previewInfo.staffIndex !== rowIdx || !previewInfo.valid || previewInfo.start === null) return;
    setPreviewInfo(null); setDraggingBarInfo(null);
    const { start, end } = previewInfo;
    if (type === 'shift') {
      const tgt=orderedStaff[rowIdx]; const blocks=getAvailability(tgt.id,dow);
      const srcId=orderedStaff[si].id; const tgtId=tgt.id; const capIdx=shIdx;
      const doTransfer=()=>setOrderedStaff(prev=>{
        const next=[...prev];
        const sii=prev.findIndex(s=>s.id===srcId); const tii=prev.findIndex(s=>s.id===tgtId);
        if(sii===-1||tii===-1) return prev;
        const src={...next[sii]}; src.shifts=src.shifts.filter((_,j)=>j!==capIdx); src.scheduled=src.shifts.length>0; next[sii]=src;
        const t={...next[tii]}; t.shifts=[...t.shifts,{id:`s${Date.now()}`,start,end}]; t.scheduled=true; next[tii]=t;
        return next;
      });
      if (isShiftOutsideAvailability(start,end,blocks)) {
        setAvailWarning({staffName:tgt.name,onConfirm:()=>{doTransfer();setAvailWarning(null);},onCancel:()=>setAvailWarning(null)});
      } else doTransfer();
    } else if (type === 'desk') {
      const doMove=()=>setOrderedStaff(prev=>{
        const next=[...prev];
        const src={...next[si]}; src.deskShifts=src.deskShifts.filter((_,j)=>j!==di); next[si]=src;
        const tg={...next[rowIdx]}; tg.deskShifts=[...tg.deskShifts,{id:`d${Date.now()}`,start,end}]; next[rowIdx]=tg;
        return next;
      });
      const conflict=orderedStaff.find((s,ii)=>ii!==rowIdx&&ii!==si&&s.deskShifts?.some(d=>start<d.end&&end>d.start));
      if (conflict) {
        setAvailWarning({title:'Desk Conflict',message:`${conflict.name} is already on desk ${formatTime(start)}–${formatTime(end)}. Move anyway?`,confirmLabel:'Move Anyway',onConfirm:()=>{doMove();setAvailWarning(null);},onCancel:()=>setAvailWarning(null)});
      } else doMove();
    } else if (type === 'event') {
      assignEventWithShiftCheck(eventId, rowIdx, { alsoUnassignStaffId: staffId });
    }
  }

  // ── Event assignment ────────────────────────────────────────────────────────
  function assignEventWithShiftCheck(evtId, tgtIdx, { alsoUnassignStaffId=null }={}) {
    const evt=dayEvents.find(ev=>ev.id===evtId); const person=orderedStaff[tgtIdx];
    if (!evt||!person) return;
    const isCovered=person.shifts.some(s=>s.start<=evt.start&&s.end>=evt.end);
    const pid=person.id;
    const doAssign=()=>{
      if (alsoUnassignStaffId) unassignStaffFromEvent(evtId,alsoUnassignStaffId);
      assignStaffToEvent(evtId,pid);
      if (!isCovered) {
        setOrderedStaff(prev=>{
          const pIdx=prev.findIndex(s=>s.id===pid); if(pIdx===-1) return prev;
          const next=[...prev]; const p={...next[pIdx]};
          const hIdx=p.shifts.findIndex(s=>s.start<=evt.end&&s.end>=evt.start);
          if (hIdx!==-1) { p.shifts=[...p.shifts]; p.shifts[hIdx]={...p.shifts[hIdx],start:Math.min(p.shifts[hIdx].start,evt.start),end:Math.max(p.shifts[hIdx].end,evt.end)}; }
          else { p.shifts=[...p.shifts,{id:`s${Date.now()}`,start:evt.start,end:evt.end}]; p.scheduled=true; }
          next[pIdx]=p; return next;
        });
      }
    };
    if (!isCovered) {
      const hasPartial=person.shifts.some(s=>s.start<=evt.end&&s.end>=evt.start);
      setAvailWarning({
        staffName:person.name,
        title:hasPartial?'Shift Doesn\'t Cover Event':'No Shift During Event',
        message:hasPartial
          ?<><strong style={{color:'var(--color-text)'}}>{person.name}</strong>'s shift doesn't fully cover <em>{evt.name}</em>. It will be extended.</>
          :<><strong style={{color:'var(--color-text)'}}>{person.name}</strong> has no shift during <em>{evt.name}</em>. A new shift will be created.</>,
        confirmLabel:hasPartial?'Assign & Extend Shift':'Assign & Create Shift',
        onConfirm:()=>{doAssign();setAvailWarning(null);},
        onCancel:()=>setAvailWarning(null),
      });
    } else doAssign();
  }

  // ── Timeline drop (toolbar chips) ───────────────────────────────────────────
  function handleTimelineDrop(si) {
    if (activeDragType === 'shift') {
      const p=orderedStaff[si];
      let ns,ne;
      if (previewInfo?.staffIndex===si&&previewInfo.valid) { ns=previewInfo.start; ne=previewInfo.end; }
      else { ns=firstFreeSlot(p.shifts,2); if(ns===null){endDrag();return;} ne=ns+2; }
      const doPlace=()=>setOrderedStaff(prev=>{
        const next=[...prev]; const pp={...next[si]}; pp.scheduled=true;
        pp.shifts=[...pp.shifts,{id:`s${Date.now()}`,start:ns,end:ne}]; next[si]=pp; return sortByShift(next);
      });
      const blocks=getAvailability(p.id,dow);
      if (isShiftOutsideAvailability(ns,ne,blocks)) { endDrag(); setAvailWarning({staffName:p.name,onConfirm:()=>{doPlace();setAvailWarning(null);},onCancel:()=>setAvailWarning(null)}); return; }
      doPlace();
    } else if (activeDragType === 'desk') {
      const p=orderedStaff[si]; const pEvts=dayEvents.filter(ev=>ev.assignedStaff.includes(p.id));
      let ns=null;
      if (previewInfo?.staffIndex===si&&previewInfo.valid&&previewInfo.start!==null) ns=previewInfo.start;
      else { for (const sh of p.shifts) { const slot=firstFreeSlot(p.deskShifts,1,sh.start,sh.end,pEvts); if(slot!==null){ns=slot;break;} } }
      if (ns!==null) {
        const ne=ns+1;
        const doPlace=()=>setOrderedStaff(prev=>{
          const next=[...prev]; const pp={...next[si]};
          pp.deskShifts=[...pp.deskShifts,{id:`d${Date.now()}`,start:ns,end:ne}]; next[si]=pp; return next;
        });
        const conflict=orderedStaff.find((s,ii)=>ii!==si&&s.deskShifts?.some(d=>ns<d.end&&ne>d.start));
        if (conflict) { endDrag(); setAvailWarning({title:'Desk Conflict',message:`${conflict.name} is already on desk ${formatTime(ns)}–${formatTime(ne)}. Place anyway?`,confirmLabel:'Place Anyway',onConfirm:()=>{doPlace();setAvailWarning(null);},onCancel:()=>setAvailWarning(null)}); return; }
        doPlace();
      }
    } else if (activeDragType === 'event' && draggingEvtId != null) {
      assignEventWithShiftCheck(draggingEvtId, si);
    }
    endDrag();
  }

  const alerts         = buildAlerts(orderedStaff.filter(s => s.shifts?.length > 0), dayEvents, dow);
  const dayName        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
  const monthDay       = date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const currentDragT   = activeDragType ?? draggingBarInfo?.type;
  const tbHighlight    = activeDragType==='shift'
    ? { background:'rgba(74,124,94,0.15)', borderColor:'var(--color-green)' }
    : activeDragType==='desk'
      ? { background:'rgba(200,148,56,0.12)', borderColor:'var(--color-yellow)' }
      : { background:'rgba(59,42,110,0.2)',   borderColor:'#7c5cbf' };

  return (
    <div style={{ marginBottom:10, borderRadius:10, border:`1px solid ${isToday?'var(--color-accent)':'var(--color-border)'}`, background:'var(--color-surface)', overflow:'hidden' }}>

      {/* Day header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', background:isToday?'rgba(176,80,48,0.08)':'var(--color-muted)', borderBottom:'1px solid var(--color-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color:isToday?'var(--color-accent)':'var(--color-text)' }}>{dayName} · {monthDay}</span>
          {isToday && <span style={{ fontSize:9, fontWeight:600, color:'var(--color-accent)', textTransform:'uppercase', letterSpacing:'0.06em', background:'rgba(176,80,48,0.15)', padding:'1px 5px', borderRadius:4 }}>Today</span>}
          <button onClick={finalized ? ()=>setFinalized(false) : ()=>{
              const issues=buildAlerts(orderedStaff.filter(s=>s.shifts?.length>0),dayEvents,dow).filter(a=>a.type!=='blue');
              if(issues.length>0){setFinalizeWarn(issues);}else{commitFinalize();}
            }}
            style={{ padding:'2px 10px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', border:'none', ...(finalized?{background:'#1a2a1a',color:'#6ab888'}:{background:'var(--color-accent)',color:'white'}) }}>
            {finalized?'✓ Finalized':'Finalize'}
          </button>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {!finalized && <button onClick={()=>setApplyTplOpen(true)} style={{ padding:'2px 10px', borderRadius:6, fontSize:11, fontWeight:500, cursor:'pointer', background:'var(--color-muted)', color:'var(--color-text-dim)', border:'1px solid var(--color-border)' }}>Apply Template</button>}
          <button onClick={()=>setSaveTplOpen(true)} style={{ padding:'2px 10px', borderRadius:6, fontSize:11, fontWeight:500, cursor:'pointer', background:'var(--color-muted)', color:'var(--color-text-dim)', border:'1px solid var(--color-border)' }}>Save as Template</button>
        </div>
      </div>

      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div style={{ padding:'4px 10px', borderBottom:'1px solid var(--color-border)', display:'flex', flexDirection:'column', gap:2 }}>
          {alerts.map((a,i) => (
            <div key={i} style={{ fontSize:11, color:'var(--color-text-dim)', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:a.type==='red'?'var(--color-red)':a.type==='yellow'?'var(--color-yellow)':'var(--color-accent-bright)', flexShrink:0 }}/>
              {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {!finalized && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'5px 10px', borderBottom:'1px solid var(--color-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', flex:1 }}>
            <DragChip label="New Shift" isActive={activeDragType==='shift'} color="var(--color-green)" borderColor="#2a4a38" bg="rgba(74,124,94,0.15)"
              icon={<div style={{width:12,height:8,borderRadius:2,background:'currentColor',opacity:0.8}}/>}
              onDragStart={e=>{e.dataTransfer.effectAllowed='copy';setActiveDragType('shift');}} onDragEnd={endDrag}/>
            <DragChip label="New Desk Shift" isActive={activeDragType==='desk'} color="var(--color-yellow)" borderColor="#5a4428" bg="rgba(61,44,24,0.4)"
              icon={<div style={{width:12,height:8,borderRadius:2,border:'1.5px solid currentColor'}}/>}
              onDragStart={e=>{e.dataTransfer.effectAllowed='copy';setActiveDragType('desk');}} onDragEnd={endDrag}/>
            {dayEvents.length > 0 && <div style={{width:1,alignSelf:'stretch',background:'var(--color-border)',margin:'0 2px'}}/>}
            {dayEvents.map(evt => (
              <DragChip key={evt.id} label={evt.name} isActive={activeDragType==='event'&&draggingEvtId===evt.id}
                color="#a080e0" borderColor="#3b2a6e" bg="rgba(59,42,110,0.25)"
                icon={<div style={{width:8,height:8,borderRadius:'50%',background:'currentColor'}}/>}
                onDragStart={e=>{e.dataTransfer.effectAllowed='copy';setActiveDragType('event');setDraggingEvtId(evt.id);}} onDragEnd={endDrag}/>
            ))}
          </div>
          <div ref={trashRef}
            onDragOver={e=>e.preventDefault()}
            onDragEnter={()=>setTrashOver(true)}
            onDragLeave={e=>{if(!trashRef.current?.contains(e.relatedTarget))setTrashOver(false);}}
            onDrop={()=>{
              setTrashOver(false);
              if (draggingBarInfo) {
                const {type,staffIndex:si,shiftIndex:shIdx,deskIndex:di,eventId,staffId}=draggingBarInfo;
                if(type==='shift'){setOrderedStaff(prev=>{const next=[...prev];const p={...next[si]};p.shifts=p.shifts.filter((_,j)=>j!==shIdx);p.scheduled=p.shifts.length>0;next[si]=p;return sortByShift(next);});}
                else if(type==='desk'){setOrderedStaff(prev=>{const next=[...prev];const p={...next[si]};p.deskShifts=p.deskShifts.filter((_,j)=>j!==di);next[si]=p;return next;});}
                else if(type==='event'){unassignStaffFromEvent(eventId,staffId);}
                setDraggingBarInfo(null);
              }
              endDrag();
            }}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:500, cursor:'default', userSelect:'none', flexShrink:0, border:`1px solid ${trashOver?'var(--color-red)':'var(--color-border)'}`, color:trashOver?'#f07070':'var(--color-text-dim)', background:trashOver?'rgba(200,64,64,0.12)':'transparent' }}>
            <span style={{fontSize:12}}>🗑</span> Remove
          </div>
        </div>
      )}

      {/* Time header */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--color-border)' }}>
        <div style={{ width:NAME_COL, flexShrink:0, padding:'3px 8px', fontSize:10, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--color-text-dim)', borderRight:'1px solid var(--color-border)' }}>Staff</div>
        <div style={{ flex:1, display:'flex' }}>
          {hours.map((h,hi) => (
            <div key={h} style={{ flex:1, padding:'3px 0', fontSize:9, textAlign:'center', color:'var(--color-text-dim)', borderRight: hi < hours.length-1 ? '1px solid var(--color-border)' : 'none' }}>{formatTime(h)}</div>
          ))}
        </div>
      </div>

      {/* Staff rows */}
      <div>
        {orderedStaff.map((person, i) => (
          <div key={person.id} style={{ display:'flex', borderBottom: i < orderedStaff.length-1 ? '1px solid var(--color-border)' : 'none', opacity: person.shifts.length>0 ? 1 : 0.38, transition:'opacity 0.15s' }}>
            {/* Name */}
            <div style={{ width:NAME_COL, flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'0 6px', height:ROW_H, borderRight:'1px solid var(--color-border)' }}>
              {!finalized && <span style={{fontSize:10,color:'var(--color-muted)',lineHeight:1,flexShrink:0}}>⠿</span>}
              <div style={{ width:18, height:18, borderRadius:'50%', background:'var(--color-muted)', color:'var(--color-text-dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, flexShrink:0 }}>
                {person.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{person.name}</div>
                <div style={{ fontSize:9, color:'var(--color-text-dim)', marginTop:1 }}>
                  {person.shifts.length>0 ? (person.shifts.length===1 ? `${formatTime(person.shifts[0].start)}–${formatTime(person.shifts[0].end)}` : `${person.shifts.length} shifts`) : 'Unscheduled'}
                </div>
              </div>
            </div>
            {/* Timeline */}
            <div data-timeline="true" style={{ flex:1, position:'relative', height:ROW_H }}
              onDragOver={e=>{
                const hasT=!!activeDragType; const hasB=!!draggingBarInfo;
                if(!hasT&&!hasB) return; e.preventDefault(); e.stopPropagation();
                if(hasT) handleTimelineDragOver(e,i); if(hasB) handleBarDragOver(e,i);
              }}
              onDrop={e=>{
                const hasT=!!activeDragType; const hasB=!!draggingBarInfo;
                if(!hasT&&!hasB) return; e.preventDefault(); e.stopPropagation();
                if(hasT) handleTimelineDrop(i); if(hasB) handleBarDrop(e,i);
              }}
            >
              {/* Grid lines */}
              {hours.map(h => h>HOURS_START && <div key={h} style={{position:'absolute',top:0,bottom:0,left:pct(h),width:1,background:'var(--color-border)',opacity:0.4,pointerEvents:'none'}}/>)}
              {halfHours.map(h => <div key={h} style={{position:'absolute',top:'25%',height:'50%',left:pct(h),width:1,background:'var(--color-border)',opacity:0.2,pointerEvents:'none'}}/>)}

              {/* Availability */}
              {getAvailability(person.id, dow).map((blk,bi) => (
                <div key={`av-${bi}`} style={{position:'absolute',top:0,bottom:0,...posStyle(blk.start,blk.end),background:'rgba(96,165,250,0.10)',border:'1px solid rgba(96,165,250,0.22)',borderRadius:4,zIndex:0,pointerEvents:'none'}}/>
              ))}

              {/* Toolbar drop highlight */}
              {activeDragType&&activeDragType!=='event'&&hoverRow===i && (
                <div style={{position:'absolute',inset:0,borderRadius:4,...tbHighlight,border:'1px dashed',zIndex:20,pointerEvents:'none'}}/>
              )}

              {/* Preview ghost */}
              {previewInfo?.staffIndex===i&&previewInfo.start!==null && (
                <div style={{position:'absolute',pointerEvents:'none',borderRadius:4,top:'50%',transform:'translateY(-50%)',height:26,...posStyle(previewInfo.start,previewInfo.end),background:previewInfo.valid?(currentDragT==='shift'?'rgba(74,124,94,0.35)':currentDragT==='desk'?'rgba(200,148,56,0.35)':'rgba(59,42,110,0.5)'):'rgba(200,64,64,0.25)',border:`2px dashed ${previewInfo.valid?(currentDragT==='shift'?'var(--color-green)':currentDragT==='desk'?'var(--color-yellow)':'#7c5cbf'):'var(--color-red)'}`,zIndex:22}}/>
              )}

              {/* Shift bars */}
              {person.shifts.map((sh,shIdx) => {
                const isAct=activeBar?.type==='shift'&&activeBar?.staffIndex===i&&activeBar?.shiftIndex===shIdx;
                const isDrg=draggingBarInfo?.type==='shift'&&draggingBarInfo?.staffIndex===i&&draggingBarInfo?.shiftIndex===shIdx;
                return (
                  <div key={sh.id} draggable={!finalized}
                    style={{position:'absolute',height:24,borderRadius:4,overflow:'hidden',userSelect:'none',top:'50%',transform:'translateY(-50%)',...posStyle(sh.start,sh.end),background:'var(--color-green)',opacity:isDrg?0.3:isAct?0.85:0.6,cursor:finalized?'default':'grab',boxShadow:isAct?'0 0 0 2px var(--color-green)':'none',zIndex:isAct?10:1}}
                    onDragStart={e=>{e.stopPropagation();!finalized&&handleShiftBarDragStart(e,i,shIdx);}}
                    onDragEnd={handleBarDragEnd}
                    onContextMenu={e=>{e.preventDefault();!finalized&&handleBarContextMenu(e,{type:'shift',staffIndex:i,shiftIndex:shIdx});}}>
                    {!finalized&&<div style={{position:'absolute',left:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.18)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleBarMouseDown(e,i,shIdx,'left');}}/>}
                    {!finalized&&<div style={{position:'absolute',right:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.18)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleBarMouseDown(e,i,shIdx,'right');}}/>}
                  </div>
                );
              })}

              {/* Desk bars */}
              {person.deskShifts.map((dk,di) => {
                const isAct=activeBar?.type==='desk'&&activeBar?.staffIndex===i&&activeBar?.deskIndex===di;
                const isDrg=draggingBarInfo?.type==='desk'&&draggingBarInfo?.staffIndex===i&&draggingBarInfo?.deskIndex===di;
                return (
                  <div key={dk.id} draggable={!finalized}
                    style={{position:'absolute',height:24,borderRadius:4,overflow:'hidden',userSelect:'none',top:'50%',transform:'translateY(-50%)',...posStyle(dk.start,dk.end),background:'var(--color-yellow)',opacity:isDrg?0.3:isAct?1:0.75,cursor:finalized?'default':'grab',boxShadow:isAct?'0 0 0 2px #e0b050':'none',zIndex:isAct?10:2}}
                    onDragStart={e=>{e.stopPropagation();!finalized&&handleDeskBarDragStart(e,i,di);}}
                    onDragEnd={handleBarDragEnd}
                    onContextMenu={e=>{e.preventDefault();!finalized&&handleBarContextMenu(e,{type:'desk',staffIndex:i,deskIndex:di});}}>
                    {!finalized&&<div style={{position:'absolute',left:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.15)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleDeskBarMouseDown(e,i,di,'left');}}/>}
                    <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'white',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',paddingLeft:10,paddingRight:10,pointerEvents:'none'}}>Desk</span>
                    {!finalized&&<div style={{position:'absolute',right:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.15)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleDeskBarMouseDown(e,i,di,'right');}}/>}
                  </div>
                );
              })}

              {/* Event bars */}
              {dayEvents.filter(ev=>ev.assignedStaff.includes(person.id)).map(evt => {
                const isAct=activeBar?.type==='event'&&activeBar?.eventId===evt.id;
                const isDrg=draggingBarInfo?.type==='event'&&draggingBarInfo?.eventId===evt.id;
                return (
                  <div key={evt.id} draggable={!finalized}
                    style={{position:'absolute',height:24,borderRadius:4,overflow:'hidden',userSelect:'none',top:'50%',transform:'translateY(-50%)',...posStyle(evt.start,evt.end),background:'#3b2a6e',opacity:isDrg?0.3:isAct?1:0.9,cursor:finalized?'default':'grab',boxShadow:isAct?'0 0 0 2px #7c5cbf':'none',zIndex:isAct?10:3}}
                    onDragStart={e=>{e.stopPropagation();!finalized&&handleEventBarDragStart(e,evt.id,person.id);}}
                    onDragEnd={handleBarDragEnd}
                    onContextMenu={e=>{e.preventDefault();!finalized&&handleBarContextMenu(e,{type:'event',eventId:evt.id,staffId:person.id});}}
                    title={evt.name}>
                    {!finalized&&<div style={{position:'absolute',left:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.15)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleEventBarMouseDown(e,evt.id,'left');}}/>}
                    <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,paddingLeft:10,paddingRight:10,whiteSpace:'nowrap',overflow:'hidden',pointerEvents:'none'}}>{evt.name}</span>
                    {!finalized&&<div style={{position:'absolute',right:0,top:0,width:7,height:'100%',cursor:'ew-resize',background:'rgba(255,255,255,0.15)',zIndex:2}} onMouseDown={e=>{e.stopPropagation();e.preventDefault();handleEventBarMouseDown(e,evt.id,'right');}}/>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Events strip */}
        {dayEvents.length > 0 && (
          <div style={{ display:'flex', borderTop:'1px solid var(--color-border)', height:22 }}>
            <div style={{ width:NAME_COL, flexShrink:0, display:'flex', alignItems:'center', paddingLeft:8, borderRight:'1px solid var(--color-border)', fontSize:9, fontWeight:600, color:'var(--color-text-dim)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Events</div>
            <div style={{ flex:1, position:'relative' }}>
              {dayEvents.map(evt => (
                <div key={evt.id} title={`${evt.name}: ${formatTime(evt.start)}–${formatTime(evt.end)}`}
                  style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', height:14, ...posStyle(evt.start,evt.end), background:'#3b2a6e', opacity:0.85, borderRadius:3, overflow:'hidden', display:'flex', alignItems:'center', paddingLeft:4 }}>
                  <span style={{ fontSize:9, color:'white', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', pointerEvents:'none' }}>{evt.name} ({evt.assignedStaff.length}/{evt.staffNeeded})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'4px 10px', borderTop:'1px solid var(--color-border)' }}>
        {[{color:'var(--color-green)',opacity:0.7,label:'Shift'},{color:'var(--color-yellow)',opacity:0.75,label:'Desk'},{color:'#3b2a6e',opacity:0.9,label:'Event'}].map(({color,opacity,label})=>(
          <div key={label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--color-text-dim)' }}>
            <div style={{ width:18, height:7, borderRadius:2, background:color, opacity }}/>
            {label}
          </div>
        ))}
      </div>

      {/* Modals */}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onEdit={handleContextMenuEdit} onDelete={handleContextMenuDelete} onClose={()=>setContextMenu(null)}/>}
      {editModal && <EditModal target={editModal} orderedStaff={orderedStaff} dayEvents={dayEvents} onSave={handleEditSave} onClose={()=>setEditModal(null)}/>}
      {availWarning && <AvailWarningModal staffName={availWarning.staffName} title={availWarning.title} message={availWarning.message} confirmLabel={availWarning.confirmLabel} onConfirm={availWarning.onConfirm} onCancel={availWarning.onCancel}/>}
      {applyTplOpen && <ApplyTemplateCalendarModal templates={templates} allStaff={allStaff} saveDaySchedule={saveDaySchedule} onClose={()=>setApplyTplOpen(false)} onApplyStaff={(newStaff,ds)=>{if(newStaff&&ds===dateStr)setOrderedStaff(sortByShift(newStaff));}}/>}
      {saveTplOpen && <SaveAsDayTemplateModal date={date} staff={orderedStaff} templates={templates} onSave={newTpl=>{const updated=[...templates,newTpl];setTemplates(updated);persistTemplates(updated);}} onClose={()=>setSaveTplOpen(false)}/>}
      {finalizeWarn && (
        <AvailWarningModal
          title="Schedule Has Issues"
          message={
            <div>
              <p style={{ marginBottom:8 }}>The following issues were found:</p>
              <ul style={{ listStyle:'none', padding:0, display:'flex', flexDirection:'column', gap:4 }}>
                {finalizeWarn.map((a,i) => (
                  <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:12 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:a.type==='red'?'var(--color-red)':'var(--color-yellow)', flexShrink:0, marginTop:3 }}/>
                    <span style={{ color:'var(--color-text-dim)' }}>{a.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          }
          confirmLabel="Finalize Anyway"
          onConfirm={()=>{setFinalizeWarn(null);commitFinalize();}}
          onCancel={()=>setFinalizeWarn(null)}
        />
      )}
    </div>
  );
}));

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WeeklyViewExperimentalPage() {
  const { events, currentDate, goToDate, getDaySchedule, staff, saveDaySchedule, assignStaffToEvent, unassignStaffFromEvent, updateEvent, daySchedules } = useScheduleContext();
  const { templates, setTemplates } = useTemplates();
  const [weekStart,    setWeekStart]    = useState(() => getMondayOf(currentDate));
  const [saveModal,    setSaveModal]    = useState(false);
  const [applyTplOpen, setApplyTplOpen] = useState(false);
  const [tplName,      setTplName]      = useState('');
  const [tplDesc,      setTplDesc]      = useState('');
  const [nameError,    setNameError]    = useState('');
  const [finalizeAllWarn, setFinalizeAllWarn] = useState(null);  // [{ label, issues }]

  // Imperative handles to each mounted DayEditor, keyed by day string. Lets
  // "Finalize All" read each day's issues / commit it without lifting its
  // local editing state into the parent (which would re-introduce cross-day
  // re-renders). Ref setters are cached per key so the hot edit path doesn't
  // detach/reattach refs on every render.
  const dayHandles = useRef({});
  const refSetters = useRef({});
  function dayRef(key) {
    if (!refSetters.current[key]) refSetters.current[key] = el => { dayHandles.current[key] = el; };
    return refSetters.current[key];
  }
  function pendingDays() {
    return weekData.map(d => dayHandles.current[d.key]).filter(h => h && !h.isFinalized());
  }
  function handleFinalizeAll() {
    const pending = pendingDays();
    if (pending.length === 0) return;
    const withIssues = pending.map(h => ({ label: h.label, issues: h.getIssues() })).filter(x => x.issues.length > 0);
    if (withIssues.length > 0) { setFinalizeAllWarn(withIssues); return; }
    pending.forEach(h => h.commit());
  }
  function confirmFinalizeAll() {
    pendingDays().forEach(h => h.commit());
    setFinalizeAllWarn(null);
  }

  const weekDays = useMemo(() => Array.from({ length:7 }, (_,i) => addDays(weekStart,i)), [weekStart]);

  // Precompute each day's events with a *content-stable* reference. Without
  // this, every parent re-render (an auto-save, or any updateEvent fired on
  // each mousemove of an event resize) hands all 7 memoized DayEditors a
  // brand-new array and forces all of them to re-render. By comparing a
  // signature per day, only the day(s) whose events actually changed get a
  // fresh array — the rest keep their old reference and stay memoized.
  const prevWeekDataRef = useRef([]);
  const weekData = useMemo(() => {
    const next = weekDays.map(date => {
      const key = toDateStr(date);
      const dayEvents = getEventsForDate(date, events);
      const sig = dayEvents.map(e => `${e.id}:${e.start}:${e.end}:${e.name}:${e.type}:${e.staffNeeded}:${e.assignedStaff.join(',')}`).join('|');
      const prev = prevWeekDataRef.current.find(d => d.key === key);
      return prev && prev.sig === sig ? prev : { date, key, sig, dayEvents };
    });
    prevWeekDataRef.current = next;
    return next;
  }, [weekDays, events]);

  const maxHoursById = useMemo(() => {
    const m = new Map(); staff.forEach(s => { if(s.maxHoursPerWeek!=null) m.set(s.id,s.maxHoursPerWeek); }); return m;
  }, [staff]);

  const overHoursAlerts = useMemo(() => {
    const totals = new Map();
    weekDays.forEach(date => {
      const saved = getDaySchedule(toDateStr(date)) ?? getDaySchedule(date.toDateString());
      const src   = saved ?? (weeklyTemplates[DOW_TO_TPL[date.getDay()]]?.staff ?? []);
      src.map(normalizeStaff).forEach(person => {
        const hrs = (person.shifts??[]).reduce((s,sh)=>s+(sh.end-sh.start),0);
        if (hrs>0) { const prev=totals.get(person.id)??{name:person.name,total:0}; totals.set(person.id,{name:person.name,total:prev.total+hrs}); }
      });
    });
    return [...totals.entries()]
      .filter(([id,{total}])=>{ const mx=maxHoursById.get(id); return mx!=null&&total>mx; })
      .map(([id,{name,total}])=>({name,total,max:maxHoursById.get(id)}))
      .sort((a,b)=>(b.total-b.max)-(a.total-a.max));
  }, [weekDays, daySchedules, getDaySchedule, maxHoursById]);

  function prevWeek() { setWeekStart(d => addDays(d,-7)); }
  function nextWeek() { setWeekStart(d => addDays(d,7)); }

  function handleSaveTemplate() {
    const trimmed = tplName.trim();
    if (!trimmed) { setNameError('Template name is required.'); return; }
    if (templates.some(t=>t.name.toLowerCase()===trimmed.toLowerCase())) { setNameError('A template with this name already exists.'); return; }
    const days = Object.fromEntries(weekDays.map((date,i) => {
      const saved = getDaySchedule(toDateStr(date)) ?? getDaySchedule(date.toDateString());
      const src   = saved ?? (weeklyTemplates[DOW_TO_TPL[date.getDay()]]?.staff ?? []);
      return [ALL_DAYS[i], { staff: src.map(normalizeStaff).filter(s=>s.shifts?.length>0) }];
    }));
    const newTpl = { id:Date.now(), type:'week', name:trimmed, description:tplDesc.trim(), createdAt:new Date().toISOString(), days };
    const updated = [...templates, newTpl];
    setTemplates(updated); persistTemplates(updated);
    setSaveModal(false); setTplName(''); setTplDesc(''); setNameError('');
  }

  const weekLabel = (() => {
    const s = weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const e = weekDays[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return `${s} – ${e}`;
  })();

  const navBtn = { padding:'4px 12px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-muted)', color:'var(--color-text)', fontSize:13, cursor:'pointer' };
  const ti = { width:'100%', padding:'8px 10px', borderRadius:7, fontSize:13, background:'var(--color-muted)', color:'var(--color-text)', outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ fontFamily:'inherit' }}>
      {/* Page header */}
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
        <h2 style={{ position:'absolute', left:0, fontSize:18, fontWeight:700, color:'var(--color-text)', margin:0 }}>
          Weekly View
        </h2>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={prevWeek} style={navBtn}>◀</button>
          <span style={{ fontSize:14, fontWeight:500, color:'var(--color-text)', minWidth:190, textAlign:'center' }}>{weekLabel}</span>
          <button onClick={nextWeek} style={navBtn}>▶</button>
        </div>
        <div style={{ position:'absolute', right:0, display:'flex', gap:8 }}>
          <button onClick={()=>setApplyTplOpen(true)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--color-border)', background:'var(--color-muted)', color:'var(--color-text)', fontSize:13, fontWeight:600, cursor:'pointer' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--color-accent)';e.currentTarget.style.color='var(--color-accent)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--color-border)';e.currentTarget.style.color='var(--color-text)';}}>
            Apply Template
          </button>
          <button onClick={()=>{setTplName('');setTplDesc('');setNameError('');setSaveModal(true);}} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'var(--color-accent)', color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            Save as Weekly Template
          </button>
          <button onClick={handleFinalizeAll} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'var(--color-green)', color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            Finalize All
          </button>
        </div>
      </div>

      {/* Over-hours alert */}
      {overHoursAlerts.length > 0 && (
        <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, border:'1px solid rgba(220,80,60,0.4)', background:'rgba(200,60,40,0.08)', display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--color-red)', marginBottom:2 }}>⚠ Over Weekly Hour Limit</div>
          {overHoursAlerts.map(({name,total,max})=>(
            <div key={name} style={{ fontSize:12, color:'var(--color-text-dim)', display:'flex', gap:6 }}>
              <span style={{ color:'var(--color-text)', fontWeight:600 }}>{name}</span>
              <span>is scheduled for <strong style={{ color:'var(--color-red)' }}>{total%1===0?total:total.toFixed(1)}h</strong> — limit is {max}h</span>
            </div>
          ))}
        </div>
      )}

      {/* Day editors */}
      <div>
        {weekData.map(({ date, key, dayEvents }) => (
          <DayEditor
            key={key}
            ref={dayRef(key)}
            date={date}
            allStaff={staff}
            dayEvents={dayEvents}
            getDaySchedule={getDaySchedule}
            saveDaySchedule={saveDaySchedule}
            assignStaffToEvent={assignStaffToEvent}
            unassignStaffFromEvent={unassignStaffFromEvent}
            updateEvent={updateEvent}
            templates={templates}
            setTemplates={setTemplates}
          />
        ))}
      </div>

      {/* Save as Weekly Template modal */}
      {saveModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.55)' }} onClick={e=>{if(e.target===e.currentTarget)setSaveModal(false);}}>
          <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:14, padding:28, width:360, boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700, color:'var(--color-text)' }}>Save as Weekly Template</h3>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--color-text-dim)', marginBottom:5 }}>Template Name *</label>
              <input autoFocus value={tplName} onChange={e=>{setTplName(e.target.value);setNameError('');}} onKeyDown={e=>e.key==='Enter'&&handleSaveTemplate()} placeholder="e.g. Summer Schedule"
                style={{...ti, border:`1px solid ${nameError?'var(--color-red)':'var(--color-border)'}`}}/>
              {nameError && <div style={{ fontSize:11, color:'var(--color-red)', marginTop:4 }}>{nameError}</div>}
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--color-text-dim)', marginBottom:5 }}>Description (optional)</label>
              <input value={tplDesc} onChange={e=>setTplDesc(e.target.value)} placeholder="e.g. Default staffing for summer weeks" style={{...ti, border:'1px solid var(--color-border)'}}/>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setSaveModal(false)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--color-border)', background:'var(--color-muted)', color:'var(--color-text)', fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={handleSaveTemplate} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'var(--color-accent)', color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>Save Template</button>
            </div>
          </div>
        </div>
      )}

      {applyTplOpen && (
        <ApplyTemplateCalendarModal templates={templates} allStaff={staff} saveDaySchedule={saveDaySchedule} onClose={()=>setApplyTplOpen(false)}/>
      )}

      {finalizeAllWarn && (
        <AvailWarningModal
          title="Some Days Have Issues"
          message={
            <div>
              <p style={{ marginBottom:10 }}>
                {finalizeAllWarn.length} {finalizeAllWarn.length===1?'day has':'days have'} scheduling issues. Finalize the whole week anyway?
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:280, overflowY:'auto' }}>
                {finalizeAllWarn.map((d,i) => (
                  <div key={i}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--color-text)', marginBottom:4 }}>{d.label}</div>
                    <ul style={{ listStyle:'none', padding:0, display:'flex', flexDirection:'column', gap:3 }}>
                      {d.issues.map((a,j) => (
                        <li key={j} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:12 }}>
                          <span style={{ width:7, height:7, borderRadius:'50%', background:a.type==='red'?'var(--color-red)':'var(--color-yellow)', flexShrink:0, marginTop:4 }}/>
                          <span style={{ color:'var(--color-text-dim)' }}>{a.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          }
          confirmLabel="Finalize All Anyway"
          onConfirm={confirmFinalizeAll}
          onCancel={()=>setFinalizeAllWarn(null)}
        />
      )}
    </div>
  );
}
