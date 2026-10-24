import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { SKILLS } from '../lib/constants';
import { CIRCLE_IDEAS, CIRCLE_LEVELS, CIRCLE_MODES } from '../lib/teams';

function NewCircle({ onClose }) {
  const { user, profile } = useAuth();
  const { label } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const modes = profile.minor ? CIRCLE_MODES.filter((m) => m !== 'In person') : CIRCLE_MODES;
  const [f, setF] = useState({ title: '', topic: SKILLS[0], level: CIRCLE_LEVELS[0], about: '', schedule: '', mode: 'Online', place: '', maxSize: 6, weeks: 6 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    if (f.title.trim().length < 4) return setError('Give the circle a clear name, like “Learn React in 6 weeks”.');
    if (f.schedule.trim().length < 3) return setError('When do you meet? e.g. “Saturdays 5–6 pm”.');
    if (f.mode !== 'Online' && !f.place.trim()) return setError('Where do you meet?');
    setBusy(true); setError('');
    try {
      const ref = await addDoc(collection(db, 'circles'), {
        title: f.title.trim().slice(0, 80), topic: f.topic, level: f.level, about: f.about.trim().slice(0, 600),
        schedule: f.schedule.trim().slice(0, 80), mode: f.mode, place: f.mode === 'Online' ? '' : f.place.trim().slice(0, 100),
        maxSize: Number(f.maxSize), weeks: Number(f.weeks), members: [user.uid], owner: user.uid, ownerName: profile.name,
        minor: Boolean(profile.minor), college: profile.college || '', status: 'open', createdAt: serverTimestamp(),
      });
      toast('Circle created. Invite friends or wait for others to join.');
      navigate(`/circles/${ref.id}`);
    } catch (err) { console.error(err); setError('Could not create. Check the details and that the latest rules are published.'); setBusy(false); }
  }

  return (
    <Sheet title="Start a learning circle" onClose={onClose}>
      <form className="stack" onSubmit={save} noValidate>
        <div className="field"><label htmlFor="c_title">What will you learn together?</label>
          <input className="input" id="c_title" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Learn React in 6 weeks" /></div>
        <div className="chips">{CIRCLE_IDEAS.map((x) => <button type="button" className="chip" key={x} onClick={() => setF({ ...f, title: x })}>{x}</button>)}</div>
        <div className="grid-2">
          <div className="field"><label htmlFor="c_topic">Skill</label>
            <select className="select" id="c_topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{SKILLS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="c_level">Level</label>
            <select className="select" id="c_level" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{CIRCLE_LEVELS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="c_sched">When</label>
          <input className="input" id="c_sched" maxLength={80} value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} placeholder="e.g. Saturdays 5–6 pm" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="c_mode">Where</label>
            <select className="select" id="c_mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{modes.map((s) => <option key={s}>{s}</option>)}</select></div>
          {f.mode !== 'Online' && <div className="field"><label htmlFor="c_place">Place</label>
            <input className="input" id="c_place" maxLength={100} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder={f.mode === 'At college' ? 'e.g. Library, 2nd floor' : 'e.g. A public café near Hebbal'} /></div>}
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="c_size">People (max)</label>
            <input className="input" id="c_size" type="number" min={3} max={8} value={f.maxSize} onChange={(e) => setF({ ...f, maxSize: Math.max(3, Math.min(8, Number(e.target.value) || 3)) })} /></div>
          <div className="field"><label htmlFor="c_weeks">For how many weeks</label>
            <input className="input" id="c_weeks" type="number" min={1} max={12} value={f.weeks} onChange={(e) => setF({ ...f, weeks: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} /></div>
        </div>
        <div className="field"><label htmlFor="c_about">Plan <span className="tag">optional</span></label>
          <textarea className="textarea" id="c_about" maxLength={600} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="e.g. Week 1 basics, week 2 components… Free YouTube course + one small project" /></div>
        {profile.minor && <p className="tiny muted">Safe Mode: circles meet online or at your school or college only.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create circle'}</button>
      </form>
    </Sheet>
  );
}

/** Learning circles: 3–8 students learn one skill together, week by week. Group-first by design. */
export default function Circles() {
  const { user, profile } = useAuth();
  const { blockedIds } = useSocial();
  const { label } = useT();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    getDocs(query(collection(db, 'circles'), where('minor', '==', Boolean(profile.minor))))
      .then((s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => { console.error(e); setError('Could not load circles. Check that the latest security rules are published.'); });
  }, [profile.minor]);
  useEffect(() => { load(); }, [load]);

  const mine = useMemo(() => (list || []).filter((c) => c.members?.includes(user.uid)), [list, user.uid]);
  const open = useMemo(() => (list || [])
    .filter((c) => !c.members?.includes(user.uid) && c.status === 'open' && (c.members?.length || 0) < c.maxSize && !blockedIds.has(c.owner))
    .filter((c) => filter === 'all' || (filter === 'college' ? c.college === profile.college : c.topic === filter))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)), [list, user.uid, blockedIds, filter, profile.college]);

  const card = (c) => (
    <Link className="card idea-card" to={`/circles/${c.id}`} key={c.id}>
      <div className="row between"><span className="tag brand">{label(c.topic)}</span><span className="tiny muted">{c.members?.length || 0}/{c.maxSize} people</span></div>
      <b className="idea-title">{c.title}</b>
      <p className="small muted"><Icon name="clock" size={14} /> {c.schedule} · {c.weeks} weeks · {c.level}</p>
      <p className="small muted"><Icon name="pin" size={14} /> {c.mode === 'Online' ? 'Online' : `${c.mode} · ${c.place}`} · {c.college}</p>
      {c.status === 'ended' && <span className="tag self-start">Ended</span>}
    </Link>
  );

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Learning circles</h2><p className="muted small">Small groups that learn one skill together, week by week. Perfect if you’re just starting.</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={16} />Start one</button>
      </header>
      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {list === null && !error && <div className="card muted">Loading…</div>}

      {mine.length > 0 && <section className="stack gap-10"><span className="eyebrow">Your circles</span>{mine.map(card)}</section>}

      {list && (
        <section className="stack gap-10">
          <div className="row between"><span className="eyebrow">Open to join</span>
            <select className="select auto" aria-label="Filter circles" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option><option value="college">My college</option>
              {SKILLS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select></div>
          {!open.length && <div className="card muted small center-text">No open circles here yet. Start one, it only needs 3 people.</div>}
          {open.map(card)}
        </section>
      )}

      {creating && <NewCircle onClose={() => setCreating(false)} />}
    </>
  );
}
