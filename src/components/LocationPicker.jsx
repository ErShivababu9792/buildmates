import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { areaFromDevice, searchColleges } from '../lib/geo';
import { saveExact } from '../lib/safetyLocation';
import { useAuth } from '../context/AuthContext';

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/** Text box with live suggestions from an API. The typed text is kept if nothing matches. */
function Suggest({ id, label, value, onType, onPick, fetcher, placeholder, hint, render }) {
  const [q, setQ] = useState(value || '');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const query = useDebounced(q);
  const picked = useRef(value || '');

  // Only react to changes made OUTSIDE this box (e.g. "Use my location"); typing must not count as a pick
  useEffect(() => {
    if ((value || '') !== q) { setQ(value || ''); picked.current = value || ''; }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3 || term === picked.current) { setList([]); return undefined; }
    let alive = true;
    setBusy(true); setErr('');
    fetcher(term).then((r) => { if (alive) { setList(r.slice(0, 8)); setOpen(true); } })
      .catch((e) => { if (alive) { setList([]); setErr(e.message || 'Search is not available right now.'); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="field suggest">
      <label htmlFor={id}>{label}</label>
      <div className="suggest-box">
        <input className="input" id={id} value={q} placeholder={placeholder} autoComplete="off" maxLength={80}
          role="combobox" aria-expanded={open && list.length > 0} aria-controls={`${id}_list`}
          onChange={(e) => { setQ(e.target.value); onType(e.target.value); }}
          onFocus={() => list.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {busy && <span className="spinner sm dark" aria-hidden="true" />}
      </div>
      {open && list.length > 0 && (
        <ul className="suggest-list" id={`${id}_list`} role="listbox">
          {list.map((p, i) => (
            <li key={`${p.name}_${i}`} role="option" aria-selected="false">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { picked.current = p.name; setQ(p.name); setOpen(false); onPick(p); }}>
                {render(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <span className="hint error-text">{err}</span>}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/**
 * Where the student lives comes ONLY from the device (the browser's "Allow location" pop-up); there is no
 * manual address entry, so the area can't be faked. OpenStreetMap names the area from the point.
 * The profile gets the area name (and a ~1 km point for distance); the exact point goes only to admins.
 * College is still searched by name (OpenStreetMap).
 * value: { pincode, state, city, area, geo, college }
 */
export default function LocationPicker({ value, onChange }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [blocked, setBlocked] = useState(false);

  // auto = when this step opens. On auto, an area already on the profile is kept (the exact point still updates).
  async function fromDevice(auto = false) {
    setBusy(true); setErr(''); setBlocked(false);
    try {
      const p = await areaFromDevice();
      saveExact(user?.uid, p.exact);
      if (!auto || !value.area) {
        onChange({ area: p.area || p.name, city: p.city, state: p.state, pincode: /^[0-9]{6}$/.test(p.pincode) ? p.pincode : '', geo: p.geo });
      }
    } catch (e) {
      if (e.exact) saveExact(user?.uid, e.exact);
      setBlocked(Boolean(e.denied));
      setErr(e.denied ? '' : 'Couldn’t find your area. Turn on Location / GPS and try again.');
    }
    setBusy(false);
  }

  useEffect(() => { fromDevice(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const place = [value.area, value.city, value.state].filter(Boolean).join(', ');

  return (
    <div className="stack">
      <div className="field">
        <label>Where you stay</label>
        {busy ? (
          <div className="notice info small"><span className="spinner sm dark" aria-hidden="true" /><div>Finding your area… If your browser asks, tap <b>Allow</b>.</div></div>
        ) : place ? (
          <div className="notice info small"><Icon name="pin" size={16} /><div className="grow">{place}</div></div>
        ) : null}
        {blocked && (
          <div className="notice bad small" role="alert"><Icon name="alert" size={16} />
            <div className="stack gap-4"><b>Location is blocked for BuildMates</b>
              <span>Tap the lock icon next to the website address → Location → Allow. On a phone, also turn on Location in settings. Then tap Try again.</span></div>
          </div>
        )}
        {err && <p className="error small" role="alert">{err}</p>}
        {!busy && (
          <button type="button" className={`btn btn-sm self-start ${place ? 'btn-secondary' : 'btn-primary'}`} onClick={() => fromDevice(false)}>
            <Icon name="pin" size={15} /> {place ? 'Update my area' : blocked || err ? 'Try again' : 'Use my location'}
          </button>
        )}
      </div>

      <Suggest id="loc_college" label="College or school" value={value.college} placeholder="Start typing your college name"
        fetcher={(q) => searchColleges(q, value.geo)} hint="Not in the list? Just type the full name."
        onType={(t) => onChange({ college: t })}
        onPick={(p) => onChange({ college: p.name })}
        render={(p) => <><b>{p.name}</b><span className="tiny muted">{[p.area !== p.name ? p.area : '', p.city, p.state].filter(Boolean).join(', ')}</span></>} />

      <p className="tiny muted">Other students see only your college and area name, never your exact location. The exact point is kept only for BuildMates admins, for safety.</p>
    </div>
  );
}
