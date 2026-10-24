import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { formatWhen } from '../lib/ideas';

/** Ideas waiting for review (flagged by the AI idea check), plus a way to take down a live idea. */
export default function AdminIdeas({ onChange }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [review, setReview] = useState(null);
  const [live, setLive] = useState([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      getDocs(query(collection(db, 'ideas'), where('status', '==', 'review'))),
      getDocs(query(collection(db, 'ideas'), where('status', '==', 'live'))),
    ]);
    setReview(r.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLive(l.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, []);

  useEffect(() => { load().catch(() => setReview([])); }, [load]);

  async function setStatus(idea, status) {
    setBusy(idea.id);
    try {
      await updateDoc(doc(db, 'ideas', idea.id), { status });
      await addDoc(collection(db, 'adminLog'), { by: user.uid, byName: profile.name, action: `Idea "${idea.title}" → ${status}`, at: serverTimestamp() }).catch(() => {});
      toast(status === 'live' ? 'Idea approved' : 'Idea hidden');
      await load();
      onChange?.();
    } catch { toast('Could not update the idea.'); }
    setBusy('');
  }

  if (review === null) return <div className="card muted">Loading ideas…</div>;

  return (
    <>
      <span className="eyebrow">Waiting for review</span>
      {review.length ? review.map((i) => (
        <div className="card stack gap-10" key={i.id}>
          <div className="row between"><b>{i.title}</b><span className="tiny muted">{formatWhen(i.createdAt)}</span></div>
          <p className="muted small">{i.pitch}</p>
          <p className="tiny muted">By {i.ownerName} · {i.ownerCollege}</p>
          <div className="row gap-8">
            <Link className="btn btn-ghost btn-sm" to={`/ideas/${i.id}`}>Open</Link>
            <button className="btn btn-secondary btn-sm" disabled={busy === i.id} onClick={() => setStatus(i, 'live')}>Approve</button>
            <button className="btn btn-danger btn-sm" disabled={busy === i.id} onClick={() => setStatus(i, 'rejected')}>Reject</button>
          </div>
        </div>
      )) : <div className="card muted">No ideas waiting for review.</div>}

      <span className="eyebrow">Live ideas ({live.length})</span>
      {live.length ? (
        <div className="card list">
          {live.map((i) => (
            <div className="row between log-row" key={i.id}>
              <div className="min0"><Link to={`/ideas/${i.id}`} className="small">{i.title}</Link><p className="tiny muted">{i.ownerName}</p></div>
              <button className="btn btn-ghost btn-sm" disabled={busy === i.id} onClick={() => setStatus(i, 'removed')}>Take down</button>
            </div>
          ))}
        </div>
      ) : <div className="card muted">No live ideas yet.</div>}
    </>
  );
}
