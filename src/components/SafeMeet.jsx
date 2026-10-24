import { useState } from 'react';
import {
  addDoc, collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { notifyPush } from '../lib/server';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Sheet from './Sheet';
import Icon from './Icon';
import { MEET_TIPS, PUBLIC_PLACES } from '../lib/teams';

const HOUR = 3600e3;

export function formatMeet(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

/** Propose a meeting in a public place. Adults only (the database refuses it for under-18 accounts). */
export function SafeMeetSheet({ chatId, otherId, otherName, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [place, setPlace] = useState(PUBLIC_PLACES[0]);
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const [time, setTime] = useState('15:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const when = new Date(`${date}T${time}`);
  const hour = when.getHours();
  const lateWarning = hour < 8 || hour >= 20;

  async function propose() {
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 30 * 60e3) { setError('Pick a time at least 30 minutes from now.'); return; }
    setBusy(true); setError('');
    try {
      const full = detail.trim() ? `${place} – ${detail.trim()}` : place;
      const meetRef = doc(collection(db, 'meets'));
      await setDoc(meetRef, {
        members: [user.uid, otherId].sort(), proposer: user.uid, chatId, place: full.slice(0, 120),
        when: Timestamp.fromDate(when), status: 'proposed', checkins: {}, feedback: {}, createdAt: serverTimestamp(),
      });
      notifyPush('meet', otherId, meetRef.id);
      toast(`Meeting proposed. ${otherName.split(' ')[0]} needs to accept.`);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Could not propose the meeting. Both of you must be 18+ and connected.');
    }
    setBusy(false);
  }

  return (
    <Sheet title={`Plan a safe meet with ${otherName.split(' ')[0]}`} onClose={onClose}>
      <div className="notice info"><Icon name="shield" size={18} /><div>Safe Meet only allows public places. Homes, rooms and hostels are never suggested.</div></div>
      <div className="field"><label htmlFor="m_place">Place</label>
        <select className="select" id="m_place" value={place} onChange={(e) => setPlace(e.target.value)}>{PUBLIC_PLACES.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="field"><label htmlFor="m_detail">Which one? (optional)</label>
        <input className="input" id="m_detail" maxLength={80} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Ground floor, near the entrance" /></div>
      <div className="row gap-10">
        <div className="field grow"><label htmlFor="m_date">Date</label><input className="input" type="date" id="m_date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field grow"><label htmlFor="m_time">Time</label><input className="input" type="time" id="m_time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      {lateWarning && <div className="notice warn"><Icon name="alert" size={18} /><div>We suggest meeting between 8 am and 8 pm, when places are busy.</div></div>}
      <ul className="tips">{MEET_TIPS.map((t) => <li key={t} className="small">{t}</li>)}</ul>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={propose} disabled={busy}>{busy ? 'Sending…' : 'Propose meeting'}</button>
    </Sheet>
  );
}

/** A meeting inside a chat: accept/decline, check in on the day, then say how it went. */
export function MeetCard({ meet, otherName }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const first = otherName.split(' ')[0];
  const t = meet.when?.toMillis?.() || 0;
  const now = Date.now();
  const isProposer = meet.proposer === user.uid;
  const myCheckin = meet.checkins?.[user.uid];
  const myFeedback = meet.feedback?.[user.uid];
  const today = Math.abs(now - t) < 4 * HOUR;
  const past = now > t + HOUR;
  const otherId = meet.members.find((m) => m !== user.uid);

  async function patch(data, msg) {
    setBusy(true);
    try { await updateDoc(doc(db, 'meets', meet.id), data); if (msg) toast(msg); } catch { toast('Could not update. Try again.'); }
    setBusy(false);
  }

  async function feedback(ok) {
    await patch({ [`feedback.${user.uid}`]: ok ? 'good' : 'unsafe', status: 'done' }, ok ? 'Glad it went well!' : 'Thanks for telling us. The team will review this.');
    if (!ok) {
      addDoc(collection(db, 'reports'), {
        by: user.uid, byName: profile.name, target: otherId, targetName: otherName,
        reason: 'Safe Meet: felt unsafe', note: `Meeting at ${meet.place} on ${formatMeet(meet.when)}`, excerpt: [],
        chatId: meet.chatId, auto: false, status: 'Open', at: serverTimestamp(),
      }).catch(() => {});
    }
  }

  async function share() {
    const text = `I'm meeting ${otherName} (from BuildMates) at ${meet.place} on ${formatMeet(meet.when)}.`;
    try { await navigator.clipboard.writeText(text); toast('Copied. Send it to someone you trust.'); } catch { toast(text); }
  }

  if (meet.status === 'declined' || meet.status === 'cancelled') {
    return <div className="meet muted small"><Icon name="clock" size={16} />Meeting at {meet.place} was {meet.status}.</div>;
  }

  return (
    <div className="meet">
      <div className="row between">
        <div className="min0"><b className="small">Safe Meet · {meet.place}</b><p className="tiny muted">{formatMeet(meet.when)}</p></div>
        <span className={`tag ${meet.status === 'accepted' ? 'good' : meet.status === 'done' ? '' : 'gold'}`}>{meet.status === 'proposed' ? 'Waiting' : meet.status === 'accepted' ? 'Confirmed' : 'Done'}</span>
      </div>

      {meet.status === 'proposed' && (isProposer
        ? <div className="row gap-8"><span className="tiny muted">Waiting for {first} to accept.</span><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch({ status: 'cancelled' }, 'Meeting cancelled')}>Cancel</button></div>
        : <div className="row gap-8"><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: 'declined' }, 'Declined')}>Decline</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => patch({ status: 'accepted' }, 'Meeting confirmed')}>Accept</button></div>)}

      {meet.status === 'accepted' && (
        <div className="stack gap-8">
          <div className="row gap-8">
            <button className="btn btn-ghost btn-sm" onClick={share}>Share details with someone you trust</button>
            {!past && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch({ status: 'cancelled' }, 'Meeting cancelled')}>Cancel</button>}
          </div>
          {today && !myCheckin && <button className="btn btn-primary btn-sm self-start" disabled={busy} onClick={() => patch({ [`checkins.${user.uid}`]: 'safe' }, 'Checked in. Have a good meeting!')}><Icon name="check" size={16} />I’m here and safe</button>}
          {myCheckin && <p className="tiny muted">You checked in.{meet.checkins?.[otherId] ? ` ${first} checked in too.` : ''}</p>}
        </div>
      )}

      {(meet.status === 'accepted' || meet.status === 'done') && past && !myFeedback && (
        <div className="row gap-8"><span className="small">How did it go?</span>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => feedback(true)}>It went well</button>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => feedback(false)}>I felt unsafe</button></div>
      )}
      {myFeedback && <p className="tiny muted">Thanks for your feedback.</p>}
    </div>
  );
}
