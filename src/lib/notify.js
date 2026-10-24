import { useMemo, useSyncExternalStore } from 'react';
import { otherMember } from './ids';

/**
 * "Seen" markers for notifications, kept on this device only.
 * - all:   when the person last pressed "Mark all as read"
 * - chats: { chatId: time the chat was last opened }
 */
const EVENT = 'bm-seen';
const key = (uid) => `bm_seen_${uid}`;
const EMPTY = { all: 0, chats: {} };
const cache = {};

function load(uid) {
  try {
    const raw = localStorage.getItem(key(uid));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? { all: Number(v.all) || 0, chats: v.chats || {} } : EMPTY;
  } catch { return EMPTY; }
}

function save(uid, v) {
  cache[uid] = v;
  try { localStorage.setItem(key(uid), JSON.stringify(v)); } catch { /* storage blocked: keep in memory */ }
  window.dispatchEvent(new Event(EVENT));
}

export function getSeen(uid) {
  if (!cache[uid]) cache[uid] = load(uid);
  return cache[uid];
}

export function markAllSeen(uid) { save(uid, { ...getSeen(uid), all: Date.now() }); }

export function markChatSeen(uid, chatId) {
  const s = getSeen(uid);
  save(uid, { ...s, chats: { ...s.chats, [chatId]: Date.now() } });
}

function subscribe(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
}

export function useSeen(uid) {
  return useSyncExternalStore(subscribe, () => getSeen(uid), () => EMPTY);
}

const ms = (ts) => ts?.toMillis?.() || 0;

/** True when the last chat message came from the other person after we last looked. */
export function chatUnread(chat, uid, seen) {
  if (!chat.lastFrom || chat.lastFrom === uid) return false;
  return ms(chat.lastAt) > Math.max(seen.all, seen.chats[chat.id] || 0);
}

/**
 * Builds the live notification list from what SocialContext already listens to (no extra reads).
 * Each item: { id, kind, at, to, vars, unread }
 */
export function useSocialNotifications(uid, social) {
  const seen = useSeen(uid);
  const { incoming, teamInvites, meets, chats, people } = social;
  return useMemo(() => {
    const now = Date.now();
    const out = [];
    incoming.forEach((r) => out.push({
      id: `r_${r.id}`, kind: 'request', icon: 'user', at: ms(r.createdAt), to: '/chats',
      vars: { name: people[r.from]?.name || '…' }, unread: true, // stays until accepted or hidden
    }));
    teamInvites.forEach((i) => out.push({
      id: `t_${i.id}`, kind: 'invite', icon: 'users', at: ms(i.at), to: '/teams',
      vars: { name: i.fromName || people[i.from]?.name || '…', team: i.teamName || '' }, unread: true,
    }));
    (meets || []).forEach((m) => {
      const when = ms(m.when);
      const other = people[otherMember(m.members, uid)]?.name || '…';
      if (m.status === 'proposed' && m.proposer !== uid && when > now) {
        out.push({ id: `m_${m.id}`, kind: 'meet', icon: 'pin', at: ms(m.createdAt), to: `/chats/${m.chatId}`, vars: { name: other, place: m.place }, unread: true });
      } else if (m.status === 'accepted' && new Date(when).toDateString() === new Date(now).toDateString() && when > now - 2 * 3600e3) {
        out.push({ id: `mt_${m.id}`, kind: 'meetToday', icon: 'clock', at: when, to: `/chats/${m.chatId}`, vars: { place: m.place }, unread: true });
      }
    });
    (chats || []).forEach((c) => {
      if (!chatUnread(c, uid, seen)) return;
      out.push({ id: `c_${c.id}`, kind: 'message', icon: 'chat', at: ms(c.lastAt), to: `/chats/${c.id}`, vars: { name: people[otherMember(c.members, uid)]?.name || '…' }, unread: true, preview: c.lastMessage });
    });
    return out.sort((a, b) => b.at - a.at);
  }, [incoming, teamInvites, meets, chats, people, uid, seen]);
}
