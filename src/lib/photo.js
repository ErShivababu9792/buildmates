/**
 * Profile photos are stored on Cloudinary (free tier) using an "unsigned upload preset",
 * so no secret key lives in the app. Firestore only keeps the image URL.
 */
const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD || '';
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET || '';

export const photoEnabled = Boolean(CLOUD && PRESET);
export const MAX_INPUT_MB = 8;

/** Shrinks the picked image to a square JPEG (default 512 px), cropping from the centre. */
export function squareJpeg(file, size = 512) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) { reject(new Error(`Please choose an image under ${MAX_INPUT_MB} MB.`)); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this image.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
    img.src = url;
  });
}

/** Uploads the image and returns its https URL on res.cloudinary.com. */
export async function uploadPhoto(blob, uid) {
  if (!photoEnabled) throw new Error('Photo upload is not set up yet.');
  const body = new FormData();
  body.append('file', blob, 'photo.jpg');
  body.append('upload_preset', PRESET);
  body.append('folder', 'buildmates/profiles');
  body.append('tags', `uid_${uid}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: 'POST', body });
  if (!res.ok) throw new Error('Upload failed. Check your internet and try again.');
  const data = await res.json();
  if (!data.secure_url?.startsWith('https://res.cloudinary.com/')) throw new Error('Upload failed.');
  return data.secure_url;
}

/** Smaller copy for lists (Cloudinary resizes on the fly). */
export function thumb(url, px = 96) {
  if (!url || !url.includes('/image/upload/')) return url || '';
  return url.replace('/image/upload/', `/image/upload/c_fill,w_${px},h_${px},q_auto,f_auto/`);
}

/** Shrinks a photo (e.g. an ID card) so its longest side is at most `maxSide` px, keeping the shape. */
export function fitJpeg(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Please choose a photo (JPG or PNG).')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('Please choose a photo under 15 MB.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this photo.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this photo.')); };
    img.src = url;
  });
}
