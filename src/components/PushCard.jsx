import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import { disablePush, enablePush, pushState } from '../lib/push';
import { serverEnabled } from '../lib/server';

const NOTE = {
  unsupported: 'This browser can’t show notifications. On iPhone, first add BuildMates to the Home Screen.',
  'not-setup': 'Phone notifications turn on once the app owner adds the Firebase web-push key.',
  'needs-build': 'Notifications work in the installed / live app (not in “npm run dev”).',
  blocked: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.',
};

/** Turn phone / desktop notifications on or off for THIS device. */
export default function PushCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (state === 'on') { await disablePush(user.uid); setState('off'); toast('Notifications turned off on this device'); }
      else { await enablePush(user.uid); setState('on'); toast('Notifications are on'); }
    } catch (e) {
      console.error(e);
      toast(e.message || 'Could not change notifications. Try again.');
      pushState().then(setState).catch(() => {});
    }
    setBusy(false);
  }

  if (state === 'loading') return null;
  const ready = state === 'on' || state === 'off';

  return (
    <section className="card stack gap-10">
      <div className="row between">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="bell" size={20} /></span>
          <div className="min0"><h3>Phone notifications</h3>
            <p className="muted small">New messages, requests, team invites and Safe Meet plans, even when the app is closed. Message text is never shown in the notification.</p></div></div>
        {ready && (
          <button className={`switch ${state === 'on' ? 'on' : ''}`} role="switch" aria-checked={state === 'on'} aria-label="Phone notifications" disabled={busy} onClick={toggle}>
            <span />
          </button>
        )}
      </div>
      {!ready && <p className="tiny muted">{NOTE[state]}</p>}
      {ready && !serverEnabled && <p className="tiny muted">The BuildMates server isn’t set up, so no notifications will be sent yet.</p>}
    </section>
  );
}
