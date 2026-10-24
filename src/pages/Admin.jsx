import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, increment, orderBy, query, serverTimestamp, updateDoc, where, limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import { aiEnabled, aiHealth } from '../lib/ai';
import AdminIdeas from './AdminIdeas';
import AdminResearch from './AdminResearch';
import AdminPros from './AdminPros';
import AdminIds from './AdminIds';
import AdminEvents from './AdminEvents';
import AdminGrowth from './AdminGrowth';

const STATUS_TAG = { Open: 'warn', Dismissed: '', Warned: 'gold', Suspended: 'bad', Banned: 'bad', Restored: 'good' };

function when(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

/** Exact location, loaded only when an admin asks for it, and every view goes in the admin log. */
function ExactCell({ p, audit }) {
  const [loc, setLoc] = useState(undefined); // undefined = not opened, null = none shared
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const s = await getDoc(doc(db, 'locations', p.id));
      setLoc(s.exists() ? s.data() : null);
      audit(`Viewed safety location of ${p.name}`);
    } catch { setLoc(null); }
    setBusy(false);
  }
  if (loc === undefined) return <button className="btn btn-secondary btn-sm" disabled={busy} onClick={open}><Icon name="pin" size={14} />{busy ? 'Opening…' : 'View'}</button>;
  if (loc === null) return <span className="tag warn">Not shared</span>;
  const lat = loc.lat.toFixed(6); const lng = loc.lng.toFixed(6);
  return (
    <div className="stack gap-4">
      <span className="mono tiny">{lat}, {lng}</span>
      <span className="tiny muted">±{loc.accuracy} m · {when(loc.at)}</span>
      <a className="tiny" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer noopener">Open map</a>
    </div>
  );
}

