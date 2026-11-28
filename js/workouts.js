
const LEVEL_FACTOR = { debutant: 0.8, intermediaire: 1, avance: 1.2 };

// Niveau chiffré de 1 à 10. Les nouveaux résultats proviennent d'épreuves submaximales courtes.
// Les résultats anciens sont conservés pour la compatibilité des profils déjà enregistrés.
const LEVEL_MIN = 1;
const LEVEL_MAX = 10;
const LEVEL_TESTS = [
  { id: 'squats', label: 'Squats contrôlés', unit: 'répétitions', divisor: 5, max: 8, mode: 'submaximal' },
  { id: 'pompes', label: 'Pompes sur les genoux', unit: 'répétitions', divisor: 3.5, max: 5, mode: 'submaximal' },
  { id: 'gainage', label: 'Gainage sur les avant-bras', unit: 'secondes', divisor: 10, max: 20, mode: 'submaximal' },
];

function clampLevel(n) {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(n)));
}

function scoreLevelTest(testId, value) {
  const test = LEVEL_TESTS.find((t) => t.id === testId);
  const v = Number(value);
  if (!test || !Number.isFinite(v) || v < 0) return LEVEL_MIN;
  if (v <= test.max) {
    if (testId === 'squats') {
      if (v >= 8) return 6;
      if (v >= 5) return 4;
      if (v >= 2) return 2;
      return 1;
    }
    if (testId === 'pompes') {
      if (v >= 5) return 6;
      if (v >= 3) return 4;
      if (v >= 1) return 2;
      return 1;
    }
    if (testId === 'gainage') {
      if (v >= 20) return 5;
      if (v >= 15) return 4;
      if (v >= 10) return 3;
      if (v >= 5) return 2;
      return 1;
    }
  }
  return clampLevel(v / test.divisor);
}

