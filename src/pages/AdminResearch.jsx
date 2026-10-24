import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Icon from '../components/Icon';
import { FEEDBACK_QUESTIONS } from '../components/FeedbackSheet';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (x, d = 2) => (x === null || Number.isNaN(x) ? '–' : x.toFixed(d));

function pearson(xs, ys) {
  if (xs.length < 3) return null;
  const mx = mean(xs); const my = mean(ys);
  let num = 0; let dx = 0; let dy = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function downloadCsv(name, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BUCKETS = [['Below 50%', 0, 50], ['50–69%', 50, 70], ['70% and above', 70, 101]];

/**
 * Pilot results for the project report:
 * do higher match scores get higher "would you work with them?" ratings, and what do students think of the app?
 */
export default function AdminResearch() {
  const [ratings, setRatings] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getDocs(collection(db, 'ratings')), getDocs(collection(db, 'feedback'))])
      .then(([r, f]) => {
        setRatings(r.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeedback(f.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((e) => { console.error(e); setError('Could not load research data. Publish the latest security rules.'); });
  }, []);

  const stats = useMemo(() => {
    if (!ratings) return null;
    const scores = ratings.map((r) => r.matchScore);
    const marks = ratings.map((r) => r.score);
    const buckets = BUCKETS.map(([label, lo, hi]) => {
      const inB = ratings.filter((r) => r.matchScore >= lo && r.matchScore < hi).map((r) => r.score);
      return { label, n: inB.length, avg: mean(inB) };
    });
    const bySource = ['ai', 'keywords'].map((src) => {
      const xs = ratings.filter((r) => r.visionSource === src).map((r) => r.score);
      return { src, n: xs.length, avg: mean(xs) };
    });
    return {
      n: ratings.length,
      raters: new Set(ratings.map((r) => r.by)).size,
      avg: mean(marks),
      r: pearson(scores, marks),
      buckets,
      bySource,
      fb: FEEDBACK_QUESTIONS.map((q) => ({ ...q, avg: mean(feedback.map((f) => f[q.id]).filter(Boolean)) })),
    };
  }, [ratings, feedback]);

  if (error) return <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>;
  if (!stats) return <div className="card muted">Loading results…</div>;

  return (
    <>
      <div className="stats">
        {[['Match ratings', stats.n], ['Students who rated', stats.raters], ['Average rating (1–5)', fmt(stats.avg)], ['Feedback answers', feedback.length]].map(([l, n]) => (
          <div className="card stat" key={l}><div className="num">{n}</div><p className="muted small">{l}</p></div>
        ))}
      </div>

      <div className="card stack">
        <div className="row between"><h3>Does a higher match score mean a better match?</h3></div>
        <p className="small">Correlation between match score and student rating (Pearson r): <b className="mono">{fmt(stats.r)}</b>
          <span className="muted"> {stats.r === null ? '(needs at least 3 ratings)' : stats.r > 0.3 ? '· positive: the algorithm is working' : stats.r > 0 ? '· weak positive' : '· no clear link yet'}</span></p>
        {stats.buckets.map((b) => (
          <div className="bar-row wide" key={b.label}>
            <span>{b.label} <span className="tiny muted">(n={b.n})</span></span>
            <div className="bar"><span style={{ width: `${b.avg ? (b.avg / 5) * 100 : 0}%` }} /></div>
            <span className="mono">{fmt(b.avg, 1)}</span>
          </div>
        ))}
        <p className="tiny muted">Average rating out of 5 for matches in each score range. If the matching works, the bars should grow from top to bottom.</p>
      </div>

      <div className="card stack">
        <h3>AI matching vs keyword matching</h3>
        {stats.bySource.map((b) => (
          <div className="bar-row wide" key={b.src}>
            <span>{b.src === 'ai' ? 'AI (meaning)' : 'Keywords only'} <span className="tiny muted">(n={b.n})</span></span>
            <div className="bar gold"><span style={{ width: `${b.avg ? (b.avg / 5) * 100 : 0}%` }} /></div>
            <span className="mono">{fmt(b.avg, 1)}</span>
          </div>
        ))}
        <p className="tiny muted">Average rating when the vision was compared by AI embeddings versus shared words.</p>
      </div>

      <div className="card stack">
        <h3>Student feedback</h3>
        {stats.fb.map((q) => (
          <div className="bar-row wide" key={q.id}>
            <span>{q.text}</span>
            <div className="bar"><span style={{ width: `${q.avg ? (q.avg / 5) * 100 : 0}%` }} /></div>
            <span className="mono">{fmt(q.avg, 1)}</span>
          </div>
        ))}
        {feedback.filter((f) => f.comment).slice(0, 8).map((f) => <p className="small excerpt" key={f.id}>“{f.comment}”</p>)}
      </div>

      <div className="row gap-8">
        <button className="btn btn-secondary btn-sm" disabled={!ratings.length}
          onClick={() => downloadCsv('buildmates-ratings.csv', ratings.map(({ id, by, target, at, ...r }) => ({ ...r, at: at?.toDate?.().toISOString() || '' })))}>
          <Icon name="download" size={16} />Ratings CSV</button>
        <button className="btn btn-secondary btn-sm" disabled={!feedback.length}
          onClick={() => downloadCsv('buildmates-feedback.csv', feedback.map(({ id, at, ...f }) => ({ ...f, at: at?.toDate?.().toISOString() || '' })))}>
          <Icon name="download" size={16} />Feedback CSV</button>
      </div>
      <p className="tiny muted">Exports leave out names and account ids, so you can put them in your report.</p>
    </>
  );
}
