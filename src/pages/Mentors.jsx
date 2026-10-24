import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, query, serverTimestamp, Timestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';

export const MIN_GROUP = 2; // a session runs only with at least this many students: never one-to-one
const ms = (ts) => ts?.toMillis?.() || 0;
export const whenLabel = (ts) => ts?.toDate?.().toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) || '';

function HostForm({ onClose }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ topic: '', about: '', date: tomorrow, time: '18:00', duration: 45, capacity: 8, link: 'https://meet.google.com/' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    const start = new Date(`${f.date}T${f.time}`);
    if (f.topic.trim().length < 5) return setError('What will you talk about? e.g. “How to validate a startup idea”.');
    if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() + 3600e3) return setError('Pick a time at least 1 hour from now.');
    if (!/^https:\/\/\S{8,290}$/.test(f.link.trim()) || f.link.trim() === 'https://meet.google.com/') return setError('Add the video call link (Google Meet, Zoom or Teams).');
    setBusy(true); setError('');
    try {
      const ref = doc(collection(db, 'officeHours'));
      const batch = writeBatch(db);
      batch.set(ref, {
        host: user.uid, hostName: profile.name, hostCompany: profile.proCompany || 'BuildMates team',
        topic: f.topic.trim().slice(0, 100), about: f.about.trim().slice(0, 800), startAt: Timestamp.fromDate(start),
        duration: Number(f.duration), capacity: Number(f.capacity), attendees: [], status: 'open', createdAt: serverTimestamp(),
      });
      // The call link is private: only the host and booked students can read it
      batch.set(doc(db, 'officeHours', ref.id, 'private', 'join'), { link: f.link.trim() });
      await batch.commit();
      toast('Session published. Students can book now.');
      navigate(`/mentors/${ref.id}`);
    } catch (err) { console.error(err); setError('Could not publish. Only verified professionals and admins can host.'); setBusy(false); }
  }

  return (
    <Sheet title="Host office hours" onClose={onClose}>
      <form className="stack" onSubmit={save} noValidate>
        <div className="field"><label htmlFor="oh_topic">Topic</label>
          <input className="input" id="oh_topic" maxLength={100} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. How to get your first 100 users" /></div>
        <div className="field"><label htmlFor="oh_about">What students should bring <span className="tag">optional</span></label>
          <textarea className="textarea" id="oh_about" maxLength={800} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="e.g. One question each about your idea or product" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="oh_date">Date</label><input className="input" id="oh_date" type="date" min={tomorrow} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="oh_time">Time</label><input className="input" id="oh_time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
        </div>
        <div className="grid-2">
          <div className="field"><label htmlFor="oh_dur">Length</label>
            <select className="select" id="oh_dur" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })}>{[30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></div>
          <div className="field"><label htmlFor="oh_cap">Seats</label>
            <input className="input" id="oh_cap" type="number" min={3} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Math.max(3, Math.min(20, Number(e.target.value) || 3)) })} /></div>
        </div>
        <div className="field"><label htmlFor="oh_link">Video call link</label>
          <input className="input" id="oh_link" inputMode="url" maxLength={300} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
          <span className="hint">Only booked students see this link.</span></div>
        <div className="notice info"><Icon name="shield" size={18} /><div>Office hours are always in a group: the session runs only if at least {MIN_GROUP} students book. Keep it about their projects.</div></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Publishing…' : 'Publish session'}</button>
      </form>
    </Sheet>
  );
}

/** Mentor office hours: group Q&A sessions with verified professionals. 18+ only. */
export default function Mentors() {
  const { user, profile, isAdmin } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [hosting, setHosting] = useState(false);
  const canHost = !profile.minor && (profile.pro || isAdmin);

  const load = useCallback(() => {
    getDocs(query(collection(db, 'officeHours'), where('status', '==', 'open')))
      .then((s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => { console.error(e); setError('Could not load sessions. Check that the latest security rules are published.'); });
  }, []);
  useEffect(() => { if (!profile.minor) load(); }, [load, profile.minor]);

  const upcoming = useMemo(() => (list || []).filter((h) => ms(h.startAt) + h.duration * 60e3 > Date.now()).sort((a, b) => ms(a.startAt) - ms(b.startAt)), [list]);

  if (profile.minor) {
    return (
      <>
        <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
        <div className="card stack center-text"><span className="feature-ic big"><Icon name="shield" size={26} /></span><b>Mentor office hours are for 18+</b>
          <p className="muted small">In Safe Mode you only meet students your age. Ask your teachers about mentoring at school or college.</p></div>
      </>
    );
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Mentor office hours</h2><p className="muted small">Group Q&amp;A with verified founders and professionals. Bring a question about your project.</p></div>
        {canHost && <button className="btn btn-primary btn-sm" onClick={() => setHosting(true)}><Icon name="plus" size={16} />Host</button>}
      </header>
      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {list === null && !error && <div className="card muted">Loading…</div>}
      {list && !upcoming.length && (
        <div className="card stack center-text"><span className="feature-ic big"><Icon name="briefcase" size={26} /></span><b>No sessions coming up</b>
          <p className="muted small">{canHost ? 'Host one, students are waiting for advice.' : 'Verified professionals add sessions here. Check back soon.'}</p></div>
      )}
      {upcoming.map((h) => {
        const left = h.capacity - (h.attendees?.length || 0);
        const booked = h.attendees?.includes(user.uid);
        return (
          <Link className="card idea-card" to={`/mentors/${h.id}`} key={h.id}>
            <div className="row between"><span className="tag brand"><Icon name="briefcase" size={12} />{h.hostCompany}</span>
              <span className={`tag ${booked ? 'good' : left <= 2 ? 'gold' : ''}`}>{booked ? 'Booked' : left > 0 ? `${left} seats left` : 'Full'}</span></div>
            <b className="idea-title">{h.topic}</b>
            <p className="small muted">with {h.hostName}</p>
            <p className="small muted"><Icon name="clock" size={14} /> {whenLabel(h.startAt)} · {h.duration} min · online</p>
          </Link>
        );
      })}
      {!canHost && <p className="tiny muted">Are you a founder or working professional? Apply as a verified professional in your Profile to host.</p>}
      {hosting && <HostForm onClose={() => setHosting(false)} />}
    </>
  );
}
