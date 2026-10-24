import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import ReportSheet from '../components/ReportSheet';
import { checkMessage } from '../lib/guard';
import { evalTrail, SPLIT_MSG } from '../lib/digits';
import { aiEnabled, guardRemote } from '../lib/ai';

const live = (s) => s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

/** Week-by-week plan; members tick "I did this" so everyone sees progress. */
function Sessions({ circle, isMember }) {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [f, setF] = useState(null);

  // The plan can hold call links, so only members load it (the database enforces the same)
  useEffect(() => {
    if (!isMember) { setList([]); return undefined; }
    return onSnapshot(query(collection(db, 'circles', circle.id, 'sessions'), orderBy('week')), (s) => setList(live(s)), () => setList([]));
  }, [circle.id, isMember]);

  async function add(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    try {
      await addDoc(collection(db, 'circles', circle.id, 'sessions'), {
        week: Number(f.week), title: f.title.trim().slice(0, 100), notes: f.notes.trim().slice(0, 500), link: '',
        attended: [], createdBy: user.uid, at: serverTimestamp(),
      });
      setF(null);
    } catch { toast('Could not add. Try again.'); }
  }

  const toggle = (s) => updateDoc(doc(db, 'circles', circle.id, 'sessions', s.id), {
    attended: s.attended?.includes(user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid),
  }).catch(() => toast('Could not update.'));

  if (list === null) return <div className="card muted">Loading…</div>;
  const next = Math.min(circle.weeks, (list.reduce((m, s) => Math.max(m, s.week), 0) || 0) + 1);
  const mineDone = list.filter((s) => s.attended?.includes(user.uid)).length;

  return (
    <div className="stack">
      {isMember && list.length > 0 && (
        <div className="card stack gap-6">
          <div className="row between"><b className="small">Your progress</b><span className="tiny muted">{mineDone} of {circle.weeks} weeks</span></div>
          <div className="bar"><span style={{ width: `${Math.min(100, (mineDone / circle.weeks) * 100)}%` }} /></div>
        </div>
      )}
      {!isMember && <div className="card muted small center-text">Join the circle to see the week-by-week plan.</div>}
      {isMember && !list.length && <div className="card muted small center-text">No plan yet. Add week 1 to get started.</div>}
      {list.map((s) => (
        <article className="card stack gap-6" key={s.id}>
          <div className="row between">
            <div className="min0"><span className="tiny muted">Week {s.week}</span><b className="small block">{s.title}</b></div>
            {isMember && <button className={`btn btn-sm ${s.attended?.includes(user.uid) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggle(s)}>
              <Icon name="check" size={16} />{s.attended?.includes(user.uid) ? 'Done' : 'I did this'}</button>}
          </div>
          {s.notes && <p className="small prewrap">{s.notes}</p>}
          <p className="tiny muted">{s.attended?.length || 0} of {circle.members.length} done</p>
        </article>
      ))}
      {isMember && !f && list.length < circle.weeks && <button className="btn btn-secondary btn-sm self-start" onClick={() => setF({ week: next, title: '', notes: '' })}><Icon name="plus" size={16} />Add week {next}</button>}
      {f && (
        <form className="card stack" onSubmit={add}>
          <div className="grid-2">
            <div className="field"><label htmlFor="s_week">Week</label><input className="input" id="s_week" type="number" min={1} max={circle.weeks} value={f.week} onChange={(e) => setF({ ...f, week: e.target.value })} /></div>
            <div className="field"><label htmlFor="s_t">Topic</label><input className="input" id="s_t" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Components and props" /></div>
          </div>
          <div className="field"><label htmlFor="s_n">What to do <span className="tag">optional</span></label><textarea className="textarea" id="s_n" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Watch video 3–5, build a todo list, share a screenshot in chat" /></div>
          <div className="row gap-8"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setF(null)}>Cancel</button><button className="btn btn-primary btn-sm">Add</button></div>
        </form>
      )}
    </div>
  );
}

/** Group chat for the circle, protected by AI Guard. Contact details stay blocked here. */
function CircleChat({ circle, nameOf }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState(null);
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const active = (profile.status || 'active') === 'active';

  useEffect(() => onSnapshot(query(collection(db, 'circles', circle.id, 'messages'), orderBy('at'), limitToLast(200)),
    (s) => setMessages(live(s)), () => setMessages([])), [circle.id]);
  const [trailDoc, setTrailDoc] = useState(null); // kept live so sending never waits for it
  useEffect(() => onSnapshot(doc(db, 'circles', circle.id, 'trail', user.uid),
    (s) => setTrailDoc(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null), () => setTrailDoc(null)), [circle.id, user.uid]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim().slice(0, 1000);
    if (!body || sending) return;
    setSending(true);
    let g = checkMessage(body);
    if (g.level === 'ok' && aiEnabled) {
      const r = await guardRemote(body);
      if (r && r.level !== 'ok') g = { level: r.level, kind: r.kind, msg: r.msg };
    }
    // Phone numbers are never allowed in circles, not even sent in pieces
    const trailPath = ['circles', circle.id, 'trail', user.uid];
    const trail = g.level !== 'block' ? evalTrail(trailDoc, body) : { blocked: false, trail: null };
    if (trail.blocked) g = { level: 'block', kind: 'Contact sharing', msg: SPLIT_MSG };
    if (g.level === 'block') {
      setNote({ tone: 'bad', text: `Not sent · ${g.kind}. ${g.msg}` });
      addDoc(collection(db, 'guardEvents'), { by: user.uid, kind: g.kind, chatId: `circle:${circle.id}`, at: serverTimestamp() }).catch(() => {});
      setSending(false);
      return;
    }
    try {
      const commit = (digits) => {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'circles', circle.id, 'messages')), { from: user.uid, text: body, at: serverTimestamp() });
        if (digits !== null) batch.set(doc(db, ...trailPath), { digits, at: serverTimestamp() });
        return batch.commit();
      };
      setText(''); setSending(false);   // appears at once; the database confirms in the background
      setNote(g.level === 'warn' ? { tone: 'warn', text: `${g.kind}. ${g.msg}` } : null);
      try { await commit(trail.trail); } catch (first) {
        if (!trail.trail || !trail.base) throw first;
        await commit(trail.trail.slice(trail.base.length));
      }
    } catch { setText((cur) => cur || body); setNote({ tone: 'bad', text: 'Could not send. It may break a safety rule, or you are offline.' }); }
    setSending(false);
  }

  return (
    <>
      <div className="thread">
        <p className="msg sys">Circle chat. Keep it about learning. AI Guard is on, and phone numbers stay blocked here.</p>
        {(messages || []).map((m) => (
          <div key={m.id} className={`msg ${m.from === user.uid ? 'me' : 'them'}`}>
            {m.from !== user.uid && <span className="msg-name">{nameOf(m.from)}</span>}{m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      {note && <div className={`notice ${note.tone}`}><Icon name="shield" size={18} /><div>{note.text}</div></div>}
      <form className="composer" onSubmit={send}>
        <input className="input" aria-label="Message" placeholder={active ? 'Message the circle' : 'Messaging is turned off for your account'} value={text} maxLength={1000} disabled={!active} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || sending || !active}><Icon name="send" size={18} /></button>
      </form>
    </>
  );
}

export default function CircleDetail() {
  const { circleId } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const { people, needPeople, blockedIds } = useSocial();
  const { label } = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [circle, setCircle] = useState(undefined);
  const [tab, setTab] = useState('plan');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(null);
  const active = (profile.status || 'active') === 'active';

  useEffect(() => onSnapshot(doc(db, 'circles', circleId),
    (s) => setCircle(s.exists() ? { id: s.id, ...s.data() } : null), () => setCircle(null)), [circleId]);
  useEffect(() => { if (circle?.members) needPeople(circle.members); }, [circle, needPeople]);

  const nameOf = useMemo(() => (id) => people[id]?.name || '…', [people]);

  if (circle === undefined) return <div className="card muted">Loading…</div>;
  if (circle === null) {
    return <div className="card stack center-text"><b>This circle isn’t available</b><p className="muted small">It may have been closed.</p><Link className="btn btn-primary btn-sm self-center" to="/circles">All circles</Link></div>;
  }

  const isMember = circle.members.includes(user.uid);
  const isOwner = circle.owner === user.uid;
  const full = circle.members.length >= circle.maxSize;
  const blocked = circle.members.some((m) => blockedIds.has(m));

  async function join() {
    setBusy(true);
    try { await updateDoc(doc(db, 'circles', circle.id), { members: arrayUnion(user.uid) }); toast('You joined! Say hi in the circle chat.'); setTab('chat'); } catch { toast('Could not join. It may be full now.'); }
    setBusy(false);
  }

  async function leave() {
    setBusy(true);
    const rest = circle.members.filter((m) => m !== user.uid);
    try {
      if (!rest.length) { await deleteDoc(doc(db, 'circles', circle.id)); toast('Circle closed'); navigate('/circles', { replace: true }); return; }
      await updateDoc(doc(db, 'circles', circle.id), { members: arrayRemove(user.uid), ...(isOwner ? { owner: rest[0], ownerName: nameOf(rest[0]) } : {}) });
      toast('You left the circle');
    } catch { toast('Could not leave. Try again.'); }
    setBusy(false);
  }

  async function setStatus(status) {
    try { await updateDoc(doc(db, 'circles', circle.id), { status }); toast(status === 'ended' ? 'Circle marked as finished 🎉' : 'Circle reopened'); } catch { toast('Could not update.'); }
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/circles"><Icon name="back" size={18} />Circles</Link>
      <section className="card stack">
        <div className="row between"><span className="tag brand">{label(circle.topic)}</span><span className={`tag ${circle.status === 'ended' ? '' : full ? 'gold' : 'good'}`}>{circle.status === 'ended' ? 'Finished' : full ? 'Full' : 'Open'}</span></div>
        <h2>{circle.title}</h2>
        <div className="stack gap-6">
          <p className="small"><Icon name="clock" size={15} /> {circle.schedule} · {circle.weeks} weeks</p>
          <p className="small"><Icon name="pin" size={15} /> {circle.mode === 'Online' ? 'Online' : `${circle.mode} · ${circle.place}`}</p>
          <p className="small"><Icon name="users" size={15} /> {circle.members.length}/{circle.maxSize} people · {circle.level}</p>
        </div>
        {circle.about && <p className="prewrap">{circle.about}</p>}
        <div className="row gap-8">
          {!isMember && circle.status === 'open' && <button className="btn btn-primary btn-sm" disabled={busy || full || !active || blocked} onClick={join}><Icon name="plus" size={16} />{full ? 'Full' : 'Join circle'}</button>}
          {isMember && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={leave}>Leave</button>}
          {isOwner && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(circle.status === 'ended' ? 'open' : 'ended')}>{circle.status === 'ended' ? 'Reopen' : 'Mark as finished'}</button>}
          {isAdmin && !isMember && <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc(db, 'circles', circle.id)).then(() => navigate('/circles'))}>Remove</button>}
        </div>
        {blocked && !isMember && <p className="tiny muted">You can’t join because you blocked, or were blocked by, someone in this circle.</p>}
      </section>

      <div className="seg" role="group" aria-label="Circle sections">
        {[['plan', 'Weekly plan'], ...(isMember ? [['chat', 'Chat']] : []), ['people', 'People']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'plan' && <Sessions circle={circle} isMember={isMember} />}
      {tab === 'chat' && isMember && <CircleChat circle={circle} nameOf={nameOf} />}
      {tab === 'people' && (
        <div className="card list">
          {circle.members.map((m) => (
            <div className="list-item" key={m}>
              <Avatar name={nameOf(m)} photo={people[m]?.photo} size={36} />
              <div className="grow min0"><b className="small">{nameOf(m)}{m === user.uid ? ' (you)' : ''}</b><p className="tiny muted">{people[m]?.college || ''}{m === circle.owner ? ' · Started the circle' : ''}</p></div>
              {m !== user.uid && people[m] && !people[m].gone && <button className="btn btn-ghost btn-sm" onClick={() => setReporting(people[m])}><Icon name="flag" size={16} />Report</button>}
            </div>
          ))}
        </div>
      )}

      {reporting && <ReportSheet target={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}
