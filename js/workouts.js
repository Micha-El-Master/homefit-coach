
const LEVEL_FACTOR = { debutant: 0.8, intermediaire: 1, avance: 1.2 };

// Niveau chiffré de 1 à 10, issu du test de départ : 3 mini-tests (squats en 60 s, pompes sur les genoux
// en une série, gainage en secondes), chacun noté de 1 à 10 ; le niveau global est la moyenne arrondie.
const LEVEL_MIN = 1;
const LEVEL_MAX = 10;
const LEVEL_TESTS = [
  { id: 'squats', label: 'Squats en 60 s', unit: 'répétitions', divisor: 5, max: 60 },
  { id: 'pompes', label: 'Pompes sur les genoux', unit: 'répétitions', divisor: 3.5, max: 60 },
  { id: 'gainage', label: 'Gainage sur les avant-bras', unit: 'secondes', divisor: 10, max: 180 },
];

function clampLevel(n) {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(n)));
}

function scoreLevelTest(testId, value) {
  const test = LEVEL_TESTS.find((t) => t.id === testId);
  const v = Number(value);
  if (!test || !Number.isFinite(v) || v < 0) return LEVEL_MIN;
  return clampLevel(Math.min(v, test.max) / test.divisor);
}

// results : { squats, pompes, gainage } -> { score, scores: { squats, pompes, gainage } }
function computeLevelFromTests(results) {
  const scores = {};
  LEVEL_TESTS.forEach((t) => {
    scores[t.id] = scoreLevelTest(t.id, results[t.id]);
  });
  const mean = LEVEL_TESTS.reduce((sum, t) => sum + scores[t.id], 0) / LEVEL_TESTS.length;
  return { score: clampLevel(mean), scores };
}

// Les 10 niveaux vont de 0,60 (on commence tout petit) à 1,23 du volume de base.
function levelScoreFactor(score) {
  return 0.6 + 0.07 * (clampLevel(score) - 1);
}

// Rattache l'ancien niveau texte à un niveau chiffré (affichage, test refait plus tard).
function levelFromScore(score) {
  const s = clampLevel(score);
  return s <= 4 ? 'debutant' : s <= 7 ? 'intermediaire' : 'avance';
}

function levelNameFromScore(score) {
  const s = clampLevel(score);
  return s <= 4 ? 'Débutant' : s <= 7 ? 'Intermédiaire' : 'Avancé';
}

// Facteur de répétitions : un nombre (1 à 10) ou l'ancien niveau texte.
function getLevelFactor(level) {
  if (typeof level === 'number') return levelScoreFactor(level);
  return LEVEL_FACTOR[level] || 1;
}

// Parcours de 12 semaines pour un niveau chiffré : un point par semaine (semaines 4 et 8 allégées).
function getLevelCurve(score, totalWeeks = TOTAL_WEEKS) {
  const base = levelScoreFactor(score);
  const weeks = [];
  for (let w = 1; w <= totalWeeks; w++) {
    weeks.push({ week: w, factor: base * getProgressionFactor(w), deload: DELOAD_WEEKS.includes(w) });
  }
  return weeks;
}

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

