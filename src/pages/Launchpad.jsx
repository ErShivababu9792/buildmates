import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { NEEDS, needLabel, STAGES } from '../lib/launchpad';

const byNewest = (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;

export default function Launchpad() {
  const { user, profile } = useAuth();
  const { blockedIds } = useSocial();
  const [tab, setTab] = useState('explore');
  const [all, setAll] = useState(null);
  const [mine, setMine] = useState([]);
  const [need, setNeed] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      getDocs(query(collection(db, 'products'), where('minor', '==', Boolean(profile.minor)), where('status', '==', 'live'), limit(300))),
      getDocs(query(collection(db, 'products'), where('owner', '==', user.uid))),
    ]).then(([a, m]) => {
      if (!alive) return;
      setAll(a.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest));
      setMine(m.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest));
    }).catch((e) => { console.error(e); if (alive) setError('Could not load Launchpad. Publish the latest security rules and try again.'); });
    return () => { alive = false; };
  }, [profile.minor, user.uid]);

  const explore = useMemo(() => (all || []).filter((p) => p.owner !== user.uid && !blockedIds.has(p.owner) && (!need || (p.needs || []).includes(need))), [all, user.uid, blockedIds, need]);
  const list = tab === 'explore' ? explore : mine;

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Launchpad</h2><p className="muted small">Students who built something real and want help to grow it.</p></div>
        <Link className="btn btn-primary btn-sm" to="/launchpad/new"><Icon name="rocket" size={16} />List a product</Link>
      </header>

      <div className="row between">
        <div className="seg" role="group" aria-label="Products">
          <button aria-pressed={tab === 'explore'} onClick={() => setTab('explore')}>Explore</button>
          <button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>My products{mine.length ? ` (${mine.length})` : ''}</button>
        </div>
        {tab === 'explore' && (
          <select className="select auto" aria-label="Filter by what they need" value={need} onChange={(e) => setNeed(e.target.value)}>
            <option value="">Any need</option>{NEEDS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        )}
      </div>

      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {!all && !error && <div className="card muted">Loading…</div>}

      {all && (list.length ? list.map((p) => (
        <Link className="card idea-card" to={`/launchpad/${p.id}`} key={p.id}>
          <div className="row between">
            <b className="idea-title">{p.name}</b>
            <div className="row gap-6">
              <span className="tag">{stageLabel(p.stage)}</span>
              {p.linkOk && <span className="tag good"><Icon name="check" size={12} />Live link</span>}
              {p.status !== 'live' && <span className="tag bad">Hidden</span>}
            </div>
          </div>
          <p className="muted">{p.what}</p>
          <div className="row gap-6">{(p.needs || []).map((n) => <span className="tag brand" key={n}>Needs: {needLabel(n)}</span>)}</div>
          <div className="row gap-8 tiny muted"><Avatar name={p.ownerName} size={24} /><span>{p.ownerName} · {p.ownerCollege}</span>{p.users ? <span>· {p.users} users</span> : null}</div>
        </Link>
      )) : (
        <div className="card stack center-text">
          <b>{tab === 'mine' ? 'You haven’t listed a product' : 'No products here yet'}</b>
          <p className="muted small">Built an app, website or small business? List it and find people to help it grow.</p>
          <Link className="btn btn-primary btn-sm" to="/launchpad/new">List a product</Link>
        </div>
      ))}
    </>
  );
}
