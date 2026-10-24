import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

export default function NotFound() {
  return (
    <div className="public">
      <Logo />
      <h2>This page doesn’t exist</h2>
      <p className="muted">The link may be old or mistyped.</p>
      <Link className="btn btn-primary" to="/">Go to BuildMates</Link>
    </div>
  );
}
