const RAY_PATHS = [
  "M12 3v1",
  "M12 20v1",
  "M3 12h1",
  "M20 12h1",
  "m18.364 5.636-.707.707",
  "m6.343 17.657-.707.707",
  "m5.636 5.636.707.707",
  "m17.657 17.657.707.707",
];

export function SunMediumIcon({ size = 16, color, className, style }) {
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
      className={`sun-medium-icon ${className ?? ''}`}
      style={style}
      aria-label="Switch to light mode"
    >
      <circle cx="12" cy="12" r="4" />
      {RAY_PATHS.map(d => (
        <path key={d} className="sun-ray" d={d} />
      ))}
    </svg>
  );
}
