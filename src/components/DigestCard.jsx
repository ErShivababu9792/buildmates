import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import Sheet from './Sheet';
import { digestPreview, serverEnabled } from '../lib/server';

/** Weekly email on/off (off by default: we only email people who ask for it). */
export default function DigestCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => onSnapshot(doc(db, 'settings', user.uid), (s) => setOn(Boolean(s.data()?.digest)), () => setOn(false)), [user.uid]);

  async function toggle() {
    setBusy(true);
    try {
      await setDoc(doc(db, 'settings', user.uid), { digest: !on, updatedAt: serverTimestamp() }, { merge: true });
      toast(!on ? 'Weekly email is on. It comes once a week, only when there’s something new.' : 'Weekly email turned off');
    } catch { toast('Could not update. Check that the latest rules are published.'); }
    setBusy(false);
  }

  async function showPreview() {
    setPreview({ html: '' });
    try { setPreview(await digestPreview()); } catch (e) { setPreview({ error: e.message }); }
  }

  if (on === null) return null;
  return (
    <section className="card stack gap-10">
      <div className="row between">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="mail" size={20} /></span>
          <div className="min0"><h3>Weekly email</h3><p className="muted small">Once a week: roles that need your skills, events, circles and your team’s update. No spam, unsubscribe any time.</p></div></div>
        <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="Weekly email" disabled={busy} onClick={toggle}><span /></button>
      </div>
      {serverEnabled && <button className="btn btn-ghost btn-sm self-start" onClick={showPreview}><Icon name="eye" size={16} />Preview this week’s email</button>}
      {preview && (
        <Sheet title={preview.subject || 'This week’s email'} onClose={() => setPreview(null)}>
          {preview.error ? <div className="notice bad"><Icon name="alert" size={18} /><div>{preview.error}</div></div>
            : preview.html ? <iframe className="mail-frame" title="Email preview" sandbox="" srcDoc={preview.html} />
              : <p className="muted small">Loading…</p>}
        </Sheet>
      )}
    </section>
  );
}
