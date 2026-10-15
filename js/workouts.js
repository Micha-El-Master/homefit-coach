
const LEVEL_FACTOR = { debutant: 0.8, intermediaire: 1, avance: 1.2 };

const WEEK_PROGRAM = [
  { type: 'repos', title: 'Repos' },
  {
    type: 'training',
    title: 'Haut du corps',
    subtitle: 'Pecs, Épaules, Triceps',
    exercises: [
      { id: 'pompes', sets: 4, reps: 12 },
      { id: 'pike-pushup', sets: 3, reps: 10 },
      { id: 'dips-chaise', sets: 3, reps: 12 },
      { id: 'extension-triceps', sets: 3, reps: 15 },
      { id: 'elevations-laterales', sets: 3, reps: 15 },
    ],
  },
  {
    type: 'training',
    title: 'Jambes + Abdos',
    subtitle: 'Quadriceps, Fessiers, Abdominaux',
    exercises: [
      { id: 'squat', sets: 4, reps: 15 },
      { id: 'fentes', sets: 3, reps: 12, perLeg: true },
      { id: 'pont-fessier', sets: 3, reps: 15 },
      { id: 'mollets', sets: 4, reps: 20 },
      { id: 'crunch', sets: 3, reps: 20 },
    ],
  },
  { type: 'repos', title: 'Repos' },
  {
    type: 'training',
    title: 'Dos + Biceps',
    subtitle: 'Dos, Biceps, Lombaires',
    exercises: [
      { id: 'superman', sets: 3, reps: 15 },
      { id: 'rowing-serviette', sets: 3, reps: 12 },
      { id: 'curl-biceps', sets: 3, reps: 15 },
      { id: 'tirage-elastique', sets: 3, reps: 12 },
      { id: 'gainage-dorsal', sets: 3, holdSeconds: 30 },
    ],
  },
  {
    type: 'training',
    title: 'Full Body + Cardio',
    subtitle: 'Corps entier, Cardio',
    exercises: [
      { id: 'star-jump', sets: 3, reps: 10 },
      { id: 'burpees', sets: 3, reps: 10 },
      { id: 'mountain-climbers', sets: 3, holdSeconds: 20 },
      { id: 'squat-jump', sets: 3, reps: 12 },
      { id: 'planche', sets: 3, holdSeconds: 30 },
    ],
  },
  { type: 'repos', title: 'Repos' },
];

const MOTIVATION_MESSAGES = [
  { max: 1, text: "Le début est toujours le plus difficile. Aujourd'hui tu construis ton habitude." },
  { max: 7, text: "Première semaine en cours. Chaque séance compte, continue comme ça." },
  { max: 30, text: "30 jours accomplis. Ton corps commence déjà à changer." },
  { max: 60, text: "60 jours de discipline. Regarde le chemin parcouru." },
  { max: 90, text: "Transformation terminée. Tu as construit une nouvelle discipline." },
  { max: Infinity, text: "Tu as dépassé ton programme initial. Continue à te dépasser." },
];

const WARMUP_ROUTINE = [
  { id: 'genoux-hauts', sets: 1, holdSeconds: 30 },
  { id: 'rotations-bras', sets: 1, holdSeconds: 30 },
  { id: 'rotations-hanches', sets: 1, holdSeconds: 30 },
  { id: 'jumping-jacks', sets: 1, holdSeconds: 30 },
];

const COOLDOWN_ROUTINE = [
  { id: 'etirement-quadriceps', sets: 1, holdSeconds: 30 },
  { id: 'etirement-ischios', sets: 1, holdSeconds: 30 },
  { id: 'etirement-pectoraux', sets: 1, holdSeconds: 30 },
  { id: 'etirement-epaules', sets: 1, holdSeconds: 30 },
  { id: 'posture-enfant', sets: 1, holdSeconds: 30 },
];

const SESSION_CYCLE = WEEK_PROGRAM.filter((d) => d.type === 'training');

function getNextSessionTitle() {
  const log = getSessionLog();
  if (log.length === 0) return SESSION_CYCLE[0].title;
  const lastIdx = SESSION_CYCLE.findIndex((s) => s.title === log[log.length - 1].title);
  return SESSION_CYCLE[(lastIdx + 1) % SESSION_CYCLE.length].title;
}

const DELOAD_WEEKS = [4, 8];
const PROGRESS_PER_WEEK = 0.03;
const FEELING_FACTOR = { dur: 0.9, facile: 1.1 };

function getWeekPhase(week) {
  if (DELOAD_WEEKS.includes(week)) {
    return { deload: true, label: 'Semaine allégée : on récupère pour mieux progresser 🌿' };
  }
  if (week === TOTAL_WEEKS) {
    return { deload: false, label: 'Dernière semaine du programme : donne tout 🏁' };
  }
  return { deload: false, label: null };
}

// Les répétitions montent de 3 % par semaine ; les semaines 4 et 8 sont allégées (-20 %).
function getProgressionFactor(week) {
  if (DELOAD_WEEKS.includes(week)) return (1 + PROGRESS_PER_WEEK * (week - 2)) * 0.8;
  return 1 + PROGRESS_PER_WEEK * (week - 1);
}

function scaleExercise(exercise, level, week = 1, feeling = null) {
  const factor = (LEVEL_FACTOR[level] || 1) * getProgressionFactor(week) * (FEELING_FACTOR[feeling] || 1);
  const delta = getAdjustments()[exercise.id] || 0;
  const phase = getWeekPhase(week);
  const extraSet = week >= 9 && !phase.deload && exercise.sets === 3 ? 1 : 0;
  const scaled = { ...exercise, sets: exercise.sets + extraSet };
  if (exercise.reps) {
    scaled.reps = Math.max(1, Math.round(exercise.reps * factor) + delta);
  } else if (exercise.holdSeconds) {
    scaled.holdSeconds = Math.max(10, Math.round(exercise.holdSeconds * factor) + delta);
  }
  return scaled;
}

function getTodayWorkout(profile, title) {
  const day = SESSION_CYCLE.find((s) => s.title === (title || getNextSessionTitle())) || SESSION_CYCLE[0];
  const level = profile ? profile.level : 'intermediaire';
  const progress = getProgramProgress();
  const week = progress ? progress.week : 1;
  const feeling = getFeelingTrend();
  return {
    ...day,
    week,
    phase: getWeekPhase(week),
    feeling,
    exercises: day.exercises.map((ex) => scaleExercise(ex, level, week, feeling)),
  };
}

function getMotivationalMessage(dayNumber) {
  const entry = MOTIVATION_MESSAGES.find((m) => dayNumber <= m.max);
  return entry.text;
}

function estimateSessionCalories(exercises) {
  return exercises.reduce((sum, ex) => sum + (ex.sets || 3) * 12, 0);
}
