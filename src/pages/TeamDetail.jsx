import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { notifyPush } from '../lib/server';
import TeamRoles from '../components/TeamRoles';
import TeamCheckins from '../components/TeamCheckins';
import TeamShowcase from '../components/TeamShowcase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { checkMessage } from '../lib/guard';
import { aiEnabled, guardRemote } from '../lib/ai';
import { otherMember } from '../lib/ids';
import { AGREEMENT_FIELDS, EXIT_REASONS, MAX_TEAM, TASK_STATUS } from '../lib/teams';

const live = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

/* ---------------- Board ---------------- */
function Board({ team, tasks, nameOf }) {
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');

  async function add(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    try {
      await addDoc(collection(db, 'teams', team.id, 'tasks'), { title: t.slice(0, 120), assignee, status: 'todo', createdBy: user.uid, createdAt: serverTimestamp(), doneAt: null });
      setTitle('');
    } catch { toast('Could not add the task.'); }
  }
  const move = (task, status) => updateDoc(doc(db, 'teams', team.id, 'tasks', task.id), { status, doneAt: status === 'done' ? serverTimestamp() : null }).catch(() => toast('Could not update.'));
  const remove = (task) => deleteDoc(doc(db, 'teams', team.id, 'tasks', task.id)).catch(() => toast('Only the person who added it or the team owner can delete it.'));

  const done = tasks.filter((t) => t.status === 'done');
  const contribution = team.members.map((m) => ({ id: m, n: done.filter((t) => t.assignee === m).length })).sort((a, b) => b.n - a.n);

  return (
    <>
      <form className="composer flat" onSubmit={add}>
        <input className="input" aria-label="New task" placeholder="Add a task" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <select className="select auto" aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone</option>{team.members.map((m) => <option key={m} value={m}>{nameOf(m)}</option>)}
        </select>
        <button className="btn btn-primary" type="submit" aria-label="Add task" disabled={!title.trim()}><Icon name="plus" size={18} /></button>
      </form>
      <div className="board">
        {TASK_STATUS.map((col) => {
          const list = tasks.filter((t) => t.status === col.id);
          return (
            <section className="board-col" key={col.id}>
              <div className="row between"><span className="eyebrow">{col.label}</span><span className="tiny muted mono">{list.length}</span></div>
              {list.map((t) => (
                <div className="task" key={t.id}>
                  <p className={`small ${t.status === 'done' ? 'strike' : ''}`}>{t.title}</p>
                  <div className="row between">
                    <span className="tiny muted">{t.assignee ? nameOf(t.assignee) : 'Anyone'}</span>
                    <div className="row gap-4">
                      {col.id !== 'todo' && <button className="btn btn-ghost btn-xs" onClick={() => move(t, col.id === 'done' ? 'doing' : 'todo')} aria-label="Move back">←</button>}
                      {col.id !== 'done' && <button className="btn btn-ghost btn-xs" onClick={() => move(t, col.id === 'todo' ? 'doing' : 'done')} aria-label="Move forward">→</button>}
                      {(t.createdBy === user.uid || team.owner === user.uid) && <button className="btn btn-ghost btn-xs" onClick={() => remove(t)} aria-label="Delete task"><Icon name="trash" size={14} /></button>}
                    </div>
                  </div>
                </div>
              ))}
              {!list.length && <p className="tiny muted">Nothing here</p>}
            </section>
          );
        })}
      </div>
      <div className="card stack gap-8">
        <h3>Contribution</h3>
        {contribution.map((c) => (
          <div className="bar-row wide" key={c.id}><span>{nameOf(c.id)}</span><div className="bar"><span style={{ width: `${done.length ? (c.n / done.length) * 100 : 0}%` }} /></div><span className="mono">{c.n}</span></div>
        ))}
        <p className="tiny muted">Tasks marked done, by the person they were assigned to. A fair record if anyone asks who did what.</p>
      </div>
    </>
  );
}

