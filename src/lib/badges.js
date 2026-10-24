/**
 * Badges are worked out from what you've actually done, so they can't be faked by editing a field.
 * ctx: { profile, chats, teams, ideas, ratings, feedback, meetsDone, products }
 */
export const BADGES = [
  { id: 'quiz', icon: '🧭', name: 'Know Yourself', how: 'Finish the working-style quiz', test: (c) => Array.isArray(c.profile.b5) },
  { id: 'verified', icon: '✅', name: 'Verified Student', how: 'Get your college ID verified', test: (c) => Boolean(c.profile.verified) },
  { id: 'first-mate', icon: '🤝', name: 'First Mate', how: 'Connect with your first person', test: (c) => c.chats >= 1 },
  { id: 'networker', icon: '🌐', name: 'Networker', how: 'Connect with 5 people', test: (c) => c.chats >= 5 },
  { id: 'idea-starter', icon: '💡', name: 'Idea Starter', how: 'Post your first idea', test: (c) => c.ideas >= 1 },
  { id: 'team-player', icon: '👥', name: 'Team Player', how: 'Join or start a team', test: (c) => c.teams >= 1 },
  { id: 'trial-done', icon: '🏁', name: 'Trial Done', how: 'Finish a trial task and make a team official', test: (c) => c.officialTeams >= 1 },
  { id: 'safe-meet', icon: '📍', name: 'Safe Meeter', how: 'Have a Safe Meet and give feedback', test: (c) => c.meetsDone >= 1 },
  { id: 'launcher', icon: '🚀', name: 'Launcher', how: 'List a product on Launchpad', test: (c) => c.products >= 1 },
  { id: 'helper', icon: '⭐', name: 'Research Helper', how: 'Rate 5 matches and send feedback', test: (c) => c.ratings >= 5 && c.feedback },
];

export function earnedBadges(ctx) {
  return BADGES.map((b) => ({ ...b, earned: Boolean(b.test(ctx)) }));
}
