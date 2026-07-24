export function ArrowLeftIcon({ size = 16, color, className, style }) {
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
      className={`arrow-left-icon ${className ?? ''}`}
      style={style}
      aria-label="Previous"
    >
      <path className="arrow-left-head" d="m12 19-7-7 7-7" />
      <path className="arrow-left-line" d="M19 12H5" />
    </svg>
  );
}
