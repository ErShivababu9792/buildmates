import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import { INTERESTS } from '../lib/constants';
import { checkLinkRemote } from '../lib/ai';
import { NEEDS, STAGES } from '../lib/launchpad';

export default function ProductNew() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', url: 'https://', what: '', tag: INTERESTS[0], stage: 'prototype', users: '', needs: [] });
  const [link, setLink] = useState(null); // null | 'checking' | {ok, reason}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleNeed = (id) => setF((x) => ({ ...x, needs: x.needs.includes(id) ? x.needs.filter((n) => n !== id) : [...x.needs, id] }));

  async function check() {
    if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(f.url.trim())) { setLink({ ok: false, reason: 'Enter a full link starting with https://' }); return null; }
    setLink('checking');
    const r = await checkLinkRemote(f.url.trim());
    const result = r || { ok: null, reason: 'Could not check right now (AI server is off). You can still list it.' };
    setLink(result);
    return result;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const name = f.name.trim(); const what = f.what.trim();
    if (name.length < 2) { setError('Enter your product’s name.'); return; }
    if (what.length < 10) { setError('Describe what it does in one or two lines.'); return; }
    if (!f.needs.length) { setError('Pick at least one thing you need help with.'); return; }
    if (!/^https:\/\/\S+\.\S+/i.test(f.url.trim())) { setError('Add a working https:// link to your product.'); return; }
    setBusy(true);
    try {
      const result = link && link !== 'checking' ? link : await check();
      const ref = doc(collection(db, 'products'));
      await setDoc(ref, {
        owner: user.uid, ownerName: profile.name, ownerCollege: profile.college, minor: Boolean(profile.minor),
        name, url: f.url.trim().slice(0, 200), what: what.slice(0, 300), tag: f.tag, stage: f.stage,
        users: Math.max(0, Math.min(1000000, parseInt(f.users, 10) || 0)), needs: f.needs,
        linkOk: result?.ok === true, status: 'live', createdAt: serverTimestamp(),
      });
      toast('Listed on Launchpad');
      navigate(`/launchpad/${ref.id}`, { replace: true });
    } catch (err) {
      console.error(err);
      setError('Could not list your product. Check your connection and that the latest rules are published.');
    }
    setBusy(false);
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/launchpad"><Icon name="back" size={18} />Launchpad</Link>
      <header className="stack gap-4"><h2>List your product</h2><p className="muted small">Already built and deployed something? Tell people what it is and what help you need.</p></header>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="p_name">Product name</label>
          <input className="input" id="p_name" maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. NotesHub" /></div>
        <div className="field"><label htmlFor="p_url">Live link</label>
          <div className="row gap-8">
            <input className="input grow" id="p_url" type="url" maxLength={200} value={f.url} onChange={(e) => { set('url', e.target.value); setLink(null); }} placeholder="https://your-app.vercel.app" />
            <button type="button" className="btn btn-secondary" onClick={check} disabled={link === 'checking'}><Icon name="link" size={16} />{link === 'checking' ? 'Checking…' : 'Check'}</button>
          </div>
          {link && link !== 'checking' && (
            <span className={link.ok ? 'hint ok' : 'hint'}>{link.ok ? '✓ The link opens. You’ll get a “Live link” badge.' : link.reason || 'The link didn’t open. Check it and try again.'}</span>
          )}</div>
        <div className="field"><label htmlFor="p_what">What it does</label>
          <textarea className="textarea short" id="p_what" maxLength={300} value={f.what} onChange={(e) => set('what', e.target.value)} placeholder="e.g. Students upload and find semester notes by subject. 40 people use it in our college." /></div>
        <div className="row gap-10">
          <div className="field grow"><label htmlFor="p_tag">Area</label>
            <select className="select" id="p_tag" value={f.tag} onChange={(e) => set('tag', e.target.value)}>{INTERESTS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field grow"><label htmlFor="p_users">Users so far</label>
            <input className="input" id="p_users" inputMode="numeric" value={f.users} onChange={(e) => set('users', e.target.value.replace(/\D/g, ''))} placeholder="0" /></div>
        </div>
        <div className="field"><span className="label">Stage</span>
          <div className="stack gap-8">{STAGES.map((s) => (
            <button type="button" key={s.id} className={`choice ${f.stage === s.id ? 'on' : ''}`} aria-pressed={f.stage === s.id} onClick={() => set('stage', s.id)}><b>{s.label}</b><span className="muted small">{s.text}</span></button>
          ))}</div></div>
        <div className="field"><span className="label">What do you need?</span>
          <div className="stack gap-8">{NEEDS.map((n) => (
            <label className="check" key={n.id}><input type="checkbox" checked={f.needs.includes(n.id)} onChange={() => toggleNeed(n.id)} /><span><b>{n.label}</b> · {n.text}</span></label>
          ))}</div></div>
        <div className="notice info"><Icon name="lock" size={18} /><div>Never share passwords or admin access here. If someone takes over, transfer accounts yourself, step by step, after you’ve agreed in writing.</div></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Listing…' : 'List on Launchpad'}</button>
      </form>
    </>
  );
}
