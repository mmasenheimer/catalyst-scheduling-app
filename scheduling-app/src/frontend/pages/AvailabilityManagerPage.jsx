import { useState } from 'react';
import { useScheduleContext } from '../context/ScheduleContext';
import { getAvailability, getSubmittedAt } from '../../data/mockAvailability';
import { HOURS_START, HOURS_END } from '../../data/mockData';
import { formatTime } from '../utils/scheduleUtils';

const TOTAL_HOURS = HOURS_END - HOURS_START;

function formatSubmittedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `Submitted ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const DAYS = [
  { label: 'Mon', dow: 1 },
  { label: 'Tue', dow: 2 },
  { label: 'Wed', dow: 3 },
  { label: 'Thu', dow: 4 },
  { label: 'Fri', dow: 5 },
  { label: 'Sun', dow: 0 },
];

function posStyle(start, end) {
  const left  = ((start - HOURS_START) / TOTAL_HOURS) * 100;
  const width = ((end   - start)       / TOTAL_HOURS) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

export default function AvailabilityManagerPage() {
  const { staff } = useScheduleContext();
  const [selectedDow, setSelectedDow] = useState(1);

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOURS_START + i);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Staff Availability</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Weekly availability submitted by staff — reference this when building the daily schedule
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded border"
          style={{ color: 'var(--color-text-dim)', borderColor: 'var(--color-border)', background: 'var(--color-muted)' }}>
          Mock data
        </span>
      </div>

      {/* Day picker */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {DAYS.map(({ label, dow }) => {
          const isActive = selectedDow === dow;
          const count = staff.filter(s => getAvailability(s.id, dow).length > 0).length;
          return (
            <button
              key={dow}
              onClick={() => setSelectedDow(dow)}
              className="flex flex-col items-center px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all border"
              style={{
                background:   isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                color:        isActive ? 'white' : 'var(--color-text-dim)',
                borderColor:  isActive ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              <span>{label}</span>
              <span className="text-xs mt-0.5" style={{ opacity: 0.75 }}>{count} avail.</span>
            </button>
          );
        })}
      </div>

      {/* Timeline grid */}
      <div className="rounded-xl border overflow-x-auto mb-4"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>

        {/* Time header */}
        <div className="flex border-b" style={{ borderColor: 'var(--color-border)', minWidth: 900 }}>
          <div className="w-48 shrink-0 p-3 text-xs uppercase tracking-wide border-r"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}>
            Staff
          </div>
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
        {staff.map(person => {
          const blocks = getAvailability(person.id, selectedDow);
          const isAvailable = blocks.length > 0;
          const submittedLabel = formatSubmittedAt(getSubmittedAt(person.id));

          return (
            <div
              key={person.id}
              className="flex border-b last:border-b-0"
              style={{
                borderColor: 'var(--color-border)',
                minWidth: 900,
                opacity: isAvailable ? 1 : 0.45,
              }}
            >
              {/* Name column */}
              <div className="w-48 shrink-0 px-3 py-3 text-sm border-r flex items-center gap-2"
                style={{ borderColor: 'var(--color-border)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}>
                  {person.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {person.name}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-dim)' }}>
                    {isAvailable
                      ? blocks.map(b => `${formatTime(b.start)}–${formatTime(b.end)}`).join(', ')
                      : 'Not available'}
                  </div>
                  {submittedLabel && (
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-dim)', opacity: 0.6, fontSize: 10 }}>
                      {submittedLabel}
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="flex-1 relative" style={{ height: 60 }}>
                {/* Hour grid lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {hours.map(h => (
                    <div key={h} className="flex-1 border-r last:border-r-0"
                      style={{ borderColor: 'var(--color-border)', opacity: 0.4 }} />
                  ))}
                </div>

                {isAvailable ? (
                  blocks.map((block, bi) => (
                    <div
                      key={bi}
                      className="absolute"
                      style={{
                        ...posStyle(block.start, block.end),
                        top: 10, bottom: 10,
                        background: 'rgba(96, 165, 250, 0.15)',
                        border: '1px solid rgba(96, 165, 250, 0.32)',
                        borderRadius: 6,
                      }}
                    >
                      <span
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{
                          fontSize: 10,
                          color: 'rgba(147, 197, 253, 0.9)',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          paddingLeft: 8,
                          paddingRight: 8,
                        }}
                      >
                        {formatTime(block.start)} – {formatTime(block.end)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 14 }}>
                    <span className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
                      Unavailable
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-1">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)' }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: 'rgba(96,165,250,0.3)', border: '1px solid rgba(96,165,250,0.5)' }} />
          Available
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-dim)', opacity: 0.5 }}>
          <div style={{ width: 28, height: 12, borderRadius: 3, background: 'var(--color-muted)' }} />
          Unavailable
        </div>
      </div>
    </div>
  );
}
