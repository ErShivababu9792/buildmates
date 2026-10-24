import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import ReportSheet from '../components/ReportSheet';
import { MeetCard, SafeMeetSheet } from '../components/SafeMeet';
import { checkMessage, ICE_BREAKERS } from '../lib/guard';
import { evalTrail, SPLIT_MSG } from '../lib/digits';
import { otherMember } from '../lib/ids';
import { aiEnabled, guardRemote } from '../lib/ai';
import { markChatSeen } from '../lib/notify';
import { notifyPush } from '../lib/server';
import { useT } from '../i18n';

const MAX_LEN = 1000;
const STRIKE_LIMIT = 3;
const FIRST_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ChatThread() {
  const { chatId } = useParams();
  const { user, profile } = useAuth();
  const { chats, people, block, blockedIds, meets } = useSocial();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useT();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [guardNote, setGuardNote] = useState(null);
  const [strikes, setStrikes] = useState(0);
  const [sending, setSending] = useState(false);
  const [aiDown, setAiDown] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [trailDoc, setTrailDoc] = useState(null); // my digit trail in this chat, kept live so sending never waits for it
  const endRef = useRef(null);

  const chat = chats?.find((c) => c.id === chatId);
  const otherId = chat ? otherMember(chat.members, user.uid) : null;
  const other = otherId ? people[otherId] : null;
  const active = (profile.status || 'active') === 'active';

  useEffect(() => {
    if (!chat) return undefined;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('at'), limitToLast(200));
    return onSnapshot(q, (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      (e) => { console.error(e); setMessages([]); });
  }, [chatId, Boolean(chat)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chat) return undefined;
    return onSnapshot(doc(db, 'chats', chatId, 'trail', user.uid), (s) => setTrailDoc(s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null), () => setTrailDoc(null));
  }, [chatId, user.uid, Boolean(chat)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  // Opening the chat (and every new message while it is open) clears its notification
  useEffect(() => { if (chat) markChatSeen(user.uid, chatId); }, [chatId, user.uid, chat?.lastAt?.toMillis?.()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (chats === null) return <div className="card muted">Loading…</div>;
  if (!chat || blockedIds.has(otherId)) {
    return (
      <div className="card stack center-text">
        <b>This chat isn’t available</b>
        <p className="muted small">It may have been closed or one of you blocked the other.</p>
        <Link className="btn btn-primary btn-sm" to="/chats">Back to chats</Link>
      </div>
    );
  }

  async function logGuard(kind) {
    await addDoc(collection(db, 'guardEvents'), { by: user.uid, kind, chatId, at: serverTimestamp() }).catch(() => {});
  }

  async function send(e) {
    e.preventDefault();
    const body = text.trim().slice(0, MAX_LEN);
    if (!body || sending) return;
    setSending(true);
    // 1) instant built-in rules, 2) trained Hinglish model on the AI API (skipped if it is slow or down)
    let g = checkMessage(body);
    if (g.level === 'ok' && aiEnabled) {
      const remote = await guardRemote(body);
      setAiDown(remote === null);
      if (remote && remote.level !== 'ok') g = { level: remote.level, kind: remote.kind, msg: remote.msg };
    }

    // A number sent in pieces over several messages (first 7 days, same as the database rule). No network wait.
    const firstWeek = Date.now() < (chat.createdAt?.toMillis?.() ?? Date.now()) + FIRST_WEEK_MS;
    const trailPath = ['chats', chatId, 'trail', user.uid];
    const trail = g.level !== 'block' && firstWeek ? evalTrail(trailDoc, body) : { blocked: false, trail: null };
    if (trail.blocked) g = { level: 'block', kind: 'Contact sharing', msg: SPLIT_MSG };

    if (g.level === 'block') {
      setSending(false);
      const n = strikes + 1;
      setStrikes(n);
      setGuardNote({ tone: 'bad', title: `Not sent · ${g.kind}`, text: g.msg + (n >= STRIKE_LIMIT ? ' Repeated attempts are shared with the admin team.' : '') });
      logGuard(g.kind);
      if (n === STRIKE_LIMIT) {
        addDoc(collection(db, 'reports'), {
          by: user.uid, byName: profile.name, target: user.uid, targetName: profile.name,
          reason: `AI Guard: ${STRIKE_LIMIT} blocked messages`, note: `Last blocked: ${g.kind}`, excerpt: [],
          chatId, auto: true, status: 'Open', at: serverTimestamp(),
        }).catch(() => {});
      }
      return;
    }

    const commit = (digits) => {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'chats', chatId, 'messages')), { from: user.uid, text: body, at: serverTimestamp() });
      batch.update(doc(db, 'chats', chatId), { lastMessage: body.slice(0, 120), lastAt: serverTimestamp(), lastFrom: user.uid });
      if (digits !== null) batch.set(doc(db, ...trailPath), { digits, at: serverTimestamp() });
      return batch.commit();
    };
    // Show it right away: the message appears in the chat at once, the database confirms in the background
    setText('');
    setSending(false);
    setGuardNote(g.level === 'warn' ? { tone: 'warn', title: g.kind, text: g.msg } : null);
    if (g.level === 'warn') logGuard(g.kind);
    try {
      try { await commit(trail.trail); } catch (first) {
        // The hour may have just run out on the server's clock: try once with a fresh trail
        if (!trail.trail || !trail.base) throw first;
        await commit(trail.trail.slice(trail.base.length));
      }
      notifyPush('message', otherId, chatId);
    } catch (err) {
      console.error(err);
      setText((cur) => cur || body);   // give the text back so nothing is lost
      setGuardNote({ tone: 'bad', title: 'Not sent', text: active ? 'This message couldn’t be sent. It may break a safety rule, or you’re offline.' : 'Your account can’t send messages right now.' });
    }
  }

  async function doBlock() {
    try { await block(otherId); toast('Blocked. You won’t see each other anywhere.'); navigate('/chats'); } catch { toast('Could not block. Try again.'); }
  }

  const excerpt = (messages || []).filter((m) => m.from === otherId).slice(-5).map((m) => m.text);

  return (
    <>
      <div className="row between">
        <Link className="btn btn-ghost btn-sm flush" to="/chats"><Icon name="back" size={18} />Chats</Link>
        <div className="row gap-6">
          <button className="btn btn-secondary btn-sm" onClick={() => setReporting(true)}><Icon name="flag" size={16} />{t('ct.report')}</button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmBlock(true)}><Icon name="block" size={16} />{t('ct.block')}</button>
        </div>
      </div>

      {confirmBlock && (
        <div className="notice bad"><Icon name="alert" size={18} />
          <div className="stack gap-10"><div><b>Block {other?.name}?</b> You won’t see each other in matches or chats. They won’t be told.</div>
            <div className="row gap-8"><button className="btn btn-secondary btn-sm" onClick={() => setConfirmBlock(false)}>Cancel</button><button className="btn btn-danger btn-sm" onClick={doBlock}>Block</button></div></div>
        </div>
      )}

      <div className="row gap-12">
        <Avatar name={other?.name || '…'} photo={other?.photo} />
        <div className="min0">
          <div className="row gap-6"><b>{other?.name || 'Loading…'}</b>{other?.verified && <span className="tag good"><Icon name="check" size={12} />Verified</span>}</div>
          <p className="muted small">{other?.college}{other?.teamType ? ` · ${other.teamType}` : ''}</p>
        </div>
      </div>

      <div className="notice info small"><Icon name="shield" size={16} /><div>{t('ct.guard')}</div></div>

      {(meets || []).filter((m) => m.chatId === chatId).map((m) => <MeetCard key={m.id} meet={m} otherName={other?.name || ''} />)}
      {!profile.minor && other && !other.minor && !other.gone && (
        <button className="btn btn-secondary btn-sm self-start" onClick={() => setPlanning(true)}><Icon name="pin" size={16} />{t('ct.meet')}</button>
      )}
      {profile.minor && <p className="tiny muted">{t('ct.minorMeet')}</p>}

      <div className="thread" aria-live="polite">
        <p className="msg sys">{t('ct.connected')}</p>
        {messages === null && <p className="msg sys">Loading messages…</p>}
        {(messages || []).map((m) => (
          <div key={m.id} className={`msg ${m.from === user.uid ? 'me' : 'them'}`}>{m.text}</div>
        ))}
        <div ref={endRef} />
      </div>

      {guardNote && (
        <div className={`notice ${guardNote.tone}`}><Icon name="shield" size={18} /><div><b>{guardNote.title}.</b> {guardNote.text}</div></div>
      )}

      {messages && messages.length === 0 && (
        <div className="chips">{ICE_BREAKERS.map((t) => <button type="button" className="chip" key={t} onClick={() => setText(t)}>{t}</button>)}</div>
      )}

      <form className="composer" onSubmit={send}>
        <input className="input" aria-label="Message" placeholder={active ? t('ct.type') : t('ct.off')}
          value={text} maxLength={MAX_LEN} disabled={!active} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || sending || !active}><Icon name="send" size={18} /></button>
      </form>

      {aiDown && <p className="tiny muted">AI Guard server didn’t answer, so only the basic safety rules checked your last message.</p>}

      {planning && other && <SafeMeetSheet chatId={chatId} otherId={otherId} otherName={other.name} onClose={() => setPlanning(false)} />}

      {reporting && other && (
        <ReportSheet target={other} chatId={chatId} excerpt={excerpt} onClose={() => setReporting(false)} />
      )}
    </>
  );
}
