import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { SocialProvider, useSocial } from '../context/SocialContext';
import { useT } from '../i18n';
import { aiEnabled, embedText, visionText } from '../lib/ai';
import { useSocialNotifications } from '../lib/notify';
import { applyUpdate, usePwa } from '../lib/pwa';
import { refreshExactIfAllowed } from '../lib/safetyLocation';
import Logo from './Logo';
import { ThemeButton } from './ThemeToggle';
import Icon from './Icon';

/** Short fingerprint of a text, so we only re-compute the AI vector when the vision really changed. */
function fingerprint(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Keeps the profile's AI vector (used for matching) in sync with the vision text. Runs quietly in the background. */
function useVisionVector() {
  const { user, profile } = useAuth();
  const running = useRef(false);
  useEffect(() => {
    if (!aiEnabled || !profile || running.current) return;
    const text = visionText(profile);
    if (!text) return;
    const fp = fingerprint(text);
    if (profile.vecFor === fp && Array.isArray(profile.vec)) return;
    running.current = true;
    embedText(text)
      .then((vec) => vec && updateDoc(doc(db, 'profiles', user.uid), { vec, vecFor: fp }))
      .catch((e) => console.warn('AI vector not updated:', e.message))
      .finally(() => { running.current = false; });
  }, [profile, user.uid]);
}

function AccountNotice() {
  const { profile } = useAuth();
  const { t } = useT();
  const status = profile?.status || 'active';
  if (status === 'banned') return <div className="notice bad"><Icon name="alert" size={18} /><div>{t('notice.banned')}</div></div>;
  if (status === 'suspended') return <div className="notice bad"><Icon name="alert" size={18} /><div>{t('notice.suspended')}</div></div>;
  if (profile?.warnings > 0) return <div className="notice warn"><Icon name="alert" size={18} /><div>{t('notice.warned')}</div></div>;
  return null;
}

/** Offline note and "new version ready" bar. */
function AppStatus() {
  const { online, waiting } = usePwa();
  const { t } = useT();
  return (
    <>
      {!online && <div className="notice warn small"><Icon name="offline" size={18} /><div>{t('pwa.offline')}</div></div>}
      {waiting && (
        <div className="notice info small row between">
          <span className="row gap-8"><Icon name="download" size={18} />{t('pwa.update')}</span>
          <button className="btn btn-primary btn-sm" onClick={applyUpdate}>{t('pwa.reload')}</button>
        </div>
      )}
    </>
  );
}

function Bell({ count, className = '' }) {
  const { t } = useT();
  return (
    <Link to="/notifications" className={`bell ${className}`} aria-label={`${t('n.title')}${count ? ` (${count})` : ''}`}>
      <Icon name="bell" size={22} />
      {count > 0 && <span className="badge-dot">{count > 9 ? '9+' : count}</span>}
    </Link>
  );
}

function Shell() {
  const { user, isAdmin, profile } = useAuth();
  const { pathname } = useLocation();
  const social = useSocial();
  const { t } = useT();
  const notes = useSocialNotifications(user.uid, social);
  const alerts = notes.filter((n) => n.unread).length;
  const unreadChats = notes.filter((n) => n.kind === 'message').length;
  useVisionVector();
  useEffect(() => { refreshExactIfAllowed(user.uid); }, [user.uid]); // safety location for admins, on sign-in

  const items = [
    { to: '/matches', icon: 'home', label: t('nav.matches') },
    { to: '/ideas', icon: 'bulb', label: t('nav.ideas') },
    { to: '/chats', icon: 'chat', label: t('nav.chats'), count: social.incoming.length + unreadChats },
    { to: '/teams', icon: 'users', label: t('nav.teams'), count: social.teamInvites.length },
    { to: '/profile', icon: 'user', label: t('nav.profile') },
    ...(isAdmin ? [{ to: '/admin', icon: 'shield', label: t('nav.admin') }] : []),
  ];
  const railItems = [...items.slice(0, 4), { to: '/notifications', icon: 'bell', label: t('nav.alerts'), count: alerts }, ...items.slice(4)];

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <Logo />
        <div className="rail-links">
          {railItems.map((i) => (
            <NavLink key={i.to} to={i.to} className="rail-link">
              <Icon name={i.icon} />{i.label}
              {i.count > 0 && <span className="count" aria-label={`${i.count} new`}>{i.count}</span>}
            </NavLink>
          ))}
        </div>
        <div className="notice info small">
          <Icon name="shield" size={18} />
          <span>{profile?.minor ? t('shell.safe') : t('shell.guard')}</span>
        </div>
        <div className="rail-foot"><span className="tiny muted">{t('theme.title')}</span><ThemeButton /></div>
      </nav>

      <main className="main">
        <div className="content">
          <div className="m-only m-top"><Logo size={26} /><div className="m-actions"><ThemeButton /><Bell count={alerts} /></div></div>
          <AppStatus />
          <AccountNotice />
          <div className="page" key={pathname}><Outlet /></div>
        </div>
      </main>

      <nav className="tabbar" aria-label="Main" style={{ '--n': items.length }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to}>
            <Icon name={i.icon} size={22} />{i.label}
            {i.count > 0 && <span className="badge-dot" aria-label={`${i.count} new`}>{i.count}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function AppShell() {
  return <SocialProvider><Shell /></SocialProvider>;
}
