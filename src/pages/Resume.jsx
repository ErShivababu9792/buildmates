import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import Icon from '../components/Icon';
import { safeUrl } from '../lib/safeUrl';
import {
  EMPTY_RESUME, projectBullets, resumeText, splitLines, splitList, suggestIntro, withDefaults,
} from '../lib/resume';

const urlText = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/* ---------------- the printable resume ---------------- */
function ResumeSheet({ r, data }) {
  const contact = [r.email, r.phone, r.location].filter(Boolean);
  const links = [r.links.linkedin, r.links.github, r.links.portfolio].filter(Boolean);
  const edu = r.education.filter((e) => e.degree || e.school);
  const ach = splitLines(r.achievements);
  const Section = ({ title, children }) => <section className="rs-sec"><h3>{title}</h3>{children}</section>;

  const main = (
    <>
      {r.summary && <Section title="Summary"><p>{r.summary}</p></Section>}
      {data.projects.length > 0 && (
        <Section title="Projects">
          {data.projects.map((p) => (
            <div className="rs-item" key={p.key}>
              <div className="rs-row"><b>{p.title}</b>{p.link && <a href={safeUrl(p.link) || undefined}>{urlText(p.link)}</a>}</div>
              {p.sub && <div className="rs-sub">{p.sub}</div>}
              <ul>{p.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </Section>
      )}
      {r.experience.length > 0 && (
        <Section title="Experience">
          {r.experience.map((e, i) => (
            <div className="rs-item" key={i}>
              <div className="rs-row"><b>{e.title}{e.org ? `, ${e.org}` : ''}</b><span>{e.period}</span></div>
              <ul>{splitLines(e.points).map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
        </Section>
      )}
      {data.activities.length > 0 && <Section title="Activities"><ul>{data.activities.map((a) => <li key={a}>{a}</li>)}</ul></Section>}
    </>
  );
  const side = (
    <>
      {data.skills.length > 0 && <Section title="Skills"><p className="rs-skills">{data.skills.join(' · ')}</p></Section>}
      {edu.length > 0 && (
        <Section title="Education">
          {edu.map((e, i) => (
            <div className="rs-item" key={i}><div className="rs-row"><b>{e.degree}</b><span>{e.years}</span></div><div className="rs-sub">{e.school}{e.score ? ` · ${e.score}` : ''}</div></div>
          ))}
        </Section>
      )}
      {ach.length > 0 && <Section title="Achievements"><ul>{ach.map((a) => <li key={a}>{a}</li>)}</ul></Section>}
      {r.languages && <Section title="Languages"><p>{r.languages}</p></Section>}
    </>
  );

  return (
    <article className={`resume rs-${r.template}`} aria-label="Resume preview">
      <header className="rs-head">
        <h1>{data.name}{data.verified && r.show.verified ? <span className="rs-badge" title="College ID verified on BuildMates">✓ Verified student</span> : null}</h1>
        {r.headline && <p className="rs-headline">{r.headline}</p>}
        {(contact.length > 0 || links.length > 0) && <p className="rs-contact">{[...contact, ...links.map(urlText)].join('  ·  ')}</p>}
      </header>
      {r.template === 'modern'
        ? <div className="rs-cols"><div className="rs-main">{main}</div><aside className="rs-side">{side}</aside></div>
        : <>{main}{side}</>}
    </article>
  );
}

/* ---------------- small form helpers ---------------- */
function ListEditor({ items, onChange, fields, addLabel, blank }) {
  const set = (i, k, v) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  return (
    <div className="stack gap-10">
      {items.map((it, i) => (
        <div className="card flat stack gap-8" key={i}>
          {fields.map(([k, l, ph, area]) => (
            <div className="field" key={k}><label htmlFor={`${k}_${i}`}>{l}</label>
              {area
                ? <textarea className="textarea" id={`${k}_${i}`} maxLength={600} value={it[k] || ''} placeholder={ph} onChange={(e) => set(i, k, e.target.value)} />
                : <input className="input" id={`${k}_${i}`} maxLength={120} value={it[k] || ''} placeholder={ph} onChange={(e) => set(i, k, e.target.value)} />}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => onChange(items.filter((_, j) => j !== i))}><Icon name="trash" size={16} />Remove</button>
        </div>
      ))}
      {items.length < 6 && <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => onChange([...items, { ...blank }])}><Icon name="plus" size={16} />{addLabel}</button>}
    </div>
  );
}

/* ---------------- page ---------------- */
export default function Resume() {
  const { user, profile } = useAuth();
  const { teams } = useSocial();
  const { label } = useT();
  const toast = useToast();
  const [r, setR] = useState(null);
  const [shows, setShows] = useState([]);
  const [circles, setCircles] = useState([]);
  const [view, setView] = useState('edit');
  const [saved, setSaved] = useState(true);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    const minor = Boolean(profile.minor);
    Promise.all([
      getDoc(doc(db, 'resumes', user.uid)).catch(() => null),
      getDocs(query(collection(db, 'showcase'), where('status', '==', 'live'), where('minor', '==', minor), where('memberIds', 'array-contains', user.uid))).catch(() => null),
      getDocs(query(collection(db, 'circles'), where('minor', '==', minor), where('members', 'array-contains', user.uid))).catch(() => null),
    ]).then(([res, sc, ci]) => {
      if (!alive) return;
      const list = (sc?.docs || []).map((d) => ({ id: d.id, ...d.data() }));
      setShows(list);
      setCircles((ci?.docs || []).map((d) => ({ id: d.id, ...d.data() })));
      if (res?.exists()) setR(withDefaults(res.data()));
      else {
        const intro = suggestIntro(profile, list, teams || []);
        setR(withDefaults({ ...EMPTY_RESUME, ...intro, email: user.email || '', location: [profile.area, profile.city || profile.state].filter(Boolean).join(', '),
          education: [{ degree: '', school: profile.college || '', years: '', score: '' }] }));
      }
    });
    return () => { alive = false; };
  }, [user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save a couple of seconds after the last change
  function update(patch) {
    setR((x) => ({ ...x, ...patch }));
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved('now'), 1500);
  }
  useEffect(() => {
    if (saved !== 'now' || !r) return;
    setDoc(doc(db, 'resumes', user.uid), { ...r, updatedAt: serverTimestamp() })
      .then(() => setSaved(true))
      .catch((e) => { console.error(e); setSaved(false); toast('Could not save. Check that the latest rules are published.'); });
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);

  const data = useMemo(() => {
    if (!r) return null;
    const projects = [
      ...shows.filter((s) => !r.hiddenProjects.includes(s.id)).map((s) => ({
        key: s.id, title: s.title, link: !s.minor ? `${window.location.origin}/p/${s.id}` : (s.link || ''),
        sub: `Team project on BuildMates${s.members?.[user.uid]?.role ? ` · ${s.members[user.uid].role}` : ''}`,
        bullets: projectBullets(s, user.uid),
      })),
      ...r.extraProjects.filter((p) => p.title).map((p, i) => ({ key: `x${i}`, title: p.title, link: p.link, sub: p.sub, bullets: splitLines(p.points) })),
    ];
    const activities = [];
    if (r.show.teams) (teams || []).filter((t) => t.status === 'active').forEach((t) => activities.push(`Member of student team “${t.name}” (${t.members.length} people), weekly check-ins and task board`));
    if (r.show.circles) circles.forEach((c) => activities.push(`${c.status === 'ended' ? 'Completed' : 'Taking part in'} learning circle “${c.title}” (${c.weeks} weeks${c.owner === user.uid ? ', organiser' : ''})`));
    const skills = [...new Set([...(profile.skills || []).map(label), ...splitList(r.extraSkills)])].slice(0, 20);
    return { name: profile.name, verified: profile.verified, projects, activities, skills };
  }, [r, shows, circles, teams, profile, user.uid, label]);

  if (!r || !data) return <div className="card muted">Loading your resume…</div>;

  const copyText = () => navigator.clipboard?.writeText(resumeText(r, data)).then(() => toast('Plain-text resume copied')).catch(() => toast('Could not copy'));
  const reIntro = () => update(suggestIntro(profile, shows, teams || []));

  return (
    <>
      <div className="row between no-print">
        <Link className="btn btn-ghost btn-sm flush" to="/profile"><Icon name="back" size={18} />Profile</Link>
        <span className="tiny muted">{saved === true ? 'Saved' : 'Saving…'}</span>
      </div>
      <header className="stack gap-4 no-print"><h2>Resume builder</h2>
        <p className="muted small">Filled from your real work on BuildMates. Your resume is private: only you can see it.</p></header>

      <div className="row between no-print">
        <div className="seg m-seg" role="group" aria-label="View"><button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit</button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button></div>
        <div className="seg" role="group" aria-label="Template">
          {[['classic', 'Classic (ATS)'], ['modern', 'Modern']].map(([k, l]) => <button key={k} aria-pressed={r.template === k} onClick={() => update({ template: k })}>{l}</button>)}
        </div>
      </div>

      <div className={`resume-layout view-${view}`}>
        <div className="resume-edit stack no-print">
          <section className="card stack">
            <div className="row between"><h3>About you</h3><button type="button" className="btn btn-ghost btn-sm" onClick={reIntro}><Icon name="spark" size={16} />Write it for me</button></div>
            <div className="field"><label htmlFor="rs_head">Headline</label><input className="input" id="rs_head" maxLength={100} value={r.headline} onChange={(e) => update({ headline: e.target.value })} placeholder="e.g. Frontend developer · MCA student" /></div>
            <div className="field"><label htmlFor="rs_sum">Summary</label><textarea className="textarea" id="rs_sum" maxLength={500} value={r.summary} onChange={(e) => update({ summary: e.target.value })} /><span className="hint">{r.summary.length}/500 · 2–3 lines is best.</span></div>
          </section>

          <section className="card stack">
            <h3>Contact</h3>
            <div className="grid-2">
              <div className="field"><label htmlFor="rs_mail">Email</label><input className="input" id="rs_mail" type="email" maxLength={100} value={r.email} onChange={(e) => update({ email: e.target.value })} /></div>
              <div className="field"><label htmlFor="rs_ph">Phone <span className="tag">optional</span></label><input className="input" id="rs_ph" inputMode="tel" maxLength={20} value={r.phone} onChange={(e) => update({ phone: e.target.value })} /></div>
            </div>
            <div className="field"><label htmlFor="rs_loc">City</label><input className="input" id="rs_loc" maxLength={60} value={r.location} onChange={(e) => update({ location: e.target.value })} /></div>
            {[['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Portfolio']].map(([k, l]) => (
              <div className="field" key={k}><label htmlFor={`rs_${k}`}>{l} <span className="tag">optional</span></label>
                <input className="input" id={`rs_${k}`} inputMode="url" maxLength={150} value={r.links[k]} placeholder="https://" onChange={(e) => update({ links: { ...r.links, [k]: e.target.value } })} /></div>
            ))}
            <p className="tiny muted">Contact details stay in your private resume. They are never shown on your BuildMates profile.</p>
          </section>

          <section className="card stack">
            <h3>Projects from BuildMates</h3>
            {!shows.length && <p className="muted small">No published projects yet. When your official team publishes in Team → Showcase, it appears here with a proof link.</p>}
            {shows.map((s) => (
              <label className="check" key={s.id}>
                <input type="checkbox" checked={!r.hiddenProjects.includes(s.id)} onChange={(e) => update({ hiddenProjects: e.target.checked ? r.hiddenProjects.filter((x) => x !== s.id) : [...r.hiddenProjects, s.id] })} />
                <span><b>{s.title}</b> · {s.tagline}</span>
              </label>
            ))}
            <h3>Other projects</h3>
            <ListEditor items={r.extraProjects} onChange={(v) => update({ extraProjects: v })} addLabel="Add a project" blank={{ title: '', sub: '', link: '', points: '' }}
              fields={[['title', 'Project name', 'e.g. College fest website'], ['sub', 'One line', 'e.g. Ticket booking site for our college fest'], ['link', 'Link', 'https://'], ['points', 'What you did (one point per line)', 'Built product pages in React\nDeployed on Vercel', true]]} />
          </section>

          <section className="card stack">
            <h3>Experience <span className="tag">optional</span></h3>
            <ListEditor items={r.experience} onChange={(v) => update({ experience: v })} addLabel="Add experience" blank={{ title: '', org: '', period: '', points: '' }}
              fields={[['title', 'Role', 'e.g. Social media intern'], ['org', 'Where', 'e.g. Local café'], ['period', 'When', 'e.g. 2024 – now'], ['points', 'What you did (one per line)', 'Grew Instagram followers from 200 to 1,500 in 3 months', true]]} />
          </section>

          <section className="card stack">
            <h3>Education</h3>
            <ListEditor items={r.education} onChange={(v) => update({ education: v })} addLabel="Add education" blank={{ degree: '', school: '', years: '', score: '' }}
              fields={[['degree', 'Degree', 'e.g. MCA'], ['school', 'College / board', 'e.g. ABC College, Bengaluru'], ['years', 'Years', 'e.g. 2025 – 2027'], ['score', 'Score', 'e.g. CGPA 7.3']]} />
          </section>

          <section className="card stack">
            <h3>Skills, achievements, languages</h3>
            <p className="tiny muted">From your profile: {(profile.skills || []).map(label).join(', ') || 'none yet'}</p>
            <div className="field"><label htmlFor="rs_sk">More skills (comma separated)</label><input className="input" id="rs_sk" maxLength={300} value={r.extraSkills} onChange={(e) => update({ extraSkills: e.target.value })} placeholder="React, Python, Figma, Excel" /></div>
            <div className="field"><label htmlFor="rs_ach">Achievements (one per line)</label><textarea className="textarea" id="rs_ach" maxLength={800} value={r.achievements} onChange={(e) => update({ achievements: e.target.value })} placeholder="2nd place, inter-college hackathon 2026" /></div>
            <div className="field"><label htmlFor="rs_lang">Languages</label><input className="input" id="rs_lang" maxLength={100} value={r.languages} onChange={(e) => update({ languages: e.target.value })} placeholder="English, Hindi, Kannada" /></div>
            <label className="check"><input type="checkbox" checked={r.show.teams} onChange={(e) => update({ show: { ...r.show, teams: e.target.checked } })} /><span>Show my official teams</span></label>
            <label className="check"><input type="checkbox" checked={r.show.circles} onChange={(e) => update({ show: { ...r.show, circles: e.target.checked } })} /><span>Show my learning circles</span></label>
            {profile.verified && <label className="check"><input type="checkbox" checked={r.show.verified} onChange={(e) => update({ show: { ...r.show, verified: e.target.checked } })} /><span>Show “Verified student” badge</span></label>}
          </section>
        </div>

        <div className="resume-preview stack">
          <div className="row gap-8 no-print">
            <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Icon name="download" size={16} />Download PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={copyText}>Copy as text</button>
          </div>
          <ResumeSheet r={r} data={data} />
          <p className="tiny muted no-print">In the print window choose “Save as PDF”, paper A4, and turn on “Background graphics” for the Modern template.</p>
        </div>
      </div>
    </>
  );
}
