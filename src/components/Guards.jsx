import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function FullScreenLoader() {
  return (
    <div className="center-screen" aria-busy="true">
      <span className="spinner" aria-label="Loading" />
    </div>
  );
}

/**
 * Sends every user to the right step:
 * not signed in → /login, no account → /onboarding, no quiz → /quiz,
 * minor without parent approval → /waiting-for-parent.
 */
export function RequireReady() {
  const { user, account, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!account?.onboarded || !profile) return <Navigate to="/onboarding" replace />;
  if (account.minor && !account.parentConsent) return <Navigate to="/waiting-for-parent" replace />;
  if (!Array.isArray(profile.b5)) return <Navigate to="/quiz" replace />;
  return <Outlet />;
}

export function RequireUser() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return isAdmin ? <Outlet /> : <Navigate to="/matches" replace />;
}

/** Signed-in users skip the landing and login pages. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/matches" replace /> : <Outlet />;
}
