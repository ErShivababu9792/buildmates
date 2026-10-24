import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import { edgeId } from '../lib/ids';

const LABELS = ['', 'Not at all', 'Probably not', 'Maybe', 'Probably yes', 'Definitely'];

/**
 * Pilot evaluation: "Would you work with this person?" 1–5.
 * Stored with the match score at that moment, so the admin can measure whether higher scores get higher ratings.
 */
export default function RateMatch({ person, score, current, onRated }) {
  const { user } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState(current || 0);
  const [hover, setHover] = useState(0);

  async function rate(n) {
    const prev = value;
    setValue(n);
    try {
      await setDoc(doc(db, 'ratings', edgeId(user.uid, person.id)), {
        by: user.uid, target: person.id, score: n, matchScore: score.total,
        vision: Math.round(score.parts.vision * 100), skills: Math.round(score.parts.skills * 100),
        style: Math.round(score.parts.style * 100), distance: Math.round(score.parts.distance * 100),
        visionSource: score.visionSource || 'keywords', at: serverTimestamp(),
      });
      onRated?.(person.id, n);
      if (!prev) toast('Thanks! This helps us test the matching.');
    } catch {
      setValue(prev);
      toast('Could not save your rating. Try again.');
    }
  }

  const shown = hover || value;
  return (
    <div className="rate">
      <span className="tiny muted">Would you work with {person.name.split(' ')[0]}?</span>
      <div className="stars" role="radiogroup" aria-label="Rate this match from 1 to 5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} – ${LABELS[n]}`}
            className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => rate(n)}>
            <Icon name="star" size={20} />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="tiny muted">{LABELS[shown]}</span>}
    </div>
  );
}
