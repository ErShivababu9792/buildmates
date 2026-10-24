import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { safeUrl } from '../lib/safeUrl';

/** Verify professionals: check LinkedIn and work email before approving. */
export default function AdminPros() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);

  const load = useCallback(() => getDocs(query(collection(db, 'proRequests'), where('status', '==', 'pending')))
    .then((s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })))).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  async function decide(r, approve) {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'proRequests', r.id), { status: approve ? 'approved' : 'rejected' });
      if (approve) batch.update(doc(db, 'profiles', r.id), { pro: true, proCompany: `${r.role} at ${r.company}`.slice(0, 120) });
      await batch.commit();
      await addDoc(collection(db, 'adminLog'), { by: user.uid, byName: profile.name, action: `${approve ? 'Verified' : 'Rejected'} professional ${r.name} (${r.company})`, at: serverTimestamp() }).catch(() => {});
      toast(approve ? `${r.name} is now a verified professional` : 'Application rejected');
      load();
    } catch (e) { console.error(e); toast('Could not update. The person may have deleted their account.'); }
  }

  if (list === null) return <div className="card muted">Loading…</div>;
  return (
    <>
      {list.length ? list.map((r) => (
        <div className="card stack gap-8" key={r.id}>
          <div className="row between"><b>{r.name}</b><span className="tag warn">Pending</span></div>
          <p className="small">{r.role} at {r.company}</p>
          <p className="tiny muted">Work email: {r.workEmail}</p>
          <a className="small" href={safeUrl(r.linkedin) || undefined} target="_blank" rel="noopener noreferrer nofollow">Open LinkedIn profile</a>
          {r.note && <p className="small excerpt">“{r.note}”</p>}
          <div className="row gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => decide(r, false)}>Reject</button>
            <button className="btn btn-primary btn-sm" onClick={() => decide(r, true)}>Verify</button>
          </div>
        </div>
      )) : <div className="card muted">No professional applications waiting.</div>}
      <p className="tiny muted">Verify only if the LinkedIn profile is real and matches the work email’s company.</p>
    </>
  );
}
