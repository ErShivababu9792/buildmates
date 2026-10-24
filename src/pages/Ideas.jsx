import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { INTERESTS } from '../lib/constants';
import { formatWhen } from '../lib/ideas';

const STATUS = { live: ['Live', 'good'], review: ['Under review', 'warn'], rejected: ['Not approved', 'bad'], removed: ['Removed', 'bad'] };
const byNewest = (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);

export default function Ideas() {
  const { user, profile } = useAuth();
  const { blockedIds } = useSocial();
  const [tab, setTab] = useState('explore');
  const [all, setAll] = useState(null);
  const [mine, setMine] = useState(null);
  const [tag, setTag] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    // Rules allow reading live ideas from your own age group, so the query asks for exactly that.
    Promise.all([
      getDocs(query(collection(db, 'ideas'), where('minor', '==', Boolean(profile.minor)), where('status', '==', 'live'), limit(300))),
      getDocs(query(collection(db, 'ideas'), where('owner', '==', user.uid))),
    ]).then(([a, m]) => {
      if (!alive) return;
      setAll(a.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest));
      setMine(m.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest));
    }).catch((e) => { console.error(e); if (alive) setError('Could not load ideas. Check your connection and that the latest security rules are published.'); });
    return () => { alive = false; };
  }, [profile.minor, user.uid]);

  const explore = useMemo(() => (all || [])
    .filter((i) => i.owner !== user.uid && !blockedIds.has(i.owner))
    .filter((i) => !tag || (i.tags || []).includes(tag)), [all, user.uid, blockedIds, tag]);

  return (
    <>
      <header className="row between">
        <div className="stack gap-4 min0"><h2>Idea board</h2><p className="muted small">Ideas from students near you. Details open in steps, so every idea stays safe.</p></div>
        <Link className="btn btn-primary btn-sm" to="/ideas/new"><Icon name="plus" size={16} />Post idea</Link>
      </header>

      <div className="tiles">
        <Link className="card tile" to="/ideas/dost"><span className="feature-ic"><Icon name="spark" /></span><div><b className="small">Idea Dost</b><p className="tiny muted">Shape a rough thought into a clear idea</p></div></Link>
        <Link className="card tile" to="/launchpad"><span className="feature-ic"><Icon name="rocket" /></span><div><b className="small">Launchpad</b><p className="tiny muted">Built something? Find people to grow it</p></div></Link>
        <Link className="card tile" to="/events"><span className="feature-ic"><Icon name="clock" /></span><div><b className="small">Hackathons and events</b><p className="tiny muted">Find an event, then find your team for it</p></div></Link>
        <Link className="card tile" to="/circles"><span className="feature-ic"><Icon name="users" /></span><div><b className="small">Learning circles</b><p className="tiny muted">Learn one skill with 3–8 students</p></div></Link>
        <Link className="card tile" to="/showcase"><span className="feature-ic"><Icon name="star" /></span><div><b className="small">Showcase</b><p className="tiny muted">Projects student teams finished</p></div></Link>
        {!profile.minor && <Link className="card tile" to="/mentors"><span className="feature-ic"><Icon name="briefcase" /></span><div><b className="small">Mentor office hours</b><p className="tiny muted">Group Q&amp;A with founders and pros</p></div></Link>}
      </div>

      <div className="card levels">
        <div><span className="tag">Everyone</span><p className="tiny muted">sees the one-line pitch</p></div>
        <div><span className="tag brand">Connected</span><p className="tiny muted">also see the summary</p></div>
        <div><span className="tag gold">Your team</span><p className="tiny muted">also sees the full plan</p></div>
      </div>

      <div className="row between">
        <div className="seg" role="group" aria-label="Ideas">
          <button aria-pressed={tab === 'explore'} onClick={() => setTab('explore')}>Explore</button>
          <button aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>My ideas{mine?.length ? ` (${mine.length})` : ''}</button>
        </div>
        {tab === 'explore' && (
          <select className="select auto" aria-label="Filter by area" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All areas</option>{INTERESTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>

      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {!all && !error && <div className="card muted">Loading ideas…</div>}

      {all && tab === 'explore' && (explore.length ? explore.map((i) => (
        <Link className="card idea-card" to={`/ideas/${i.id}`} key={i.id}>
          <div className="row between"><b className="idea-title">{i.title}</b><div className="row gap-6">{(i.tags || []).map((t) => <span className="tag" key={t}>{t}</span>)}</div></div>
          <p className="muted">{i.pitch}</p>
          <div className="row gap-8 tiny muted"><Avatar name={i.ownerName} size={24} /><span>{i.ownerName} · {i.ownerCollege}</span><span>·</span><span>{formatWhen(i.createdAt)}</span></div>
        </Link>
      )) : (
        <div className="card stack center-text"><b>No ideas here yet</b><p className="muted small">Be the first to post one. Only your one-line pitch is public.</p><Link className="btn btn-primary btn-sm" to="/ideas/new">Post an idea</Link></div>
      ))}

      {mine && tab === 'mine' && (mine.length ? mine.map((i) => (
        <Link className="card idea-card" to={`/ideas/${i.id}`} key={i.id}>
          <div className="row between"><b className="idea-title">{i.title}</b><span className={`tag ${STATUS[i.status]?.[1] || ''}`}>{STATUS[i.status]?.[0] || i.status}</span></div>
          <p className="muted">{i.pitch}</p>
          <p className="tiny muted"><Icon name="clock" size={13} /> Posted {formatWhen(i.createdAt)}</p>
        </Link>
      )) : (
        <div className="card stack center-text"><b>You haven’t posted an idea</b><p className="muted small">Post one to find people who want to build it with you.</p><Link className="btn btn-primary btn-sm" to="/ideas/new">Post an idea</Link></div>
      ))}
    </>
  );
}
