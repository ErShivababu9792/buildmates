import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Sheet from './Sheet';

export const FEEDBACK_QUESTIONS = [
  { id: 'easy', text: 'BuildMates was easy to use' },
  { id: 'useful', text: 'My matches made sense for my idea' },
  { id: 'safe', text: 'I felt safe chatting here' },
  { id: 'recommend', text: 'I would recommend it to a friend' },
];

/** Short pilot survey (1 = disagree, 5 = agree). One answer per student, can be updated. */
export default function FeedbackSheet({ onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'feedback', user.uid)).then((s) => {
      if (s.exists()) {
        const d = s.data();
        setAnswers(Object.fromEntries(FEEDBACK_QUESTIONS.map((q) => [q.id, d[q.id]])));
        setComment(d.comment || '');
      }
    }).catch(() => {});
  }, [user.uid]);

  async function save() {
    if (FEEDBACK_QUESTIONS.some((q) => !answers[q.id])) { setError('Please answer all four questions.'); return; }
    setBusy(true); setError('');
    try {
      await setDoc(doc(db, 'feedback', user.uid), { ...answers, comment: comment.trim().slice(0, 500), at: serverTimestamp() });
      toast('Thank you for your feedback!');
      onClose();
    } catch { setError('Could not save. Try again.'); }
    setBusy(false);
  }

  return (
    <Sheet title="Tell us what you think" onClose={onClose}>
      <p className="muted small">1 = strongly disagree, 5 = strongly agree. Takes 30 seconds.</p>
      {FEEDBACK_QUESTIONS.map((q) => (
        <div className="stack gap-6" key={q.id}>
          <span className="small"><b>{q.text}</b></span>
          <div className="scale five" role="radiogroup" aria-label={q.text}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={answers[q.id] === n}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="field"><label htmlFor="fbComment">Anything we should improve? (optional)</label>
        <textarea className="textarea" id="fbComment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Send feedback'}</button>
    </Sheet>
  );
}
