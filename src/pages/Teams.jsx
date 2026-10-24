import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  arrayUnion, collection, doc, getDocs, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { notifyPush } from '../lib/server';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { otherMember } from '../lib/ids';
import { MAX_TEAM, TRIAL_CHALLENGES } from '../lib/teams';
import { CHALLENGES } from '../lib/challenges';
import { addDoc } from 'firebase/firestore';

function NewTeamSheet({ onClose }) {
  const { user, profile } = useAuth();
  const { chats, people } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [ideaId, setIdeaId] = useState('');
  const [myIdeas, setMyIdeas] = useState([]);
  const [challenge, setChallenge] = useState(TRIAL_CHALLENGES[0]);
  const [due, setDue] = useState(() => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const [invite, setInvite] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'ideas'), where('owner', '==', user.uid)))
      .then((s) => setMyIdeas(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.status === 'live')))
      .catch(() => {});
  }, [user.uid]);

  const connected = (chats || []).map((c) => people[otherMember(c.members, user.uid)]).filter((p) => p && !p.gone);
  const toggle = (id) => setInvite((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length >= MAX_TEAM - 1 ? l : [...l, id]));

  async function create() {
    const n = name.trim();
    if (n.length < 2) { setError('Give your team a name.'); return; }
    if (!invite.length) { setError('Invite at least one person you’re connected with.'); return; }
    setBusy(true); setError('');
    try {
      const ref = doc(collection(db, 'teams'));
      const batch = writeBatch(db);
      batch.set(ref, {
        name: n, ideaId, owner: user.uid, members: [user.uid], minor: Boolean(profile.minor), status: 'trial',
        challenge: { title: challenge, due }, agreement: {}, agreedBy: [], createdAt: serverTimestamp(),
      });
      invite.forEach((uid) => batch.set(doc(db, 'teamInvites', `${ref.id}_${uid}`), {
        team: ref.id, teamName: n, uid, from: user.uid, fromName: profile.name, at: serverTimestamp(),
      }));
      await batch.commit();
      invite.forEach((uid) => notifyPush('invite', uid, ref.id));
      toast('Team created. Invites sent.');
      navigate(`/teams/${ref.id}`);
    } catch (e) {
      console.error(e);
      setError('Could not create the team. Check your connection and that the latest rules are published.');
    }
    setBusy(false);
  }

  return (
    <Sheet title="Start a team" onClose={onClose}>
      <div className="field"><label htmlFor="t_name">Team name</label>
        <input className="input" id="t_name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tiffin Squad" /></div>
      {myIdeas.length > 0 && (
        <div className="field"><label htmlFor="t_idea">For which idea? (optional)</label>
          <select className="select" id="t_idea" value={ideaId} onChange={(e) => setIdeaId(e.target.value)}>
            <option value="">No idea linked</option>{myIdeas.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select></div>
      )}
      <div className="field"><span className="label">Invite people you’re connected with (up to {MAX_TEAM - 1})</span>
        {connected.length ? connected.map((p) => (
          <label className="check" key={p.id}><input type="checkbox" checked={invite.includes(p.id)} onChange={() => toggle(p.id)} /><span>{p.name} <span className="tiny muted">· {p.college}</span></span></label>
        )) : <p className="muted small">Connect with someone in Matches first.</p>}
      </div>
      <div className="notice info"><Icon name="spark" size={18} /><div><b>Start with a trial.</b> Do one small task together first. If it feels right, make the team official.</div></div>
      <div className="field"><label htmlFor="t_ch">Trial task</label>
        <select className="select" id="t_ch" value={challenge} onChange={(e) => setChallenge(e.target.value)}>{TRIAL_CHALLENGES.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="t_due">Finish by</label>
        <input className="input" type="date" id="t_due" value={due} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDue(e.target.value)} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create team and send invites'}</button>
    </Sheet>
  );
}

