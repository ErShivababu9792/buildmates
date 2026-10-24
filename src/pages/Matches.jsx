import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import ReportSheet from '../components/ReportSheet';
import RateMatch from '../components/RateMatch';
import { INTERESTS, SKILLS } from '../lib/constants';
import { canSee, scoreMatch, WEIGHTS } from '../lib/matching';
import { sameArea } from '../lib/geo';
import ScoreRing from '../components/ScoreRing';
import { useT } from '../i18n';

const AreaMap = lazy(() => import('../components/AreaMap'));

const SCOPES = [['college', 'm.college'], ['area', 'm.area'], ['all', 'm.all']];

/** Lower-case text of everything a person can be searched by. */
const haystack = (p) => [p.name, p.college, p.area, p.role, p.vision, ...(p.skills || []), ...(p.interests || [])].join(' ').toLowerCase();

export default function Matches() {
  const { user, profile } = useAuth();
  const { relation, sendRequest, accept, block, chatWith, blockedIds } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, label } = useT();
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('all');
  const [skill, setSkill] = useState('');
  const [why, setWhy] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [busy, setBusy] = useState('');
  const [ratings, setRatings] = useState({});
  const [view, setView] = useState('list');
  const active = (profile.status || 'active') === 'active';

  useEffect(() => {
    let alive = true;
    // Security rules only allow reading profiles in the same age group, so the query must say so too.
    const q = query(collection(db, 'profiles'), where('minor', '==', Boolean(profile.minor)), limit(300));
    getDocs(q)
      .then((snap) => { if (alive) setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); })
      .catch((e) => { console.error(e); if (alive) setError('Could not load matches. Check your connection and try again.'); });
    getDocs(query(collection(db, 'ratings'), where('by', '==', user.uid)))
      .then((snap) => { if (alive) setRatings(Object.fromEntries(snap.docs.map((d) => [d.data().target, d.data().score]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [profile.minor, user.uid]);

  // Search also matches the translated skill/interest names, e.g. "डिज़ाइन" finds Design
  const terms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const all = [...SKILLS, ...INTERESTS];
    return q.split(/\s+/).map((w) => {
      const hit = all.find((x) => label(x).toLowerCase() === w);
      return hit ? hit.toLowerCase() : w;
    });
  }, [search, label]);

  const list = useMemo(() => {
    if (!people) return [];
    return people
      .filter((p) => p.id !== user.uid && Array.isArray(p.b5) && canSee(profile, p))
      .filter((p) => (p.status || 'active') === 'active' && !blockedIds.has(p.id))
      .filter((p) => scope === 'all' || (scope === 'college' ? p.college === profile.college : sameArea(profile, p)))
      .filter((p) => !skill || (p.skills || []).includes(skill))
      .filter((p) => !terms.length || terms.every((w) => haystack(p).includes(w)))
      .map((p) => ({ p, s: scoreMatch(profile, p) }))
      .sort((a, b) => b.s.total - a.s.total);
  }, [people, profile, user.uid, scope, skill, blockedIds, terms]);

  async function connect(p) {
    setBusy(p.id);
    try {
      const chatId = await sendRequest(p.id);
      if (chatId) { toast(`Connected with ${p.name.split(' ')[0]}`); navigate(`/chats/${chatId}`); }
      else toast('Request sent. The chat opens when they accept.');
    } catch (e) { console.error(e); toast('Could not send the request. Try again.'); }
    setBusy('');
  }

  async function acceptFrom(p) {
    setBusy(p.id);
    try { const chatId = await accept(p.id); navigate(`/chats/${chatId}`); } catch { toast('Could not accept. Try again.'); }
    setBusy('');
  }

  async function doBlock(p) {
    try { await block(p.id); setWhy(null); toast('Blocked. You won’t see each other anywhere.'); } catch { toast('Could not block. Try again.'); }
  }

  function action(p) {
    const r = relation(p.id);
    if (r === 'connected') return <Link className="btn btn-secondary btn-sm" to={`/chats/${chatWith[p.id].id}`}><Icon name="chat" size={16} />{t('m.openChat')}</Link>;
    if (r === 'sent') return <button className="btn btn-secondary btn-sm" disabled>{t('m.sent')}</button>;
    if (r === 'incoming') return <button className="btn btn-primary btn-sm" disabled={busy === p.id || !active} onClick={() => acceptFrom(p)}>{t('m.accept')}</button>;
    return <button className="btn btn-primary btn-sm" disabled={busy === p.id || !active} onClick={() => connect(p)}>{busy === p.id ? t('m.sending') : t('m.connect')}</button>;
  }

  const first = (profile.name || '').split(' ')[0];

  return (
    <>
      <header className="stack gap-4">
        <h2>{t('m.title', { name: first })}</h2>
        <p className="muted small">{profile.minor ? t('m.safe') : t('m.sorted')}</p>
      </header>

      {!profile.vision && (
        <div className="notice warn"><Icon name="alert" size={18} />
          <div>{t('m.addVision')} <Link to="/onboarding?edit=1">{t('m.addNow')}</Link></div></div>
      )}

      <label className="search">
        <Icon name="search" size={18} />
        <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('m.search')} aria-label={t('m.search')} maxLength={60} enterKeyHint="search" />
      </label>

      <div className="row between">
        <div className="seg" role="group" aria-label="Distance">
          {SCOPES.map(([k, l]) => <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)}>{t(l)}</button>)}
        </div>
        <select className="select auto" aria-label="Filter by skill" value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">{t('m.anySkill')}</option>{SKILLS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </div>

      <div className="seg" role="group" aria-label="View">
        <button aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('m.list')}</button>
        <button aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon name="pin" size={15} /> {t('m.map')}</button>
      </div>

      {error && <div className="notice bad"><Icon name="alert" size={18} /><div>{error}</div></div>}
      {!people && !error && (
        <div className="stack gap-10" aria-busy="true" aria-label={t('m.finding')}>
          {[0, 1, 2].map((i) => (
            <div className="card sk-card" key={i}>
              <div className="row gap-12"><span className="skeleton sk-avatar" /><div className="grow stack gap-8"><span className="skeleton sk-line w60" /><span className="skeleton sk-line w40" /></div></div>
              <span className="skeleton sk-line w80" /><span className="skeleton sk-line w60" />
            </div>
          ))}
        </div>
      )}

      {people && view === 'map' && (
        <Suspense fallback={<div className="card muted">Loading map…</div>}>
          <AreaMap people={people.filter((p) => (p.status || 'active') === 'active' && !blockedIds.has(p.id))} me={profile} />
        </Suspense>
      )}

      {view === 'list' && people && !list.length && (
        <div className="card stack center-text">
          <b>{t('m.none')}</b>
          <p className="muted small">{t('m.noneText')}</p>
        </div>
      )}

      {view === 'list' && list.map(({ p, s }) => (
        <article className="card match" key={p.id}>
          <div className="match-head">
            <Avatar name={p.name} photo={p.photo} />
            <div className="who">
              <div className="row gap-6"><b>{p.name}</b>{p.verified && <span className="tag good"><Icon name="check" size={12} />{t('m.verified')}</span>}<span className="tag">{t(`role.${p.role}`)}</span></div>
              <p className="muted small">{p.college} · {p.area}{s.km !== null && s.km !== undefined && p.college !== profile.college ? ` · ~${Math.max(1, Math.round(s.km))} km` : ''}{p.teamType ? ` · ${p.teamType}` : ''}</p>
            </div>
            <ScoreRing value={s.total} label={t('m.match')} />
          </div>
          {p.vision && <p>“{p.vision}”</p>}
          {!!s.reasons.length && (
            <ul className="reasons">{s.reasons.map((r) => <li key={r}><span className="ok"><Icon name="check" size={16} /></span>{r}</li>)}</ul>
          )}
          <div className="row gap-6">{(p.skills || []).map((k) => <span key={k} className={`tag ${s.newSkills.includes(k) ? 'brand' : ''}`}>{label(k)}</span>)}</div>
          <div className="row between">
            <button className="btn btn-ghost btn-sm" onClick={() => setWhy({ p, s })}>{t('m.why')}</button>
            {action(p)}
          </div>
          <RateMatch person={p} score={s} current={ratings[p.id]} onRated={(id, n) => setRatings((r) => ({ ...r, [id]: n }))} />
        </article>
      ))}

      <p className="tiny muted">Score = {WEIGHTS.vision * 100}% vision + {WEIGHTS.skills * 100}% skill fit + {WEIGHTS.style * 100}% working style + {WEIGHTS.distance * 100}% distance.</p>

      {why && (
        <Sheet title={`Why ${why.p.name.split(' ')[0]} is a ${why.s.total}% match`} onClose={() => setWhy(null)}>
          <div className="bars">
            {[['Vision', why.s.parts.vision], ['Skill fit', why.s.parts.skills], ['Working style', why.s.parts.style, 'gold'], ['Distance', why.s.parts.distance]].map(([l, v, c]) => (
              <div className="bar-row" key={l}><span>{l}</span><div className={`bar ${c || ''}`}><span style={{ width: `${Math.round(v * 100)}%` }} /></div><span className="mono">{Math.round(v * 100)}</span></div>
            ))}
          </div>
          <div className="notice info"><Icon name="spark" size={18} /><div>Skill fit rewards people who bring what you’re missing. Two people with the same skills rarely make a complete team.</div></div>
          <p className="tiny muted">{why.s.visionSource === 'ai'
            ? 'Vision compared by AI: it reads the meaning of both ideas, in English, Hindi or Hinglish.'
            : 'Vision compared by shared words and interests. AI matching starts once both of you have saved a vision.'}</p>
          <div className="row gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => { setReporting(why.p); setWhy(null); }}><Icon name="flag" size={16} />Report</button>
            <button className="btn btn-danger btn-sm" onClick={() => doBlock(why.p)}><Icon name="block" size={16} />Block</button>
          </div>
        </Sheet>
      )}

      {reporting && <ReportSheet target={reporting} onClose={() => setReporting(null)} />}
    </>
  );
}
