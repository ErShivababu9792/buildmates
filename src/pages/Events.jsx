import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { countdown, EVENT_KINDS, EVENT_MODES, eventWhen, sortEvents } from '../lib/events';

const list = (snap) => (snap?.docs || []).map((d) => ({ id: d.id, ...d.data() }));

/** Add an event. Admins publish straight away; adult students send it for review. */
export function EventForm({ onClose, onSaved }) {
  const { user, profile, isAdmin } = useAuth();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    title: '', organizer: profile.college || '', kind: 'Hackathon', mode: 'In person', place: '', link: '',
    startDate: today, startTime: '09:00', endDate: today, endTime: '18:00', teamSize: 4, audience: 'all', about: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const start = new Date(`${f.startDate}T${f.startTime}`);
    const end = new Date(`${f.endDate}T${f.endTime}`);
    const link = f.link.trim() === 'https://' ? '' : f.link.trim();
    if (f.title.trim().length < 4) return setError('Give the event a clear title (at least 4 letters).');
    if (f.organizer.trim().length < 2) return setError('Who is organising it?');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return setError('Check the dates: the end must be after the start.');
    if (end.getTime() < Date.now()) return setError('This event has already ended.');
    if (link && !/^https:\/\/\S{3,290}$/.test(link)) return setError('The link must start with https://');
    if (f.mode === 'In person' && !f.place.trim()) return setError('Where is it happening?');
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'events'), {
        title: f.title.trim(), organizer: f.organizer.trim(), kind: f.kind, mode: f.mode, place: f.place.trim(), link,
        about: f.about.trim(), startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end),
        audience: f.audience, teamSize: Number(f.teamSize), status: isAdmin ? 'live' : 'pending',
        createdBy: user.uid, createdByName: profile.name, createdAt: serverTimestamp(),
      });
      toast(isAdmin ? 'Event published' : 'Thanks! The team will check it and publish it.');
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Could not save. Check the details and that the latest rules are published.');
    }
    setBusy(false);
  }

  return (
    <Sheet title={isAdmin ? 'Add an event' : 'Suggest an event'} onClose={onClose}>
      <form className="stack" onSubmit={save} noValidate>
        <div className="field"><label htmlFor="ev_title">Title</label>
          <input className="input" id="ev_title" maxLength={100} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Smart India Hackathon – internal round" /></div>
        <div className="field"><label htmlFor="ev_org">Organised by</label>
          <input className="input" id="ev_org" maxLength={80} value={f.organizer} onChange={(e) => set('organizer', e.target.value)} /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="ev_kind">Type</label>
            <select className="select" id="ev_kind" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div className="field"><label htmlFor="ev_mode">Where</label>
            <select className="select" id="ev_mode" value={f.mode} onChange={(e) => set('mode', e.target.value)}>{EVENT_MODES.map((k) => <option key={k}>{k}</option>)}</select></div>
        </div>
        {f.mode === 'In person' && (
          <div className="field"><label htmlFor="ev_place">Venue</label>
            <input className="input" id="ev_place" maxLength={120} value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="e.g. Krupanidhi campus, Seminar Hall 2" /></div>
        )}
        <div className="grid-2">
          <div className="field"><label htmlFor="ev_sd">Starts</label>
            <input className="input" id="ev_sd" type="date" min={today} value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <input className="input" type="time" aria-label="Start time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} /></div>
          <div className="field"><label htmlFor="ev_ed">Ends</label>
            <input className="input" id="ev_ed" type="date" min={f.startDate} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
            <input className="input" type="time" aria-label="End time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="ev_team">Team size (max)</label>
            <input className="input" id="ev_team" type="number" min={1} max={10} value={f.teamSize} onChange={(e) => set('teamSize', Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></div>
          <div className="field"><label htmlFor="ev_aud">Who can join</label>
            <select className="select" id="ev_aud" value={f.audience} onChange={(e) => set('audience', e.target.value)}>
              <option value="all">All students</option><option value="adults">18+ only</option></select></div>
        </div>
        <div className="field"><label htmlFor="ev_link">Registration link <span className="tag">optional</span></label>
          <input className="input" id="ev_link" inputMode="url" maxLength={300} value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" /></div>
        <div className="field"><label htmlFor="ev_about">About <span className="tag">optional</span></label>
          <textarea className="textarea" id="ev_about" maxLength={1500} value={f.about} onChange={(e) => set('about', e.target.value)} placeholder="Theme, prizes, rules, what to bring" /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : isAdmin ? 'Publish event' : 'Send for review'}</button>
      </form>
    </Sheet>
  );
}