// Séance de récupération (jours de repos) : hors du cycle de séances, ne compte pas dans la série.
const RECOVERY_TITLE = 'Récupération';
const RECOVERY_ROUTINE = [
  { id: 'respiration-profonde', sets: 1, holdSeconds: 60 },
  { id: 'chat-vache', sets: 1, holdSeconds: 40 },
  { id: 'rotations-hanches', sets: 1, holdSeconds: 40 },
  { id: 'rotations-bras', sets: 1, holdSeconds: 40 },
  { id: 'etirement-quadriceps', sets: 1, holdSeconds: 40 },
  { id: 'etirement-ischios', sets: 1, holdSeconds: 40 },
  { id: 'etirement-pectoraux', sets: 1, holdSeconds: 40 },
  { id: 'etirement-epaules', sets: 1, holdSeconds: 40 },
  { id: 'posture-enfant', sets: 1, holdSeconds: 60 },
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

function getWeekPhase(week, mode = 'standard') {
  if (mode === 'maintenance') return { deload: false, label: 'Mode entretien : on garde le niveau, sans progression.' };
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

// mode : 'standard', 'phase2' (+20 % sur tout le cycle) ou 'maintenance' (niveau constant, sans semaines allégées).
function scaleExercise(exercise, level, week = 1, feeling = null, mode = 'standard') {
  const progression = mode === 'maintenance' ? 1 : getProgressionFactor(week);
  const factor = getLevelFactor(level) * progression * (mode === 'phase2' ? 1.2 : 1) * (FEELING_FACTOR[feeling] || 1);
  const delta = getAdjustments()[exercise.id] || 0;
  const phase = getWeekPhase(week, mode);
  const extraSet = mode !== 'maintenance' && week >= 9 && !phase.deload && exercise.sets === 3 ? 1 : 0;
  const scaled = { ...exercise, sets: exercise.sets + extraSet };
  if (exercise.reps) {
    scaled.reps = Math.max(1, Math.round(exercise.reps * factor) + delta);
  } else if (exercise.holdSeconds) {
    scaled.holdSeconds = Math.max(10, Math.round(exercise.holdSeconds * factor) + delta);
  }
  return scaled;
}

// Variantes du programme selon l'objectif : les 4 séances gardent leur nom, seul le contenu change.
const FINISHERS = {
  'Haut du corps': { id: 'mountain-climbers', sets: 3, holdSeconds: 30 },
  'Jambes + Abdos': { id: 'squat-jump', sets: 3, reps: 12 },
  'Dos + Biceps': { id: 'star-jump', sets: 3, reps: 10 },
  'Full Body + Cardio': { id: 'jumping-jacks', sets: 3, holdSeconds: 40 },
};

const GOAL_NOTES = {
  muscle: 'Programme prise de muscle : +1 série sur les deux premiers exercices de chaque séance.',
  perte: 'Programme perte de poids : un finisher cardio est ajouté à la fin de chaque séance.',
  forme: null,
  discipline: 'Programme habitude : séances raccourcies (un exercice de moins) pour installer la routine.',
};

function applyGoalVariant(session, goal) {
  const base = session.exercises.map((ex) => ({ ...ex }));
  if (goal === 'muscle') return base.map((ex, i) => (i < 2 ? { ...ex, sets: ex.sets + 1 } : ex));
  if (goal === 'perte') return [...base, { ...FINISHERS[session.title] }];
  if (goal === 'discipline') return base.slice(0, -1);
  return base;
}

// Exercices de repli (au poids du corps) par catégorie, quand le matériel manque.
const FALLBACKS_BY_CATEGORY = {
  'Haut du corps': ['pompes'],
  Jambes: ['squat', 'fentes', 'pont-fessier'],
  Abdos: ['crunch', 'planche'],
  Dos: ['superman', 'gainage-dorsal'],
  Cardio: ['mountain-climbers', 'squat-jump', 'star-jump', 'jumping-jacks', 'planche'],
};

function isFeasible(id, equipment) {
  return (EXERCISES[id].requires || []).every((r) => equipment.includes(r));
}

// Remplace chaque exercice infaisable par une alternative faisable (sinon par un repli de la catégorie),
// et le retire s'il n'existe rien de nouveau à proposer dans la séance.
function applyEquipment(exercises, equipment) {
  const out = [];
  let replaced = 0;
  let dropped = 0;
  exercises.forEach((ex) => {
    if (isFeasible(ex.id, equipment)) {
      out.push(ex);
      return;
    }
    const data = EXERCISES[ex.id];
    const candidates = [...(data.alternatives || []), ...(FALLBACKS_BY_CATEGORY[data.category] || [])];
    const sub = candidates.find(
      (c) => isFeasible(c, equipment) && !exercises.some((e) => e.id === c) && !out.some((o) => o.id === c)
    );
    if (!sub) {
      dropped++;
      return;
    }
    const next = { ...ex, id: sub };
    if (EXERCISES[sub].type === 'hold' && next.reps) {
      next.holdSeconds = 30;
      delete next.reps;
    } else if (EXERCISES[sub].type !== 'hold' && next.holdSeconds) {
      next.reps = 12;
      delete next.holdSeconds;
    }
    if (sub !== 'fentes') delete next.perLeg;
    out.push(next);
    replaced++;
  });
  return { exercises: out, replaced, dropped };
}

function getRecoveryWorkout() {
  return {
    type: 'training',
    recovery: true,
    title: RECOVERY_TITLE,
    subtitle: 'Mobilité et étirements doux',
    week: 1,
    mode: 'standard',
    phase: { deload: false, label: null },
    feeling: null,
    goalNote: null,
    equipmentNote: null,
    exercises: RECOVERY_ROUTINE.map((ex) => ({ ...ex })),
  };
}

function getTodayWorkout(profile, title) {
  if (title === RECOVERY_TITLE) return getRecoveryWorkout();
  const day = SESSION_CYCLE.find((s) => s.title === (title || getNextSessionTitle())) || SESSION_CYCLE[0];
  const level = profile ? (profile.levelScore || profile.level) : 'intermediaire';
  const goal = profile ? profile.goal : 'forme';
  const progress = getProgramProgress();
  const week = progress ? progress.week : 1;
  const mode = progress ? progress.mode : 'standard';
  const feeling = getFeelingTrend();
  const equipped = applyEquipment(applyGoalVariant(day, goal), getSettings().equipment);

  let equipmentNote = null;
  if (equipped.replaced || equipped.dropped) {
    const parts = [];
    if (equipped.replaced) parts.push(`${equipped.replaced} exercice${equipped.replaced > 1 ? 's' : ''} remplacé${equipped.replaced > 1 ? 's' : ''}`);
    if (equipped.dropped) parts.push(`${equipped.dropped} retiré${equipped.dropped > 1 ? 's' : ''}`);
    equipmentNote = `Selon ton matériel : ${parts.join(', ')}. Ajoute du matériel dans les réglages pour retrouver la séance complète.`;
  }

  return {
    ...day,
    week,
    mode,
    phase: getWeekPhase(week, mode),
    feeling,
    goalNote: GOAL_NOTES[goal] || null,
    equipmentNote,
    exercises: equipped.exercises.map((ex) => scaleExercise(ex, level, week, feeling, mode)),
  };
}

function getMotivationalMessage(dayNumber) {
  const entry = MOTIVATION_MESSAGES.find((m) => dayNumber <= m.max);
  return entry.text;
}

function estimateSessionCalories(exercises) {
  return exercises.reduce((sum, ex) => sum + (ex.sets || 3) * 12, 0);
}
