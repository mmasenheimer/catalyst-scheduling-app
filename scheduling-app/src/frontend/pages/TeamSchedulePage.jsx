import { useState, useEffect, useMemo } from 'react';
import { useScheduleContext } from '../context/ScheduleContext';
import { useAuth } from '../context/AuthContext';
import { formatTime, getStaffForDate, mergeStaffOverrides, toDateStr } from '../utils/scheduleUtils';
import { HOURS_START, HOURS_END } from '../../data/mockData';
import { schedulesApi } from '../utils/api';

const TOTAL_HOURS = HOURS_END - HOURS_START;
const NAME_COL    = 140;
const ROW_H       = 46;

function pct(h) { return `${((h - HOURS_START) / TOTAL_HOURS) * 100}%`; }
function posStyle(start, end) {
  return { left: `${((start - HOURS_START) / TOTAL_HOURS) * 100}%`, width: `${((end - start) / TOTAL_HOURS) * 100}%` };
}

function getMondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

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

function sortByShift(arr) {
  return [...arr].sort((a, b) => {
    const aMin = a.shifts?.length ? Math.min(...a.shifts.map(s => s.start)) : Infinity;
    const bMin = b.shifts?.length ? Math.min(...b.shifts.map(s => s.start)) : Infinity;
    return aMin - bMin;
  });
}

// ── Read-only day box ────────────────────────────────────────────────────────────

