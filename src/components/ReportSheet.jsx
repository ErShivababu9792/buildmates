import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from './Toast';
import Sheet from './Sheet';
import { REPORT_REASONS } from '../lib/guard';

/**
 * Report a person. When opened from a chat, their last few messages are attached
 * so admins can judge it without reading the whole private conversation.
 */
export default function ReportSheet({ target, chatId = '', ideaId = '', excerpt = [], onClose }) {
  const { user, profile } = useAuth();
  const { block } = useSocial();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!reason) { setError('Pick a reason.'); return; }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'reports'), {
        by: user.uid, byName: profile.name, target: target.id, targetName: target.name || '',
        reason, note: note.trim().slice(0, 500), excerpt: excerpt.slice(-5), chatId, ideaId, auto: false,
        status: 'Open', at: serverTimestamp(),
      });
      if (alsoBlock) await block(target.id);
      toast('Report sent to the BuildMates team');
      onClose();
    } catch (e) {
      console.error(e);
      setError('Could not send the report. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <Sheet title={`Report ${target.name || 'this person'}`} onClose={onClose}>
      <div className="chips" role="radiogroup" aria-label="Reason">
        {REPORT_REASONS.map((r) => (
          <button type="button" key={r} className="chip" role="radio" aria-checked={reason === r} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
        ))}
      </div>
      <div className="field"><label htmlFor="repNote">What happened (optional)</label>
        <textarea className="textarea" id="repNote" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <label className="check"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /><span>Also block them, so you won’t see each other anywhere</span></label>
      {excerpt.length > 0 && <p className="tiny muted">Their last {Math.min(5, excerpt.length)} messages will be attached for the admin team. Nothing else from your chat is shared.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
      <p className="tiny muted">{target.name || 'They'} won’t know who reported them.</p>
    </Sheet>
  );
}
