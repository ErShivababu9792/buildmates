import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { buildIdea, COACH_CHECKLIST, COACH_STEPS, feedbackFor } from '../lib/coach';

/** Idea Dost: step-by-step coach that turns a rough thought into a clear idea, then pre-fills "Post an idea". */
export default function IdeaDost() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const step = COACH_STEPS[i];
  const value = answers[step?.id] || '';
  const fb = value.trim() ? feedbackFor(step.id, value) : null;

  if (done) {
    const idea = buildIdea(answers);
    return (
      <>
        <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
        <header className="stack gap-4"><h2>Your idea, made clear</h2><p className="muted small">Here’s what you told Idea Dost, shaped into a pitch and summary.</p></header>
        <div className="card stack">
          <span className="eyebrow">One-line pitch</span><p className="lead">{idea.pitch}</p>
          <span className="eyebrow">Summary</span><p className="prewrap small">{idea.summary}</p>
        </div>
        <div className="card stack gap-8">
          <h3>Before you build, try this</h3>
          {COACH_CHECKLIST.map((c) => <div className="row gap-8 small" key={c}><span className="ok"><Icon name="check" size={16} /></span>{c}</div>)}
        </div>
        <div className="row gap-8">
          <button className="btn btn-secondary" onClick={() => { setDone(false); setI(0); }}>Change answers</button>
          <button className="btn btn-primary grow" onClick={() => navigate('/ideas/new', { state: { pitch: idea.pitch, summary: idea.summary } })}>Post this idea</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Link className="btn btn-ghost btn-sm flush self-start" to="/ideas"><Icon name="back" size={18} />Ideas</Link>
      <header className="stack gap-4">
        <div className="row between"><h2>Idea Dost</h2><span className="tiny muted mono">{i + 1} / {COACH_STEPS.length}</span></div>
        <p className="muted small">Five questions an experienced founder would ask you. There are no wrong answers.</p>
      </header>
      <div className="progress" aria-hidden="true"><span style={{ width: `${(i / COACH_STEPS.length) * 100}%` }} /></div>
      <div className="bubble bot">{step.q}</div>
      <div className="field">
        <label htmlFor="dost">Your answer</label>
        <textarea className="textarea" id="dost" maxLength={400} value={value} placeholder={step.placeholder}
          onChange={(e) => setAnswers((a) => ({ ...a, [step.id]: e.target.value }))} />
      </div>
      {fb && <div className={`notice ${fb.tone === 'good' ? 'info' : 'warn'}`}><Icon name={fb.tone === 'good' ? 'check' : 'spark'} size={18} /><div>{fb.text}</div></div>}
      <div className="row gap-10">
        {i > 0 && <button className="btn btn-secondary" onClick={() => setI(i - 1)}>Back</button>}
        <button className="btn btn-primary grow" disabled={value.trim().length < 5}
          onClick={() => (i < COACH_STEPS.length - 1 ? setI(i + 1) : setDone(true))}>
          {i === COACH_STEPS.length - 1 ? 'See my idea' : 'Next'}
        </button>
      </div>
    </>
  );
}
