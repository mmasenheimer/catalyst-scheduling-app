export function DeleteIcon({ size = 16, color, className, style }) {
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
      className={`delete-icon ${className ?? ''}`}
      style={style}
      aria-label="Delete"
    >
      <g className="delete-icon-lid">
        <path d="M3 6h18" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </g>
      <path className="delete-icon-body" d="M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8" />
      <line className="delete-icon-line" x1="10" x2="10" y1="11" y2="17" />
      <line className="delete-icon-line" x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