export default function Admin() {
  const { user, profile: me } = useAuth();
  const toast = useToast();
  const [profiles, setProfiles] = useState(null);
  const [pending, setPending] = useState([]);
  const [reports, setReports] = useState([]);
  const [guard, setGuard] = useState([]);
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, u, r, g, l] = await Promise.all([
        getDocs(collection(db, 'profiles')),
        getDocs(query(collection(db, 'users'), where('minor', '==', true), where('parentConsent', '==', false))),
        getDocs(query(collection(db, 'reports'), orderBy('at', 'desc'), limit(200))),
        getDocs(query(collection(db, 'guardEvents'), orderBy('at', 'desc'), limit(500))),
        getDocs(query(collection(db, 'adminLog'), orderBy('at', 'desc'), limit(100))),
      ]);
      const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProfiles(map(p)); setPending(map(u)); setReports(map(r)); setGuard(map(g)); setLog(map(l));
    } catch (e) {
      console.error(e);
      setError('Could not load admin data. Make sure your account is in the "admins" collection and the latest security rules are published.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const [ai, setAi] = useState(null);
  useEffect(() => { aiHealth().then(setAi); }, []);

  const audit = (action) => addDoc(collection(db, 'adminLog'), { by: user.uid, byName: me.name, action, at: serverTimestamp() }).catch(() => {});
  const nameOf = (id) => profiles?.find((p) => p.id === id)?.name || 'Unknown';

  async function setVerified(p, value) {
    await updateDoc(doc(db, 'profiles', p.id), { verified: value });
    await audit(`${value ? 'Verified' : 'Removed verification for'} ${p.name}`);
    toast(value ? `${p.name} verified` : `Verification removed for ${p.name}`);
    load();
  }

  async function removePhoto(p) {
    await updateDoc(doc(db, 'profiles', p.id), { photo: '' });
    await audit(`Removed profile photo of ${p.name}`);
    toast(`Photo removed for ${p.name}`);
    load();
  }

  async function approveParent(u) {
    await updateDoc(doc(db, 'users', u.id), { parentConsent: true, parentConsentAt: serverTimestamp(), parentConsentBy: user.uid });
    await audit(`Recorded parent approval for ${nameOf(u.id)}`);
    toast('Parent approval recorded');
    load();
  }

  /** decision: Dismissed | Warned | Suspended | Banned | Restored */
  async function decide(r, decision) {
    setBusy(r.id);
    try {
      const target = doc(db, 'profiles', r.target);
      if (decision === 'Warned') await updateDoc(target, { warnings: increment(1) });
      if (decision === 'Suspended') await updateDoc(target, { status: 'suspended' });
      if (decision === 'Banned') await updateDoc(target, { status: 'banned' });
      if (decision === 'Restored') await updateDoc(target, { status: 'active' });
      await updateDoc(doc(db, 'reports', r.id), { status: decision, handledBy: user.uid, handledAt: serverTimestamp() });
      await audit(`${decision} ${r.targetName || nameOf(r.target)} (report: ${r.reason})`);
      toast(`${r.targetName || 'User'}: ${decision.toLowerCase()}`);
      load();
    } catch (e) {
      console.error(e);
      toast('Could not apply that action. The account may have been deleted.');
    }
    setBusy('');
  }

  const stats = useMemo(() => {
    if (!profiles) return null;
    const counts = {};
    profiles.forEach((p) => (p.interests || []).forEach((i) => { counts[i] = (counts[i] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const kinds = {};
    guard.forEach((g) => { kinds[g.kind] = (kinds[g.kind] || 0) + 1; });
    return {
      total: profiles.length,
      minors: profiles.filter((p) => p.minor).length,
      verified: profiles.filter((p) => p.verified).length,
      quiz: profiles.filter((p) => Array.isArray(p.b5)).length,
      top,
      guardKinds: Object.entries(kinds).sort((a, b) => b[1] - a[1]),
    };
  }, [profiles, guard]);

  const openReports = reports.filter((r) => r.status === 'Open').length;
  const shown = (profiles || []).filter((p) => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.college?.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <header className="stack gap-4"><h2>Admin panel</h2><p className="muted small">Keep the community safe and see how BuildMates is growing.</p></header>
      <div className="seg" role="group" aria-label="Admin sections">
        <button aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
        <button aria-pressed={tab === 'growth'} onClick={() => setTab('growth')}>Growth</button>
        <button aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>Reports{openReports ? ` (${openReports})` : ''}</button>
        <button aria-pressed={tab === 'ideas'} onClick={() => setTab('ideas')}>Ideas</button>
        <button aria-pressed={tab === 'events'} onClick={() => setTab('events')}>Events</button>
        <button aria-pressed={tab === 'research'} onClick={() => setTab('research')}>Research</button>
        <button aria-pressed={tab === 'pros'} onClick={() => setTab('pros')}>Professionals</button>
        <button aria-pressed={tab === 'ids'} onClick={() => setTab('ids')}>ID checks</button>
        <button aria-pressed={tab === 'users'} onClick={() => setTab('users')}>Students</button>
        <button aria-pressed={tab === 'parents'} onClick={() => setTab('parents')}>Parents{pending.length ? ` (${pending.length})` : ''}</button>
        <button aria-pressed={tab === 'log'} onClick={() => setTab('log')}>Log</button>
      </div>
      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {!profiles && !error && <div className="card muted">Loading…</div>}

      {stats && tab === 'overview' && (
        <>
          <div className="stats">
            {[['Students', stats.total], ['Under 18', stats.minors], ['Verified', stats.verified], ['Finished quiz', stats.quiz], ['Open reports', openReports], ['Messages stopped by AI Guard', guard.length]].map(([l, n]) => (
              <div className="card stat" key={l}><div className="num">{n}</div><p className="muted small">{l}</p></div>
            ))}
          </div>
          <div className="card row between">
            <div className="min0"><h3>AI server</h3>
              <p className="muted small">{!aiEnabled ? 'Not connected. Add VITE_AI_API_URL to .env to turn on AI matching and the trained guard.'
                : ai === null ? 'Checking… (a sleeping free server can take up to 30 seconds)'
                  : ai.ok && ai.auth_ready === false ? 'Online, but FIREBASE_PROJECT_ID is missing in ai-api/.env, so every AI check is refused. Add it and restart the AI server.'
                  : ai.ok ? `Online · guard model ${ai.guard_model ? 'loaded' : 'missing'} · ${ai.embed_model}` : `Offline (${ai.reason}). The app is using built-in rules.`}</p></div>
            <span className={`tag ${ai?.ok && ai.auth_ready !== false ? 'good' : aiEnabled ? 'warn' : ''}`}>{ai?.ok && ai.auth_ready === false ? 'Needs setup' : ai?.ok ? 'Online' : aiEnabled ? (ai === null ? 'Checking' : 'Offline') : 'Off'}</span>
          </div>
          {ai?.ok && (
            <div className="card stack gap-8">
              <h3>Server features</h3>
              {[
                ['Firebase admin key', ai.admin_ready, ai.admin_error || 'FIREBASE_SERVICE_ACCOUNT in ai-api/.env'],
                ['Parent approval email', ai.mail_ready, 'SMTP_USER + SMTP_PASS (or BREVO_API_KEY) in ai-api/.env'],
                ['College ID upload', ai.id_ready, 'CLOUDINARY_URL in ai-api/.env'],
                ['Phone notifications', ai.push_ready, 'Needs the Firebase admin key'],
              ].map(([l, ok, fix]) => (
                <div className="row between" key={l}>
                  <div className="min0"><b className="small">{l}</b>{!ok && <p className="tiny muted">{fix}</p>}</div>
                  <span className={`tag ${ok ? 'good' : 'warn'}`}>{ok ? 'Ready' : 'Not set up'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card stack">
            <div className="row between"><h3>Top interests</h3><span className="tiny muted">students per interest</span></div>
            {stats.top.length ? stats.top.map(([l, n]) => (
              <div className="bar-row" key={l}><span>{l}</span><div className="bar"><span style={{ width: `${(n / stats.top[0][1]) * 100}%` }} /></div><span className="mono">{n}</span></div>
            )) : <p className="muted small">No data yet.</p>}
          </div>
          <div className="card stack">
            <div className="row between"><h3>AI Guard</h3><span className="tiny muted">messages blocked or warned, by type</span></div>
            {stats.guardKinds.length ? stats.guardKinds.map(([l, n]) => (
              <div className="bar-row wide" key={l}><span>{l}</span><div className="bar gold"><span style={{ width: `${(n / stats.guardKinds[0][1]) * 100}%` }} /></div><span className="mono">{n}</span></div>
            )) : <p className="muted small">Nothing caught yet.</p>}
          </div>
        </>
      )}

      {tab === 'ideas' && <AdminIdeas onChange={load} />}
      {tab === 'research' && <AdminResearch />}
      {tab === 'pros' && <AdminPros />}
      {tab === 'ids' && <AdminIds onChange={load} />}
      {tab === 'events' && <AdminEvents />}
      {tab === 'growth' && <AdminGrowth />}

      {tab === 'reports' && (
        reports.length ? (
          <div className="stack gap-10">
            {reports.map((r) => (
              <article className="card stack gap-10" key={r.id}>
                <div className="row between">
                  <div className="min0"><b>{r.targetName || nameOf(r.target)}</b>
                    <p className="tiny muted">{r.auto ? 'Raised automatically by AI Guard' : `Reported by ${r.byName || nameOf(r.by)}`} · {when(r.at)}</p></div>
                  <span className={`tag ${STATUS_TAG[r.status] || ''}`}>{r.status}</span>
                </div>
                <p><b>{r.reason}</b>{r.note ? ` · ${r.note}` : ''}</p>
                <div className="row gap-8"><span className="tiny muted">Safety location of {r.targetName || nameOf(r.target)}:</span><ExactCell p={{ id: r.target, name: r.targetName || nameOf(r.target) }} audit={audit} /></div>
                {r.excerpt?.length > 0 && (
                  <div className="excerpt">{r.excerpt.map((t, i) => <p key={i} className="small">“{t}”</p>)}</div>
                )}
                {r.status === 'Open' ? (
                  <div className="row gap-6">
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'Dismissed')}>Dismiss</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'Warned')}>Warn</button>
                    <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'Suspended')}>Suspend</button>
                    <button className="btn btn-danger btn-sm" disabled={busy === r.id} onClick={() => decide(r, 'Banned')}>Ban</button>
                  </div>
                ) : (['Suspended', 'Banned'].includes(r.status) && (
                  <button className="btn btn-ghost btn-sm self-start" disabled={busy === r.id} onClick={() => decide(r, 'Restored')}>Restore account</button>
                ))}
              </article>
            ))}
            <p className="tiny muted">Admins see only the messages attached to a report, never full private chats.</p>
          </div>
        ) : <div className="card muted">No reports. The community is behaving 🙂</div>
      )}

      {profiles && tab === 'users' && (
        <>
          <input className="input" placeholder="Search by name or college" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th><th>College</th><th>Mode</th><th>Status</th><th>Safety location</th><th>Badge</th></tr></thead>
            <tbody>{shown.map((p) => (
              <tr key={p.id}>
                <td><div className="row gap-8"><Avatar name={p.name} photo={p.photo} size={32} /><div><b>{p.name}</b><br /><span className="tiny muted">{p.role}</span>
                  {p.photo && <><br /><button className="link-btn tiny" onClick={() => removePhoto(p)}>Remove photo</button></>}</div></div></td>
                <td>{p.college}<br /><span className="tiny muted">{p.area}</span></td>
                <td>{p.minor ? <span className="tag gold">Safe Mode</span> : <span className="tag">Adult</span>}</td>
                <td><span className={`tag ${(p.status || 'active') === 'active' ? 'good' : 'bad'}`}>{p.status || 'active'}</span>{p.warnings ? <span className="tiny muted"> · {p.warnings} warning{p.warnings > 1 ? 's' : ''}</span> : null}</td>
                <td><ExactCell p={p} audit={audit} /></td>
                <td>{p.verified
                  ? <button className="btn btn-secondary btn-sm" onClick={() => setVerified(p, false)}>Remove</button>
                  : <button className="btn btn-primary btn-sm" onClick={() => setVerified(p, true)}>Verify</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="tiny muted">Verify only after checking the student’s college ID card. Open a safety location only for a real safety reason: every view is saved in the admin log.</p>
        </>
      )}

      {tab === 'parents' && (
        <>
          {pending.length ? pending.map((u) => (
            <div className="card row between" key={u.id}>
              <div><b>{nameOf(u.id)}</b><p className="muted small">Parent: {u.parentEmail}</p></div>
              <button className="btn btn-primary btn-sm" onClick={() => approveParent(u)}>Mark approved</button>
            </div>
          )) : <div className="card muted">No students waiting for parent approval.</div>}
          <p className="tiny muted">Contact the parent by email or phone first. Approve only after they confirm.</p>
        </>
      )}

      {tab === 'log' && (
        log.length ? (
          <div className="card list">
            {log.map((l) => (
              <div className="row between log-row" key={l.id}><span className="small">{l.action}</span><span className="tiny muted">{l.byName} · {when(l.at)}</span></div>
            ))}
          </div>
        ) : <div className="card muted">No admin actions yet.</div>
      )}
    </>
  );
}