/* ---------------- Team chat ---------------- */
function TeamChat({ team, nameOf }) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState(null);
  const [sending, setSending] = useState(false);
  const end = useRef(null);
  const active = (profile.status || 'active') === 'active';

  useEffect(() => onSnapshot(query(collection(db, 'teams', team.id, 'messages'), orderBy('at'), limitToLast(200)),
    (s) => setMessages(live(s)), () => setMessages([])), [team.id]);
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
    // In a team chat, contact sharing is fine once everyone has agreed; abuse and money requests never are.
    if (g.level === 'block' && !(g.kind === 'Contact sharing' && team.status === 'active')) {
      setNote({ tone: 'bad', text: `Not sent · ${g.kind}. ${g.msg}` });
      addDoc(collection(db, 'guardEvents'), { by: user.uid, kind: g.kind, chatId: `team:${team.id}`, at: serverTimestamp() }).catch(() => {});
      setSending(false);
      return;
    }
    try {
      await addDoc(collection(db, 'teams', team.id, 'messages'), { from: user.uid, text: body, at: serverTimestamp() });
      setText('');
      setNote(g.level === 'warn' ? { tone: 'warn', text: `${g.kind}. ${g.msg}` } : null);
    } catch { setNote({ tone: 'bad', text: 'Could not send. You may be offline.' }); }
    setSending(false);
  }

  return (
    <>
      <div className="thread">
        <p className="msg sys">Team chat for {team.name}. AI Guard is on.</p>
        {(messages || []).map((m) => (
          <div key={m.id} className={`msg ${m.from === user.uid ? 'me' : 'them'}`}>
            {m.from !== user.uid && <span className="msg-name">{nameOf(m.from)}</span>}{m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      {note && <div className={`notice ${note.tone}`}><Icon name="shield" size={18} /><div>{note.text}</div></div>}
      <form className="composer" onSubmit={send}>
        <input className="input" aria-label="Message" placeholder={active ? 'Message the team' : 'Messaging is turned off for your account'} value={text} maxLength={1000} disabled={!active} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || sending || !active}><Icon name="send" size={18} /></button>
      </form>
    </>
  );
}

/* ---------------- Agreement ---------------- */
function Agreement({ team, nameOf }) {
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState(team.agreement || {});
  const [editing, setEditing] = useState(!Object.keys(team.agreement || {}).length);
  useEffect(() => { if (!editing) setDraft(team.agreement || {}); }, [team.agreement, editing]);

  const agreed = team.agreedBy || [];
  const everyone = team.members.every((m) => agreed.includes(m));

  async function save() {
    const clean = Object.fromEntries(AGREEMENT_FIELDS.map((f) => [f.id, String(draft[f.id] || '').trim().slice(0, 400)]));
    try {
      await updateDoc(doc(db, 'teams', team.id), { agreement: clean, agreedBy: [] }); // any change needs everyone to agree again
      setEditing(false);
      toast('Agreement saved. Everyone needs to agree again.');
    } catch { toast('Could not save.'); }
  }
  async function agree() {
    try { await updateDoc(doc(db, 'teams', team.id), { agreedBy: [...new Set([...agreed, user.uid])] }); toast('You agreed'); } catch { toast('Could not save.'); }
  }

  return (
    <div className="card stack">
      <div className="row between"><h3>Team agreement</h3>{!editing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>}</div>
      <p className="muted small">Most early teams break up over unclear roles and money, not the idea. Write it down now, while everyone is friends.</p>
      {AGREEMENT_FIELDS.map((f) => (
        <div className="field" key={f.id}>
          <label htmlFor={`ag_${f.id}`}>{f.label}</label>
          {editing ? (
            <textarea className="textarea short" id={`ag_${f.id}`} maxLength={400} placeholder={f.hint} value={draft[f.id] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value }))} />
          ) : <p className="prewrap small">{team.agreement?.[f.id] || <span className="muted">Not written yet</span>}</p>}
        </div>
      ))}
      {editing ? (
        <div className="row gap-8"><button className="btn btn-primary" onClick={save}>Save agreement</button>
          {Object.keys(team.agreement || {}).length > 0 && <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>}</div>
      ) : (
        <>
          <div className="stack gap-6">
            {team.members.map((m) => <div className="row gap-8 small" key={m}>{agreed.includes(m) ? <span className="ok"><Icon name="check" size={16} /></span> : <span className="muted">○</span>}{nameOf(m)}</div>)}
          </div>
          {everyone ? <div className="notice info"><Icon name="check" size={18} /><div>Everyone agreed. This is your team’s record.</div></div>
            : !agreed.includes(user.uid) && <button className="btn btn-primary self-start" onClick={agree}>I agree</button>}
        </>
      )}
    </div>
  );
}

