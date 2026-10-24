import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { FullScreenLoader } from '../components/Guards';
import { ADULT_AGE, INTERESTS, MAX_PICKS, MIN_AGE, ROLES, SKILLS } from '../lib/constants';
import LocationPicker from '../components/LocationPicker';
import { ageOn, dobToDate } from '../lib/age';
import { LanguagePicker, useT } from '../i18n';

const ALL_STEPS = ['name', 'dob', 'place', 'role', 'skills', 'interests', 'vision'];

export default function Onboarding() {
  const { user, account, profile, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { t, label } = useT();
  const editing = params.get('edit') === '1' && Boolean(account?.onboarded);
  const steps = useMemo(() => (editing ? ALL_STEPS.filter((s) => s !== 'dob') : ALL_STEPS), [editing]);

  const [i, setI] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', dob: '', parentEmail: '', college: '', area: '', city: '', state: '', pincode: '', geo: null,
    role: '', skills: [], interests: [], vision: '',
  });

  // Prefill from the existing profile when editing
  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        name: profile.name || '', college: profile.college || '', area: profile.area || '',
        city: profile.city || '', state: profile.state || '', pincode: profile.pincode || '', geo: profile.geo || null,
        role: profile.role || '', skills: profile.skills || [], interests: profile.interests || [], vision: profile.vision || '',
      }));
    } else if (user?.displayName) {
      setForm((f) => ({ ...f, name: f.name || user.displayName }));
    }
  }, [profile, user]);

  // Already onboarded and not editing → nothing to do here
  useEffect(() => {
    if (!loading && account?.onboarded && profile && !editing) navigate('/matches', { replace: true });
  }, [loading, account, profile, editing, navigate]);

  if (loading) return <FullScreenLoader />;

  const step = steps[i];
  const age = ageOn(form.dob);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, v) => setForm((f) => {
    const list = f[k];
    if (list.includes(v)) return { ...f, [k]: list.filter((x) => x !== v) };
    if (list.length >= MAX_PICKS) { toast(`Pick up to ${MAX_PICKS}`); return f; }
    return { ...f, [k]: [...list, v] };
  });

  function validate() {
    switch (step) {
      case 'name': {
        const n = form.name.trim();
        if (n.length < 2 || n.length > 50) return 'Please enter your name (2 to 50 letters).';
        return '';
      }
      case 'dob':
        if (age === null) return 'Please enter your date of birth.';
        if (age < MIN_AGE) return `BuildMates is for ages ${MIN_AGE} and up.`;
        if (age > 100) return 'Please check your date of birth.';
        if (age < ADULT_AGE && !/^\S+@\S+\.\S+$/.test(form.parentEmail.trim())) return 'Enter a parent’s email so they can approve your account.';
        if (age < ADULT_AGE && form.parentEmail.trim().toLowerCase() === (user.email || '').toLowerCase()) return 'Please use your parent’s email, not your own.';
        return '';
      case 'place':
        if (form.area.trim().length < 2) return 'Allow location so we can find your area.';
        if (form.college.trim().length < 3) return 'Type your college or school name.';
        return '';
      case 'role': return form.role ? '' : 'Pick one option.';
      case 'skills': return form.skills.length ? '' : 'Pick at least one skill.';
      case 'interests': return form.interests.length ? '' : 'Pick at least one interest.';
      case 'vision': return form.vision.length > 500 ? 'Please keep it under 500 characters.' : '';
      default: return '';
    }
  }

  async function next() {
    const msg = validate();
    setError(msg);
    if (msg) return;
    if (i < steps.length - 1) { setI(i + 1); return; }
    await save();
  }

  async function save() {
    setSaving(true);
    const publicData = {
      name: form.name.trim(), college: form.college.trim().slice(0, 80), area: form.area.trim().slice(0, 60),
      city: (form.city || '').trim().slice(0, 60), state: (form.state || '').trim().slice(0, 60),
      pincode: /^[1-9][0-9]{5}$/.test(form.pincode || '') ? form.pincode : '', geo: form.geo || null,
      role: form.role,
      skills: form.skills, interests: form.interests, vision: form.vision.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      if (editing) {
        batch.update(doc(db, 'profiles', user.uid), publicData);
      } else {
        const minor = age < ADULT_AGE;
        const dob = Timestamp.fromDate(dobToDate(form.dob));
        // A login keeps its first birthday forever, so the age group can't be switched by re-creating the account
        const lock = await getDoc(doc(db, 'ageLocks', user.uid)).catch(() => null);
        if (lock?.exists()) {
          if (lock.data().dob.toMillis() !== dob.toMillis()) {
            setError('This login was registered with a different date of birth. It can’t be changed. Ask a BuildMates admin if it was a mistake.');
            setSaving(false);
            return;
          }
        } else {
          batch.set(doc(db, 'ageLocks', user.uid), { dob, at: serverTimestamp() });
        }
        batch.set(doc(db, 'users', user.uid), {
          email: user.email || '',
          dob,
          minor,
          parentEmail: minor ? form.parentEmail.trim().toLowerCase() : '',
          parentConsent: !minor,
          consentAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          onboarded: true,
        });
        batch.set(doc(db, 'profiles', user.uid), {
          ...publicData, minor, verified: false, visibility: 'area', b5: null, teamType: '', createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      toast(editing ? 'Profile updated' : 'Profile created');
      navigate(editing ? '/profile' : '/quiz', { replace: true });
    } catch (e) {
      console.error(e);
      setError('Could not save. Check your internet connection and try again.');
    }
    setSaving(false);
  }

  return (
    <div className="public">
      <div className="row between"><Logo /><span className="tiny muted mono">{i + 1} / {steps.length}</span></div>
      {i === 0 && <LanguagePicker compact />}
      <div className="progress" aria-hidden="true"><span style={{ width: `${(i / steps.length) * 100}%` }} /></div>

      <div className="stack gap-10">
        {i === 0 && !editing && <div className="bubble bot">{t('ob.hello')}</div>}
        <div className="bubble bot" key={step}>{t(`ob.q.${step}`)}</div>
      </div>

      <div className="stack">
        {step === 'name' && (
          <div className="field"><label htmlFor="f_name">{t('ob.name')}</label>
            <input className="input" id="f_name" value={form.name} maxLength={50} autoComplete="name"
              onChange={(e) => set('name', e.target.value)} placeholder="e.g. Shivanand" /></div>
        )}

        {step === 'dob' && (
          <>
            <div className="field"><label htmlFor="f_dob">{t('ob.dob')}</label>
              <input className="input" id="f_dob" type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('dob', e.target.value)} />
              <span className="hint">{t('ob.dobHint')}</span></div>
            {age !== null && age >= MIN_AGE && age < ADULT_AGE && (
              <>
                <div className="notice warn"><Icon name="shield" size={18} />
                  <div>{t('ob.minor', { age })}</div></div>
                <div className="field"><label htmlFor="f_parent">{t('ob.parent')}</label>
                  <input className="input" id="f_parent" type="email" value={form.parentEmail}
                    onChange={(e) => set('parentEmail', e.target.value)} placeholder="parent@email.com" /></div>
              </>
            )}
            {age !== null && age >= ADULT_AGE && (
              <div className="notice info"><Icon name="check" size={18} /><div>{t('ob.adult', { age })}</div></div>
            )}
          </>
        )}

        {step === 'place' && (
          <LocationPicker value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        )}

        {step === 'role' && (
          <div className="stack gap-10">
            {ROLES.map((r) => (
              <button type="button" key={r.id} className={`choice ${form.role === r.id ? 'on' : ''}`}
                aria-pressed={form.role === r.id} onClick={() => set('role', r.id)}>
                <b>{t(`role.${r.id}`)}</b><span className="muted small">{t(`role.${r.id}.d`)}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'skills' && (
          <div className="chips">{SKILLS.map((s) => (
            <button type="button" key={s} className="chip" aria-pressed={form.skills.includes(s)} onClick={() => toggle('skills', s)}>{label(s)}</button>
          ))}</div>
        )}

        {step === 'interests' && (
          <div className="chips">{INTERESTS.map((s) => (
            <button type="button" key={s} className="chip" aria-pressed={form.interests.includes(s)} onClick={() => toggle('interests', s)}>{label(s)}</button>
          ))}</div>
        )}

        {step === 'vision' && (
          <div className="field"><label htmlFor="f_vision">{t('ob.vision')}</label>
            <textarea className="textarea" id="f_vision" maxLength={500} value={form.vision}
              onChange={(e) => set('vision', e.target.value)}
              placeholder="e.g. Ek app jo first-year students ko seniors ke notes aur study groups se jode" />
            <span className="hint">{t('ob.visionHint', { n: form.vision.length })}</span></div>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="row gap-10">
        {i > 0 && <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setI(i - 1); }}>{t('common.back')}</button>}
        {i === 0 && editing && <button type="button" className="btn btn-secondary" onClick={() => navigate('/profile')}>{t('common.cancel')}</button>}
        <button type="button" className="btn btn-primary grow" onClick={next} disabled={saving}>
          {saving ? t('common.saving') : i === steps.length - 1 ? (editing ? t('ob.saveChanges') : form.vision ? t('common.continue') : t('ob.skip')) : t('common.continue')}
        </button>
      </div>
    </div>
  );
}
