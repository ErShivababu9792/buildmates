import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { SKILLS } from '../lib/constants';
import { formatWhen } from '../lib/ideas';

/** Open roles: teams that need a skill. You apply to a TEAM, and if they accept you get a team invite. */
export default function Roles() {
  const { user, profile } = useAuth();
  const { teams, blockedIds } = useSocial();
  const { label } = useT();
  const toast = useToast();
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState('');
  const [skill, setSkill] = useState('mine');
  const [open, setOpen] = useState(null); // { role, app }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = (profile.status || 'active') === 'active';

  useEffect(() => {
    getDocs(query(collection(db, 'roles'), where('minor', '==', Boolean(profile.minor)), where('status', '==', 'open')))
      .then((s) => setRoles(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => { console.error(e); setError('Could not load roles. Check your connection and that the latest security rules are published.'); });
  }, [profile.minor]);

  const myTeams = useMemo(() => new Set((teams || []).map((t) => t.id)), [teams]);
  const mySkills = profile.skills || [];

  const list = useMemo(() => (roles || [])
    .filter((r) => !myTeams.has(r.team) && !blockedIds.has(r.postedBy))
    .filter((r) => skill === 'all' || (skill === 'mine' ? mySkills.includes(r.skill) : r.skill === skill))
    .sort((a, b) => {
      const ca = a.college === profile.college ? 1 : 0; const cb = b.college === profile.college ? 1 : 0;
      if (ca !== cb) return cb - ca; // your college first
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    }), [roles, myTeams, blockedIds, skill, mySkills, profile.college]);

  async function show(role) {
    setOpen({ role, app: undefined }); setNote('');
    const snap = await getDoc(doc(db, 'teams', role.team, 'applications', `${role.id}_${user.uid}`)).catch(() => null);
    const app = snap?.exists() ? snap.data() : null;
    setOpen({ role, app });
    if (app?.note) setNote(app.note);
  }

  async function apply() {
    const { role } = open;
    setBusy(true);
    try {
      const data = {
        uid: user.uid, role: role.id, roleTitle: role.title, name: profile.name, college: profile.college || '',
        skills: mySkills.slice(0, 4), photo: profile.minor ? '' : (profile.photo || ''), note: note.trim().slice(0, 300),
        minor: Boolean(profile.minor), status: 'pending', at: serverTimestamp(),
      };
      await setDoc(doc(db, 'teams', role.team, 'applications', `${role.id}_${user.uid}`), data);
      toast(`Applied! If ${role.teamName} picks you, you’ll get a team invite.`);
      setOpen({ role, app: data });
    } catch (e) { console.error(e); toast('Could not apply. The role may be closed now.'); }
    setBusy(false);
  }

  async function withdraw() {
    const { role } = open;
    setBusy(true);
    try { await deleteDoc(doc(db, 'teams', role.team, 'applications', `${role.id}_${user.uid}`)); toast('Application withdrawn'); setOpen({ role, app: null }); } catch { toast('Could not withdraw.'); }
    setBusy(false);
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/teams"><Icon name="back" size={18} />Teams</Link>
      <header className="stack gap-4"><h2>Open roles</h2><p className="muted small">Teams near you that need your skills. You join a team, not just one person.</p></header>

      <div className="row between">
        <select className="select auto" aria-label="Filter by skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="mine">Matching my skills</option><option value="all">All roles</option>
          {SKILLS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <span className="tiny muted">{list.length} role{list.length === 1 ? '' : 's'}</span>
      </div>

      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {roles === null && !error && <div className="card muted">Loading roles…</div>}

      {roles && !list.length && (
        <div className="card stack center-text">
          <span className="feature-ic big"><Icon name="briefcase" size={26} /></span>
          <b>{skill === 'mine' ? 'No roles for your skills yet' : 'No open roles yet'}</b>
          <p className="muted small">{skill === 'mine' ? 'Try “All roles”, or add more skills to your profile.' : 'When teams post roles, they show up here.'}</p>
          {skill === 'mine' && <button className="btn btn-secondary btn-sm" onClick={() => setSkill('all')}>Show all roles</button>}
        </div>
      )}

      {list.map((r) => (
        <button type="button" className="card idea-card text-left" key={r.id} onClick={() => show(r)}>
          <div className="row between"><span className={`tag ${mySkills.includes(r.skill) ? 'brand' : ''}`}>{label(r.skill)}</span><span className="tiny muted">{formatWhen(r.createdAt)}</span></div>
          <b className="idea-title">{r.title}</b>
          <p className="small muted">Team <b>{r.teamName}</b> · {r.college}{r.area ? ` · ${r.area}` : ''}</p>
          {r.about && <p className="small">{r.about}</p>}
          <p className="tiny muted"><Icon name="clock" size={13} /> {r.hours}</p>
        </button>
      ))}

      {open && (
        <Sheet title={open.role.title} onClose={() => setOpen(null)}>
          <p className="small">Team <b>{open.role.teamName}</b> · posted by {open.role.postedByName}</p>
          <p className="small muted">{label(open.role.skill)} · {open.role.hours}</p>
          {open.role.about && <p>{open.role.about}</p>}
          {open.role.ideaId && <Link className="small" to={`/ideas/${open.role.ideaId}`}>See the idea →</Link>}
          {open.app === undefined && <p className="muted small">Loading…</p>}
          {open.app?.status === 'accepted' && <div className="notice info"><Icon name="check" size={18} /><div>You were picked! Open <Link to="/teams">Teams</Link> to accept the invite.</div></div>}
          {open.app?.status === 'declined' && <div className="notice warn"><Icon name="alert" size={18} /><div>The team chose someone else this time. Keep looking, there are more roles.</div></div>}
          {open.app?.status === 'pending' && <div className="notice info"><Icon name="clock" size={18} /><div>Applied. The team will decide soon.</div></div>}
          {open.app !== undefined && open.app?.status !== 'accepted' && open.app?.status !== 'declined' && (
            <>
              <div className="field"><label htmlFor="ap_note">Why you? <span className="tag">optional</span></label>
                <textarea className="textarea" id="ap_note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I’ve designed 2 college fest posters, can give 5 hours a week" /></div>
              <p className="tiny muted">The team sees your name, college, skills and this note. Not your contact details.</p>
              <div className="row gap-8">
                {open.app && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={withdraw}>Withdraw</button>}
                <button className="btn btn-primary btn-sm" disabled={busy || !active} onClick={apply}>{open.app ? 'Update application' : 'Apply to this team'}</button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
