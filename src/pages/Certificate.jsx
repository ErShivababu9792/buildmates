import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { NotAvailable, useShowcase } from './ShowcasePage';

/**
 * Printable certificate: /certificate/:teamId/:uid → "Download PDF" uses the browser's Save as PDF.
 * Anyone with the link can check it is real, because it is read live from the published project.
 */
export default function Certificate() {
  const { teamId, uid } = useParams();
  const { user } = useAuth();
  const sc = useShowcase(teamId);

  if (sc === undefined) return <div className="public"><Logo /><div className="card muted">Loading…</div></div>;
  if (!sc || !sc.memberIds?.includes(uid)) return <NotAvailable />;

  const person = sc.members?.[uid] || {};
  const date = (sc.publishedAt?.toDate?.() || new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const others = (sc.memberIds || []).filter((m) => m !== uid).map((m) => sc.members?.[m]?.name).filter(Boolean);
  const certId = `BM-${teamId.slice(0, 6).toUpperCase()}-${uid.slice(0, 4).toUpperCase()}`;

  return (
    <div className="cert-page">
      <div className="row between no-print cert-bar">
        <Link className="btn btn-ghost btn-sm" to={`/p/${teamId}`}><Icon name="back" size={18} />Project</Link>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Icon name="download" size={16} />Download PDF</button>
      </div>

      <article className="cert">
        <div className="cert-top"><Logo size={30} /><span className="tiny muted mono">{certId}</span></div>
        <p className="eyebrow">Certificate of project work</p>
        <p className="muted">This is to certify that</p>
        <h1 className="cert-name">{person.name || 'Team member'}</h1>
        <p className="cert-text">
          worked {person.role ? <>as <b>{person.role}</b> </> : null}on <b>{sc.title}</b>
          {sc.tagline ? <> — {sc.tagline}</> : null}
        </p>
        <p className="cert-text muted">
          as part of the team <b>{sc.teamName}</b>{others.length ? <> with {others.join(', ')}</> : null}, formed and managed on BuildMates.
        </p>
        {sc.stack?.length > 0 && <p className="small muted">Built with {sc.stack.join(', ')}</p>}
        <div className="cert-foot">
          <div><b>{date}</b><p className="tiny muted">Published</p></div>
          <div className="right"><b>BuildMates</b><p className="tiny muted">Verify: {window.location.origin}/certificate/{teamId}/{uid}</p></div>
        </div>
      </article>

      {user?.uid === uid && <p className="tiny muted no-print center-text">Tip: in the print window choose “Save as PDF” and turn on “Background graphics”.</p>}
    </div>
  );
}