function ChallengesSection({ teams }) {
  const { user } = useAuth();
  const toast = useToast();
  const [pick, setPick] = useState(null);
  const [teamId, setTeamId] = useState('');

  async function addToTeam() {
    const t = teams.find((x) => x.id === teamId);
    if (!t) return;
    try {
      await addDoc(collection(db, 'teams', t.id, 'tasks'), {
        title: `Challenge: ${pick.title} (${pick.days} days)`, assignee: '', status: 'todo', createdBy: user.uid, createdAt: serverTimestamp(), doneAt: null,
      });
      toast(`Added to ${t.name}'s board`);
      setPick(null);
    } catch { toast('Could not add the challenge.'); }
  }

  return (
    <section className="stack gap-10">
      <span className="eyebrow">This week’s mini-challenges</span>
      <div className="tiles">
        {CHALLENGES.map((c) => (
          <button className="card tile challenge" key={c.id} onClick={() => { setPick(c); setTeamId(teams[0]?.id || ''); }}>
            <b className="small">{c.title}</b><p className="tiny muted">{c.text}</p><span className="tag">{c.days} days</span>
          </button>
        ))}
      </div>
      {pick && (
        <Sheet title={pick.title} onClose={() => setPick(null)}>
          <p>{pick.text}</p>
          {teams.length ? (
            <>
              <div className="field"><label htmlFor="ch_team">Add to which team’s board?</label>
                <select className="select" id="ch_team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <button className="btn btn-primary" onClick={addToTeam}>Add challenge to board</button>
            </>
          ) : <p className="muted small">Start a team first, then add challenges to its board.</p>}
        </Sheet>
      )}
    </section>
  );
}

export default function Teams() {
  const { user } = useAuth();
  const { teams, teamInvites, people } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');

  async function acceptInvite(inv) {
    setBusy(inv.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', inv.team), { members: arrayUnion(user.uid) });
      batch.delete(doc(db, 'teamInvites', inv.id));
      await batch.commit();
      toast(`You joined ${inv.teamName}`);
      navigate(`/teams/${inv.team}`);
    } catch (e) {
      console.error(e);
      toast('Could not join. The team may be full or closed.');
    }
    setBusy('');
  }

  async function declineInvite(inv) {
    setBusy(inv.id);
    try { await writeBatch(db).delete(doc(db, 'teamInvites', inv.id)).commit(); toast('Invite declined'); } catch { toast('Could not update. Try again.'); }
    setBusy('');
  }

  return (
    <>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Teams</h2><p className="muted small">Work together with a trial task, a task board and a clear agreement.</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={16} />Start a team</button>
      </header>

      <Link className="card tile" to="/roles"><span className="feature-ic"><Icon name="briefcase" /></span>
        <div className="grow min0"><b className="small">Open roles</b><p className="tiny muted">Teams near you that need your skills. Apply and join.</p></div><Icon name="back" size={18} className="flip" /></Link>

      {teamInvites.length > 0 && (
        <section className="stack gap-10">
          <span className="eyebrow">Invites</span>
          {teamInvites.map((inv) => (
            <div className="card row between" key={inv.id}>
              <div className="min0"><b>{inv.teamName}</b><p className="muted small">Invited by {inv.fromName || people[inv.from]?.name}</p></div>
              <div className="row gap-8">
                <button className="btn btn-secondary btn-sm" disabled={busy === inv.id} onClick={() => declineInvite(inv)}>Decline</button>
                <button className="btn btn-primary btn-sm" disabled={busy === inv.id} onClick={() => acceptInvite(inv)}>Join team</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="stack gap-10">
        <span className="eyebrow">Your teams</span>
        {teams === null && <div className="card muted">Loading…</div>}
        {teams?.length === 0 && (
          <div className="card stack center-text">
            <b>No teams yet</b>
            <p className="muted small">Connect with people, then start a team and do a small trial task together.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Start a team</button>
          </div>
        )}
        {teams?.map((t) => (
          <Link className="card idea-card" to={`/teams/${t.id}`} key={t.id}>
            <div className="row between"><b className="idea-title">{t.name}</b>
              <span className={`tag ${t.status === 'active' ? 'good' : 'gold'}`}>{t.status === 'active' ? 'Official team' : 'Trial'}</span></div>
            <div className="row gap-6">{t.members.map((m) => <Avatar key={m} name={people[m]?.name || '?'} photo={people[m]?.photo} size={28} />)}<span className="tiny muted">{t.members.length} member{t.members.length > 1 ? 's' : ''}</span></div>
            {t.status === 'trial' && t.challenge?.title && <p className="tiny muted">Trial: {t.challenge.title} · by {t.challenge.due}</p>}
          </Link>
        ))}
      </section>

      <ChallengesSection teams={teams || []} />

      {creating && <NewTeamSheet onClose={() => setCreating(false)} />}
    </>
  );
}
