import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useT } from '../i18n';
import Icon from '../components/Icon';
import { formatWhen } from '../lib/ideas';
import { markAllSeen, useSeen, useSocialNotifications } from '../lib/notify';
import { weekKey } from '../lib/teams';

const ms = (ts) => ts?.toMillis?.() || 0;

/** Activity on things I own (ideas and Launchpad products). Read once when the page opens. */
function useOwnerActivity(uid, teams) {
  const [items, setItems] = useState(null);
  const teamKey = (teams || []).map((t) => t.id).join(',');
  useEffect(() => {
    let alive = true;
    const sub = (path) => getDocs(collection(db, ...path)).then((s) => s.docs.map((d) => d.data())).catch(() => []);
    (async () => {
      const [ideas, products] = await Promise.all([
        getDocs(query(collection(db, 'ideas'), where('owner', '==', uid))).catch(() => null),
        getDocs(query(collection(db, 'products'), where('owner', '==', uid))).catch(() => null),
      ]);
      const jobs = [];
      (ideas?.docs || []).forEach((d) => {
        const title = d.data().title || 'Your idea';
        jobs.push(sub(['ideas', d.id, 'interest']).then((l) => ({ kind: 'interest', icon: 'star', list: l, title, to: `/ideas/${d.id}`, id: `ii_${d.id}` })));
        jobs.push(sub(['ideas', d.id, 'access']).then((l) => ({ kind: 'access', icon: 'briefcase', list: l.filter((a) => a.status === 'requested'), title, to: `/ideas/${d.id}`, id: `ia_${d.id}` })));
        jobs.push(sub(['ideas', d.id, 'offers']).then((l) => ({ kind: 'offer', icon: 'briefcase', list: l, title, to: `/ideas/${d.id}`, id: `io_${d.id}` })));
      });
      (products?.docs || []).forEach((d) => {
        const title = d.data().name || 'Your product';
        jobs.push(sub(['products', d.id, 'help']).then((l) => ({ kind: 'help', icon: 'rocket', list: l, title, to: `/launchpad/${d.id}`, id: `ph_${d.id}` })));
        jobs.push(sub(['products', d.id, 'offers']).then((l) => ({ kind: 'offer', icon: 'briefcase', list: l, title, to: `/launchpad/${d.id}`, id: `po_${d.id}` })));
      });
      // Teams I'm in: people who applied to our open roles, and my weekly check-in
      const week = weekKey();
      const lateInWeek = [0, 4, 5, 6].includes(new Date().getDay()); // Thu–Sun
      (teams || []).forEach((t) => {
        jobs.push(sub(['teams', t.id, 'applications']).then((l) => ({ kind: 'applied', icon: 'briefcase', list: l.filter((a) => a.status === 'pending'), title: t.name, to: `/teams/${t.id}`, id: `ta_${t.id}` })));
        if (lateInWeek) {
          jobs.push(getDoc(doc(db, 'teams', t.id, 'checkins', `${week}_${uid}`)).then((c) => ({
            kind: 'checkin', icon: 'clock', title: t.name, to: `/teams/${t.id}`, id: `tc_${t.id}_${week}`,
            list: c.exists() ? [] : [{ at: { toMillis: () => Date.now() } }], always: true,
          })).catch(() => ({ list: [] })));
        }
      });
      const groups = await Promise.all(jobs);
      if (alive) setItems(groups.filter((g) => g.list.length));
    })();
    return () => { alive = false; };
  }, [uid, teamKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return items;
}

export default function Notifications() {
  const { user } = useAuth();
  const social = useSocial();
  const { t } = useT();
  const seen = useSeen(user.uid);
  const live = useSocialNotifications(user.uid, social);
  const owner = useOwnerActivity(user.uid, social.teams);

  // Turn owner activity into rows: only entries newer than "mark all as read" count as new
  const ownerRows = (owner || []).map((g) => {
    const fresh = g.always ? g.list : g.list.filter((x) => ms(x.at) > seen.all);
    const latest = Math.max(...g.list.map((x) => ms(x.at)));
    return {
      id: g.id, kind: g.kind, icon: g.icon, to: g.to, at: latest, unread: fresh.length > 0,
      vars: { title: g.title, n: fresh.length || g.list.length },
    };
  });
  const rows = [...live, ...ownerRows].sort((a, b) => b.at - a.at);
  const unread = rows.filter((r) => r.unread).length;

  return (
    <>
      <header className="row between">
        <div className="stack gap-4"><h2>{t('n.title')}</h2><p className="muted small">{t('n.lead')}</p></div>
        {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={() => markAllSeen(user.uid)}><Icon name="check" size={16} />{t('n.markRead')}</button>}
      </header>

      {owner === null && !live.length && <div className="card muted">{t('common.loading')}</div>}

      {owner !== null && !rows.length && (
        <div className="card stack center-text">
          <span className="feature-ic big"><Icon name="bell" size={26} /></span>
          <b>{t('n.none')}</b>
          <p className="muted small">{t('n.noneText')}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card list">
          {rows.map((r) => (
            <Link className={`list-item notif ${r.unread ? 'unread' : ''}`} to={r.to} key={r.id}>
              <span className="feature-ic"><Icon name={r.icon} size={18} /></span>
              <div className="grow min0">
                <p className="small">{t(`n.${r.kind}`, r.vars)}</p>
                {r.preview && <p className="tiny muted ellipsis">{r.preview}</p>}
                {r.at > 0 && <p className="tiny muted">{formatWhen({ toMillis: () => r.at, toDate: () => new Date(r.at) })}</p>}
              </div>
              {r.unread && <span className="dot" aria-label="New" />}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
