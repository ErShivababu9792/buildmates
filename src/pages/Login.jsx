import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink,
  signInWithPopup, signInWithRedirect,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { LanguagePicker, useT } from '../i18n';

const EMAIL_KEY = 'bm_email_for_signin';
const CONSENT_KEY = 'bm_consent_at';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

function friendly(err) {
  const code = err?.code || '';
  if (code.includes('popup-closed')) return 'The Google window was closed. Please try again.';
  if (code.includes('network')) return 'No internet connection. Check your network and try again.';
  if (code.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (code.includes('invalid-action-code') || code.includes('expired')) return 'This sign-in link has expired or was already used. Request a new one.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (code.includes('unauthorized-domain')) return 'This website is not yet allowed in Firebase. Add it under Authentication → Settings → Authorized domains.';
  return 'Something went wrong while signing in. Please try again.';
}

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [needEmailConfirm, setNeedEmailConfirm] = useState(false);

  useEffect(() => { if (user) navigate('/matches', { replace: true }); }, [user, navigate]);

  // Coming back from the email link
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    const saved = store.get(EMAIL_KEY);
    if (!saved) { setNeedEmailConfirm(true); return; }
    finishEmailLink(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishEmailLink(address) {
    setBusy(true); setError('');
    try {
      await signInWithEmailLink(auth, address, window.location.href);
      store.del(EMAIL_KEY);
      if (!store.get(CONSENT_KEY)) store.set(CONSENT_KEY, new Date().toISOString());
      window.history.replaceState(null, '', '/login');
    } catch (e) { setError(friendly(e)); }
    setBusy(false);
  }

  function needConsent() {
    if (consent) { store.set(CONSENT_KEY, new Date().toISOString()); return false; }
    setError(t('login.needConsent'));
    return true;
  }

  async function google() {
    setError('');
    if (needConsent()) return;
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e?.code === 'auth/popup-blocked') await signInWithRedirect(auth, googleProvider);
      else setError(friendly(e));
    }
    setBusy(false);
  }

  async function sendLink(e) {
    e.preventDefault();
    setError('');
    if (needConsent()) return;
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) { setError('Enter a valid email, like name@college.edu.in'); return; }
    setBusy(true);
    try {
      await sendSignInLinkToEmail(auth, address, { url: `${window.location.origin}/login`, handleCodeInApp: true });
      store.set(EMAIL_KEY, address);
      setSentTo(address);
    } catch (err) { setError(friendly(err)); }
    setBusy(false);
  }

  if (needEmailConfirm) {
    return (
      <div className="public">
        <Logo />
        <form className="stack" onSubmit={(e) => { e.preventDefault(); finishEmailLink(email.trim().toLowerCase()); }}>
          <h2>Confirm your email</h2>
          <p className="muted">You opened the link on a different device. Enter the same email to finish signing in.</p>
          <div className="field"><label htmlFor="confirmEmail">Email</label>
            <input className="input" id="confirmEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>Finish signing in</button>
        </form>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="public">
        <Logo />
        <div className="card stack center-text">
          <span className="feature-ic big"><Icon name="mail" size={26} /></span>
          <h2>{t('login.checkTitle')}</h2>
          <p className="muted">{t('login.checkText', { email: sentTo })}</p>
          <button className="btn btn-secondary" onClick={() => setSentTo('')}>{t('login.otherEmail')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="public">
      <div className="row between">
        <Link className="btn btn-ghost btn-sm flush" to="/"><Icon name="back" size={18} />{t('common.back')}</Link>
        <LanguagePicker compact />
      </div>
      <div className="stack gap-8"><h2>{t('login.title')}</h2><p className="muted">{t('login.lead')}</p></div>

      <label className="check">
        <input type="checkbox" id="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t('login.consent')}</span>
      </label>

      <button className="btn btn-google btn-block" onClick={google} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
        {t('login.google')}
      </button>

      <div className="divider">{t('login.or')}</div>

      <form className="stack" onSubmit={sendLink} noValidate>
        <div className="field">
          <label htmlFor="email">{t('login.email')}</label>
          <input className="input" id="email" type="email" placeholder="name@college.edu.in" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <span className="hint">{t('login.emailHint')}</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('login.wait') : t('login.send')}</button>
      </form>
    </div>
  );
}
