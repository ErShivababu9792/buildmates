import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';

/** Gallery of projects that teams finished and published (your age group only). */
export default function Showcase() {
  const { profile } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'showcase'), where('status', '==', 'live'), where('minor', '==', Boolean(profile.minor)), limit(200)))
      .then((s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.publishedAt?.toMillis?.() || 0) - (a.publishedAt?.toMillis?.() || 0))))
      .catch((e) => { console.error(e); setError('Could not load projects. Check that the latest security rules are published.'); });
  }, [profile.minor]);

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="stack gap-4"><h2>Showcase</h2><p className="muted small">Real projects built by student teams on BuildMates. Get inspired, then build yours.</p></header>
      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {list === null && !error && <div className="card muted">Loading…</div>}
      {list && !list.length && (
        <div className="card stack center-text">
          <span className="feature-ic big"><Icon name="rocket" size={26} /></span>
          <b>No projects yet</b>
          <p className="muted small">When an official team finishes something, they publish it from Team → Showcase.</p>
        </div>
      )}
      {(list || []).map((s) => (
        <Link className="card idea-card" to={`/p/${s.id}`} key={s.id}>
          <b className="idea-title">{s.title}</b>
          <p className="small muted">{s.tagline}</p>
          <div className="row gap-6">
            <span className="tag">Team of {(s.memberIds || []).length}</span>
            {(s.stack || []).slice(0, 3).map((x) => <span className="tag" key={x}>{x}</span>)}
          </div>
        </Link>
      ))}
    </>
  );
}
