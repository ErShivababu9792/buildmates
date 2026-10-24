import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// True when the .env file has been filled in. The app shows a setup screen otherwise.
export const isConfigured = Boolean(config.apiKey && config.projectId && config.appId);

export const app = isConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
// Offline cache: the app keeps working on weak mobile internet and syncs later.
export const db = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (auth) setPersistence(auth, browserLocalPersistence).catch(() => {});
