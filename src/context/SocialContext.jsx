import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { edgeId, otherMember, pairId } from '../lib/ids';
import { notifyPush } from '../lib/server';

const SocialContext = createContext(null);
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

/**
 * Live connection requests, chats and blocks for the signed-in user,
 * plus a small cache of other people's public profiles.
 */
export function SocialProvider({ children }) {
  const { user } = useAuth();
  const uid = user.uid;
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [blockedByMe, setBlockedByMe] = useState([]);
  const [blockedMe, setBlockedMe] = useState([]);
  const [chats, setChats] = useState(null);
  const [people, setPeople] = useState({});
  const [teams, setTeams] = useState(null);
  const [teamInvites, setTeamInvites] = useState([]);
  const [meets, setMeets] = useState([]);
  const asked = useRef(new Set());

  useEffect(() => {
    const listen = (q, set) => onSnapshot(q, (s) => set(docs(s)), (e) => console.error(e));
    const stops = [
      listen(query(collection(db, 'requests'), where('to', '==', uid)), setIncoming),
      listen(query(collection(db, 'requests'), where('from', '==', uid)), setOutgoing),
      listen(query(collection(db, 'blocks'), where('by', '==', uid)), setBlockedByMe),
      listen(query(collection(db, 'blocks'), where('target', '==', uid)), setBlockedMe),
      listen(query(collection(db, 'chats'), where('members', 'array-contains', uid)), (list) => {
        list.sort((a, b) => (b.lastAt?.toMillis?.() || 0) - (a.lastAt?.toMillis?.() || 0));
        setChats(list);
      }),
      listen(query(collection(db, 'teams'), where('members', 'array-contains', uid)), (list) => {
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setTeams(list);
      }),
      listen(query(collection(db, 'teamInvites'), where('uid', '==', uid)), setTeamInvites),
      listen(query(collection(db, 'meets'), where('members', 'array-contains', uid)), (list) => {
        list.sort((a, b) => (a.when?.toMillis?.() || 0) - (b.when?.toMillis?.() || 0));
        setMeets(list);
      }),
    ];
    return () => stops.forEach((s) => s());
  }, [uid]);

  /** Load public profiles we don't have yet (names for chats and requests). */
  const needPeople = useCallback((ids) => {
    ids.filter((id) => id && !asked.current.has(id)).forEach((id) => {
      asked.current.add(id);
      getDoc(doc(db, 'profiles', id))
        .then((s) => setPeople((p) => ({ ...p, [id]: s.exists() ? { id, ...s.data() } : { id, name: 'Deleted account', gone: true } })))
        .catch(() => setPeople((p) => ({ ...p, [id]: { id, name: 'Unavailable', gone: true } })));
    });
  }, []);

  useEffect(() => {
    needPeople([
      ...incoming.map((r) => r.from),
      ...outgoing.map((r) => r.to),
      ...(chats || []).map((c) => otherMember(c.members, uid)),
      ...blockedByMe.map((b) => b.target),
      ...(teams || []).flatMap((t) => t.members),
      ...teamInvites.map((i) => i.from),
    ]);
  }, [incoming, outgoing, chats, blockedByMe, teams, teamInvites, uid, needPeople]);

  const blockedIds = useMemo(
    () => new Set([...blockedByMe.map((b) => b.target), ...blockedMe.map((b) => b.by)]),
    [blockedByMe, blockedMe],
  );
  const chatWith = useMemo(() => {
    const m = {};
    (chats || []).forEach((c) => { m[otherMember(c.members, uid)] = c; });
    return m;
  }, [chats, uid]);

  /** 'blocked' | 'connected' | 'incoming' | 'sent' | 'none' */
  const relation = useCallback((otherId) => {
    if (blockedIds.has(otherId)) return 'blocked';
    if (chatWith[otherId]) return 'connected';
    if (incoming.some((r) => r.from === otherId && r.status === 'pending')) return 'incoming';
    if (outgoing.some((r) => r.to === otherId)) return 'sent'; // declined also shows as "sent": nobody is told they were declined
    return 'none';
  }, [blockedIds, chatWith, incoming, outgoing]);

  const accept = useCallback(async (fromId) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'requests', edgeId(fromId, uid)), { status: 'accepted', respondedAt: serverTimestamp() });
    if (!chatWith[fromId]) {
      const members = [uid, fromId].sort();
      batch.set(doc(db, 'chats', pairId(uid, fromId)), {
        members, createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastMessage: '', lastFrom: '',
      });
    }
    await batch.commit();
    return pairId(uid, fromId);
  }, [uid, chatWith]);

  const sendRequest = useCallback(async (toId) => {
    // They already asked us → accepting is the same as connecting
    if (incoming.some((r) => r.from === toId && r.status === 'pending')) return accept(toId);
    await setDoc(doc(db, 'requests', edgeId(uid, toId)), {
      from: uid, to: toId, status: 'pending', createdAt: serverTimestamp(),
    });
    notifyPush('request', toId);
    return null;
  }, [uid, incoming, accept]);

  const decline = useCallback((fromId) => (
    writeBatch(db).update(doc(db, 'requests', edgeId(fromId, uid)), { status: 'declined', respondedAt: serverTimestamp() }).commit()
  ), [uid]);

  const block = useCallback((otherId) => setDoc(doc(db, 'blocks', edgeId(uid, otherId)), {
    by: uid, target: otherId, at: serverTimestamp(),
  }), [uid]);

  const unblock = useCallback((otherId) => deleteDoc(doc(db, 'blocks', edgeId(uid, otherId))), [uid]);

  const value = useMemo(() => ({
    incoming: incoming.filter((r) => r.status === 'pending' && !blockedIds.has(r.from)),
    chats: chats && chats.filter((c) => !blockedIds.has(otherMember(c.members, uid))),
    blockedByMe, people, blockedIds, chatWith, teams, teamInvites, meets,
    relation, sendRequest, accept, decline, block, unblock, needPeople,
  }), [incoming, chats, blockedByMe, people, blockedIds, chatWith, teams, teamInvites, meets, uid, relation, sendRequest, accept, decline, block, unblock, needPeople]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export const useSocial = () => useContext(SocialContext);
