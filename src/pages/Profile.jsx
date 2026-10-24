import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import PhotoPicker from '../components/PhotoPicker';
import FeedbackSheet from '../components/FeedbackSheet';
import BadgesCard from '../components/BadgesCard';
import ProSection from '../components/ProSection';
import VerifyCard from '../components/VerifyCard';
import PushCard from '../components/PushCard';
import DigestCard from '../components/DigestCard';
import { disablePush } from '../lib/push';
import Icon from '../components/Icon';
import { VISIBILITY } from '../lib/constants';
import { teamType } from '../lib/personality';
import { LanguagePicker, useT } from '../i18n';
import { ThemePicker } from '../components/ThemeToggle';
import { isIos, isStandalone, promptInstall, usePwa } from '../lib/pwa';
import { photoEnabled } from '../lib/photo';

/** "Install the app" card: real button on Android/desktop Chrome, steps on iPhone, hidden once installed. */
function InstallCard() {
  const { t } = useT();
  const { installEvent, installed } = usePwa();
  if (installed || isStandalone()) return null;
  if (!installEvent && !isIos()) return null;
  return (
    <section className="card row between">
      <div className="row gap-12 min0"><span className="feature-ic"><Icon name="phone" size={20} /></span>
        <div className="min0"><h3>{t('p.install')}</h3><p className="muted small">{installEvent ? t('p.installText') : 'iPhone: tap Share, then “Add to Home Screen”.'}</p></div></div>
      {installEvent && <button className="btn btn-primary btn-sm" onClick={promptInstall}><Icon name="download" size={16} />{t('p.installBtn')}</button>}
    </section>
  );
}

