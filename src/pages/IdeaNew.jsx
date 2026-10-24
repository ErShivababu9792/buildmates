import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import { INTERESTS } from '../lib/constants';
import { ideaCheckRemote } from '../lib/ai';
import { LIMITS, localIdeaCheck, proofHash } from '../lib/ideas';

export default function IdeaNew() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const prefill = useLocation().state || {};
  const [f, setF] = useState({ title: '', pitch: prefill.pitch || '', summary: prefill.summary || '', plan: '', tags: [] });
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const active = (profile.status || 'active') === 'active';

  function toggleTag(t) {
    setF((x) => {
      if (x.tags.includes(t)) return { ...x, tags: x.tags.filter((y) => y !== t) };
      if (x.tags.length >= LIMITS.tags) { toast(`Pick up to ${LIMITS.tags}`); return x; }
      return { ...x, tags: [...x.tags, t] };
    });
  }

  async function runCheck() {
    const local = localIdeaCheck(f);
    const remote = await ideaCheckRemote({ title: f.title, pitch: f.pitch, detail: `${f.summary} ${f.plan}` });
    const merged = [...local];
    (remote || []).forEach((r) => { if (!merged.some((m) => m.msg === r.msg)) merged.push(r); });
    setChecks(merged);
    return merged;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const title = f.title.trim(); const pitch = f.pitch.trim();
    if (title.length < 3) { setError('Give your idea a name (at least 3 letters).'); return; }
    if (pitch.length < 10) { setError('Write a one-line pitch (at least 10 letters) so people know the problem you solve.'); return; }
    if (!f.tags.length) { setError('Pick at least one area.'); return; }
    setBusy(true);
    try {
      const results = await runCheck();
      const flagged = results.some((r) => r.level === 'bad');
      const clean = { title, pitch, summary: f.summary.trim(), plan: f.plan.trim() };
      const proof = await proofHash(clean, user.uid);
      const ideaRef = doc(collection(db, 'ideas'));
      const batch = writeBatch(db);
      batch.set(ideaRef, {
        owner: user.uid, ownerName: profile.name, ownerCollege: profile.college, minor: Boolean(profile.minor),
        title, pitch, tags: f.tags, status: flagged ? 'review' : 'live', proof, createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'ideaDetails', ideaRef.id), { owner: user.uid, minor: Boolean(profile.minor), summary: clean.summary });
      batch.set(doc(db, 'ideaPlans', ideaRef.id), { owner: user.uid, plan: clean.plan, team: [] });
      await batch.commit();
      if (flagged) {
        await addDoc(collection(db, 'reports'), {
          by: user.uid, byName: profile.name, target: user.uid, targetName: profile.name,
          reason: 'AI idea check: needs review', note: `Idea: ${title}`, excerpt: [pitch], chatId: '', ideaId: ideaRef.id,
          auto: true, status: 'Open', at: serverTimestamp(),
        }).catch(() => {});
      }
      toast(flagged ? 'Sent for admin review before it goes live' : 'Idea posted and timestamped');
      navigate(`/ideas/${ideaRef.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError('Could not post your idea. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      {!prefill.pitch && <Link className="card row between list-link" to="/ideas/dost"><div className="min0"><b className="small">Not sure how to describe it?</b><p className="tiny muted">Idea Dost asks you 5 questions and writes the pitch for you.</p></div><Icon name="spark" size={20} /></Link>}
      <header className="stack gap-4"><h2>Post an idea</h2><p className="muted small">You decide how much people see. The moment you post, BuildMates records a timestamp and a fingerprint of what you wrote.</p></header>

      <form className="stack" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="i_title">Idea name</label>
          <input className="input" id="i_title" maxLength={LIMITS.title} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Hostel tiffin subscription" /></div>

        <div className="field"><label htmlFor="i_pitch">One-line pitch <span className="tag">Everyone</span></label>
          <input className="input" id="i_pitch" maxLength={LIMITS.pitch} value={f.pitch} onChange={(e) => set('pitch', e.target.value)} placeholder="What problem it solves and for whom, not how" />
          <span className="hint">{f.pitch.length}/{LIMITS.pitch} · Don’t reveal your secret solution here.</span></div>

        <div className="field"><span className="label">Areas (up to {LIMITS.tags})</span>
          <div className="chips">{INTERESTS.map((t) => <button type="button" key={t} className="chip" aria-pressed={f.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>)}</div></div>

        <div className="field"><label htmlFor="i_summary">Summary <span className="tag brand">Connected people</span></label>
          <textarea className="textarea" id="i_summary" maxLength={LIMITS.summary} value={f.summary} onChange={(e) => set('summary', e.target.value)} placeholder="A bit more about the idea and who you need. Only people you’ve connected with can read this." />
          <span className="hint">{f.summary.length}/{LIMITS.summary}</span></div>

        <div className="field"><label htmlFor="i_plan">Full plan <span className="tag gold">Your team only</span></label>
          <textarea className="textarea tall" id="i_plan" maxLength={LIMITS.plan} value={f.plan} onChange={(e) => set('plan', e.target.value)} placeholder="How it works, steps, numbers. Only the team members you add can read this." />
          <span className="hint">{f.plan.length}/{LIMITS.plan}</span></div>

        {checks && (checks.length ? checks.map((c) => (
          <div className={`notice ${c.level === 'bad' ? 'bad' : 'warn'}`} key={c.msg}><Icon name="alert" size={18} /><div>{c.msg}</div></div>
        )) : <div className="notice info"><Icon name="check" size={18} /><div>Looks good. Your public line doesn’t give away how it works.</div></div>)}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="row gap-10">
          <button type="button" className="btn btn-secondary" onClick={runCheck} disabled={busy}><Icon name="spark" size={16} />AI check</button>
          <button type="submit" className="btn btn-primary grow" disabled={busy || !active}>{busy ? 'Posting…' : 'Post idea'}</button>
        </div>
        {!active && <p className="tiny muted">Your account can’t post ideas right now.</p>}
      </form>
    </>
  );
}
