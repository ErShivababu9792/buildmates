import { useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { useToast } from './Toast';
import Avatar from './Avatar';
import Icon from './Icon';
import { photoEnabled, squareJpeg, uploadPhoto } from '../lib/photo';

/**
 * Profile photo with "Add / Change / Remove".
 * Under-18 accounts keep initials only (Safe Mode), and the database rules enforce that too.
 */
export default function PhotoPicker({ size = 64 }) {
  const { user, profile } = useAuth();
  const { t } = useT();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const canUse = photoEnabled && !profile.minor;

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const blob = await squareJpeg(file);
      const url = await uploadPhoto(blob, user.uid);
      await updateDoc(doc(db, 'profiles', user.uid), { photo: url, updatedAt: serverTimestamp() });
      toast('Photo updated');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not upload. Try again.');
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try { await updateDoc(doc(db, 'profiles', user.uid), { photo: '', updatedAt: serverTimestamp() }); toast('Photo removed'); } catch { toast('Could not update. Try again.'); }
    setBusy(false);
  }

  return (
    <div className="photo-pick">
      <button type="button" className="photo-btn" onClick={() => canUse && input.current?.click()} disabled={!canUse || busy}
        aria-label={profile.photo ? t('p.photo') : t('p.addPhoto')}>
        <Avatar name={profile.name} photo={profile.photo} size={size} />
        {canUse && <span className="photo-cam">{busy ? <span className="spinner sm" /> : <Icon name="camera" size={14} />}</span>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      {canUse && profile.photo && <button type="button" className="link-btn tiny" onClick={remove} disabled={busy}>{t('p.removePhoto')}</button>}
    </div>
  );
}
