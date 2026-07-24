import { useRef } from 'react';
import { CalendarDaysIcon } from './CalendarDaysIcon';

export function DateInput({ className, style, wrapperStyle, wrapperClassName, ...inputProps }) {
  const ref = useRef(null);

  return (
    <div className={wrapperClassName} style={{ position: 'relative', ...wrapperStyle }}>
      <input
        ref={ref}
        type="date"
        className={`date-input-custom ${className ?? ''}`}
        style={{ paddingRight: 32, ...style }}
        {...inputProps}
      />
      <span
        onClick={() => ref.current?.showPicker?.()}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex' }}
      >
        <CalendarDaysIcon size={15} color="white" />
      </span>
    </div>
  );
}
