import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import { otherMember } from '../lib/ids';
import { scoreMatch } from '../lib/matching';
import { formatMeet } from '../components/SafeMeet';
import { chatUnread, useSeen } from '../lib/notify';
import { useT } from '../i18n';

function timeLabel(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Chats() {
  const { user, profile } = useAuth();
  const { incoming, chats, people, accept, decline, meets } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useT();
  const seen = useSeen(user.uid);
  const [busy, setBusy] = useState('');
  const active = (profile.status || 'active') === 'active';

  async function onAccept(fromId) {
    setBusy(fromId);
    try {
      const chatId = await accept(fromId);
      toast('Connected. Say hi!');
      navigate(`/chats/${chatId}`);
    } catch (e) { console.error(e); toast('Could not accept. Try again.'); }
    setBusy('');
  }

  async function onDecline(fromId) {
    setBusy(fromId);
    try { await decline(fromId); toast('Request hidden. They won’t be told.'); } catch { toast('Could not update. Try again.'); }
    setBusy('');
  }

  return (
    <>
      <header className="stack gap-4"><h2>{t('c.title')}</h2><p className="muted small">{t('c.lead')}</p></header>

      {incoming.length > 0 && (
        <section className="stack gap-10">
          <span className="eyebrow">{t('c.requests')}</span>
          {incoming.map((r) => {
            const p = people[r.from];
            const s = p && !p.gone ? scoreMatch(profile, p) : null;
            return (
              <div className="card row between" key={r.id}>
                <div className="row gap-12 min0">
                  <Avatar name={p?.name || '…'} photo={p?.photo} />
                  <div className="min0"><b>{p?.name || 'Loading…'}</b>
                    <p className="muted small">{s ? `${s.total}% match · ` : ''}{p?.college || ''}</p></div>
                </div>
                <div className="row gap-8">
                  <button className="btn btn-secondary btn-sm" disabled={busy === r.from} onClick={() => onDecline(r.from)}>{t('c.notNow')}</button>
                  <button className="btn btn-primary btn-sm" disabled={busy === r.from || !active} onClick={() => onAccept(r.from)}>{t('c.accept')}</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {(meets || []).filter((m) => ['proposed', 'accepted'].includes(m.status) && (m.when?.toMillis?.() || 0) > Date.now() - 2 * 3600e3).length > 0 && (
        <section className="stack gap-10">
          <span className="eyebrow">{t('c.upcoming')}</span>
          {meets.filter((m) => ['proposed', 'accepted'].includes(m.status) && (m.when?.toMillis?.() || 0) > Date.now() - 2 * 3600e3).map((m) => {
            const p = people[otherMember(m.members, user.uid)];
            return (
              <Link className="card row between list-link" to={`/chats/${m.chatId}`} key={m.id}>
                <div className="min0"><b className="small">{p?.name || '…'} · {m.place}</b><p className="tiny muted">{formatMeet(m.when)}</p></div>
                <span className={`tag ${m.status === 'accepted' ? 'good' : 'gold'}`}>{m.status === 'accepted' ? 'Confirmed' : 'Waiting'}</span>
              </Link>
            );
          })}
        </section>
      )}

      <section className="stack gap-6">
        <span className="eyebrow">{t('c.conversations')}</span>
        {chats === null && <div className="card muted">{t('common.loading')}</div>}
        {chats && chats.length === 0 && (
          <div className="card stack center-text">
            <b>{t('c.none')}</b>
            <p className="muted small">{t('c.noneText')}</p>
            <Link className="btn btn-primary btn-sm" to="/matches">{t('c.seeMatches')}</Link>
          </div>
        )}
        {chats && chats.length > 0 && (
          <div className="card list">
            {chats.map((c) => {
              const other = otherMember(c.members, user.uid);
              const p = people[other];
              const unread = chatUnread(c, user.uid, seen);
              return (
                <Link className="list-item" to={`/chats/${c.id}`} key={c.id}>
                  <Avatar name={p?.name || '…'} photo={p?.photo} />
                  <div className="grow min0">
                    <div className="row between"><b>{p?.name || 'Loading…'}</b><span className="tiny muted">{timeLabel(c.lastAt)}</span></div>
                    <p className={`small ellipsis ${unread ? '' : 'muted'}`}>{c.lastMessage ? `${c.lastFrom === user.uid ? t('c.you') : ''}${c.lastMessage}` : t('c.sayHi')}</p>
                  </div>
                  {unread && <span className="dot" aria-label="New message" />}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
