import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import ReportSheet from '../components/ReportSheet';
import OfferSheet from '../components/OfferSheet';
import OffersList from '../components/OffersList';
import { otherMember } from '../lib/ids';
import { formatWhen, LIMITS } from '../lib/ideas';

const tryGet = (ref) => getDoc(ref).then((s) => (s.exists() ? s.data() : null)).catch(() => undefined); // undefined = not allowed

export default function IdeaDetail() {
  const { ideaId } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const { relation, sendRequest, chatWith, chats, people, needPeople } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const [idea, setIdea] = useState(null);
  const [details, setDetails] = useState(undefined);
  const [plan, setPlan] = useState(undefined);
  const [interested, setInterested] = useState(false);
  const [interestList, setInterestList] = useState([]);
  const [views, setViews] = useState([]);
  const [missing, setMissing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myAccess, setMyAccess] = useState(null);
  const [accessList, setAccessList] = useState([]);
  const [offers, setOffers] = useState([]);
  const [offering, setOffering] = useState(false);

  const isOwner = idea?.owner === user.uid;

  const load = useCallback(async () => {
    const snap = await getDoc(doc(db, 'ideas', ideaId)).catch(() => null);
    if (!snap || !snap.exists()) { setMissing(true); return; }
    const data = { id: snap.id, ...snap.data() };
    setIdea(data);
    setDetails(await tryGet(doc(db, 'ideaDetails', ideaId)));
    setPlan(await tryGet(doc(db, 'ideaPlans', ideaId)));
    if (data.owner === user.uid) {
      const [i, v, a, o] = await Promise.all([
        getDocs(collection(db, 'ideas', ideaId, 'interest')).catch(() => null),
        getDocs(collection(db, 'ideas', ideaId, 'views')).catch(() => null),
        getDocs(collection(db, 'ideas', ideaId, 'access')).catch(() => null),
        getDocs(collection(db, 'ideas', ideaId, 'offers')).catch(() => null),
      ]);
      const list = (x) => (x ? x.docs.map((d) => ({ id: d.id, ...d.data() })) : []);
      setInterestList(list(i)); setViews(list(v)); setAccessList(list(a)); setOffers(list(o));
    } else {
      setInterested(Boolean(await tryGet(doc(db, 'ideas', ideaId, 'interest', user.uid))));
      if (profile.pro) setMyAccess((await tryGet(doc(db, 'ideas', ideaId, 'access', user.uid))) || null);
    }
  }, [ideaId, user.uid, profile.pro]);

  useEffect(() => { load(); }, [load]);

  // Record a view once the summary is visible to someone other than the owner.
  useEffect(() => {
    if (idea && !isOwner && details) {
      setDoc(doc(db, 'ideas', ideaId, 'views', user.uid), { name: profile.name, at: serverTimestamp() }).catch(() => {});
    }
  }, [idea, isOwner, details, ideaId, user.uid, profile.name]);

  useEffect(() => { if (idea && !isOwner) needPeople([idea.owner]); }, [idea, isOwner, needPeople]);

  if (missing) {
    return <div className="card stack center-text"><b>This idea isn’t available</b><p className="muted small">It may have been removed, or it’s not visible to you.</p><Link className="btn btn-primary btn-sm" to="/ideas">Back to ideas</Link></div>;
  }
  if (!idea) return <div className="card muted">Loading idea…</div>;

  const rel = isOwner ? null : relation(idea.owner);
  const firstName = (idea.ownerName || '').split(' ')[0];

  async function markInterested() {
    setBusy(true);
    try {
      await setDoc(doc(db, 'ideas', ideaId, 'interest', user.uid), { name: profile.name, college: profile.college, at: serverTimestamp() });
      setInterested(true);
      toast(`${firstName} will see that you’re interested`);
    } catch { toast('Could not save. Try again.'); }
    setBusy(false);
  }

  async function connect(otherId) {
    setBusy(true);
    try {
      const chatId = await sendRequest(otherId);
      if (chatId) navigate(`/chats/${chatId}`); else toast('Request sent. The chat opens when they accept.');
    } catch { toast('Could not send the request. Try again.'); }
    setBusy(false);
  }

  async function toggleTeam(memberId) {
    const team = plan?.team || [];
    const next = team.includes(memberId) ? team.filter((x) => x !== memberId) : [...team, memberId];
    if (next.length > LIMITS.team) { toast(`A team can have up to ${LIMITS.team} people`); return; }
    try {
      await updateDoc(doc(db, 'ideaPlans', ideaId), { team: next });
      setPlan((p) => ({ ...p, team: next }));
      toast(team.includes(memberId) ? 'Removed from team' : 'Added to team. They can now read the full plan.');
    } catch { toast('Could not update the team. Try again.'); }
  }

  async function removeIdea() {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'ideaPlans', ideaId));
      batch.delete(doc(db, 'ideaDetails', ideaId));
      batch.delete(doc(db, 'ideas', ideaId));
      await batch.commit();
      toast('Idea deleted');
      navigate('/ideas', { replace: true });
    } catch { toast('Could not delete. Try again.'); setBusy(false); }
  }

  async function requestAccess() {
    setBusy(true);
    try {
      const data = { name: profile.name, company: profile.proCompany || '', status: 'requested', ndaAt: null, at: serverTimestamp() };
      await setDoc(doc(db, 'ideas', ideaId, 'access', user.uid), data);
      setMyAccess(data); toast(`Request sent. ${firstName} decides whether to share the summary.`);
    } catch { toast('Could not send the request.'); }
    setBusy(false);
  }

  async function acceptNda() {
    setBusy(true);
    try { await updateDoc(doc(db, 'ideas', ideaId, 'access', user.uid), { ndaAt: serverTimestamp() }); toast('NDA accepted'); await load(); } catch { toast('Could not save.'); }
    setBusy(false);
  }

  async function answerAccess(a, status) {
    try { await updateDoc(doc(db, 'ideas', ideaId, 'access', a.id), { status }); setAccessList((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x))); toast(status === 'approved' ? `${a.name} can read the summary after accepting the NDA` : 'Request declined'); } catch { toast('Could not update.'); }
  }

  const proView = !isOwner && profile.pro && rel !== 'connected';

  const connectedPeople = (chats || []).map((c) => otherMember(c.members, user.uid)).map((id) => people[id]).filter((p) => p && !p.gone);

  return (
    <>
      <div className="row between">
        <Link className="btn btn-ghost btn-sm flush" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
        {!isOwner && <button className="btn btn-secondary btn-sm" onClick={() => setReporting(true)}><Icon name="flag" size={16} />Report</button>}
      </div>

      {idea.status !== 'live' && (
        <div className={`notice ${idea.status === 'review' ? 'warn' : 'bad'}`}><Icon name="alert" size={18} />
          <div>{idea.status === 'review' ? 'This idea is waiting for admin review. Only you and admins can see it.' : 'This idea was not approved and is hidden from others.'}</div></div>
      )}

      <article className="card stack">
        <div className="row gap-6">{(idea.tags || []).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        <h2>{idea.title}</h2>
        <p className="lead">{idea.pitch}</p>
        <div className="row gap-10">
          <Avatar name={idea.ownerName} size={36} />
          <div className="min0"><b className="small">{idea.ownerName}</b><p className="tiny muted">{idea.ownerCollege}</p></div>
        </div>
        <div className="proof">
          <Icon name="lock" size={16} />
          <div className="min0"><p className="small"><b>Timestamp locked:</b> {formatWhen(idea.createdAt)}</p>
            <p className="tiny muted mono ellipsis" title={idea.proof}>Fingerprint {idea.proof?.slice(0, 16)}…</p></div>
        </div>
      </article>

      <section className="card stack">
        <div className="row between"><h3>Summary</h3><span className="tag brand">Connected people</span></div>
        {details ? (
          <div className={proView ? 'watermarked' : ''} data-mark={proView ? `Shared with ${profile.name} under NDA · ${profile.proCompany || ''}` : undefined}>
            <p className="prewrap">{details.summary || <span className="muted">No summary added.</span>}</p>
          </div>
        ) : (
          <div className="locked"><Icon name="lock" size={18} /><div>Connect with {firstName} to read the summary.</div></div>
        )}
      </section>

      <section className="card stack">
        <div className="row between"><h3>Full plan</h3><span className="tag gold">Team only</span></div>
        {plan ? <p className="prewrap">{plan.plan || <span className="muted">No plan added yet.</span>}</p> : (
          <div className="locked"><Icon name="lock" size={18} /><div>Only people {firstName} adds to the team can read the plan.</div></div>
        )}
      </section>

      {!isOwner && (
        <div className="row gap-8">
          {interested ? <button className="btn btn-secondary" disabled><Icon name="check" size={16} />You’re interested</button>
            : <button className="btn btn-secondary" onClick={markInterested} disabled={busy}><Icon name="star" size={16} />I’m interested</button>}
          {rel === 'connected' && <Link className="btn btn-primary" to={`/chats/${chatWith[idea.owner].id}`}><Icon name="chat" size={16} />Open chat</Link>}
          {rel === 'sent' && <button className="btn btn-primary" disabled>Request sent</button>}
          {(rel === 'none' || rel === 'incoming') && <button className="btn btn-primary" onClick={() => connect(idea.owner)} disabled={busy}>Connect with {firstName}</button>}
        </div>
      )}

      {!isOwner && profile.pro && (
        <section className="card stack">
          <div className="row between"><h3>As a professional</h3><span className="tag good"><Icon name="briefcase" size={12} />Pro</span></div>
          {!details && !myAccess && <><p className="muted small">Ask {firstName} to share the summary with you. You’ll need to accept an NDA first.</p><button className="btn btn-primary self-start" disabled={busy} onClick={requestAccess}>Request access</button></>}
          {!details && myAccess?.status === 'requested' && <p className="muted small">Waiting for {firstName} to approve your request.</p>}
          {!details && myAccess?.status === 'declined' && <p className="muted small">{firstName} chose not to share the summary right now.</p>}
          {!details && myAccess?.status === 'approved' && !myAccess.ndaAt && (
            <div className="nda stack gap-8">
              <b className="small">Non-disclosure agreement</b>
              <p className="small">I will keep this idea confidential. I won’t copy, build, share or pitch it, or use it for my company, without {idea.ownerName}’s written permission. I understand BuildMates records when I view it, and breaking this leads to a public ban.</p>
              <button className="btn btn-primary self-start" disabled={busy} onClick={acceptNda}>I agree, show me the summary</button>
            </div>
          )}
          <button className="btn btn-secondary self-start" onClick={() => setOffering(true)}>Make an offer</button>
        </section>
      )}

      {isOwner && (
        <>
          {accessList.length > 0 && (
            <section className="card stack">
              <h3>Professionals asking to read your summary</h3>
              {accessList.map((a) => (
                <div className="row between" key={a.id}>
                  <div className="min0"><b className="small">{a.name}</b><p className="tiny muted">{a.company}{a.ndaAt ? ' · NDA accepted' : ''}</p></div>
                  {a.status === 'requested' ? (
                    <div className="row gap-6"><button className="btn btn-secondary btn-sm" onClick={() => answerAccess(a, 'declined')}>Decline</button><button className="btn btn-primary btn-sm" onClick={() => answerAccess(a, 'approved')}>Allow</button></div>
                  ) : <span className={`tag ${a.status === 'approved' ? 'good' : ''}`}>{a.status === 'approved' ? 'Allowed' : 'Declined'}</span>}
                </div>
              ))}
              <p className="tiny muted">They can only read the summary after accepting an NDA. They never see your full plan.</p>
            </section>
          )}
          {offers.length > 0 && <OffersList offers={offers} />}

          <section className="card stack">
            <div className="row between"><h3>Interested people</h3><span className="mono">{interestList.length}</span></div>
            {interestList.length ? interestList.map((p) => {
              const r = relation(p.id);
              return (
                <div className="row between" key={p.id}>
                  <div className="row gap-10 min0"><Avatar name={p.name} photo={p.photo} size={32} /><div className="min0"><b className="small">{p.name}</b><p className="tiny muted">{p.college}</p></div></div>
                  {r === 'connected' ? <Link className="btn btn-ghost btn-sm" to={`/chats/${chatWith[p.id].id}`}>Chat</Link>
                    : r === 'sent' ? <span className="tiny muted">Request sent</span>
                      : r === 'blocked' ? <span className="tiny muted">Blocked</span>
                        : <button className="btn btn-primary btn-sm" onClick={() => connect(p.id)} disabled={busy}>Connect</button>}
                </div>
              );
            }) : <p className="muted small">Nobody yet. Share your idea with friends from your college.</p>}
          </section>

          <section className="card stack">
            <div className="row between"><h3>Team</h3><span className="tiny muted">can read the full plan</span></div>
            {connectedPeople.length ? connectedPeople.map((p) => (
              <label className="check" key={p.id}>
                <input type="checkbox" checked={(plan?.team || []).includes(p.id)} onChange={() => toggleTeam(p.id)} />
                <span>{p.name} <span className="muted tiny">· {p.college}</span></span>
              </label>
            )) : <p className="muted small">Connect with people first, then add them to your team here.</p>}
          </section>

          <section className="card stack">
            <div className="row between"><h3>Who read your summary</h3><Icon name="eye" size={18} /></div>
            {views.length ? views.map((v) => (
              <div className="row between" key={v.id}><span className="small">{v.name}</span><span className="tiny muted">{formatWhen(v.at)}</span></div>
            )) : <p className="muted small">No one yet. Only connected people can read it, and every read is recorded here.</p>}
          </section>

          {!confirmDelete ? (
            <button className="btn btn-danger self-start" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} />Delete idea</button>
          ) : (
            <div className="notice bad"><Icon name="alert" size={18} /><div className="stack gap-10"><div><b>Delete this idea?</b> The pitch, summary and plan are removed. This can’t be undone.</div>
              <div className="row gap-8"><button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button><button className="btn btn-danger btn-sm" onClick={removeIdea} disabled={busy}>Delete</button></div></div></div>
          )}
        </>
      )}

      {isAdmin && !isOwner && <p className="tiny muted">You’re seeing this as an admin.</p>}

      {offering && <OfferSheet parent={`ideas/${ideaId}`} title={idea.title} onClose={() => setOffering(false)} />}

      {reporting && (
        <ReportSheet target={{ id: idea.owner, name: idea.ownerName }} ideaId={ideaId} excerpt={[idea.pitch]} onClose={() => setReporting(false)} />
      )}
    </>
  );
}