export default function Profile() {
  const { user, profile, account, isAdmin, logout } = useAuth();
  const { blockedByMe, people, unblock } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, label } = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tt = teamType(profile.b5);

  // Stop phone notifications for this device before signing out, so the next person doesn't get yours
  async function signOut() {
    await disablePush(user.uid).catch(() => {});
    await logout();
  }

  async function changeVisibility(value) {
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { visibility: value, updatedAt: serverTimestamp() });
      toast('Visibility updated');
    } catch { toast('Could not update. Try again.'); }
  }

  async function removeAccount() {
    setBusy(true); setError('');
    try {
      const current = auth.currentUser;
      const isGoogle = current.providerData.some((p) => p.providerId === 'google.com');
      // Google users confirm their identity first, so the login can always be removed at the end
      if (isGoogle) await reauthenticateWithPopup(current, googleProvider);
      // Data first (needs to be signed in), then the login itself
      await deleteDoc(doc(db, 'profiles', user.uid));
      await deleteDoc(doc(db, 'locations', user.uid)).catch(() => {});
      await deleteDoc(doc(db, 'users', user.uid));
      try {
        await deleteUser(current);
      } catch (e) {
        if (e?.code !== 'auth/requires-recent-login') throw e;
        await logout();
        toast('Your data is deleted. Sign in once more and delete again to remove the login too.');
      }
      navigate('/', { replace: true });
    } catch (e) {
      console.error(e);
      setError('Could not delete your account. Please try again.');
    }
    setBusy(false);
  }

  return (
    <>
      <header className="stack gap-4"><h2>{t('p.title')}</h2><p className="muted small">{t('p.lead')}</p></header>

      <section className="card stack">
        <div className="row gap-14">
          <PhotoPicker size={64} />
          <div className="grow min0">
            <div className="row gap-6">
              <h3>{profile.name}</h3>
              {profile.verified ? <span className="tag good"><Icon name="check" size={12} />{t('m.verified')}</span> : <span className="tag warn">{t('p.notVerified')}</span>}
              {profile.minor && <span className="tag gold"><Icon name="shield" size={12} />Safe Mode</span>}
              {isAdmin && <span className="tag brand">Admin</span>}
            </div>
            <p className="muted small">{profile.college} · {profile.area} · {t(`role.${profile.role}`)}</p>
          </div>
        </div>
        {tt && <div className="notice info"><Icon name="users" size={18} /><div><b>{tt.name}.</b> {tt.text}</div></div>}
        <div className="stack gap-6"><span className="eyebrow">{t('p.vision')}</span><p>{profile.vision || <span className="muted">{t('p.notAdded')}</span>}</p></div>
        <div className="stack gap-6"><span className="eyebrow">{t('p.skills')}</span><div className="row gap-6">{(profile.skills || []).map((s) => <span key={s} className="tag brand">{label(s)}</span>)}</div></div>
        <div className="stack gap-6"><span className="eyebrow">{t('p.interests')}</span><div className="row gap-6">{(profile.interests || []).map((s) => <span key={s} className="tag">{label(s)}</span>)}</div></div>
        <div className="row gap-8">
          <Link className="btn btn-secondary btn-sm" to="/onboarding?edit=1">{t('p.edit')}</Link>
          <Link className="btn btn-secondary btn-sm" to="/quiz">{t('p.retake')}</Link>
        </div>
        {profile.minor && <p className="tiny muted">In Safe Mode your picture stays as initials, for your safety.</p>}
        {!profile.minor && !photoEnabled && <p className="tiny muted">Profile photos turn on once the app owner adds Cloudinary to the settings.</p>}
      </section>

      <section className="card row between">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="globe" size={20} /></span><h3>{t('common.language')}</h3></div>
        <LanguagePicker compact />
      </section>

      <section className="card row between">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="moon" size={20} /></span>
          <div className="min0"><h3>{t('theme.title')}</h3><p className="tiny muted">{t('theme.hint')}</p></div></div>
        <ThemePicker />
      </section>

      <section className="card row between">
        <div className="row gap-12 min0"><span className="feature-ic"><Icon name="briefcase" size={20} /></span>
          <div className="min0"><h3>Resume builder</h3><p className="muted small">A resume filled from your real projects and teams, with proof links. Download as PDF.</p></div></div>
        <Link className="btn btn-primary btn-sm" to="/resume">Build my resume</Link>
      </section>

      <VerifyCard />
      <PushCard />
      <DigestCard />
      <InstallCard />

      <BadgesCard />
      <ProSection />

      <section className="card row between">
        <div className="min0"><h3>{t('p.improve')}</h3><p className="muted small">{t('p.improveText')}</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => setFeedback(true)}>{t('p.feedback')}</button>
      </section>
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}

      <section className="card stack">
        <h3>{t('p.privacy')}</h3>
        <div className="field"><label htmlFor="vis">{t('p.findMe')}</label>
          <select className="select" id="vis" value={profile.visibility || 'area'} onChange={(e) => changeVisibility(e.target.value)}>
            {VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select></div>
        <div className="stack gap-8">
          <b className="small">{t('p.blocked')}</b>
          {blockedByMe.length === 0 && <p className="muted tiny">{t('p.noBlocked')}</p>}
          {blockedByMe.map((b) => (
            <div className="row between" key={b.id}>
              <span className="small">{people[b.target]?.name || '…'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => unblock(b.target).then(() => toast('Unblocked')).catch(() => toast('Could not unblock. Try again.'))}>{t('p.unblock')}</button>
            </div>
          ))}
        </div>
        <div className="row between">
          <div><b className="small">{t('p.signedIn')}</b><p className="muted tiny">{user.email || 'Google account'}{account?.minor ? ' · parent approved' : ''}</p></div>
          <button className="btn btn-secondary btn-sm" onClick={signOut}><Icon name="logout" size={16} />{t('p.signOut')}</button>
        </div>
        <div className="row between">
          <div><b className="small">{t('p.delete')}</b><p className="muted tiny">{t('p.deleteText')}</p></div>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>{t('p.deleteBtn')}</button>
        </div>
        {confirmDelete && (
          <div className="notice bad"><Icon name="alert" size={18} />
            <div className="stack gap-10">
              <div><b>Delete your account?</b> Your profile and answers are removed right away. This can’t be undone.</div>
              {error && <p className="error">{error}</p>}
              <div className="row gap-8">
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep my account</button>
                <button className="btn btn-danger btn-sm" onClick={removeAccount} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
