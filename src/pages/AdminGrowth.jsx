import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import { adminStats, digestSend, serverEnabled } from '../lib/server';

const TOTALS = [
  ['students', 'Students'], ['under18', 'Under 18'], ['verified', 'Verified'], ['updatedLast7Days', 'Active this week'],
  ['requests', 'Connection requests'], ['acceptRate', 'Requests accepted (%)'], ['teams', 'Teams'], ['officialTeams', 'Official teams'],
  ['avgTeamSize', 'Average team size'], ['ideas', 'Ideas'], ['products', 'Launchpad products'], ['showcases', 'Published projects'],
  ['roles', 'Open roles posted'], ['circles', 'Learning circles'], ['events', 'Events'], ['officeHours', 'Office hours'],
  ['reports', 'Reports'], ['guardBlocks', 'Messages stopped by AI Guard'],
];

function download(name, rows) {
  const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Admin → Growth: the funnel and weekly numbers for the report's Results chapter. */
export default function AdminGrowth() {
  const toast = useToast();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => { setS(null); setError(''); adminStats().then(setS).catch((e) => setError(e.message)); };
  useEffect(() => { if (serverEnabled) load(); }, []);

  async function sendDigest() {
    setSending(true);
    try {
      const r = await digestSend();
      toast(`Weekly email: ${r.sent} sent, ${r.skipped} skipped${r.failed ? `, ${r.failed} failed` : ''}`);
    } catch (e) { toast(e.message); }
    setSending(false);
  }

  if (!serverEnabled) return <div className="notice warn"><Icon name="alert" size={18} /><div>Growth numbers come from the BuildMates server (VITE_AI_API_URL).</div></div>;
  if (error) return <div className="notice bad"><Icon name="alert" size={18} /><div>{error} <button className="link-btn" onClick={load}>Try again</button></div></div>;
  if (!s) return <div className="card muted">Counting… (can take a few seconds)</div>;

  const top = s.funnel[0][1] || 1;
  const maxWeek = Math.max(1, ...s.weekly.map((w) => w.signups));

  return (
    <>
      <div className="row between">
        <p className="muted small">Only counts. No chats or messages are read to make these numbers.</p>
        <div className="row gap-6">
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={() => download('buildmates-growth.csv', [
            ['Metric', 'Value'], ...TOTALS.map(([k, l]) => [l, s.totals[k]]), [], ['Funnel step', 'Students'], ...s.funnel, [],
            ['Week', 'Signups', 'Requests', 'Teams'], ...s.weekly.map((w) => [w.week, w.signups, w.requests, w.teams]),
          ])}><Icon name="download" size={16} />CSV</button>
        </div>
      </div>

      <div className="card stack">
        <div className="row between"><h3>Funnel</h3><span className="tiny muted">from sign-up to a finished project</span></div>
        {s.funnel.map(([l, n], i) => (
          <div className="bar-row wide" key={l}>
            <span>{l}</span>
            <div className={`bar ${i > 3 ? 'gold' : ''}`}><span style={{ width: `${(n / top) * 100}%` }} /></div>
            <span className="mono">{n}{i > 0 ? ` · ${Math.round((n / top) * 100)}%` : ''}</span>
          </div>
        ))}
        <p className="tiny muted">The biggest drop between two steps is where to improve next.</p>
      </div>

      <div className="card stack">
        <div className="row between"><h3>New students per week</h3><span className="tiny muted">last 12 weeks</span></div>
        <div className="weekbars" role="img" aria-label="New students per week">
          {s.weekly.map((w) => (
            <div className="weekbar" key={w.week} title={`${w.week}: ${w.signups} signups, ${w.requests} requests, ${w.teams} teams`}>
              <span className="mono tiny">{w.signups || ''}</span>
              <div style={{ height: `${(w.signups / maxWeek) * 100}%` }} />
              <span className="tiny muted">{w.week.slice(-3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stats">
        {TOTALS.map(([k, l]) => <div className="card stat" key={k}><div className="num">{s.totals[k]}</div><p className="muted small">{l}</p></div>)}
      </div>

      {s.colleges?.length > 0 && (
        <div className="card stack">
          <h3>Students by college</h3>
          {s.colleges.map(([c, n]) => (
            <div className="bar-row wide" key={c}><span>{c}</span><div className="bar"><span style={{ width: `${(n / s.colleges[0][1]) * 100}%` }} /></div><span className="mono">{n}</span></div>
          ))}
        </div>
      )}

      <div className="card row between">
        <div className="min0"><h3>Weekly email</h3><p className="muted small">Sends this week’s digest to students who turned it on (once every 6 days each).</p></div>
        <button className="btn btn-primary btn-sm" disabled={sending} onClick={sendDigest}><Icon name="mail" size={16} />{sending ? 'Sending…' : 'Send now'}</button>
      </div>
    </>
  );
}
