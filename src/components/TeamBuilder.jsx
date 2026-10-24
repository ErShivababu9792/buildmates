import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDocs, limit, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from './Toast';
import { useT } from '../i18n';
import Avatar from './Avatar';
import Icon from './Icon';
import Sheet from './Sheet';
import { BUILDER_WEIGHTS, suggestForTeam } from '../lib/teambuilder';
import { MAX_TEAM } from '../lib/teams';
import { notifyPush } from '../lib/server';

/** AI Team Builder: the 5 students who would complete this team best, with the reasons. */
export default function TeamBuilder({ team, openRoleSkills }) {
  const { user, profile } = useAuth();
  const { people, needPeople, relation, sendRequest, blockedIds } = useSocial();
  const { label } = useT();
  const toast = useToast();
  const [pool, setPool] = useState(null);
  const [why, setWhy] = useState(null);
  const [busy, setBusy] = useState('');
  const [invited, setInvited] = useState(new Set());
  const [open, setOpen] = useState(false);

  useEffect(() => { needPeople(team.members); }, [team.members, needPeople]);

  useEffect(() => {
    if (!open || pool) return;
    getDocs(query(collection(db, 'profiles'), where('minor', '==', Boolean(team.minor)), limit(300)))
      .then((s) => setPool(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setPool([]));
  }, [open, pool, team.minor]);

  const members = team.members.map((m) => (m === user.uid ? { id: m, ...profile } : people[m])).filter(Boolean);
  const result = useMemo(() => {
    if (!pool) return null;
    const exclude = new Set([...team.members, ...blockedIds, ...invited]);
    return suggestForTeam(members, pool, { openRoleSkills, exclude, n: 5 });
  }, [pool, members.length, openRoleSkills.join(','), blockedIds, invited]); // eslint-disable-line react-hooks/exhaustive-deps

  const full = team.members.length >= MAX_TEAM;

  async function connect(p) {
    setBusy(p.id);
    try {
      const chatId = await sendRequest(p.id);
      toast(chatId ? `Connected with ${p.name.split(' ')[0]}. You can invite them now.` : 'Request sent. When they accept, invite them from here.');
    } catch { toast('Could not send the request.'); }
    setBusy('');
  }

  async function invite(p) {
    setBusy(p.id);
    try {
      await writeBatch(db).set(doc(db, 'teamInvites', `${team.id}_${p.id}`), {
        team: team.id, teamName: team.name, uid: p.id, from: user.uid, fromName: profile.name, at: serverTimestamp(),
      }).commit();
      notifyPush('invite', p.id, team.id);
      setInvited((s) => new Set([...s, p.id]));
      toast(`Team invite sent to ${p.name.split(' ')[0]}`);
    } catch { toast('Could not invite. Try again.'); }
    setBusy('');
  }

  function action(p) {
    const r = relation(p.id);
    if (r === 'connected') return <button className="btn btn-primary btn-sm" disabled={busy === p.id || full} onClick={() => invite(p)}>Invite to team</button>;
    if (r === 'sent') return <button className="btn btn-secondary btn-sm" disabled>Request sent</button>;
    if (r === 'incoming') return <Link className="btn btn-secondary btn-sm" to="/chats">Accept their request</Link>;
    return <button className="btn btn-secondary btn-sm" disabled={busy === p.id} onClick={() => connect(p)}>Connect first</button>;
  }

  if (!open) {
    return (
      <div className="card row between builder-cta">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="spark" size={20} /></span>
          <div className="min0"><b className="small">AI Team Builder</b><p className="tiny muted">Find the people who would complete this team: missing skills, same vision, balanced working style.</p></div></div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)} disabled={full}>{full ? 'Team full' : 'Suggest people'}</button>
      </div>
    );
  }

  return (
    <section className="card stack">
      <div className="row between"><div className="row gap-8"><Icon name="spark" size={18} /><h3>AI Team Builder</h3></div><button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Hide</button></div>
      {!result && <p className="muted small">Looking at students in your group…</p>}
      {result && (
        <>
          <div className="stack gap-6">
            <span className="eyebrow">Your team has</span>
            <div className="row gap-6">{[...result.team.skills].map((s) => <span key={s} className="tag">{label(s)}</span>)}</div>
            <span className="eyebrow">{openRoleSkills.length ? 'Your open roles need' : 'Missing skills'}</span>
            <div className="row gap-6">{result.team.missing.length ? result.team.missing.map((s) => <span key={s} className="tag brand">{label(s)}</span>) : <span className="tiny muted">Nothing obvious. Nice mix!</span>}</div>
          </div>

          {!result.list.length && <p className="muted small">No one in your group brings the missing skills yet. Post a role so new students can apply.</p>}
          {result.list.map(({ c, s }, i) => (
            <div className="stack gap-6 app-row" key={c.id}>
              <div className="row between">
                <div className="row gap-10 min0"><Avatar name={c.name} photo={c.photo} size={38} />
                  <div className="min0"><b className="small">{i + 1}. {c.name}</b><p className="tiny muted">{c.college} · {(c.skills || []).map(label).join(', ')}</p></div></div>
                <div className="score"><div className="pct">{s.total}%</div><span className="tiny muted">fit</span></div>
              </div>
              <ul className="reasons">{s.reasons.slice(0, 3).map((r) => <li key={r}><span className="ok"><Icon name="check" size={16} /></span>{r}</li>)}</ul>
              <div className="row between">
                <button className="btn btn-ghost btn-sm" onClick={() => setWhy({ c, s })}>How we scored</button>
                {action(c)}
              </div>
            </div>
          ))}
          <p className="tiny muted">Fit = {BUILDER_WEIGHTS.skills * 100}% missing skills + {BUILDER_WEIGHTS.vision * 100}% vision + {BUILDER_WEIGHTS.style * 100}% working-style balance + {BUILDER_WEIGHTS.distance * 100}% distance. Only students in your age group are suggested.</p>
        </>
      )}

      {why && (
        <Sheet title={`${why.c.name.split(' ')[0]} · ${why.s.total}% team fit`} onClose={() => setWhy(null)}>
          <div className="bars">
            {[['Missing skills', why.s.parts.skills], ['Vision', why.s.parts.vision], ['Style balance', why.s.parts.style, 'gold'], ['Distance', why.s.parts.distance]].map(([l, v, cl]) => (
              <div className="bar-row" key={l}><span>{l}</span><div className={`bar ${cl || ''}`}><span style={{ width: `${Math.round(v * 100)}%` }} /></div><span className="mono">{Math.round(v * 100)}</span></div>
            ))}
          </div>
          <p className="tiny muted">{why.s.visionSource === 'ai' ? 'Vision compared by AI with the average of your team’s visions (meaning, not just words).' : 'Vision compared by shared words and interests (AI vector not ready yet).'} Style balance rewards someone strong where your team is weaker.</p>
        </Sheet>
      )}
    </section>
  );
}
