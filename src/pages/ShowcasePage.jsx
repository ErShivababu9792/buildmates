import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { resumeLine } from '../lib/teams';
import { safeUrl } from '../lib/safeUrl';

export function useShowcase(teamId) {
  const [sc, setSc] = useState(undefined);
  useEffect(() => {
    getDoc(doc(db, 'showcase', teamId))
      .then((s) => setSc(s.exists() ? { id: s.id, ...s.data() } : null))
      .catch(() => setSc(null)); // not allowed = Safe Mode / hidden, treated as not found
  }, [teamId]);
  return sc;
}

export function NotAvailable() {
  return (
    <div className="public">
      <Logo />
      <div className="card stack center-text">
        <b>This project page isn’t available</b>
        <p className="muted small">It may be hidden by the team, or it belongs to a Safe Mode team (only visible inside BuildMates).</p>
        <Link className="btn btn-primary btn-sm self-center" to="/">Go to BuildMates</Link>
      </div>
    </div>
  );
}

/** Public project page: /p/:teamId. Adults' projects can be opened by anyone with the link (good for resumes). */
export default function ShowcasePage() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const sc = useShowcase(teamId);

  if (sc === undefined) return <div className="public"><Logo /><div className="card muted">Loading…</div></div>;
  if (!sc) return <NotAvailable />;

  const mine = user && sc.memberIds?.includes(user.uid);
  const pageUrl = `${window.location.origin}/p/${teamId}`;
  const copy = (text, msg) => navigator.clipboard?.writeText(text).then(() => toast(msg)).catch(() => toast('Could not copy'));

  return (
    <div className="public wide">
      <header className="row between">
        <Logo />
        {user ? <Link className="btn btn-ghost btn-sm" to="/showcase"><Icon name="back" size={18} />Showcase</Link> : <Link className="btn btn-ghost btn-sm" to="/">Join BuildMates</Link>}
      </header>

      <section className="stack gap-8">
        <span className="eyebrow">Built by a student team on BuildMates</span>
        <h1>{sc.title}</h1>
        <p className="muted lead">{sc.tagline}</p>
        <div className="row gap-8">
          {sc.link && <a className="btn btn-primary btn-sm" href={safeUrl(sc.link) || undefined} target="_blank" rel="noopener noreferrer nofollow"><Icon name="link" size={16} />Open the project</a>}
          {sc.repo && <a className="btn btn-secondary btn-sm" href={safeUrl(sc.repo) || undefined} target="_blank" rel="noopener noreferrer nofollow">Code / demo</a>}
          {!sc.minor && <button className="btn btn-ghost btn-sm" onClick={() => copy(pageUrl, 'Link copied')}>Copy link</button>}
        </div>
        {sc.status !== 'live' && <div className="notice warn"><Icon name="eye" size={18} /><div>Hidden. Only the team can see this page right now.</div></div>}
      </section>

      {sc.problem && <section className="card stack gap-6"><h3>The problem</h3><p className="prewrap">{sc.problem}</p></section>}
      <section className="card stack gap-6"><h3>What we built</h3><p className="prewrap">{sc.built}</p>
        {sc.stack?.length > 0 && <div className="row gap-6">{sc.stack.map((s) => <span className="tag" key={s}>{s}</span>)}</div>}</section>

      <section className="card stack gap-8">
        <h3>The team</h3>
        {(sc.memberIds || []).map((m) => (
          <div className="row between" key={m}>
            <span className="small"><b>{sc.members?.[m]?.name || 'Member'}</b>{sc.members?.[m]?.role ? ` · ${sc.members[m].role}` : ''}</span>
            {!sc.minor && <Link className="tiny" to={`/certificate/${teamId}/${m}`}>Certificate</Link>}
          </div>
        ))}
      </section>

      {mine && (
        <section className="card stack gap-8">
          <h3>For your resume</h3>
          <p className="small mono prewrap">{resumeLine(sc, sc.members?.[user.uid]?.role)}</p>
          <div className="row gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => copy(resumeLine(sc, sc.members?.[user.uid]?.role), 'Resume line copied')}>Copy resume line</button>
            <Link className="btn btn-secondary btn-sm" to={`/certificate/${teamId}/${user.uid}`}><Icon name="download" size={16} />My certificate</Link>
          </div>
        </section>
      )}

      <footer className="tiny muted">BuildMates helps students find teammates and build together. Project details are written by the team.</footer>
    </div>
  );
}
