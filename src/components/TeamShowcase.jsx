import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from './Toast';
import Icon from './Icon';

const urlOk = (u) => !u || /^https:\/\/\S{3,290}$/.test(u);

/**
 * Team → Showcase: an official team publishes what it built.
 * Adults' showcases get a public link (for resumes); Safe Mode showcases stay inside BuildMates.
 */
export default function TeamShowcase({ team, nameOf }) {
  const toast = useToast();
  const [sc, setSc] = useState(undefined);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'showcase', team.id))
      .then((s) => setSc(s.exists() ? s.data() : null))
      .catch(() => setSc(null));
  }, [team.id]);

  function startEdit() {
    const roles = Object.fromEntries(team.members.map((m) => [m, sc?.members?.[m]?.role || '']));
    setF({
      title: sc?.title || team.name, tagline: sc?.tagline || '', problem: sc?.problem || '', built: sc?.built || '',
      link: sc?.link || '', repo: sc?.repo || '', stack: (sc?.stack || []).join(', '), roles,
    });
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    const link = f.link.trim(); const repo = f.repo.trim();
    if (f.title.trim().length < 2) return setError('Give the project a name.');
    if (f.tagline.trim().length < 10) return setError('Write a one-line description (at least 10 letters).');
    if (f.built.trim().length < 20) return setError('Tell people what you built (at least 20 letters).');
    if (!urlOk(link) || !urlOk(repo)) return setError('Links must start with https://');
    const members = Object.fromEntries(team.members.map((m) => [m, { name: nameOf(m).slice(0, 50), role: (f.roles[m] || '').trim().slice(0, 40) }]));
    const data = {
      team: team.id, teamName: team.name, title: f.title.trim().slice(0, 80), tagline: f.tagline.trim().slice(0, 140),
      problem: f.problem.trim().slice(0, 600), built: f.built.trim().slice(0, 1200), link, repo,
      stack: f.stack.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 30)),
      memberIds: team.members, members, minor: Boolean(team.minor), status: sc?.status || 'live',
      publishedAt: sc?.publishedAt || serverTimestamp(), updatedAt: serverTimestamp(),
    };
    setBusy(true); setError('');
    try {
      await setDoc(doc(db, 'showcase', team.id), data);
      setSc({ ...data, publishedAt: sc?.publishedAt || { toDate: () => new Date() } });
      setF(null);
      toast(sc ? 'Showcase updated' : 'Published! 🎉');
    } catch (err) { console.error(err); setError('Could not publish. Only official teams can publish, and the latest rules must be published.'); }
    setBusy(false);
  }

  async function toggleHidden() {
    const status = sc.status === 'live' ? 'hidden' : 'live';
    try { await updateDoc(doc(db, 'showcase', team.id), { status, updatedAt: serverTimestamp() }); setSc({ ...sc, status }); toast(status === 'live' ? 'Showcase is visible again' : 'Showcase hidden'); } catch { toast('Could not update.'); }
  }

  if (team.status !== 'active') {
    return <div className="notice info"><Icon name="star" size={18} /><div>Finish your trial task first. Once you’re an official team, you can publish what you built here and everyone gets a certificate.</div></div>;
  }
  if (sc === undefined) return <div className="card muted">Loading…</div>;

  if (f) {
    return (
      <form className="card stack" onSubmit={save} noValidate>
        <h3>{sc ? 'Edit showcase' : 'Publish your project'}</h3>
        <div className="field"><label htmlFor="s_title">Project name</label><input className="input" id="s_title" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="s_tag">One line about it</label><input className="input" id="s_tag" maxLength={140} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="e.g. An app that helps first-years find seniors’ notes" /></div>
        <div className="field"><label htmlFor="s_prob">The problem <span className="tag">optional</span></label><textarea className="textarea" id="s_prob" maxLength={600} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} /></div>
        <div className="field"><label htmlFor="s_built">What you built</label><textarea className="textarea" id="s_built" maxLength={1200} value={f.built} onChange={(e) => setF({ ...f, built: e.target.value })} placeholder="Features, what works today, what you learned" /></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="s_link">Live link <span className="tag">optional</span></label><input className="input" id="s_link" inputMode="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></div>
          <div className="field"><label htmlFor="s_repo">Code / demo video <span className="tag">optional</span></label><input className="input" id="s_repo" inputMode="url" value={f.repo} onChange={(e) => setF({ ...f, repo: e.target.value })} placeholder="https://github.com/…" /></div>
        </div>
        <div className="field"><label htmlFor="s_stack">Built with</label><input className="input" id="s_stack" value={f.stack} onChange={(e) => setF({ ...f, stack: e.target.value })} placeholder="React, Firebase, Figma" /><span className="hint">Separate with commas</span></div>
        <div className="stack gap-8"><span className="label">Who did what (shown on certificates)</span>
          {team.members.map((m) => (
            <div className="row gap-8" key={m}><span className="small grow min0 ellipsis">{nameOf(m)}</span>
              <input className="input auto" aria-label={`Role of ${nameOf(m)}`} maxLength={40} value={f.roles[m] || ''} onChange={(e) => setF({ ...f, roles: { ...f.roles, [m]: e.target.value } })} placeholder="e.g. Frontend developer" /></div>
          ))}
        </div>
        {team.minor && <p className="tiny muted">Safe Mode: this showcase is visible only to other students in BuildMates, never on the public internet.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row gap-8"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setF(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : sc ? 'Save' : 'Publish'}</button></div>
      </form>
    );
  }

  if (!sc) {
    return (
      <div className="card stack center-text">
        <span className="feature-ic big"><Icon name="rocket" size={26} /></span>
        <b>Show what you built</b>
        <p className="muted small">A project page with your team’s names and roles, plus a certificate and a resume line for every member.</p>
        <button className="btn btn-primary btn-sm self-center" onClick={startEdit}>Create showcase</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <article className="card stack gap-8">
        <div className="row between"><h3>{sc.title}</h3><span className={`tag ${sc.status === 'live' ? 'good' : ''}`}>{sc.status === 'live' ? 'Published' : 'Hidden'}</span></div>
        <p className="muted">{sc.tagline}</p>
        <div className="row gap-8">
          <Link className="btn btn-secondary btn-sm" to={`/p/${team.id}`}><Icon name="eye" size={16} />View page</Link>
          <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={toggleHidden}>{sc.status === 'live' ? 'Hide' : 'Show again'}</button>
        </div>
      </article>
      <div className="card stack gap-8">
        <h3>Certificates</h3>
        <p className="muted small">Each member gets their own certificate page to download as PDF.</p>
        {team.members.map((m) => (
          <div className="row between" key={m}><span className="small">{sc.members?.[m]?.name || nameOf(m)}{sc.members?.[m]?.role ? ` · ${sc.members[m].role}` : ''}</span>
            <Link className="btn btn-ghost btn-sm" to={`/certificate/${team.id}/${m}`}><Icon name="download" size={16} />Certificate</Link></div>
        ))}
      </div>
    </div>
  );
}