/* ---------------- Members ---------------- */
function Members({ team, tasks, nameOf }) {
  const { user, profile } = useAuth();
  const { chats, people } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [reason, setReason] = useState(EXIT_REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canInvite = team.members.length < MAX_TEAM;
  const invitable = (chats || []).map((c) => otherMember(c.members, user.uid)).filter((id) => !team.members.includes(id)).map((id) => people[id]).filter((p) => p && !p.gone);

  async function invite(p) {
    try {
      await writeBatch(db).set(doc(db, 'teamInvites', `${team.id}_${p.id}`), { team: team.id, teamName: team.name, uid: p.id, from: user.uid, fromName: profile.name, at: serverTimestamp() }).commit();
      notifyPush('invite', p.id, team.id);
      toast(`Invite sent to ${p.name}`);
    } catch { toast('Could not invite. They may be in a different age group.'); }
  }

  async function leave() {
    setBusy(true);
    try {
      const rest = team.members.filter((m) => m !== user.uid);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'teams', team.id, 'exits')), { uid: user.uid, name: profile.name, reason, note: note.trim().slice(0, 300), at: serverTimestamp() });
      batch.update(doc(db, 'teams', team.id), {
        members: rest,
        owner: team.owner === user.uid ? (rest[0] || user.uid) : team.owner,
        agreedBy: (team.agreedBy || []).filter((m) => m !== user.uid),
        status: rest.length ? team.status : 'closed',
      });
      await batch.commit();
      toast('You left the team. Thanks for being honest about it.');
      navigate('/teams', { replace: true });
    } catch (e) { console.error(e); toast('Could not leave. Try again.'); setBusy(false); }
  }

  const doneBy = (m) => tasks.filter((t) => t.status === 'done' && t.assignee === m).length;

  return (
    <>
      <div className="card stack gap-10">
        <h3>Members</h3>
        {team.members.map((m) => (
          <div className="row between" key={m}>
            <div className="row gap-10"><Avatar name={nameOf(m)} photo={people[m]?.photo} size={32} /><div><b className="small">{nameOf(m)}{m === user.uid ? ' (you)' : ''}</b><p className="tiny muted">{m === team.owner ? 'Owner · ' : ''}{doneBy(m)} tasks done</p></div></div>
          </div>
        ))}
      </div>
      {canInvite && invitable.length > 0 && (
        <div className="card stack gap-10">
          <h3>Invite more</h3>
          {invitable.map((p) => <div className="row between" key={p.id}><span className="small">{p.name}</span><button className="btn btn-secondary btn-sm" onClick={() => invite(p)}>Invite</button></div>)}
        </div>
      )}
      {!leaving ? (
        <button className="btn btn-secondary self-start" onClick={() => setLeaving(true)}>Leave team</button>
      ) : (
        <div className="card stack">
          <h3>Leave {team.name}</h3>
          <p className="muted small">Leaving is fine. Telling the team why helps them more than going silent.</p>
          <div className="field"><label htmlFor="ex_reason">Reason</label>
            <select className="select" id="ex_reason" value={reason} onChange={(e) => setReason(e.target.value)}>{EXIT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="field"><label htmlFor="ex_note">A note for the team (optional)</label>
            <textarea className="textarea short" id="ex_note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="row gap-8"><button className="btn btn-secondary" onClick={() => setLeaving(false)}>Stay</button><button className="btn btn-danger" onClick={leave} disabled={busy}>Leave team</button></div>
        </div>
      )}
    </>
  );
}

/* ---------------- Page ---------------- */
export default function TeamDetail() {
  const { teamId } = useParams();
  const { teams, people, needPeople } = useSocial();
  const toast = useToast();
  const [tab, setTab] = useState('board');
  const [tasks, setTasks] = useState([]);
  const team = teams?.find((t) => t.id === teamId);

  useEffect(() => { if (team) needPeople(team.members); }, [team, needPeople]);
  useEffect(() => {
    if (!team) return undefined;
    return onSnapshot(collection(db, 'teams', teamId, 'tasks'), (s) => setTasks(live(s).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))), () => setTasks([]));
  }, [teamId, Boolean(team)]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = useMemo(() => (id) => people[id]?.name || '…', [people]);

  if (teams === null) return <div className="card muted">Loading…</div>;
  if (!team) return <div className="card stack center-text"><b>This team isn’t available</b><p className="muted small">You may have left it.</p><Link className="btn btn-primary btn-sm" to="/teams">Back to teams</Link></div>;

  const trialDone = async () => {
    try { await updateDoc(doc(db, 'teams', team.id), { status: 'active' }); toast('You’re now an official team 🎉'); } catch { toast('Could not update.'); }
  };

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/teams"><Icon name="back" size={18} />Teams</Link>
      <header className="stack gap-6">
        <div className="row between"><h2>{team.name}</h2><span className={`tag ${team.status === 'active' ? 'good' : 'gold'}`}>{team.status === 'active' ? 'Official team' : 'Trial'}</span></div>
        {team.ideaId && <Link className="small" to={`/ideas/${team.ideaId}`}>Open the idea →</Link>}
      </header>

      {team.status === 'trial' && (
        <div className="notice warn"><Icon name="clock" size={18} />
          <div className="stack gap-8"><div><b>Trial task:</b> {team.challenge?.title} · finish by {team.challenge?.due}</div>
            <div className="row gap-8"><button className="btn btn-primary btn-sm" onClick={trialDone}>We did it, make the team official</button><span className="tiny muted">Not a fit? Leave from the Members tab, no hard feelings.</span></div></div>
        </div>
      )}

      <div className="seg" role="group" aria-label="Team sections">
        {[['board', 'Board'], ['checkins', 'Check-ins'], ['chat', 'Chat'], ['roles', 'Roles'], ['agreement', 'Agreement'], ['showcase', 'Showcase'], ['members', 'Members']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'board' && <Board team={team} tasks={tasks} nameOf={nameOf} />}
      {tab === 'chat' && <TeamChat team={team} nameOf={nameOf} />}
      {tab === 'agreement' && <Agreement team={team} nameOf={nameOf} />}
      {tab === 'members' && <Members team={team} tasks={tasks} nameOf={nameOf} />}
      {tab === 'checkins' && <TeamCheckins team={team} tasks={tasks} nameOf={nameOf} />}
      {tab === 'roles' && <TeamRoles team={team} />}
      {tab === 'showcase' && <TeamShowcase team={team} nameOf={nameOf} />}
    </>
  );
}
