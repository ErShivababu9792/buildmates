import { useEffect, useState } from 'react';

/** Match score as a ring that fills up while the number counts to the score (no movement, so it also runs with reduced motion). */
export default function ScoreRing({ value, size = 58, label }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 1000);
      setN(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const tone = value >= 70 ? 'high' : value >= 45 ? 'mid' : 'low';
  return (
    <div className={`ring ${tone}`} style={{ '--to': value, '--size': `${size}px` }} role="img" aria-label={`${value}% ${label || ''}`.trim()}>
      <b>{n}<small>%</small></b>
    </div>
  );
}
