import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Icon from './Icon';
import Sheet from './Sheet';

/** Professionals (founders, mentors, people from companies) apply here; an admin verifies them. Adults only. */
export default function ProSection() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [req, setReq] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ company: '', role: '', linkedin: 'https://www.linkedin.com/in/', workEmail: '', note: '' });
  const [error, setError] = useState('');

  useEffect(() => { getDoc(doc(db, 'proRequests', user.uid)).then((s) => setReq(s.exists() ? s.data() : null)).catch(() => setReq(null)); }, [user.uid]);

  if (profile.minor || req === undefined) return null;

  if (profile.pro) {
    return (
      <section className="card row between">
        <div className="min0"><h3>Verified professional</h3><p className="muted small">{profile.proCompany}. You can request access to ideas under NDA and make offers to student teams.</p></div>
        <span className="tag good"><Icon name="briefcase" size={12} />Pro</span>
      </section>
    );
  }

  async function apply() {
    if (f.company.trim().length < 2 || f.role.trim().length < 2) { setError('Add your company and role.'); return; }
    if (!/^https:\/\/(www\.)?linkedin\.com\/in\/[^/\s]+/i.test(f.linkedin.trim())) { setError('Add your LinkedIn profile link (linkedin.com/in/…).'); return; }
    if (!/^\S+@\S+\.\S+$/.test(f.workEmail.trim())) { setError('Add your work email.'); return; }
    const data = {
      name: profile.name, company: f.company.trim().slice(0, 80), role: f.role.trim().slice(0, 80), linkedin: f.linkedin.trim().slice(0, 200),
      workEmail: f.workEmail.trim().toLowerCase().slice(0, 120), note: f.note.trim().slice(0, 300), status: 'pending', at: serverTimestamp(),
    };
    try { await setDoc(doc(db, 'proRequests', user.uid), data); setReq(data); setOpen(false); toast('Application sent. An admin will verify it.'); } catch { setError('Could not send. Try again.'); }
  }

  return (
    <section className="card row between">
      <div className="min0"><h3>Are you a professional?</h3>
        <p className="muted small">{req?.status === 'pending' ? 'Your application is waiting for verification.' : req?.status === 'rejected' ? 'Your last application wasn’t approved. You can apply again with more details.' : 'Founders, mentors and people from companies can get verified to support student ideas.'}</p></div>
      {req?.status !== 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}><Icon name="briefcase" size={16} />Apply</button>}
      {open && (
        <Sheet title="Apply as a professional" onClose={() => setOpen(false)}>
          {[['company', 'Company or organisation'], ['role', 'Your role'], ['linkedin', 'LinkedIn profile'], ['workEmail', 'Work email']].map(([k, l]) => (
            <div className="field" key={k}><label htmlFor={`pro_${k}`}>{l}</label>
              <input className="input" id={`pro_${k}`} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></div>
          ))}
          <div className="field"><label htmlFor="pro_note">How you’d like to help students (optional)</label>
            <textarea className="textarea short" id="pro_note" maxLength={300} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></div>
          <p className="tiny muted">Professionals must follow the NDA on every idea they open. Copying a student’s idea leads to a public ban.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary" onClick={apply}>Send application</button>
        </Sheet>
      )}
    </section>
  );
}