// results : { squats, pompes, gainage } -> { score, scores: { squats, pompes, gainage } }
function computeLevelFromTests(results) {
  const scores = {};
  const safeResults = isPlainObject(results) ? results : {};
  const completed = [];
  let ignoredCount = 0;
  const interrupted = safeResults.interrupted === true || safeResults.safetyStop === true;
  const hardEffort = ['difficile', 'tres_difficile', 'arreter'].includes(safeResults.effort);
  LEVEL_TESTS.forEach((t) => {
    const value = safeResults[t.id];
    if (value === undefined || value === null || value === '' || safeResults.skipped && safeResults.skipped.includes(t.id)) {
      ignoredCount++;
      scores[t.id] = null;
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      ignoredCount++;
      scores[t.id] = null;
      return;
    }
    scores[t.id] = scoreLevelTest(t.id, numeric);
    completed.push(scores[t.id]);
  });
  let score;
  if (completed.length === 0) {
    const skippedAll = Array.isArray(safeResults.skipped) && safeResults.skipped.length === LEVEL_TESTS.length;
    score = skippedAll ? 2 : 1;
  } else {
    const mean = completed.reduce((sum, value) => sum + value, 0) / completed.length;
    score = clampLevel(mean);
  }
  if (ignoredCount > 0) score = Math.min(score, ignoredCount === LEVEL_TESTS.length ? 2 : 4);
  if (hardEffort) score = Math.min(score, 3);
  if (interrupted) score = Math.min(score, 2);
  return { score: clampLevel(score), scores };
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
// `policy` (facultative, résultat de evaluateSafetyPolicy) : sans elle, comportement historique. Avec elle, aucune augmentation
// au-delà de ce qu'elle autorise (niveau plafonné, progression, phase 2, ressenti « facile », « trop facile », série en plus) ;
// les réductions (semaine allégée, ressenti « dur », baisses mémorisées, reprise après jeûne) restent toujours appliquées.
function scaleExercise(exercise, level, week = 1, feeling = null, mode = 'standard', volume = 1, policy = null) {
  const limited = policy !== null && policy !== undefined;
  const allowIncrease = !limited || policy.allowIncrease === true;
  const allowPhase2 = !limited || policy.allowPhase2 === true;
  const allowAdjustUp = !limited || policy.allowAdjustUp === true;
  const cap = limited && typeof policy.volumeCap === 'number' ? policy.volumeCap : null;
  let progression = mode === 'maintenance' ? 1 : getProgressionFactor(week);
  if (!allowIncrease) progression = Math.min(progression, 1);
  let levelFactor = getLevelFactor(level);
  if (cap !== null) levelFactor = Math.min(levelFactor, cap);
  const feelingFactor = feeling === 'facile' && !allowIncrease ? 1 : (FEELING_FACTOR[feeling] || 1);
  let factor = levelFactor * progression * (mode === 'phase2' && allowPhase2 ? 1.2 : 1) * feelingFactor * volume;
  if (cap !== null) factor = Math.min(factor, cap);
  let delta = getAdjustments()[exercise.id] || 0;
  if (!allowAdjustUp) delta = Math.min(delta, 0);
  const phase = getWeekPhase(week, mode);
  const extraSet = allowIncrease && mode !== 'maintenance' && week >= 9 && !phase.deload && exercise.sets === 3 ? 1 : 0;
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

function applyGoalVariant(session, goal, policy = null) {
  const base = session.exercises.map((ex) => ({ ...ex }));
  const growth = !policy || policy.allowIncrease === true; // « muscle » et « perte » ajoutent du volume : interdits sans augmentation
  if (goal === 'muscle') return growth ? base.map((ex, i) => (i < 2 ? { ...ex, sets: ex.sets + 1 } : ex)) : base;
  if (goal === 'perte') return growth ? [...base, { ...FINISHERS[session.title] }] : base;
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
// `profile` (facultatif) : un remplaçant incompatible avec les précautions déclarées n'est jamais choisi ;
// `policy` (facultative) : ni un remplaçant au-dessus du plafond d'intensité.
function applyEquipment(exercises, equipment, profile = null, policy = null) {
  const isSafe = (id) => (!profile || typeof evaluateExerciseCompatibility !== 'function' || evaluateExerciseCompatibility(id, profile).compatible)
    && (!policy || typeof isExerciseIntensityAllowed !== 'function' || isExerciseIntensityAllowed(id, policy.maxIntensity));
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
      (c) => isFeasible(c, equipment) && isSafe(c) && !exercises.some((e) => e.id === c) && !out.some((o) => o.id === c)
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

// Message selon la phase de jeûne du jour (null hors jeûne).
function getFastNote(phase) {
  if (!phase) return null;
  if (phase.phase === 'fast') return `Jeûne, jour ${phase.day} sur ${phase.days} : pas d'effort intense. Arrête-toi, assieds-toi et bois si tu as un vertige, des palpitations ou des nausées.`;
  if (phase.phase === 'refeed') return `Reprise après le jeûne, jour ${phase.day} sur ${phase.refeedDays} : séance à ${Math.round(phase.factor * 100)} % du volume. Remonte en douceur.`;
  return 'Veille du jeûne : dernière séance complète. Prévois un repas léger, de l\'eau, des tisanes et du bouillon.';
}

// Texte à afficher quand la politique interdit la séance (messages de gravité « warning », sans diagnostic).
function safetyPolicyNote(policy) {
  return policy.messages.filter((m) => m.severity === 'warning').map((m) => m.text).join(' ') || null;
}

// La récupération n'est pas automatiquement sûre : la politique décide d'abord (interdite en cas de symptômes thoraciques déclarés),
// puis la routine passe, comme toute séance, par le garde-fou central (précautions et plafond d'intensité).
function getRecoveryWorkout(profile = getProfile()) {
  const policy = evaluateSafetyPolicy(profile, { action: 'start-recovery' });
  const blocked = !policy.canOfferRecovery;
  const safe = blocked
    ? { exercises: [], removed: [], added: [], status: 'impossible' }
    : enforceSafeExercises(RECOVERY_ROUTINE.map((ex) => ({ ...ex })), profile, policy);
  const safetyNote = blocked ? safetyPolicyNote(policy) : describeSafetyEnforcement(safe);
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
    ...(safetyNote ? { safetyNote } : {}),
    safetyStatus: blocked ? 'blocked' : safe.status,
    fastNote: getFastNote(fastPhaseOn(todayISO())),
    exercises: safe.exercises,
    policy,
  };
}

function getTodayWorkout(profile, title) {
  if (title === RECOVERY_TITLE) return getRecoveryWorkout(profile);
  const day = SESSION_CYCLE.find((s) => s.title === (title || getNextSessionTitle())) || SESSION_CYCLE[0];
  const level = profile ? (profile.levelScore || profile.level) : 'intermediaire';
  const goal = profile ? profile.goal : 'forme';
  const progress = getProgramProgress();
  const week = progress ? progress.week : 1;
  const mode = progress ? progress.mode : 'standard';
  // 1. La politique de sécurité est évaluée en premier, à chaque génération (jamais une ancienne décision).
  const policy = evaluateSafetyPolicy(profile, { action: 'start-training' });
  const fastPhase = fastPhaseOn(todayISO());
  if (!policy.canStartTraining) {
    // Entraînement interdit : aucun exercice n'est généré (ni séance, ni progression, ni adaptation possible ensuite).
    return {
      ...day,
      week,
      mode,
      phase: getWeekPhase(week, mode),
      feeling: null,
      goalNote: null,
      equipmentNote: null,
      safetyNote: safetyPolicyNote(policy),
      safetyStatus: 'blocked',
      fastNote: getFastNote(fastPhase),
      exercises: [],
      policy,
    };
  }
  const trend = getFeelingTrend();
  const feeling = trend === 'facile' && !policy.allowIncrease ? null : trend; // « plus intense » n'est jamais appliqué si interdit
  const volume = fastPhase && fastPhase.phase === 'refeed' ? fastPhase.factor : 1;
  // 2. Contenu autorisé. « muscle » et « perte » ajoutent du volume : écartés si la politique n'autorise aucune augmentation.
  let planned = applyGoalVariant(day, goal, policy);
  let safetyResult = { exercises: planned, blocked: 0, replaced: 0, unknown: 0 };
  if (typeof applySafetyToExercises === 'function') {
    safetyResult = applySafetyToExercises(planned, profile);
  }
  planned = safetyResult.exercises;
  // 3. Matériel, puis 4. garde-fou central (précautions + plafond d'intensité) : un remplaçant d'équipement ne doit
  // jamais réintroduire un exercice écarté.
  const equipped = applyEquipment(planned, getSettings().equipment, profile, policy);
  const afterEquipment = enforceSafeExercises(equipped.exercises, profile, policy);
  equipped.exercises = afterEquipment.exercises;
  let filled = 0;
  if (typeof fillWithGentleExercises === 'function') {
    const topUp = fillWithGentleExercises(equipped.exercises, profile);
    equipped.exercises = topUp.exercises;
    filled = topUp.added;
  }
  // Verrou final, après le complément de mouvements doux : la séance retournée respecte toujours les précautions.
  // 6. Dernière vérification de sécurité.
  const finalGuard = enforceSafeExercises(equipped.exercises, profile, policy);
  equipped.exercises = finalGuard.exercises;

  let equipmentNote = null;
  if (equipped.replaced || equipped.dropped) {
    const parts = [];
    if (equipped.replaced) parts.push(`${equipped.replaced} exercice${equipped.replaced > 1 ? 's' : ''} remplacé${equipped.replaced > 1 ? 's' : ''}`);
    if (equipped.dropped) parts.push(`${equipped.dropped} retiré${equipped.dropped > 1 ? 's' : ''}`);
    equipmentNote = `Selon ton matériel : ${parts.join(', ')}. Ajoute du matériel dans les réglages pour retrouver la séance complète.`;
  }
  let safetyNote = null;
  if (safetyResult.replaced || safetyResult.blocked || safetyResult.unknown) {
    const safetyParts = [];
    if (safetyResult.replaced) safetyParts.push(`${safetyResult.replaced} exercice${safetyResult.replaced > 1 ? 's' : ''} remplacé${safetyResult.replaced > 1 ? 's' : ''} par une option connue`);
    const removed = safetyResult.blocked + safetyResult.unknown - safetyResult.replaced;
    if (removed > 0) safetyParts.push(`${removed} exercice${removed > 1 ? 's' : ''} retiré${removed > 1 ? 's' : ''} pour prudence`);
    safetyNote = `Précautions prises en compte : ${safetyParts.join(', ')}.`;
  }
  if (filled) {
    safetyNote = `${safetyNote ? safetyNote + ' ' : 'Précautions prises en compte : '}${filled} mouvement${filled > 1 ? 's' : ''} doux ajouté${filled > 1 ? 's' : ''} pour garder une séance complète.`;
  }

  // Très peu d'exercices compatibles : on le dit, et on renvoie vers un professionnel pour adapter la séance.
  if (typeof fillWithGentleExercises === 'function' && equipped.exercises.length < SAFETY_MIN_EXERCISES) {
    safetyNote = `${safetyNote ? safetyNote + ' ' : ''}Peu d'exercices sont compatibles avec tes précautions : demande l'avis d'un professionnel qualifié pour adapter ta séance.`;
  }
  // Ce que les garde-fous ont dû corriger après coup (normalement rien : le matériel tient déjà compte du profil).
  const lateNote = describeSafetyEnforcement({ ...afterEquipment, status: 'complete' }) || describeSafetyEnforcement({ ...finalGuard, status: 'complete' });
  if (lateNote) safetyNote = `${safetyNote ? safetyNote + ' ' : ''}${lateNote}`;

  return {
    ...day,
    week,
    mode,
    phase: getWeekPhase(week, mode),
    feeling,
    // La note de l'objectif décrit un volume en plus : elle n'est pas affichée si cette augmentation n'est pas appliquée.
    goalNote: (goal === 'muscle' || goal === 'perte') && !policy.allowIncrease ? null : (GOAL_NOTES[goal] || null),
    equipmentNote,
    safetyNote,
    safetyStatus: finalGuard.status,
    fastNote: getFastNote(fastPhase),
    exercises: equipped.exercises.map((ex) => scaleExercise(ex, level, week, feeling, mode, volume, policy)),
    policy,
  };
}

// Adaptations proposées par le coach (coach.html), appliquées à une séance déjà filtrée par la sécurité.
// Les transformations sont celles qui étaient écrites dans workout.html ; la seule différence est que le garde-fou
// central repasse à la fin : aucune adaptation ne peut réintroduire un exercice incompatible avec les précautions.
// La politique est réévaluée à chaque appel : une adaptation interdite (type inconnu, entraînement bloqué) n'est PAS appliquée.
// Une adaptation ne peut que réduire ou substituer : elle n'assouplit jamais la politique.
// Retourne { exercises, restSeconds, guard, policy, denied? } (guard : résultat de enforceSafeExercises).
function applyCoachAdaptation(exercises, adaptation, profile, restSeconds) {
  const policy = evaluateSafetyPolicy(profile, { action: 'coach-adapt', adaptation });
  if (!policy.allowed) {
    const guard = enforceSafeExercises(exercises, profile, policy);
    return { exercises: guard.exercises, restSeconds, guard, policy, denied: true };
  }
  let list = exercises;
  let rest = restSeconds;
  const type = adaptation && adaptation.type;
  if (type === 'reduce-sets' || type === 'light') {
    list = list.map((ex) => ({ ...ex, sets: Math.max(1, ex.sets - 1) }));
  }
  if (type === 'shorter-rest' || type === 'light') {
    rest = Math.min(rest, 30);
  }
  if (type === 'no-equipment') {
    list = applyEquipment(list, [], profile, policy).exercises;
  }
  if (type === 'mini') {
    list = list.slice(0, 3).map((ex) => ({ ...ex, sets: Math.min(2, ex.sets) }));
  }
  if (type === 'comeback') {
    list = list.map((ex) => ({
      ...ex,
      sets: Math.max(1, ex.sets - 1),
      ...(ex.reps ? { reps: Math.max(1, Math.round(ex.reps * 0.8)) } : {}),
      ...(ex.holdSeconds ? { holdSeconds: Math.max(10, Math.round(ex.holdSeconds * 0.8)) } : {}),
    }));
  }
  if (type === 'swap-categories') {
    const categories = Array.isArray(adaptation.categories) ? adaptation.categories : [];
    list = list.map((ex) => {
      const data = EXERCISES[ex.id];
      if (data && categories.includes(data.category) && data.alternatives && data.alternatives.length) {
        // Première alternative compatible avec les précautions (la première tout court sans restriction).
        const alt = data.alternatives.find((id) => evaluateExerciseCompatibility(id, profile).compatible && isExerciseIntensityAllowed(id, policy.maxIntensity));
        if (alt) return { ...ex, id: alt };
      }
      return ex;
    });
  }
  const guard = enforceSafeExercises(list, profile, policy);
  return { exercises: guard.exercises, restSeconds: rest, guard, policy };
}

function getMotivationalMessage(dayNumber) {
  const entry = MOTIVATION_MESSAGES.find((m) => dayNumber <= m.max);
  return entry.text;
}

function estimateSessionCalories(exercises) {
  return exercises.reduce((sum, ex) => sum + (ex.sets || 3) * 12, 0);
}
