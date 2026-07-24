const DOTS = [
  { cx: 8, cy: 14 },
  { cx: 12, cy: 14 },
  { cx: 16, cy: 14 },
  { cx: 8, cy: 18 },
  { cx: 12, cy: 18 },
  { cx: 16, cy: 18 },
];

export function CalendarDaysIcon({ size = 16, color, className, style }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`calendar-days-icon ${className ?? ''}`}
      style={style}
      aria-label="Calendar"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect height="18" rx="2" width="18" x="3" y="4" />
      <path d="M3 10h18" />
      {DOTS.map(dot => (
        <circle key={`${dot.cx}-${dot.cy}`} className="cal-dot" cx={dot.cx} cy={dot.cy} r="1" fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