export function EventCard({ e }) {
  const c = countdown(e);
  return (
    <Link className="card idea-card" to={`/events/${e.id}`}>
      <div className="row between">
        <span className="tag brand">{e.kind}</span>
        <span className={`tag ${c === 'Happening now' || c === 'Today' ? 'gold' : ''}`}>{c}</span>
      </div>
      <b className="idea-title">{e.title}</b>
      <p className="small muted"><Icon name="clock" size={14} /> {eventWhen(e)}</p>
      <p className="small muted"><Icon name="pin" size={14} /> {e.mode === 'Online' ? 'Online' : e.place} · {e.organizer}</p>
      <div className="row gap-6">
        <span className="tag">Teams up to {e.teamSize}</span>
        {e.audience === 'adults' && <span className="tag">18+</span>}
        {e.status === 'pending' && <span className="tag warn">Under review</span>}
      </div>
    </Link>
  );
}

export default function Events() {
  const { user, profile, isAdmin } = useAuth();
  const [live, setLive] = useState(null);
  const [mine, setMine] = useState([]);
  const [review, setReview] = useState([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(() => {
    // Safe Mode only asks for events open to everyone; the rules check this too.
    const liveQ = profile.minor
      ? query(collection(db, 'events'), where('status', '==', 'live'), where('audience', '==', 'all'))
      : query(collection(db, 'events'), where('status', '==', 'live'));
    Promise.all([
      getDocs(liveQ),
      getDocs(query(collection(db, 'events'), where('createdBy', '==', user.uid))).catch(() => null),
      isAdmin ? getDocs(query(collection(db, 'events'), where('status', '==', 'pending'))).catch(() => null) : null,
    ]).then(([a, m, r]) => {
      setLive(list(a));
      setMine(list(m).filter((e) => e.status === 'pending'));
      setReview(list(r).filter((e) => e.createdBy !== user.uid));
    }).catch((e) => { console.error(e); setError('Could not load events. Check your connection and that the latest security rules are published.'); });
  }, [profile.minor, user.uid, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const { upcoming, past } = useMemo(() => sortEvents(live || []), [live]);

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Hackathons and events</h2><p className="muted small">Find an event, then find your team for it.</p></div>
        {!profile.minor && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />{isAdmin ? 'Add' : 'Suggest'}</button>}
      </header>

      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}

      {review.length > 0 && (
        <section className="stack gap-10">
          <span className="eyebrow">Waiting for your review</span>
          {review.map((e) => <EventCard key={e.id} e={e} />)}
        </section>
      )}

      {mine.length > 0 && (
        <section className="stack gap-10">
          <span className="eyebrow">Your suggestions</span>
          {mine.map((e) => <EventCard key={e.id} e={e} />)}
        </section>
      )}

      {live === null && !error && <div className="card muted">Loading events…</div>}

      {live && !upcoming.length && (
        <div className="card stack center-text">
          <span className="feature-ic big"><Icon name="star" size={26} /></span>
          <b>No upcoming events yet</b>
          <p className="muted small">{profile.minor ? 'When your school or college adds one, it will show up here.' : 'Know a hackathon or workshop coming up? Suggest it so others can find teammates.'}</p>
        </div>
      )}

      {upcoming.length > 0 && <section className="stack gap-10"><span className="eyebrow">Upcoming</span>{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</section>}

      {past.length > 0 && (
        <section className="stack gap-10">
          <button className="btn btn-ghost btn-sm self-start" onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide' : 'Show'} past events ({past.length})</button>
          {showPast && past.map((e) => <EventCard key={e.id} e={e} />)}
        </section>
      )}

      {adding && <EventForm onClose={() => setAdding(false)} onSaved={load} />}
    </>
  );
}
