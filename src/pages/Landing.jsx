import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { LanguagePicker, useT } from '../i18n';
import { ThemeButton } from '../components/ThemeToggle';

const FEATURES = [['spark', 'f1'], ['shield', 'f2'], ['lock', 'f3']];

/**
 * The signature moment: three students with different skills arrive, connect, and lock into one team,
 * the same "blocks resting on each other" idea as the logo. Plays once, then gently breathes.
 */
function Assembly() {
  const { t, label } = useT();
  const [phase, setPhase] = useState('play');
  useEffect(() => { const id = setTimeout(() => setPhase('settled'), 2800); return () => clearTimeout(id); }, []);
  return (
    <div className={`stage ${phase}`} role="img" aria-label={`${label('Coding')}, ${label('Design')} and ${label('Marketing')} join into one team: ${t('hero.ready')}`}>
      <svg className="links" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true">
        <path d="M30 22 C 52 26, 60 36, 70 42" />
        <path d="M70 46 C 60 58, 46 62, 32 64" />
        <path d="M32 68 C 40 74, 46 76, 50 79" />
      </svg>
      <div className="blk a" aria-hidden="true"><span className="av">AK</span><span>{label('Coding')}<small>{t('hero.code')}</small></span></div>
      <div className="blk b" aria-hidden="true"><span className="av">RS</span><span>{label('Design')}<small>{t('hero.design')}</small></span></div>
      <div className="blk c" aria-hidden="true"><span className="av">MJ</span><span>{label('Marketing')}<small>{t('hero.market')}</small></span></div>
      <div className="team" aria-hidden="true">
        <span className="stack-ic"><i /><i /><i /></span>
        <span><b>{t('hero.ready')}</b><small>{t('hero.fit', { n: 92 })}</small></span>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useT();
  return (
    <div className="public landing">
      <header className="row between">
        <Logo />
        <div className="row gap-4"><LanguagePicker compact /><ThemeButton /><Link className="btn btn-ghost btn-sm" to="/login">{t('landing.signin')}</Link></div>
      </header>

      <section className="l-hero">
        <div className="l-copy">
          <span className="eyebrow">{t('landing.eyebrow')}</span>
          <h1>{t('landing.title')}</h1>
          <p className="lead">{t('landing.lead')}</p>
          <div className="l-actions">
            <Link className="btn btn-primary" to="/login">{t('landing.cta')}</Link>
            <span className="l-note">{t('landing.note')}</span>
          </div>
        </div>
        <Assembly />
      </section>

      <section className="l-section" aria-labelledby="how">
        <h2 id="how">{t('how.title')}</h2>
        <ol className="how">
          {[1, 2, 3].map((n) => <li key={n}><b>{t(`how.${n}.t`)}</b><p className="muted small">{t(`how.${n}.d`)}</p></li>)}
        </ol>
      </section>

      <section className="l-section" aria-labelledby="feats">
        <h2 id="feats">{t('feat.title')}</h2>
        <div className="feats">
          {FEATURES.map(([icon, k]) => (
            <div className="feature" key={k}>
              <span className="feature-ic"><Icon name={icon} /></span>
              <div className="stack gap-4"><b>{t(`landing.${k}.t`)}</b><p className="muted small">{t(`landing.${k}.d`)}</p></div>
            </div>
          ))}
        </div>
      </section>

      <footer className="l-foot">
        <Logo size={24} />
        <span className="tiny muted">{t('landing.footer')}</span>
      </footer>
    </div>
  );
}
