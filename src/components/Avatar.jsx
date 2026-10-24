import { useState } from 'react';
import { thumb } from '../lib/photo';

const TINTS = ['#CFE8E0', '#F6E2B8', '#DCE3F5', '#F3D9D3', '#E2EED5', '#E9DDF0'];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Round picture of a person: their photo if they added one, otherwise their initials. */
export default function Avatar({ name = '?', photo = '', size = 44 }) {
  const [broken, setBroken] = useState(false);
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  if (photo && !broken) {
    return (
      <img className="avatar" src={thumb(photo, Math.round(size * 2))} alt="" width={size} height={size}
        loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)}
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="avatar" aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36, background: TINTS[hash(name) % TINTS.length] }}>
      {initials}
    </span>
  );
}