function ReadOnlyDayBox({ date, staff, events, currentStaffId }) {
  const dow      = date.getDay();
  const isToday  = toDateStr(date) === toDateStr(new Date());
  const dayName  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
  const monthDay = date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const hours    = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  return (
    <div style={{ marginBottom:10, borderRadius:10, border:`1px solid ${isToday?'var(--color-accent)':'var(--color-border)'}`, background:'var(--color-surface)', overflow:'hidden' }}>
      {/* Day header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:isToday?'rgba(176,80,48,0.08)':'var(--color-muted)', borderBottom:'1px solid var(--color-border)' }}>
        <span style={{ fontSize:13, fontWeight:700, color:isToday?'var(--color-accent)':'var(--color-text)' }}>{dayName} · {monthDay}</span>
        {isToday && <span style={{ fontSize:9, fontWeight:600, color:'var(--color-accent)', textTransform:'uppercase', letterSpacing:'0.06em', background:'rgba(176,80,48,0.15)', padding:'1px 5px', borderRadius:4 }}>Today</span>}
      </div>

      {/* Hour header */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--color-border)' }}>
        <div style={{ width:NAME_COL, flexShrink:0, padding:'3px 8px', fontSize:10, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--color-text-dim)', borderRight:'1px solid var(--color-border)' }}>Staff</div>
        <div style={{ flex:1, display:'flex' }}>
          {hours.map((h,hi) => (
            <div key={h} style={{ flex:1, padding:'3px 0', fontSize:9, textAlign:'center', color:'var(--color-text-dim)', borderRight: hi < hours.length-1 ? '1px solid var(--color-border)' : 'none' }}>{formatTime(h)}</div>
          ))}
        </div>
      </div>

      {/* Staff rows — read-only, no drag handles, no resize, no context menu */}
      <div>
        {staff.map((person, i) => {
          const isMe = person.id === currentStaffId;
          return (
          <div key={person.id} style={{ display:'flex', borderBottom: i < staff.length-1 ? '1px solid var(--color-border)' : 'none', opacity: person.shifts?.length>0 ? 1 : 0.38, background: isMe ? 'rgba(176,80,48,0.08)' : undefined }}>
            <div style={{ width:NAME_COL, flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'0 6px', height:ROW_H, borderRight:'1px solid var(--color-border)' }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background: isMe ? 'var(--color-accent)' : 'var(--color-muted)', color: isMe ? 'white' : 'var(--color-text-dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, flexShrink:0 }}>
                {person.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color: isMe ? 'var(--color-accent)' : 'var(--color-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{person.name}</span>
                  {isMe && <span style={{ fontSize:8, fontWeight:700, color:'white', background:'var(--color-accent)', padding:'1px 4px', borderRadius:3, flexShrink:0 }}>YOU</span>}
                </div>
                <div style={{ fontSize:9, color:'var(--color-text-dim)', marginTop:1 }}>
                  {person.shifts?.length>0 ? (person.shifts.length===1 ? `${formatTime(person.shifts[0].start)}–${formatTime(person.shifts[0].end)}` : `${person.shifts.length} shifts`) : 'Unscheduled'}
                </div>
              </div>
            </div>
            <div style={{ flex:1, position:'relative', height:ROW_H }}>
              {hours.map(h => h>HOURS_START && <div key={h} style={{position:'absolute',top:0,bottom:0,left:pct(h),width:1,background:'var(--color-border)',opacity:0.4,pointerEvents:'none'}}/>)}

              {(person.shifts??[]).map(sh => (
                <div key={sh.id}
                  style={{position:'absolute',height:24,borderRadius:4,top:'50%',transform:'translateY(-50%)',...posStyle(sh.start,sh.end),background:'var(--color-green)',opacity:isMe?1:0.6,border:isMe?'2px solid var(--color-accent)':'none',boxShadow:isMe?'0 0 0 1px var(--color-accent)':'none'}}
                  title={`${person.name}: ${formatTime(sh.start)} – ${formatTime(sh.end)}`}
                />
              ))}

              {(person.deskShifts??[]).map(dk => (
                <div key={dk.id}
                  style={{position:'absolute',height:24,borderRadius:4,top:'50%',transform:'translateY(-50%)',...posStyle(dk.start,dk.end),background:'var(--color-yellow)',opacity:isMe?1:0.75,border:isMe?'2px solid var(--color-accent)':'none',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}
                  title={`${person.name}: Desk ${formatTime(dk.start)} – ${formatTime(dk.end)}`}
                >
                  <span style={{fontSize:9,color:'white',fontWeight:600,whiteSpace:'nowrap',pointerEvents:'none'}}>Desk</span>
                </div>
              ))}

              {events.filter(ev=>ev.assignedStaff.includes(person.id)).map(evt => (
                <div key={evt.id}
                  style={{position:'absolute',height:24,borderRadius:4,top:'50%',transform:'translateY(-50%)',...posStyle(evt.start,evt.end),background:'#3b2a6e',opacity:isMe?1:0.9,border:isMe?'2px solid var(--color-accent)':'none',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}
                  title={evt.name}
                >
                  <span style={{fontSize:10,color:'white',whiteSpace:'nowrap',overflow:'hidden',paddingLeft:6,paddingRight:6,pointerEvents:'none'}}>{evt.name}</span>
                </div>
              ))}
            </div>
          </div>
          );
        })}
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
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function TeamSchedulePage() {
  const { staff, events, getDaySchedule } = useScheduleContext();
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  // { [dateStr]: staffArray | null } — null means "checked, nothing saved, use template"
  const [savedByKey, setSavedByKey] = useState({});

  const weekDays = useMemo(() => Array.from({ length:7 }, (_,i) => addDays(weekStart,i)), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    weekDays.forEach(date => {
      const key = toDateStr(date);
      schedulesApi.getDay(key)
        .then(saved => { if (!cancelled) setSavedByKey(prev => ({ ...prev, [key]: saved.staff })); })
        .catch(() => { if (!cancelled) setSavedByKey(prev => ({ ...prev, [key]: null })); });
    });
    return () => { cancelled = true; };
  }, [weekDays]);

  function staffForDate(date) {
    const key = toDateStr(date);
    const saved = savedByKey[key];
    return saved
      ? sortByShift(mergeStaffOverrides(staff, saved))
      : sortByShift(getStaffForDate(date, getDaySchedule, staff));
  }

  const weekLabel = (() => {
    const s = weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const e = weekDays[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return `${s} – ${e}`;
  })();

  const navBtn = { padding:'4px 12px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-muted)', color:'var(--color-text)', fontSize:13, cursor:'pointer' };

  return (
    <div style={{ fontFamily:'inherit' }}>
      <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
        <h2 style={{ position:'absolute', left:0, fontSize:18, fontWeight:700, color:'var(--color-text)', margin:0 }}>
          Team Schedule
        </h2>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>setWeekStart(d=>addDays(d,-7))} style={navBtn}>◀</button>
          <span style={{ fontSize:14, fontWeight:500, color:'var(--color-text)', minWidth:190, textAlign:'center' }}>{weekLabel}</span>
          <button onClick={()=>setWeekStart(d=>addDays(d,7))} style={navBtn}>▶</button>
        </div>
      </div>

      <p style={{ fontSize:12, color:'var(--color-text-dim)', marginTop:-4, marginBottom:14, textAlign:'center' }}>
        Read-only — everyone's shifts, desk times, and events for the week.
      </p>

      {weekDays.map(date => {
        const key = toDateStr(date);
        return (
          <ReadOnlyDayBox
            key={key}
            date={date}
            staff={staffForDate(date)}
            events={getEventsForDate(date, events)}
          />
        );
      })}
    </div>
  );
}
