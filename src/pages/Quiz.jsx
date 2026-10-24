import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { FullScreenLoader } from '../components/Guards';
import { scoreTipi, teamType, TIPI_ITEMS, TRAIT_LABELS } from '../lib/personality';
import { useT } from '../i18n';

export default function Quiz() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useT();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState(Array(TIPI_ITEMS.length).fill(0));
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/onboarding" replace />;

  const answer = answers[i];
  const choose = (n) => setAnswers((a) => a.map((v, k) => (k === i ? n : v)));

  async function finish() {
    const b5 = scoreTipi(answers);
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { b5, teamType: teamType(b5).name, updatedAt: serverTimestamp() });
      setResult(b5);
    } catch (e) {
      console.error(e);
      setError('Could not save your answers. Check your connection and try again.');
    }
    setSaving(false);
  }

  if (result) {
    const tt = teamType(result);
    return (
      <div className="public">
        <Logo />
        <span className="eyebrow">{t('quiz.type')}</span>
        <h1>{tt.name}</h1>
        <p className="muted lead">{tt.text}</p>
        <div className="card">
          <div className="bars">
            {TRAIT_LABELS.map((l, k) => (
              <div className="bar-row" key={l}>
                <span>{t(`trait.${k}`) || l}</span>
                <div className="bar"><span style={{ width: `${((result[k] - 1) / 6) * 100}%` }} /></div>
                <span className="mono">{result[k].toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/matches', { replace: true })}>{t('quiz.seeMatches')}</button>
      </div>
    );
  }

  return (
    <div className="public">
      <div className="row between"><Logo /><span className="tiny muted mono">{i + 1} / {TIPI_ITEMS.length}</span></div>
      <div className="progress" aria-hidden="true"><span style={{ width: `${(i / TIPI_ITEMS.length) * 100}%` }} /></div>
      <div className="stack gap-6">
        <span className="eyebrow">{t('quiz.eyebrow')}</span>
        <h2>{t('quiz.title')}</h2>
        <p className="muted small">{t('quiz.lead')}</p>
      </div>
      <div className="card raised stack">
        <p className="quiz-q">{t(`tipi.${i}`)}</p>
        <div className="scale" role="radiogroup" aria-label="How much do you agree, 1 to 7">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={answer === n} onClick={() => choose(n)}>{n}</button>
          ))}
        </div>
        <div className="scale-labels"><span>{t('quiz.low')}</span><span>{t('quiz.high')}</span></div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row gap-10">
        {i > 0 && <button type="button" className="btn btn-secondary" onClick={() => setI(i - 1)}>{t('common.back')}</button>}
        <button type="button" className="btn btn-primary grow" disabled={!answer || saving}
          onClick={() => (i < TIPI_ITEMS.length - 1 ? setI(i + 1) : finish())}>
          {saving ? t('common.saving') : i === TIPI_ITEMS.length - 1 ? t('quiz.result') : t('common.next')}
        </button>
      </div>
    </div>
  );
}
