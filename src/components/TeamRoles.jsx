import { useCallback, useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { useT } from '../i18n';
import Avatar from './Avatar';
import Icon from './Icon';
import { SKILLS } from '../lib/constants';
import { MAX_TEAM, ROLE_HOURS } from '../lib/teams';
import { notifyPush } from '../lib/server';
import TeamBuilder from './TeamBuilder';

/**
 * Team → Roles: post the roles the team still needs, see who applied, accept (sends a team invite) or decline.
 * Applicants join the TEAM and talk in the team chat, so it stays about the work.
 */
export default function TeamRoles({ team }) {
  const { user, profile } = useAuth();
  const { label } = useT();
  const toast = useToast();
  const [roles, setRoles] = useState(null);
  const [apps, setApps] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [r, a] = await Promise.all([
      getDocs(query(collection(db, 'roles'), where('team', '==', team.id), where('minor', '==', Boolean(team.minor)))).catch(() => null),
      getDocs(collection(db, 'teams', team.id, 'applications')).catch(() => null),
    ]);
    setRoles((r?.docs || []).map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.createdAt?.toMillis?.() || 0) - (x.createdAt?.toMillis?.() || 0)));
    setApps((a?.docs || []).map((d) => ({ id: d.id, ...d.data() })));
  }, [team.id, team.minor]);
  useEffect(() => { load(); }, [load]);

  const full = team.members.length >= MAX_TEAM;

  async function post(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (title.length < 3) { toast('Give the role a short name, like “UI designer”.'); return; }
    setBusy('post');
    try {
      await addDoc(collection(db, 'roles'), {
        team: team.id, teamName: team.name, ideaId: team.ideaId || '', title, skill: form.skill, hours: form.hours,
        about: form.about.trim().slice(0, 400), minor: Boolean(team.minor), status: 'open',
        postedBy: user.uid, postedByName: profile.name, college: profile.college || '', area: profile.area || '', createdAt: serverTimestamp(),
      });
      toast('Role posted. Students with this skill will see it.');
      setForm(null); load();
    } catch (err) { console.error(err); toast('Could not post. Check that the latest rules are published.'); }
    setBusy('');
  }

  async function setStatus(r, status) {
    try { await updateDoc(doc(db, 'roles', r.id), { status }); load(); } catch { toast('Could not update. Try again.'); }
  }

  async function remove(r) {
    try { await deleteDoc(doc(db, 'roles', r.id)); toast('Role removed'); load(); } catch { toast('Could not remove. Try again.'); }
  }

  async function accept(a) {
    if (full) { toast(`Teams can have up to ${MAX_TEAM} people.`); return; }
    setBusy(a.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'teams', team.id, 'applications', a.id), { status: 'accepted', decidedAt: serverTimestamp() });
      batch.set(doc(db, 'teamInvites', `${team.id}_${a.uid}`), {
        team: team.id, teamName: team.name, uid: a.uid, from: user.uid, fromName: profile.name, role: a.role, at: serverTimestamp(),
      });
      await batch.commit();
      notifyPush('invite', a.uid, team.id);
      toast(`Invite sent to ${a.name.split(' ')[0]}. They join once they accept.`);
      load();
    } catch (err) { console.error(err); toast('Could not accept. They may already be invited or in a different age group.'); }
    setBusy('');
  }

  async function decline(a) {
    setBusy(a.id);
    try { await updateDoc(doc(db, 'teams', team.id, 'applications', a.id), { status: 'declined', decidedAt: serverTimestamp() }); load(); } catch { toast('Could not update.'); }
    setBusy('');
  }

  if (roles === null) return <div className="card muted">Loading…</div>;

  const openSkills = roles.filter((r) => r.status === 'open').map((r) => r.skill);

  return (
    <div className="stack">
      <TeamBuilder team={team} openRoleSkills={openSkills} />
      <div className="row between">
        <p className="muted small min0">Missing a skill? Post a role. Students who have it can apply, and you choose who joins.</p>
        {!form && <button className="btn btn-primary btn-sm" disabled={full} onClick={() => setForm({ title: '', skill: SKILLS[0], hours: ROLE_HOURS[0], about: '' })}><Icon name="plus" size={16} />Post a role</button>}
      </div>
      {full && <div className="notice info"><Icon name="users" size={18} /><div>Your team is full ({MAX_TEAM} people).</div></div>}

      {form && (
        <form className="card stack" onSubmit={post}>
          <div className="field"><label htmlFor="r_title">Role</label>
            <input className="input" id="r_title" maxLength={50} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. UI designer, Instagram marketer" /></div>
          <div className="grid-2">
            <div className="field"><label htmlFor="r_skill">Main skill</label>
              <select className="select" id="r_skill" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })}>{SKILLS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
            <div className="field"><label htmlFor="r_hours">Time needed</label>
              <select className="select" id="r_hours" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })}>{ROLE_HOURS.map((h) => <option key={h}>{h}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="r_about">What they will do <span className="tag">optional</span></label>
            <textarea className="textarea" id="r_about" maxLength={400} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} placeholder="e.g. Design 5 app screens in Figma in the next 3 weeks" /></div>
          <p className="tiny muted">Don’t share your full plan here. Everyone in your age group can see open roles.</p>
          <div className="row gap-8"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy === 'post'}>Post role</button></div>
        </form>
      )}

      {!roles.length && !form && <div className="card muted small center-text">No roles posted yet.</div>}

      {roles.map((r) => {
        const list = apps.filter((a) => a.role === r.id);
        const waiting = list.filter((a) => a.status === 'pending');
        return (
          <article className="card stack gap-10" key={r.id}>
            <div className="row between">
              <div className="min0"><b>{r.title}</b><p className="tiny muted">{label(r.skill)} · {r.hours}</p></div>
              <span className={`tag ${r.status === 'open' ? 'good' : ''}`}>{r.status === 'open' ? 'Open' : r.status === 'filled' ? 'Filled' : 'Closed'}</span>
            </div>
            {r.about && <p className="small">{r.about}</p>}

            {list.length > 0 && (
              <div className="stack gap-8">
                <span className="eyebrow">Applications ({waiting.length} waiting)</span>
                {list.map((a) => (
                  <div className="stack gap-6 app-row" key={a.id}>
                    <div className="row between">
                      <div className="row gap-10 min0"><Avatar name={a.name} photo={a.photo} size={34} />
                        <div className="min0"><b className="small">{a.name}</b><p className="tiny muted">{a.college} · {(a.skills || []).map(label).join(', ')}</p></div></div>
                      {a.status === 'pending' ? (
                        <div className="row gap-6">
                          <button className="btn btn-secondary btn-sm" disabled={busy === a.id} onClick={() => decline(a)}>Not now</button>
                          <button className="btn btn-primary btn-sm" disabled={busy === a.id || full} onClick={() => accept(a)}>Invite</button>
                        </div>
                      ) : <span className={`tag ${a.status === 'accepted' ? 'good' : ''}`}>{a.status === 'accepted' ? 'Invited' : 'Declined'}</span>}
                    </div>
                    {a.note && <p className="small muted">“{a.note}”</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="row gap-6">
              {r.status === 'open'
                ? <><button className="btn btn-secondary btn-sm" onClick={() => setStatus(r, 'filled')}><Icon name="check" size={16} />Mark filled</button><button className="btn btn-ghost btn-sm" onClick={() => setStatus(r, 'closed')}>Close</button></>
                : <button className="btn btn-secondary btn-sm" onClick={() => setStatus(r, 'open')}>Open again</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}><Icon name="trash" size={16} />Delete</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
