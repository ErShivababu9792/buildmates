import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Sheet from './Sheet';
import Icon from './Icon';
import { OFFER_KINDS } from '../lib/launchpad';

/** A verified professional offers to mentor, co-build or (non-binding) buy. Path: ideas/{id} or products/{id}. */
export default function OfferSheet({ parent, title, onClose }) {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState('mentor');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    const a = parseInt(min, 10) || 0; const b = parseInt(max, 10) || 0;
    if (kind === 'buy' && (!a || !b || b < a)) { setError('Enter a range, like 20000 to 50000.'); return; }
    if (note.trim().length < 10) { setError('Write a short note about what you’re offering.'); return; }
    setBusy(true); setError('');
    try {
      await setDoc(doc(db, parent, 'offers', user.uid), {
        name: profile.name, company: profile.proCompany || '', kind,
        amountMin: kind === 'buy' ? a : 0, amountMax: kind === 'buy' ? b : 0, note: note.trim().slice(0, 500), at: serverTimestamp(),
      });
      toast('Offer sent. The student is advised to take a few days to decide.');
      onClose();
    } catch (e) { console.error(e); setError('Could not send the offer. Only verified professionals can make offers.'); }
    setBusy(false);
  }

  return (
    <Sheet title={`Make an offer · ${title}`} onClose={onClose}>
      <div className="stack gap-8">{OFFER_KINDS.map((k) => (
        <button type="button" key={k.id} className={`choice ${kind === k.id ? 'on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}><b>{k.label}</b><span className="muted small">{k.text}</span></button>
      ))}</div>
      {kind === 'buy' && (
        <div className="row gap-10">
          <div className="field grow"><label htmlFor="o_min">From (₹)</label><input className="input" id="o_min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} /></div>
          <div className="field grow"><label htmlFor="o_max">To (₹)</label><input className="input" id="o_max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} /></div>
        </div>
      )}
      <div className="field"><label htmlFor="o_note">Note to the student</label>
        <textarea className="textarea short" id="o_note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who you are, what you’d bring, what you expect" /></div>
      <div className="notice warn"><Icon name="alert" size={18} /><div>Offers are not contracts. Never ask a student to sign or decide the same day.</div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send offer'}</button>
    </Sheet>
  );
}
