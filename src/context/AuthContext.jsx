import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

/**
 * Keeps the signed-in user, their private account doc (users/{uid})
 * and their public profile doc (profiles/{uid}) in sync in real time.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [account, setAccount] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);

  useEffect(() => {
    if (!user) {
      setAccount(user === null ? null : undefined);
      setProfile(user === null ? null : undefined);
      setIsAdmin(false);
      return undefined;
    }
    let lockChecked = false;
    const stopAccount = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setAccount(snap.exists() ? snap.data() : null);
        // Accounts made before the age lock existed: write it once (the rules only accept the same birthday)
        if (snap.exists() && snap.data().dob && !lockChecked) {
          lockChecked = true;
          getDoc(doc(db, 'ageLocks', user.uid))
            .then((l) => (l.exists() ? null : setDoc(doc(db, 'ageLocks', user.uid), { dob: snap.data().dob, at: serverTimestamp() })))
            .catch(() => {});
        }
      },
      () => setAccount(null),
    );
    const stopProfile = onSnapshot(
      doc(db, 'profiles', user.uid),
      (snap) => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setProfile(null),
    );
    getDoc(doc(db, 'admins', user.uid))
      .then((snap) => setIsAdmin(snap.exists()))
      .catch(() => setIsAdmin(false));
    return () => { stopAccount(); stopProfile(); };
  }, [user]);

  const value = useMemo(() => ({
    user,
    account,
    profile,
    isAdmin,
    loading: user === undefined || (user && (account === undefined || profile === undefined)),
    logout: () => signOut(auth),
  }), [user, account, profile, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
