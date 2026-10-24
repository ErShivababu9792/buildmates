import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { LIST_LABELS, STRINGS } from './strings';
import { ALL, nameIn, nativeName, REVIEWED, RTL, fromBrowser } from './languages';
import { AI_URL } from '../lib/ai';

const KEY = 'bm_lang';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
};
const cacheKey = (l) => `bm_i18n_${l}`;

function initial() {
  const saved = store.get(KEY);
  return saved && ALL.includes(saved) ? saved : fromBrowser();
}

function readCache(l) {
  try { return JSON.parse(store.get(cacheKey(l)) || 'null'); } catch { return null; }
}

const I18n = createContext(null);

/**
 * Text in the chosen language.
 * Reviewed languages come from strings.js. Every other language is loaded from Firestore translations/{lang};
 * if it doesn't exist yet, the BuildMates server translates it once (NLLB-200) and everyone gets it after that.
 */
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initial);
  const [remote, setRemote] = useState(() => (REVIEWED.includes(initial()) ? null : readCache(initial())));
  const [job, setJob] = useState(null); // { status, progress, error }
  const asked = useRef(new Set());

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  // Load the machine translation for non-reviewed languages
  useEffect(() => {
    setJob(null);
    if (REVIEWED.includes(lang)) { setRemote(null); return undefined; }
    setRemote(readCache(lang));
    let alive = true;
    let stop = () => {};

    const keep = (data) => {
      setRemote(data);
      store.set(cacheKey(lang), JSON.stringify({ strings: data.strings, version: data.version }));
    };

    // 2) Not prepared ahead of time: shared copy in Firestore, or ask the server to translate it once
    const subscribe = () => onSnapshot(doc(db, 'translations', lang), (s) => {
      if (s.exists()) keep(s.data());
      if (AI_URL && !asked.current.has(lang)) { // once per session; the server says "ready" at once if nothing changed
        asked.current.add(lang);
        requestTranslation(lang, setJob, Boolean(s.exists()));
      }
    }, () => { /* offline or rules not published: keep the cached copy */ });

    // 1) Instant: translations prepared ahead of time ship with the website (public/i18n/<lang>.json)
    loadStatic(lang).then((data) => {
      if (!alive) return;
      if (data) keep(data);
      else if (db) stop = subscribe();
    });
    return () => { alive = false; stop(); };
  }, [lang]);

  const setLang = useCallback((l) => { if (ALL.includes(l)) { setLangState(l); store.set(KEY, l); } }, []);

  const t = useCallback((key, vars) => {
    let s = STRINGS[lang]?.[key] ?? remote?.strings?.[key] ?? STRINGS.en[key] ?? key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
    return s;
  }, [lang, remote]);

  /** Skill / interest names are stored in English; show them translated. */
  const label = useCallback((value) => LIST_LABELS[lang]?.[value] || remote?.strings?.[`list.${value}`] || value, [lang, remote]);

  const value = useMemo(() => ({
    lang, setLang, t, label, job, machine: !REVIEWED.includes(lang) && lang !== 'en',
  }), [lang, setLang, t, label, job]);

  return (
    <I18n.Provider value={value}>
      {children}
      <TranslatingBar lang={lang} job={job} hasText={Boolean(remote?.strings)} />
    </I18n.Provider>
  );
}

/** public/i18n/<lang>.json if it exists (the dev server answers missing files with the app page, so check it is JSON). */
async function loadStatic(lang) {
  try {
    const res = await fetch(`/i18n/${encodeURIComponent(lang)}.json`, { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const data = await res.json();
    return data && data.strings && typeof data.strings === 'object' ? data : null;
  } catch { return null; }
}

async function requestTranslation(lang, setJob, already) {
  try {
    const res = await fetch(`${AI_URL}/i18n/translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang }),
    });
    let j = await res.json().catch(() => ({}));
    if (!res.ok) { if (!already) setJob({ status: 'error', error: j.detail || 'Translation server error' }); return; }
    if (j.status === 'ready') { setJob(null); return; }
    setJob(j);
    // Poll until done; the Firestore listener then swaps the text in by itself
    for (let i = 0; i < 400 && j.status !== 'ready' && j.status !== 'error'; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      j = await fetch(`${AI_URL}/i18n/status?lang=${encodeURIComponent(lang)}`).then((r) => r.json()).catch(() => j);
      setJob(j);
    }
    if (j.status === 'ready') setTimeout(() => setJob(null), 1500);
  } catch {
    if (!already) setJob({ status: 'error', error: 'The BuildMates server is not reachable, so this language can’t be prepared right now.' });
  }
}

function TranslatingBar({ lang, job, hasText }) {
  if (!job || job.status === 'idle') return null;
  const name = nativeName(lang);
  if (job.status === 'error') {
    return <div className="i18n-bar bad" role="status">{hasText ? '' : `${name}: `}{job.error} Showing English for now.</div>;
  }
  if (job.status === 'ready') return <div className="i18n-bar good" role="status">✓ {name}</div>;
  const pct = Math.round((job.progress || 0) * 100);
  const loading = job.stage === 'loading' || job.stage === 'starting' || (job.status === 'queued');
  return (
    <div className="i18n-bar" role="status">
      <span>{loading
        ? <>Getting {name} ready… <span className="muted">The translation model is starting (the very first time it downloads ~2.5 GB). English is shown meanwhile.</span></>
        : <>Translating BuildMates into {name}… {pct}% <span className="muted">(one time only, then instant for everyone)</span></>}</span>
      <span className="i18n-prog"><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

export const useT = () => useContext(I18n);

/** Language chooser: our 7 languages, each named in its own script by the browser. */
export function LanguagePicker({ compact = false }) {
  const { lang, setLang, t, machine } = useT();
  const id = useId();
  const option = (c) => <option key={c} value={c}>{nativeName(c)}{c !== lang && nameIn(c, lang) !== nativeName(c) ? ` · ${nameIn(c, lang)}` : ''}</option>;
  return (
    <div className={`lang-pick ${compact ? 'compact' : ''}`}>
      <label className="sr-only" htmlFor={id}>{t('common.language')}</label>
      <span aria-hidden="true">🌐</span>
      <select id={id} className="select auto" value={lang} onChange={(e) => setLang(e.target.value)}>
        {ALL.map(option)}
      </select>
      {machine && !compact && <span className="tiny muted">Machine-translated</span>}
    </div>
  );
}
