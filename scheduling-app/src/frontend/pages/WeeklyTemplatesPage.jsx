import { useState } from 'react';
import { weeklyTemplates, initialStaff } from '../../data/mockData';
import { formatTime } from '../utils/scheduleUtils';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function cloneTemplates() {
  const result = {};
  for (const [day, t] of Object.entries(weeklyTemplates)) {
    result[day] = { ...t, staff: [...t.staff] };
  }
  return result;
}

function DayCard({ day, template, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border transition-all cursor-pointer"
      style={{
        background: isSelected ? '#2a1e14' : 'var(--color-surface)',
        borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      <div className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{day}</div>
      <div className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
        {template.staff.length} staff · {template.events.length} events
      </div>
    </button>
  );
}

function DayDetail({ day, template, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editIds, setEditIds] = useState(new Set());

  function startEdit() {
    setEditIds(new Set(template.staff.map(s => s.id)));
    setIsEditing(true);
  }

  function toggleStaff(id) {
    setEditIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveEdit() {
    onSave(day, { ...template, staff: initialStaff.filter(s => editIds.has(s.id)) });
    setIsEditing(false);
  }

  return (
    <div
      className="p-5 rounded-xl border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{day} Template</h3>
        {isEditing && (
          <span className="text-xs px-2 py-1 rounded" style={{ background: '#2a1e14', color: 'var(--color-accent-bright)' }}>
            Editing
          </span>
        )}
      </div>

      {isEditing ? (
        <>
          <h4
            className="text-sm font-semibold mb-3 uppercase tracking-wide"
            style={{ color: 'var(--color-text-dim)' }}
          >
            Select Staff ({editIds.size} selected)
          </h4>
          <div className="flex flex-col gap-1 mb-6">
            {initialStaff.map(s => {
              const checked = editIds.has(s.id);
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: checked ? '#2a1e14' : 'var(--color-bg)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: checked ? 'var(--color-accent)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStaff(s.id)}
                    className="w-4 h-4 accent-orange-700 cursor-pointer"
                  />
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
                  >
                    {s.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-text-dim)' }}>
                    {formatTime(s.shiftStart)} – {formatTime(s.shiftEnd)}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Save Changes
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
              style={{ background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h4
            className="text-sm font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--color-text-dim)' }}
          >
            Staff ({template.staff.length})
          </h4>
          <div className="grid gap-2 mb-6">
            {template.staff.length === 0 ? (
              <p className="text-sm px-3 py-2" style={{ color: 'var(--color-text-dim)' }}>
                No staff assigned — click Edit Template to add staff.
              </p>
            ) : (
              template.staff.map(s => (
                <div
                  key={s.id}
                  className="flex justify-between items-center px-3 py-2 rounded-lg"
                  style={{ background: 'var(--color-bg)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'var(--color-muted)', color: 'var(--color-text-dim)' }}
                    >
                      {s.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
                    {formatTime(s.shiftStart)} – {formatTime(s.shiftEnd)}
                  </span>
                </div>
              ))
            )}
          </div>

          {template.events.length > 0 && (
            <>
              <h4
                className="text-sm font-semibold mb-2 uppercase tracking-wide"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Events ({template.events.length})
              </h4>
              <div className="grid gap-2">
                {template.events.map(e => (
                  <div
                    key={e.id}
                    className="px-3 py-2 rounded-lg"
                    style={{ background: 'var(--color-bg)' }}
                  >
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                      {formatTime(e.start)} – {formatTime(e.end)} · {e.staffNeeded} staff needed
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-2 mt-6">
            <button
              onClick={startEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'var(--color-accent)', color: 'white' }}
            >
              Edit Template
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
              style={{ background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Apply to Week
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function WeeklyTemplatesPage() {
  const [selectedDay, setSelectedDay] = useState('Wednesday');
  const [templates, setTemplates] = useState(cloneTemplates);

  function handleSave(day, updated) {
    setTemplates(prev => ({ ...prev, [day]: updated }));
  }

  const stats = {
    avgStaff: Math.round(
      Object.values(templates).reduce((sum, t) => sum + t.staff.length, 0) /
      Object.keys(templates).length
    ),
    totalEvents: Object.values(templates).reduce((sum, t) => sum + t.events.length, 0),
  };

  return (
    <div>
      {/* Page header */}
      <div
        className="flex justify-between items-center p-5 rounded-xl mb-6 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Weekly Templates</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-dim)' }}>
            Define reusable staffing patterns for each day
          </p>
        </div>
        <div className="flex gap-6">
          {[
            { label: 'Avg Staff/Day', value: stats.avgStaff },
            { label: 'Total Events', value: stats.totalEvents },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-xl font-bold" style={{ color: 'var(--color-accent-bright)' }}>{value}</div>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div className="flex flex-col gap-2">
          {DAYS.map(day => (
            <DayCard
              key={day}
              day={day}
              template={templates[day]}
              isSelected={selectedDay === day}
              onClick={() => setSelectedDay(day)}
            />
          ))}
        </div>

        <DayDetail
          key={selectedDay}
          day={selectedDay}
          template={templates[selectedDay]}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
