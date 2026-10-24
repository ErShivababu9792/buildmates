import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import { checkMessage } from '../lib/guard';
import { MIN_GROUP, whenLabel } from './Mentors';
import { safeUrl } from '../lib/safeUrl';

export default function MentorSession() {
  const { sessionId } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const toast = useToast();
  const [h, setH] = useState(undefined);
  const [link, setLink] = useState('');
  const [questions, setQuestions] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const active = (profile.status || 'active') === 'active';

  useEffect(() => onSnapshot(doc(db, 'officeHours', sessionId),
    (s) => setH(s.exists() ? { id: s.id, ...s.data() } : null), () => setH(null)), [sessionId]);

  const isHost = h?.host === user.uid;
  const booked = Boolean(h?.attendees?.includes(user.uid));
  const canSeeInside = isHost || booked || isAdmin;

  useEffect(() => {
    if (!h || !canSeeInside) { setLink(''); setQuestions([]); return undefined; }
    getDoc(doc(db, 'officeHours', sessionId, 'private', 'join')).then((s) => setLink(s.data()?.link || '')).catch(() => setLink(''));
    return onSnapshot(query(collection(db, 'officeHours', sessionId, 'questions'), orderBy('at')),
      (s) => setQuestions(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setQuestions([]));
  }, [h?.id, canSeeInside, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile.minor) return <div className="card stack center-text"><b>Mentor office hours are for 18+</b><Link className="btn btn-primary btn-sm self-center" to="/ideas">Back</Link></div>;
  if (h === undefined) return <div className="card muted">Loading…</div>;
  if (!h) return <div className="card stack center-text"><b>This session isn’t available</b><Link className="btn btn-primary btn-sm self-center" to="/mentors">All sessions</Link></div>;

  const start = h.startAt?.toMillis?.() || 0;
  const ended = start + h.duration * 60e3 < Date.now();
  const soon = start - Date.now() < 15 * 60e3 && !ended;
  const count = h.attendees?.length || 0;
  const full = count >= h.capacity;
  const tooFew = count < MIN_GROUP;

  async function book() {
    setBusy(true);
    try { await updateDoc(doc(db, 'officeHours', h.id), { attendees: arrayUnion(user.uid) }); toast('Booked! Add a question so the mentor can prepare.'); } catch { toast('Could not book. It may be full.'); }
    setBusy(false);
  }
  async function cancelSeat() {
    setBusy(true);
    try { await updateDoc(doc(db, 'officeHours', h.id), { attendees: arrayRemove(user.uid) }); toast('Seat cancelled'); } catch { toast('Could not cancel.'); }
    setBusy(false);
  }
  async function cancelSession() {
    try { await updateDoc(doc(db, 'officeHours', h.id), { status: 'cancelled' }); toast('Session cancelled'); } catch { toast('Could not cancel.'); }
  }
  async function ask(e) {
    e.preventDefault();
    const text = q.trim().slice(0, 300);
    if (!text) return;
    const g = checkMessage(text);
    if (g.level === 'block') { toast(`${g.kind}: ${g.msg}`); return; }
    try { await addDoc(collection(db, 'officeHours', h.id, 'questions'), { from: user.uid, name: profile.name, text, at: serverTimestamp() }); setQ(''); } catch { toast('Could not post. Try again.'); }
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/mentors"><Icon name="back" size={18} />Office hours</Link>
      <section className="card stack">
        <div className="row between"><span className="tag brand"><Icon name="briefcase" size={12} />{h.hostCompany}</span>
          <span className={`tag ${h.status === 'cancelled' ? 'bad' : ended ? '' : 'good'}`}>{h.status === 'cancelled' ? 'Cancelled' : ended ? 'Ended' : `${count}/${h.capacity} booked`}</span></div>
        <h2>{h.topic}</h2>
        <p className="muted small">with <b>{h.hostName}</b> · verified professional</p>
        <p className="small"><Icon name="clock" size={15} /> {whenLabel(h.startAt)} · {h.duration} minutes · online, in a group</p>
        {h.about && <p className="prewrap">{h.about}</p>}

        {h.status === 'open' && !ended && tooFew && <div className="notice warn"><Icon name="users" size={18} /><div>Runs only with at least {MIN_GROUP} students. {count ? `${MIN_GROUP - count} more needed.` : 'Be the first to book.'}</div></div>}

        {h.status === 'open' && !ended && !isHost && (
          booked
            ? <div className="row gap-8"><span className="tag good"><Icon name="check" size={12} />You’re booked</span><button className="btn btn-ghost btn-sm" disabled={busy} onClick={cancelSeat}>Cancel my seat</button></div>
            : <button className="btn btn-primary btn-sm self-start" disabled={busy || full || !active} onClick={book}>{full ? 'Full' : 'Book a seat'}</button>
        )}

        {canSeeInside && h.status === 'open' && !ended && link && (
          tooFew
            ? <p className="tiny muted">The call link appears here once at least {MIN_GROUP} students have booked.</p>
            : <a className={`btn btn-sm self-start ${soon ? 'btn-primary' : 'btn-secondary'}`} href={safeUrl(link) || undefined} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={16} />{soon ? 'Join now' : 'Call link'}</a>
        )}
        {isHost && h.status === 'open' && !ended && <button className="btn btn-danger btn-sm self-start" onClick={cancelSession}>Cancel session</button>}
      </section>

      {canSeeInside && (
        <section className="stack gap-10">
          <span className="eyebrow">Questions ({questions.length})</span>
          {!questions.length && <div className="card muted small">No questions yet. {booked ? 'Add yours so the mentor can prepare.' : ''}</div>}
          {questions.map((x) => <div className="card stack gap-4" key={x.id}><b className="small">{x.name}</b><p className="small">{x.text}</p></div>)}
          {(booked || isHost) && h.status === 'open' && !ended && (
            <form className="composer" onSubmit={ask}>
              <input className="input" aria-label="Your question" maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How do I price my app for colleges?" />
              <button className="btn btn-primary" type="submit" aria-label="Post question" disabled={!q.trim()}><Icon name="send" size={18} /></button>
            </form>
          )}
        </section>
      )}
      <p className="tiny muted">Office hours happen in a group video call. Never share personal contact details. Report anything that feels wrong.</p>
    </>
  );
}
