import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { FullScreenLoader } from '../components/Guards';
import { useT } from '../i18n';
import { sendParentEmail, serverEnabled } from '../lib/server';

const WAIT_S = 120;

export default function WaitingForParent() {
  const { account, loading, logout } = useAuth();
  const { t } = useT();
  const [status, setStatus] = useState({ tone: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const autoSent = useRef(false);

  const lastSent = account?.parentMailAt?.toMillis?.() || 0;

  // Count down until "Send again" is allowed
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((lastSent + WAIT_S * 1000 - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSent]);

  async function send() {
    setBusy(true);
    try {
      const r = await sendParentEmail();
      if (r.sent) setStatus({ tone: 'good', text: `Email sent to ${r.to}. Ask your parent to check their inbox (and Spam).` });
    } catch (e) {
      setStatus({ tone: 'bad', text: e.message });
    }
    setBusy(false);
  }

  // First visit: send the email automatically once
  useEffect(() => {
    if (!account || autoSent.current || !serverEnabled) return;
    if (account.minor && !account.parentConsent && !account.parentDeclined && !account.parentMailAt) {
      autoSent.current = true;
      send();
    }
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <FullScreenLoader />;
  if (!account?.minor || account.parentConsent) return <Navigate to="/matches" replace />;

  return (
    <div className="public">
      <Logo />
      <div className="card stack center-text">
        <span className="feature-ic big"><Icon name="shield" size={26} /></span>
        <h2>{t('waiting.title')}</h2>
        <p className="muted">{t('waiting.text', { email: account.parentEmail })}</p>
        <p className="tiny muted">{t('waiting.hidden')}</p>

        {account.parentDeclined && (
          <div className="notice warn"><Icon name="alert" size={18} /><div>Your parent chose not to approve the account for now. Talk to them, then send the email again if they agree.</div></div>
        )}
        {status.text && <div className={`notice ${status.tone === 'good' ? 'info' : 'bad'}`}><Icon name={status.tone === 'good' ? 'mail' : 'alert'} size={18} /><div>{status.text}</div></div>}
        {!status.text && lastSent > 0 && <p className="small muted">Last email sent {new Date(lastSent).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}

        {serverEnabled ? (
          <button className="btn btn-primary" disabled={busy || left > 0} onClick={send}>
            <Icon name="mail" size={18} />{busy ? 'Sending…' : left > 0 ? `Send again in ${left}s` : lastSent ? 'Send the email again' : 'Email my parent'}
          </button>
        ) : (
          <p className="tiny muted">Approval emails aren’t set up yet. Ask your teacher or the BuildMates team to approve your account.</p>
        )}
        <button className="btn btn-secondary" onClick={logout}>{t('p.signOut')}</button>
      </div>
    </div>
  );
}
