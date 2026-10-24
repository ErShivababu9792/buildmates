import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { decideIdCard, serverEnabled, viewIdCard } from '../lib/server';

const REASONS = ['Photo is blurry', 'Name not readable', 'College doesn’t match the profile', 'Not a college ID card', 'Card has expired'];
const when = (ts) => ts?.toDate?.().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) || '';

/** Admin → ID checks: look at each college ID photo and approve (Verified badge) or reject. */
export default function AdminIds({ onChange }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // { req, img, error }
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getDocs(query(collection(db, 'idRequests'), where('status', '==', 'pending')))
      .then((s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at?.toMillis?.() || 0) - (b.at?.toMillis?.() || 0))))
      .catch((e) => { console.error(e); setList([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function show(req) {
    setOpen({ req, img: '', error: '' });
    setReason(REASONS[0]);
    try { const img = await viewIdCard(req.id); setOpen({ req, img, error: '' }); } catch (e) { setOpen({ req, img: '', error: e.message }); }
  }

  async function decide(approve) {
    setBusy(true);
    try {
      await decideIdCard(open.req.id, approve, approve ? '' : reason);
      toast(approve ? `${open.req.name} is now verified` : 'Rejected. The student can upload again.');
      setOpen(null);
      load();
      onChange?.();
    } catch (e) { toast(e.message); }
    setBusy(false);
  }

  if (!serverEnabled) return <div className="notice warn"><Icon name="alert" size={18} /><div>ID checks need the BuildMates server (VITE_AI_API_URL in .env).</div></div>;
  if (list === null) return <div className="card muted">Loading…</div>;

  return (
    <>
      <div className="notice info"><Icon name="lock" size={18} /><div>ID photos are private. They open here only, and are deleted from storage as soon as you approve or reject.</div></div>
      {!list.length && <div className="card muted center-text">No ID cards waiting.</div>}
      {list.length > 0 && (
        <div className="card list">
          {list.map((r) => (
            <div className="list-item" key={r.id}>
              <div className="grow min0"><b className="small">{r.name}</b><p className="tiny muted">{r.college}{r.minor ? ' · Safe Mode' : ''} · sent {when(r.at)}</p></div>
              <button className="btn btn-primary btn-sm" onClick={() => show(r)}><Icon name="eye" size={16} />Check</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Sheet title={`ID of ${open.req.name}`} onClose={() => setOpen(null)}>
          <p className="small muted">Profile says: <b>{open.req.name}</b> · {open.req.college}</p>
          <div className="idcheck">
            {open.error ? <div className="notice bad"><Icon name="alert" size={18} /><div>{open.error}</div></div>
              : open.img ? <img src={open.img} alt={`College ID card of ${open.req.name}`} /> : <div className="card muted center-text">Loading photo…</div>}
          </div>
          <p className="tiny muted">Check that the name and college match the profile and the card looks real.</p>
          <div className="field"><label htmlFor="rej">If rejecting, why?</label>
            <select className="select" id="rej" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="row gap-8">
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => decide(false)}>Reject</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !open.img} onClick={() => decide(true)}><Icon name="check" size={16} />Approve · Verified</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
