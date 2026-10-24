import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import OfferSheet from '../components/OfferSheet';
import OffersList from '../components/OffersList';
import ReportSheet from '../components/ReportSheet';
import { checkLinkRemote } from '../lib/ai';
import { scoreMatch } from '../lib/matching';
import { growthPlan, NEEDS, needLabel, STAGES, valuationGuide } from '../lib/launchpad';
import { safeUrl } from '../lib/safeUrl';

const docs = (s) => (s ? s.docs.map((d) => ({ id: d.id, ...d.data() })) : []);

export default function ProductDetail() {
  const { productId } = useParams();
  const { user, profile } = useAuth();
  const { relation, sendRequest, chatWith, blockedIds } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [helps, setHelps] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [offers, setOffers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [myHelp, setMyHelp] = useState(null);
  const [myFb, setMyFb] = useState(null);
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = p?.owner === user.uid;
  const path = `products/${productId}`;

  const load = useCallback(async () => {
    const snap = await getDoc(doc(db, 'products', productId)).catch(() => null);
    if (!snap?.exists()) { setMissing(true); return; }
    const data = { id: snap.id, ...snap.data() };
    setP(data);
    if (data.owner === user.uid) {
      const [h, f, o, people] = await Promise.all([
        getDocs(collection(db, path, 'help')).catch(() => null),
        getDocs(collection(db, path, 'feedback')).catch(() => null),
        getDocs(collection(db, path, 'offers')).catch(() => null),
        getDocs(query(collection(db, 'profiles'), where('minor', '==', Boolean(profile.minor)), limit(300))).catch(() => null),
      ]);
      setHelps(docs(h)); setFeedback(docs(f)); setOffers(docs(o));
      const wanted = new Set(NEEDS.filter((n) => data.needs?.includes(n.id)).flatMap((n) => n.skills));
      setHelpers(docs(people)
        .filter((x) => x.id !== user.uid && (x.status || 'active') === 'active' && Array.isArray(x.b5) && (!wanted.size || (x.skills || []).some((s) => wanted.has(s))))
        .map((x) => ({ x, s: scoreMatch(profile, x) })).sort((a, b) => b.s.total - a.s.total).slice(0, 5));
    } else {
      const [h, f] = await Promise.all([
        getDoc(doc(db, path, 'help', user.uid)).catch(() => null),
        getDoc(doc(db, path, 'feedback', user.uid)).catch(() => null),
      ]);
      setMyHelp(h?.exists() ? h.data() : null);
      setMyFb(f?.exists() ? f.data() : null);
    }
  }, [productId, path, user.uid, profile]);

  useEffect(() => { load(); }, [load]);

  const plan = useMemo(() => (p ? growthPlan(p) : []), [p]);
  if (missing) return <div className="card stack center-text"><b>This product isn’t available</b><Link className="btn btn-primary btn-sm" to="/launchpad">Back to Launchpad</Link></div>;
  if (!p) return <div className="card muted">Loading…</div>;

  const first = (p.ownerName || '').split(' ')[0];
  const avg = feedback.length ? feedback.reduce((a, f) => a + f.score, 0) / feedback.length : null;

  async function connect(id) {
    const r = relation(id);
    if (r === 'connected') { navigate(`/chats/${chatWith[id].id}`); return; }
    try { const chatId = await sendRequest(id); if (chatId) navigate(`/chats/${chatId}`); else toast('Request sent. The chat opens when they accept.'); } catch { toast('Could not send the request.'); }
  }

  async function recheck() {
    setBusy(true);
    const r = await checkLinkRemote(p.url);
    if (!r) { toast('Could not check right now (AI server is off).'); setBusy(false); return; }
    try { await updateDoc(doc(db, 'products', p.id), { linkOk: r.ok === true }); setP({ ...p, linkOk: r.ok === true }); toast(r.ok ? 'Link works ✓' : 'The link did not open'); } catch { toast('Could not save.'); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try { await deleteDoc(doc(db, 'products', p.id)); toast('Removed from Launchpad'); navigate('/launchpad', { replace: true }); } catch { toast('Could not remove.'); setBusy(false); }
  }

  return (
    <>
      <div className="row between">
        <Link className="btn btn-ghost btn-sm flush" to="/launchpad"><Icon name="back" size={18} />Launchpad</Link>
        {!isOwner && <button className="btn btn-secondary btn-sm" onClick={() => setSheet('report')}><Icon name="flag" size={16} />Report</button>}
      </div>

      <article className="card stack">
        <div className="row gap-6">
          <span className="tag">{STAGES.find((s) => s.id === p.stage)?.label}</span><span className="tag">{p.tag}</span>
          {p.linkOk && <span className="tag good"><Icon name="check" size={12} />Live link</span>}
          {p.users > 0 && <span className="tag">{p.users} users</span>}
        </div>
        <h2>{p.name}</h2>
        <p className="lead">{p.what}</p>
        <a className="btn btn-secondary self-start" href={safeUrl(p.url) || undefined} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={16} />Open {p.name}</a>
        <div className="row gap-6">{(p.needs || []).map((n) => <span className="tag brand" key={n}>Needs: {needLabel(n)}</span>)}</div>
        <div className="row gap-10"><Avatar name={p.ownerName} size={36} /><div><b className="small">{p.ownerName}</b><p className="tiny muted">{p.ownerCollege}</p></div></div>
      </article>

      {!isOwner && (
        <div className="row gap-8">
          {myHelp ? <button className="btn btn-secondary" disabled><Icon name="check" size={16} />You offered help</button>
            : <button className="btn btn-primary" onClick={() => setSheet('help')}>I can help</button>}
          <button className="btn btn-secondary" onClick={() => setSheet('feedback')}><Icon name="star" size={16} />{myFb ? 'Edit your feedback' : 'Try it & give feedback'}</button>
          {profile.pro && <button className="btn btn-secondary" onClick={() => setSheet('offer')}><Icon name="briefcase" size={16} />Make an offer</button>}
          <button className="btn btn-ghost" onClick={() => connect(p.owner)}>Connect with {first}</button>
        </div>
      )}

      {isOwner && (
        <>
          <section className="card stack">
            <div className="row between"><h3>Your growth plan</h3><Icon name="rocket" size={18} /></div>
            <p className="muted small">First 100 users, step by step. Based on your stage, area and what you need.</p>
            <ol className="plan">{plan.map((s) => <li key={s.title}><b className="small">{s.title}</b><p className="small muted">{s.text}</p></li>)}</ol>
          </section>

          <section className="card stack">
            <h3>Students who can help</h3>
            <p className="muted small">People whose skills match what you need, best fit first.</p>
            {helpers.length ? helpers.map(({ x, s }) => (
              <div className="row between" key={x.id}>
                <div className="row gap-10 min0"><Avatar name={x.name} photo={x.photo} size={32} /><div className="min0"><b className="small">{x.name}</b><p className="tiny muted">{(x.skills || []).join(', ')} · {s.total}% match</p></div></div>
                {!blockedIds.has(x.id) && <button className="btn btn-secondary btn-sm" onClick={() => connect(x.id)}>{relation(x.id) === 'connected' ? 'Chat' : relation(x.id) === 'sent' ? 'Sent' : 'Connect'}</button>}
              </div>
            )) : <p className="muted small">No one with those skills yet. Check back as more students join.</p>}
          </section>

          <section className="card stack">
            <div className="row between"><h3>People who offered help</h3><span className="mono">{helps.length}</span></div>
            {helps.length ? helps.map((h) => (
              <div className="row between" key={h.id}>
                <div className="min0"><b className="small">{h.name}</b><p className="tiny muted">{needLabel(h.need)}{h.note ? ` · ${h.note}` : ''}</p></div>
                <button className="btn btn-secondary btn-sm" onClick={() => connect(h.id)}>{relation(h.id) === 'connected' ? 'Chat' : 'Connect'}</button>
              </div>
            )) : <p className="muted small">Nobody yet.</p>}
          </section>

          <section className="card stack">
            <div className="row between"><h3>Tester feedback</h3><span className="mono">{avg ? `${avg.toFixed(1)} ★ · ${feedback.length}` : '0'}</span></div>
            {feedback.length ? feedback.map((f) => <p className="small excerpt" key={f.id}>{'★'.repeat(f.score)} {f.comment ? `“${f.comment}”` : ''}</p>) : <p className="muted small">No feedback yet. Share your Launchpad page with classmates.</p>}
          </section>

          <OffersList offers={offers} guide={valuationGuide(p)} />

          <div className="row gap-8">
            <button className="btn btn-secondary" onClick={recheck} disabled={busy}><Icon name="link" size={16} />Check link again</button>
            <button className="btn btn-danger" onClick={remove} disabled={busy}><Icon name="trash" size={16} />Remove</button>
          </div>
        </>
      )}

      {sheet === 'help' && <HelpSheet path={path} needs={p.needs || []} onDone={(h) => { setMyHelp(h); setSheet(''); }} onClose={() => setSheet('')} />}
      {sheet === 'feedback' && <FeedbackSheetP path={path} current={myFb} onDone={(f) => { setMyFb(f); setSheet(''); }} onClose={() => setSheet('')} />}
      {sheet === 'offer' && <OfferSheet parent={path} title={p.name} onClose={() => setSheet('')} />}
      {sheet === 'report' && <ReportSheet target={{ id: p.owner, name: p.ownerName }} excerpt={[p.what]} onClose={() => setSheet('')} />}
    </>
  );
}

function HelpSheet({ path, needs, onDone, onClose }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [need, setNeed] = useState(needs[0] || 'testers');
  const [note, setNote] = useState('');
  async function save() {
    const data = { name: profile.name, college: profile.college, need, note: note.trim().slice(0, 300), at: serverTimestamp() };
    try { await setDoc(doc(db, path, 'help', user.uid), data); toast('They’ll see your offer to help'); onDone(data); } catch { toast('Could not save. Try again.'); }
  }
  return (
    <Sheet title="Offer your help" onClose={onClose}>
      <div className="field"><label htmlFor="h_need">How can you help?</label>
        <select className="select" id="h_need" value={need} onChange={(e) => setNeed(e.target.value)}>{needs.map((n) => <option key={n} value={n}>{needLabel(n)}</option>)}</select></div>
      <div className="field"><label htmlFor="h_note">A short note</label>
        <textarea className="textarea short" id="h_note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I run our college’s Instagram page and can help with reels" /></div>
      <button className="btn btn-primary" onClick={save}>Send</button>
    </Sheet>
  );
}

function FeedbackSheetP({ path, current, onDone, onClose }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [score, setScore] = useState(current?.score || 0);
  const [comment, setComment] = useState(current?.comment || '');
  async function save() {
    if (!score) { toast('Pick 1 to 5 stars'); return; }
    const data = { name: profile.name, score, comment: comment.trim().slice(0, 500), at: serverTimestamp() };
    try { await setDoc(doc(db, path, 'feedback', user.uid), data); toast('Thanks for testing!'); onDone(data); } catch { toast('Could not save. Try again.'); }
  }
  return (
    <Sheet title="Your honest feedback" onClose={onClose}>
      <div className="stars big" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={score === n} className={n <= score ? 'on' : ''} onClick={() => setScore(n)} aria-label={`${n} stars`}><Icon name="star" size={26} /></button>)}
      </div>
      <div className="field"><label htmlFor="f_c">What worked, what didn’t?</label>
        <textarea className="textarea" id="f_c" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      <button className="btn btn-primary" onClick={save}>Send feedback</button>
    </Sheet>
  );
}
