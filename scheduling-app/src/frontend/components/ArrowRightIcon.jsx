export function ArrowRightIcon({ size = 16, color, className, style }) {
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
      className={`arrow-right-icon ${className ?? ''}`}
      style={style}
      aria-label="Next"
    >
      <path className="arrow-right-line" d="M5 12h14" />
      <path className="arrow-right-head" d="m12 5 7 7-7 7" />
    </svg>
  );
}
