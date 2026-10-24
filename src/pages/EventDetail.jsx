import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { countdown, eventWhen } from '../lib/events';
import { safeUrl } from '../lib/safeUrl';

export default function EventDetail() {
  const { eventId } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const { relation, sendRequest, chatWith, blockedIds } = useSocial();
  const { label } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [ev, setEv] = useState(undefined);
  const [people, setPeople] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const active = (profile.status || 'active') === 'active';

  const load = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) { setEv(null); return; }
      setEv({ id: snap.id, ...snap.data() });
      // Only people from your own age group, the rules allow exactly this query
      const ps = await getDocs(query(collection(db, 'events', eventId, 'people'), where('minor', '==', Boolean(profile.minor)))).catch(() => null);
      const list = (ps?.docs || []).map((d) => ({ id: d.id, ...d.data() }));
      setPeople(list);
      const mine = list.find((p) => p.id === user.uid);
      if (mine) setNote(mine.note || '');
    } catch (e) {
      console.error(e);
      setEv(null);
    }
  }, [eventId, profile.minor, user.uid]);

  useEffect(() => { load(); }, [load]);

  const me = people.find((p) => p.id === user.uid);
  const seekers = useMemo(() => people
    .filter((p) => p.team && p.id !== user.uid && !blockedIds.has(p.id))
    .map((p) => ({ p, s: { newSkills: (p.skills || []).filter((k) => !(profile.skills || []).includes(k)) } }))
    .sort((a, b) => b.s.newSkills.length - a.s.newSkills.length), [people, user.uid, blockedIds, profile.skills]);
  const goingCount = people.length;

  if (ev === undefined) return <div className="card muted">Loading…</div>;
  if (ev === null) {
    return (
      <div className="card stack center-text">
        <b>This event isn’t available</b>
        <p className="muted small">It may have been removed, or it’s only for 18+ students.</p>
        <Link className="btn btn-primary btn-sm" to="/events">All events</Link>
      </div>
    );
  }

  const ended = (ev.endAt?.toMillis?.() || 0) < Date.now();
  const isLive = ev.status === 'live';

  async function join(team) {
    setBusy('join');
    try {
      await setDoc(doc(db, 'events', eventId, 'people', user.uid), {
        name: profile.name, college: profile.college || '', skills: (profile.skills || []).slice(0, 4),
        photo: profile.minor ? '' : (profile.photo || ''), note: team ? note.trim().slice(0, 200) : '',
        team, minor: Boolean(profile.minor), at: serverTimestamp(),
      });
      toast(team ? 'You’re on the “looking for a team” list' : 'Marked as going');
      await load();
    } catch (e) { console.error(e); toast('Could not save. Try again.'); }
    setBusy('');
  }

  async function leave() {
    setBusy('join');
    try { await deleteDoc(doc(db, 'events', eventId, 'people', user.uid)); toast('Removed'); setNote(''); await load(); } catch { toast('Could not update. Try again.'); }
    setBusy('');
  }

  async function connect(p) {
    setBusy(p.id);
    try {
      const chatId = await sendRequest(p.id);
      if (chatId) navigate(`/chats/${chatId}`); else toast('Request sent. The chat opens when they accept.');
    } catch { toast('Could not send the request. Try again.'); }
    setBusy('');
  }

  async function approve() {
    try {
      await updateDoc(doc(db, 'events', eventId), { status: 'live' });
      await addDoc(collection(db, 'adminLog'), { by: user.uid, byName: profile.name, action: `Published event “${ev.title}”`, at: serverTimestamp() }).catch(() => {});
      toast('Event published'); load();
    } catch { toast('Could not publish. Try again.'); }
  }

  async function remove() {
    try {
      await deleteDoc(doc(db, 'events', eventId));
      if (isAdmin) await addDoc(collection(db, 'adminLog'), { by: user.uid, byName: profile.name, action: `Removed event “${ev.title}”`, at: serverTimestamp() }).catch(() => {});
      toast('Event removed'); navigate('/events', { replace: true });
    } catch { toast('Could not remove. Try again.'); }
  }

  function action(p) {
    const r = relation(p.id);
    if (r === 'connected') return <Link className="btn btn-secondary btn-sm" to={`/chats/${chatWith[p.id].id}`}><Icon name="chat" size={16} />Chat</Link>;
    if (r === 'sent') return <button className="btn btn-secondary btn-sm" disabled>Request sent</button>;
    return <button className="btn btn-primary btn-sm" disabled={busy === p.id || !active} onClick={() => connect(p)}>{r === 'incoming' ? 'Accept' : 'Connect'}</button>;
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/events"><Icon name="back" size={18} />Events</Link>

      <section className="card stack">
        <div className="row between"><span className="tag brand">{ev.kind}</span><span className="tag">{countdown(ev)}</span></div>
        <h2>{ev.title}</h2>
        <p className="muted small">by {ev.organizer}</p>
        <div className="stack gap-6">
          <p className="small"><Icon name="clock" size={15} /> {eventWhen(ev)}</p>
          <p className="small"><Icon name="pin" size={15} /> {ev.mode === 'Online' ? 'Online' : ev.place}</p>
          <p className="small"><Icon name="users" size={15} /> Teams of up to {ev.teamSize}{ev.audience === 'adults' ? ' · 18+ only' : ''}</p>
        </div>
        {ev.about && <p className="prewrap">{ev.about}</p>}
        {ev.link && <a className="btn btn-secondary btn-sm self-start" href={safeUrl(ev.link) || undefined} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={16} />Register on the organiser’s site</a>}
        {!isLive && <div className="notice warn"><Icon name="clock" size={18} /><div>Under review. Only you and the admins can see this for now.</div></div>}
        {(isAdmin || (!isLive && ev.createdBy === user.uid)) && (
          <div className="row gap-8">
            {isAdmin && !isLive && <button className="btn btn-primary btn-sm" onClick={approve}><Icon name="check" size={16} />Publish</button>}
            <button className="btn btn-danger btn-sm" onClick={remove}><Icon name="trash" size={16} />Remove</button>
          </div>
        )}
      </section>

      {isLive && !ended && (
        <section className="card stack">
          <h3>Are you taking part?</h3>
          <p className="muted small">{goingCount ? `${goingCount} ${profile.minor ? 'student' : 'person'}${goingCount > 1 ? 's' : ''} from your group ${goingCount > 1 ? 'are' : 'is'} going.` : 'Be the first from your group.'}</p>
          <div className="field"><label htmlFor="ev_note">What kind of teammate do you need? <span className="tag">optional</span></label>
            <input className="input" id="ev_note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Need a designer and someone good at pitching" /></div>
          <div className="row gap-8">
            <button className="btn btn-primary btn-sm" disabled={busy === 'join' || !active} onClick={() => join(true)}><Icon name="users" size={16} />{me?.team ? 'Update my note' : 'I’m looking for a team'}</button>
            {!me?.team && <button className="btn btn-secondary btn-sm" disabled={busy === 'join' || !active || (me && !me.team)} onClick={() => join(false)}><Icon name="check" size={16} />{me ? 'Going' : 'I already have a team'}</button>}
            {me && <button className="btn btn-ghost btn-sm" disabled={busy === 'join'} onClick={leave}>Not going</button>}
          </div>
        </section>
      )}

      {isLive && (
        <section className="stack gap-10">
          <span className="eyebrow">Looking for a team ({seekers.length})</span>
          {!seekers.length && <div className="card muted small">Nobody yet. Tap “I’m looking for a team” so others can find you.</div>}
          {seekers.map(({ p, s }) => (
            <div className="card stack gap-8" key={p.id}>
              <div className="row between">
                <div className="row gap-10 min0">
                  <Avatar name={p.name} photo={p.photo} size={40} />
                  <div className="min0"><b className="small">{p.name}</b><p className="tiny muted">{p.college}{s.newSkills.length ? ` · brings ${s.newSkills.map(label).join(', ')}` : ''}</p></div>
                </div>
                {action(p)}
              </div>
              {p.note && <p className="small">“{p.note}”</p>}
              <div className="row gap-6">{(p.skills || []).map((k) => <span key={k} className={`tag ${s.newSkills.includes(k) ? 'brand' : ''}`}>{label(k)}</span>)}</div>
            </div>
          ))}
          <p className="tiny muted">Skills you don’t have are highlighted. A good team mixes different skills.</p>
        </section>
      )}
    </>
  );
}
