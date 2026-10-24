import { useEffect, useRef } from 'react';

/** Bottom sheet on phones, centred dialog on larger screens. */
export default function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="row between"><h3>{title}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}
