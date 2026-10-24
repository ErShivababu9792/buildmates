import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { earnedBadges } from '../lib/badges';

const count = (q) => getDocs(q).then((s) => s.size).catch(() => 0);

export default function BadgesCard() {
  const { user, profile } = useAuth();
  const { chats, teams, meets } = useSocial();
  const [extra, setExtra] = useState(null);

  useEffect(() => {
    Promise.all([
      count(query(collection(db, 'ideas'), where('owner', '==', user.uid))),
      count(query(collection(db, 'ratings'), where('by', '==', user.uid))),
      getDoc(doc(db, 'feedback', user.uid)).then((s) => s.exists()).catch(() => false),
      count(query(collection(db, 'products'), where('owner', '==', user.uid))),
    ]).then(([ideas, ratings, feedback, products]) => setExtra({ ideas, ratings, feedback, products }));
  }, [user.uid]);

  if (!extra) return null;
  const badges = earnedBadges({
    profile,
    chats: (chats || []).length,
    teams: (teams || []).length,
    officialTeams: (teams || []).filter((t) => t.status === 'active').length,
    meetsDone: (meets || []).filter((m) => m.feedback?.[user.uid]).length,
    ...extra,
  });
  const got = badges.filter((b) => b.earned).length;

  return (
    <section className="card stack">
      <div className="row between"><h3>Badges</h3><span className="tiny muted mono">{got} / {badges.length}</span></div>
      <div className="badges">
        {badges.map((b) => (
          <div className={`badge ${b.earned ? 'on' : ''}`} key={b.id} title={b.how}>
            <span className="badge-ic" aria-hidden="true">{b.icon}</span>
            <b className="tiny">{b.name}</b>
            <span className="tiny muted">{b.earned ? 'Earned' : b.how}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
