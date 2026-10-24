import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import { fitJpeg } from '../lib/photo';
import { serverEnabled, uploadIdCard } from '../lib/server';

/**
 * "Get verified": the student uploads a photo of their college ID card.
 * Only an admin sees it (through the server, never as a public link) and it is deleted right after the decision.
 */
export default function VerifyCard() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const input = useRef(null);
  const [req, setReq] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile.verified) return undefined;
    return onSnapshot(doc(db, 'idRequests', user.uid), (s) => setReq(s.exists() ? s.data() : null), () => setReq(null));
  }, [user.uid, profile.verified]);

  if (profile.verified) return null;

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const blob = await fitJpeg(file);
      await uploadIdCard(blob);
      toast('ID sent. You’ll get the Verified badge after it’s checked.');
    } catch (err) {
      setError(err.message || 'Could not upload. Try again.');
    }
    setBusy(false);
  }

  const pending = req?.status === 'pending';
  const rejected = req?.status === 'rejected';

  return (
    <section className="card stack">
      <div className="row gap-12">
        <span className="feature-ic"><Icon name="shield" size={20} /></span>
        <div className="min0"><h3>Get the Verified badge</h3>
          <p className="muted small">Verified students get more replies. Upload a clear photo of your college ID card.</p></div>
      </div>

      {pending && <div className="notice info"><Icon name="clock" size={18} /><div><b>Being checked.</b> The BuildMates team will look at it soon. Your badge appears here automatically.</div></div>}
      {rejected && <div className="notice warn"><Icon name="alert" size={18} /><div><b>Not approved{req.reason ? `: ${req.reason}` : ''}.</b> You can upload a clearer photo.</div></div>}

      <ul className="tiny muted plain-list">
        <li><Icon name="lock" size={13} /> Only the admin team sees it. It is never shown on your profile.</li>
        <li><Icon name="trash" size={13} /> The photo is deleted as soon as it has been checked.</li>
        <li><Icon name="eye" size={13} /> Your name and college must be readable. You may cover your ID number.</li>
      </ul>

      {error && <p className="error" role="alert">{error}</p>}
      {!serverEnabled
        ? <p className="tiny muted">ID upload needs the BuildMates server. Ask the app owner to set it up.</p>
        : (
          <button className="btn btn-primary btn-sm self-start" disabled={busy || pending} onClick={() => input.current?.click()}>
            <Icon name="camera" size={16} />{busy ? 'Uploading…' : pending ? 'Sent for checking' : rejected ? 'Upload again' : 'Upload college ID'}
          </button>
        )}
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </section>
  );
}
