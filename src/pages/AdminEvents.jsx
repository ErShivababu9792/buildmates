import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import { EventForm } from './Events';
import { countdown, eventWhen, sortEvents } from '../lib/events';

/** Admin → Events: add events, publish students' suggestions, remove old or wrong ones. */
export default function AdminEvents() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [all, setAll] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    getDocs(collection(db, 'events'))
      .then((s) => setAll(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => { console.error(e); setAll([]); toast('Could not load events. Publish the latest security rules.'); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const log = (action) => addDoc(collection(db, 'adminLog'), { by: user.uid, byName: profile.name, action, at: serverTimestamp() }).catch(() => {});

  async function publish(e) {
    setBusy(e.id);
    try { await updateDoc(doc(db, 'events', e.id), { status: 'live' }); await log(`Published event “${e.title}”`); toast('Event published'); load(); } catch { toast('Could not publish. Try again.'); }
    setBusy('');
  }

  async function remove(e) {
    setBusy(e.id);
    try { await deleteDoc(doc(db, 'events', e.id)); await log(`Removed event “${e.title}”`); toast('Event removed'); load(); } catch { toast('Could not remove. Try again.'); }
    setBusy('');
  }

  if (all === null) return <div className="card muted">Loading…</div>;
  const pending = all.filter((e) => e.status === 'pending');
  const { upcoming, past } = sortEvents(all.filter((e) => e.status === 'live'));

  const row = (e, actions) => (
    <div className="list-item" key={e.id}>
      <div className="grow min0">
        <Link className="small" to={`/events/${e.id}`}><b>{e.title}</b></Link>
        <p className="tiny muted">{e.kind} · {eventWhen(e)} · {e.mode === 'Online' ? 'Online' : e.place}{e.audience === 'adults' ? ' · 18+' : ''}</p>
        <p className="tiny muted">{e.status === 'pending' ? `Suggested by ${e.createdByName}` : countdown(e)}</p>
      </div>
      <div className="row gap-6">{actions}</div>
    </div>
  );

  return (
    <>
      <div className="row between">
        <p className="muted small">Hackathons, workshops and fests. Students see them under Ideas → Hackathons and events.</p>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add event</button>
      </div>

      <section className="stack gap-6">
        <span className="eyebrow">Waiting for review ({pending.length})</span>
        {pending.length ? <div className="card list">{pending.map((e) => row(e, <>
          <button className="btn btn-secondary btn-sm" disabled={busy === e.id} onClick={() => remove(e)}>Reject</button>
          <button className="btn btn-primary btn-sm" disabled={busy === e.id} onClick={() => publish(e)}>Publish</button>
        </>))}</div> : <p className="muted small">No suggestions waiting.</p>}
      </section>

      <section className="stack gap-6">
        <span className="eyebrow">Live, upcoming ({upcoming.length})</span>
        {upcoming.length ? <div className="card list">{upcoming.map((e) => row(e,
          <button className="btn btn-danger btn-sm" disabled={busy === e.id} onClick={() => remove(e)}>Take down</button>))}</div>
          : <p className="muted small">No upcoming events. Add one so students can find teammates for it.</p>}
      </section>

      {past.length > 0 && (
        <section className="stack gap-6">
          <span className="eyebrow">Past ({past.length})</span>
          <div className="card list">{past.map((e) => row(e,
            <button className="btn btn-ghost btn-sm" disabled={busy === e.id} onClick={() => remove(e)}>Delete</button>))}</div>
        </section>
      )}

      {adding && <EventForm onClose={() => setAdding(false)} onSaved={load} />}
    </>
  );
}
