const BADGES = [
  {
    id: 'first-session',
    icon: '🎉',
    label: 'Premier pas',
    description: 'Terminer ta toute première séance.',
    isUnlocked: (ctx) => ctx.sessions.length >= 1,
  },
  {
    id: 'streak-4',
    icon: '🔥',
    label: '4 semaines de suite',
    description: 'Atteindre ton objectif hebdomadaire pendant 4 semaines consécutives.',
    isUnlocked: (ctx) => ctx.streak >= 4,
  },
  {
    id: 'sessions-10',
    icon: '💪',
    label: '10 séances',
    description: 'Cumuler 10 séances terminées.',
    isUnlocked: (ctx) => ctx.sessions.length >= 10,
  },
  {
    id: 'streak-12',
    icon: '🚀',
    label: '12 semaines de suite',
    description: 'Atteindre ton objectif chaque semaine pendant tout le programme.',
    isUnlocked: (ctx) => ctx.streak >= 12,
  },
  {
    id: 'sessions-25',
    icon: '🏅',
    label: '25 séances',
    description: 'Cumuler 25 séances terminées.',
    isUnlocked: (ctx) => ctx.sessions.length >= 25,
  },
  {
    id: 'kegel-7',
    icon: '🧘',
    label: 'Routine Kegel x7',
    description: 'Compléter 7 routines Kegel.',
    isUnlocked: (ctx) => ctx.kegelLog.length >= 7,
  },
  {
    id: 'program-complete',
    icon: '🏆',
    label: 'Programme terminé',
    description: 'Compléter toutes les séances du programme de 12 semaines.',
    isUnlocked: (ctx) => ctx.sessions.length >= getTotalProgramSessions(),
  },
];

function getBadgeContext() {
  return {
    sessions: getSessionLog(),
    kegelLog: getKegelLog(),
    streak: getStreak(),
  };
}

function getBadgeStates() {
  const ctx = getBadgeContext();
  return BADGES.map((badge) => ({ ...badge, unlocked: badge.isUnlocked(ctx) }));
}
