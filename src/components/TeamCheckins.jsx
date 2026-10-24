import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import { checkinTips, lastWeeks, MOODS, weekKey } from '../lib/teams';

const EMPTY = { did: '', next: '', blocker: '', mood: 'good', hours: 3 };

/** Team → Check-ins: a 2-minute weekly update from each member, a team view, and coach tips. */
export default function TeamCheckins({ team, tasks, nameOf }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const weeks = useMemo(() => lastWeeks(4), []);
  const week = weeks[0];
  const [all, setAll] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(db, 'teams', team.id, 'checkins'), where('week', 'in', weeks)),
    (s) => setAll(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAll([]),
  ), [team.id, weeks]);

  const thisWeek = (all || []).filter((c) => c.week === week && team.members.includes(c.uid));
  const mine = thisWeek.find((c) => c.uid === user.uid);
  useEffect(() => { if (mine && !editing) setForm({ did: mine.did, next: mine.next, blocker: mine.blocker, mood: mine.mood, hours: mine.hours }); }, [mine, editing]);

  const tips = checkinTips({ members: team.members, checkins: thisWeek, tasks });
  const doneThisWeek = tasks.filter((t) => t.status === 'done' && t.doneAt?.toDate && weekKey(t.doneAt.toDate()) === week).length;

  async function save(e) {
    e.preventDefault();
    if (!form.did.trim() && !form.next.trim()) { toast('Write at least what you did or what’s next.'); return; }
    setBusy(true);
    try {
      await setDoc(doc(db, 'teams', team.id, 'checkins', `${week}_${user.uid}`), {
        uid: user.uid, name: profile.name, week, did: form.did.trim().slice(0, 300), next: form.next.trim().slice(0, 300),
        blocker: form.blocker.trim().slice(0, 300), mood: form.mood, hours: Math.max(0, Math.min(60, Number(form.hours) || 0)), at: serverTimestamp(),
      });
      toast('Check-in saved. Thanks!');
      setEditing(false);
    } catch (err) { console.error(err); toast('Could not save. Check that the latest rules are published.'); }
    setBusy(false);
  }

  if (all === null) return <div className="card muted">Loading…</div>;
  const showForm = !mine || editing;

  return (
    <div className="stack">
      <div className="stats three">
        <div className="card stat"><div className="num">{thisWeek.length}/{team.members.length}</div><p className="muted small">checked in</p></div>
        <div className="card stat"><div className="num">{doneThisWeek}</div><p className="muted small">tasks done this week</p></div>
        <div className="card stat"><div className="num">{thisWeek.reduce((s, c) => s + (Number(c.hours) || 0), 0)}</div><p className="muted small">hours this week</p></div>
      </div>

      {showForm ? (
        <form className="card stack" onSubmit={save}>
          <div className="row between"><h3>Your check-in · {week.replace('-W', ' week ')}</h3><span className="tiny muted">2 minutes</span></div>
          <div className="field"><label htmlFor="ci_did">What did you do this week?</label>
            <textarea className="textarea" id="ci_did" maxLength={300} value={form.did} onChange={(e) => setForm({ ...form, did: e.target.value })} placeholder="e.g. Finished the login screen design" /></div>
          <div className="field"><label htmlFor="ci_next">What will you do next week?</label>
            <textarea className="textarea" id="ci_next" maxLength={300} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} placeholder="e.g. Start the profile page" /></div>
          <div className="field"><label htmlFor="ci_block">Anything blocking you? <span className="tag">optional</span></label>
            <input className="input" id="ci_block" maxLength={300} value={form.blocker} onChange={(e) => setForm({ ...form, blocker: e.target.value })} placeholder="e.g. Waiting for the logo" /></div>
          <div className="grid-2">
            <div className="field"><span className="label">How is it going?</span>
              <div className="seg" role="group" aria-label="How is it going">{MOODS.map((m) => <button type="button" key={m.id} aria-pressed={form.mood === m.id} onClick={() => setForm({ ...form, mood: m.id })}>{m.emoji} {m.label}</button>)}</div></div>
            <div className="field"><label htmlFor="ci_hours">Hours this week</label>
              <input className="input" id="ci_hours" type="number" min={0} max={60} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
          </div>
          <div className="row gap-8">
            {mine && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>}
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : mine ? 'Update check-in' : 'Save check-in'}</button>
          </div>
        </form>
      ) : (
        <div className="notice info row between"><span className="row gap-8"><Icon name="check" size={18} />You’ve checked in this week.</span><button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button></div>
      )}

      {tips.length > 0 && (
        <div className="card stack gap-8">
          <div className="row gap-8"><span className="feature-ic"><Icon name="spark" size={18} /></span><h3>Coach tips</h3></div>
          <ul className="reasons">{tips.map((t) => <li key={t}><span className="ok"><Icon name="check" size={16} /></span>{t}</li>)}</ul>
        </div>
      )}

      {weeks.map((w) => {
        const list = (all || []).filter((c) => c.week === w);
        if (!list.length && w !== week) return null;
        const missing = team.members.filter((m) => !list.some((c) => c.uid === m));
        return (
          <section className="stack gap-8" key={w}>
            <span className="eyebrow">{w === week ? 'This week' : w.replace('-W', ' · week ')}</span>
            {list.map((c) => {
              const mood = MOODS.find((m) => m.id === c.mood) || MOODS[1];
              return (
                <article className={`card stack gap-6 ${c.mood === 'stuck' ? 'stuck' : ''}`} key={c.id}>
                  <div className="row between"><b className="small">{c.name || nameOf(c.uid)}{c.uid === user.uid ? ' (you)' : ''}</b><span className="tiny muted">{mood.emoji} {mood.label} · {c.hours || 0} h</span></div>
                  {c.did && <p className="small"><b>Did:</b> {c.did}</p>}
                  {c.next && <p className="small"><b>Next:</b> {c.next}</p>}
                  {c.blocker && <p className="small warn-text"><b>Blocked:</b> {c.blocker}</p>}
                </article>
              );
            })}
            {w === week && missing.length > 0 && <p className="tiny muted">Not checked in yet: {missing.map(nameOf).join(', ')}</p>}
          </section>
        );
      })}
    </div>
  );
}
