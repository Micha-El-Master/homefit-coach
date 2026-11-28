const SAFETY_LIMITATION_IDS = [
  'knees',
  'back',
  'shoulders',
  'balance',
  'mobility',
  'professional_advice',
  'chest_symptoms',
];

const SAFETY_LIMITATION_LABELS = {
  knees: 'Genoux ou jambes',
  back: 'Bas du dos',
  shoulders: 'Épaules ou bras',
  balance: 'Équilibre',
  mobility: 'Mobilité limitée',
  professional_advice: 'Avis professionnel recommandé',
  chest_symptoms: 'Symptômes thoraciques ou respiration difficile',
};

const SAFETY_EXERCISE_DATA = {
  pompes: { restrictions: ['shoulders'], alternatives: ['elevations-laterales', 'curl-biceps'] },
  'pike-pushup': { restrictions: ['shoulders', 'balance'], alternatives: ['pompes', 'elevations-laterales'] },
  'dips-chaise': { restrictions: ['shoulders'], alternatives: ['curl-biceps', 'pompes'] },
  'extension-triceps': { restrictions: ['shoulders'], alternatives: ['curl-biceps'] },
  'elevations-laterales': { restrictions: ['shoulders'], alternatives: ['pompes'] },
  squat: { restrictions: ['knees', 'balance', 'mobility'], alternatives: ['pont-fessier', 'mollets'] },
  fentes: { restrictions: ['knees', 'balance', 'mobility'], alternatives: ['squat', 'pont-fessier'] },
  'pont-fessier': { restrictions: ['back'], alternatives: ['crunch', 'respiration-profonde'] },
  mollets: { restrictions: ['balance'], alternatives: ['pont-fessier'] },
  crunch: { restrictions: ['back'], alternatives: ['respiration-profonde', 'planche'] },
  superman: { restrictions: ['back'], alternatives: ['gainage-dorsal', 'posture-enfant'] },
  'gainage-dorsal': { restrictions: ['back'], alternatives: ['superman', 'respiration-profonde'] },
  'curl-biceps': { restrictions: [], alternatives: [] },
  'rowing-serviette': { restrictions: ['back', 'shoulders'], alternatives: ['gainage-dorsal'] },
  'tirage-elastique': { restrictions: ['shoulders', 'back'], alternatives: ['gainage-dorsal'] },
  'star-jump': { restrictions: ['knees', 'balance', 'mobility'], alternatives: ['mountain-climbers', 'squat'] },
  burpees: { restrictions: ['knees', 'back', 'shoulders', 'balance', 'mobility'], alternatives: ['squat', 'mountain-climbers'] },
  'mountain-climbers': { restrictions: ['knees', 'back', 'shoulders', 'balance'], alternatives: ['respiration-profonde', 'planche'] },
  'squat-jump': { restrictions: ['knees', 'back', 'balance', 'mobility'], alternatives: ['squat', 'pont-fessier'] },
  planche: { restrictions: ['back', 'shoulders', 'mobility'], alternatives: ['gainage-dorsal', 'respiration-profonde'] },
  'jumping-jacks': { restrictions: ['knees', 'balance', 'mobility'], alternatives: ['rotations-hanches', 'respiration-profonde'] },
};

// Mouvements doux (mobilité, étirements, respiration) : sans restriction connue, sauf ceux qui demandent de l'équilibre ou de la mobilité.
Object.assign(SAFETY_EXERCISE_DATA, {
  'respiration-profonde': { restrictions: [], alternatives: [] },
  'posture-enfant': { restrictions: ['knees'], alternatives: ['respiration-profonde'] },
  'chat-vache': { restrictions: ['shoulders'], alternatives: ['respiration-profonde'] },
  'rotations-hanches': { restrictions: ['balance'], alternatives: ['respiration-profonde'] },
  'rotations-bras': { restrictions: ['shoulders'], alternatives: ['respiration-profonde'] },
  'etirement-quadriceps': { restrictions: ['balance', 'knees'], alternatives: ['etirement-ischios'] },
  'etirement-ischios': { restrictions: ['back'], alternatives: ['respiration-profonde'] },
  'etirement-pectoraux': { restrictions: ['shoulders'], alternatives: ['respiration-profonde'] },
  'etirement-epaules': { restrictions: ['shoulders'], alternatives: ['respiration-profonde'] },
  'genoux-hauts': { restrictions: ['knees', 'balance', 'mobility'], alternatives: ['respiration-profonde'] },
});

// Une séance ne descend jamais sous ce nombre d'exercices : on la complète avec des mouvements doux compatibles.
const SAFETY_MIN_EXERCISES = 3;
const SAFETY_GENTLE_FILLERS = ['respiration-profonde', 'rotations-hanches', 'rotations-bras', 'chat-vache', 'etirement-ischios', 'etirement-pectoraux', 'etirement-epaules', 'posture-enfant', 'etirement-quadriceps'];

function isPlainSafetyObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ───────────── États du questionnaire de sécurité (sous-lot 0b-1) ─────────────
// Quatre états distincts :
//   unanswered : questionnaire jamais rempli (aucun enregistrement exploitable)
//   declined   : « je préfère ne pas répondre »
//   none       : questionnaire rempli, « aucune de ces situations ne me concerne »
//   declared   : au moins une situation déclarée
// Aucun de ces états n'est une autorisation médicale : « none » est une déclaration de l'utilisateur, pas une vérification.
//
// Modèle à facettes : deux informations sont INDÉPENDANTES et peuvent coexister (typiquement après une fusion d'import) :
//   - `limitations` : les situations déclarées ;
//   - `declined`    : le refus de répondre au questionnaire (« j'ai refusé de répondre » reste identifiable même si
//                     des situations sont déclarées par ailleurs).
// `status` n'est PAS une troisième information : c'est le résumé calculé de ces facettes
//   (declared si des situations, sinon declined si refus, sinon none si « aucune situation », sinon unanswered).
// Il ne peut donc jamais contredire les facettes. `preferNot` est la projection historique de `status` (vrai seulement
// pour « declined ») : les lecteurs existants, dont le filtre d'exercices, continuent d'appliquer les limitations.
const SAFETY_STATUSES = ['unanswered', 'declined', 'none', 'declared'];
const SAFETY_CHEST_CONTEXTS = ['unspecified', 'new_or_unexplained', 'evaluated'];

function safetyDateOrNull(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// Lecture unique et pure de profile.safety : reconnaît les quatre états, les anciennes structures et les données
// mal formées, sans jamais modifier l'objet reçu. Règle de prudence : une donnée ambiguë ou inconnue ne devient JAMAIS
// « none » ; les restrictions présentes ne sont jamais ignorées (même si le reste de l'enregistrement est incohérent).
// Les champs historiques (responded, preferNot, professionalAdvice) sont des projections de `status`, pas des sources.
function deriveSafetyState(profile) {
  const state = {
    status: 'unanswered',
    responded: false,
    preferNot: false,
    limitations: [],
    declined: false,
    professionalAdvice: false,
    chestSymptoms: false,
    chestContext: 'unspecified',
    returnAfterPause: false,
    answeredAt: null,
    acknowledgedAt: null,
    hasRecord: false,
    ambiguous: false,
    issues: [],
  };
  const raw = isPlainSafetyObject(profile) ? profile.safety : undefined;
  if (raw === undefined || raw === null) return state;
  state.hasRecord = true;
  const issue = (code) => {
    state.ambiguous = true;
    state.issues.push(code);
  };
  if (!isPlainSafetyObject(raw)) {
    issue('record-invalid');
    return state;
  }

  // Situations déclarées : liste, plus les anciens indicateurs booléens (avis professionnel, symptômes thoraciques).
  let ids = [];
  if (raw.limitations !== undefined) {
    if (Array.isArray(raw.limitations)) {
      ids = raw.limitations.filter((id) => SAFETY_LIMITATION_IDS.includes(id));
      if (ids.length !== raw.limitations.length) issue('limitations-unknown-entries');
    } else {
      issue('limitations-invalid');
    }
  }
  if (raw.professionalAdvice === true) ids.push('professional_advice');
  else if (raw.professionalAdvice !== undefined && raw.professionalAdvice !== false) issue('professional-advice-invalid');
  if (raw.chestSymptoms === true) ids.push('chest_symptoms');
  else if (raw.chestSymptoms !== undefined && raw.chestSymptoms !== false) issue('chest-symptoms-invalid');
  const limitations = SAFETY_LIMITATION_IDS.filter((id) => ids.includes(id));

  if (raw.preferNot !== undefined && typeof raw.preferNot !== 'boolean') issue('prefer-not-invalid');
  if (raw.declined !== undefined && typeof raw.declined !== 'boolean') issue('declined-invalid');
  if (raw.responded !== undefined && typeof raw.responded !== 'boolean') issue('responded-invalid');
  let claimed = null;
  if (raw.status !== undefined) {
    if (SAFETY_STATUSES.includes(raw.status)) claimed = raw.status;
    else issue('status-invalid');
  }
  // Facette « refus de répondre » : indépendante des situations (ancien `preferNot` et ancien status « declined » inclus).
  const declined = raw.declined === true || raw.preferNot === true || claimed === 'declined';
  const responded = raw.responded === true;

  let status;
  if (limitations.length) {
    status = 'declared'; // les restrictions présentes l'emportent toujours (le refus éventuel reste dans la facette `declined`)
    if (claimed === 'none' || claimed === 'unanswered') issue('status-conflict');
  } else if (declined) {
    status = 'declined';
    if (claimed && claimed !== 'declined') issue('status-conflict');
  } else if (claimed === 'declared') {
    status = 'unanswered'; // « déclaré » sans aucune situation : impossible à confirmer
    issue('status-declared-without-limitation');
  } else if (claimed === 'none') {
    status = raw.responded === false ? 'unanswered' : 'none';
    if (raw.responded === false) issue('status-conflict');
  } else if (claimed === 'unanswered') {
    status = 'unanswered';
    if (responded) issue('status-conflict');
  } else {
    status = responded ? 'none' : 'unanswered'; // ancien format : seul `responded` renseigne
  }
  // Prudence : aucune donnée ambiguë ne vaut « aucune situation ».
  if (status === 'none' && state.ambiguous) status = 'unanswered';

  const chest = limitations.includes('chest_symptoms');
  state.status = status;
  state.responded = status !== 'unanswered';
  state.preferNot = status === 'declined';
  state.limitations = limitations;
  state.declined = declined;
  state.professionalAdvice = limitations.includes('professional_advice');
  state.chestSymptoms = chest;
  state.chestContext = chest && SAFETY_CHEST_CONTEXTS.includes(raw.chestContext) ? raw.chestContext : 'unspecified';
  state.returnAfterPause = raw.returnAfterPause === true;
  state.answeredAt = safetyDateOrNull(raw.answeredAt);
  state.acknowledgedAt = safetyDateOrNull(raw.acknowledgedAt);
  return state;
}

// API historique : projection de deriveSafetyState (mêmes champs qu'avant, plus les nouveaux champs, ajoutés).
function normalizeSafetyProfile(profile) {
  const s = deriveSafetyState(profile);
  return {
    status: s.status,
    responded: s.responded,
    preferNot: s.preferNot,
    limitations: s.limitations,
    declined: s.declined,
    returnAfterPause: s.returnAfterPause,
    professionalAdvice: s.professionalAdvice,
    chestSymptoms: s.chestSymptoms,
    chestContext: s.chestContext,
    answeredAt: s.answeredAt,
    acknowledgedAt: s.acknowledgedAt,
  };
}

// Enregistrement à stocker dans profile.safety. `status` est la source de vérité ; `responded`, `preferNot` et
// `professionalAdvice` restent écrits comme projections pour les anciennes versions de l'application (cache hors ligne) :
// ils ne sont jamais lus avant `status`/`declined`. L'accusé de compréhension n'a de sens que si le questionnaire est
// non renseigné ou refusé (facette `declined`, même quand des situations sont déclarées par ailleurs).
function buildSafetyRecord(input) {
  const s = deriveSafetyState({ safety: input });
  const record = {
    status: s.status,
    responded: s.responded,
    preferNot: s.preferNot,
    limitations: s.limitations.slice(),
    declined: s.declined,
    returnAfterPause: s.returnAfterPause,
    professionalAdvice: s.professionalAdvice,
    answeredAt: s.status === 'unanswered' ? null : s.answeredAt,
    acknowledgedAt: s.status === 'unanswered' || s.declined ? s.acknowledgedAt : null,
  };
  if (s.chestSymptoms) record.chestContext = s.chestContext;
  return record;
}

// Réponses du formulaire -> enregistrement. Une situation déclarée l'emporte toujours sur « aucune situation » (jamais effacée) ;
// le refus de répondre reste une facette indépendante : il est conservé s'il est coché, même avec des situations.
// Retourne null s'il n'y a rien à enregistrer (questionnaire non renseigné et sans accusé de compréhension).
function buildSafetyRecordFromAnswers(answers, previousProfile, todayIso) {
  const previous = deriveSafetyState(previousProfile);
  const a = isPlainSafetyObject(answers) ? answers : {};
  const limitations = Array.isArray(a.limitations) ? a.limitations.filter((id) => SAFETY_LIMITATION_IDS.includes(id)) : [];
  const declined = a.preferNot === true;
  let status = 'unanswered';
  if (limitations.length) status = 'declared';
  else if (declined) status = 'declined';
  else if (a.none === true) status = 'none';
  const record = buildSafetyRecord({
    status,
    limitations,
    declined,
    returnAfterPause: previous.returnAfterPause,
    chestContext: previous.chestContext,
    answeredAt: status === 'unanswered' ? null : safetyDateOrNull(todayIso),
    acknowledgedAt: previous.acknowledgedAt,
  });
  return record.status === 'unanswered' && !record.acknowledgedAt ? null : record;
}

function getSafetyProfile(profile) {
  return normalizeSafetyProfile(profile);
}

function saveSafetyProfile(profile, safety) {
  if (!isPlainSafetyObject(profile)) return false;
  profile.safety = buildSafetyRecord(safety);
  return typeof saveProfile === 'function' ? saveProfile(profile) : true;
}

function hasDeclaredSafety(safety) {
  const value = normalizeSafetyProfile({ safety });
  return value.responded && (value.preferNot || value.limitations.length > 0);
}

function getSafetyWarnings(profile) {
  const safety = normalizeSafetyProfile(profile);
  if (!safety || !safety.responded) {
    return ['Écoute ton corps : arrête en cas de douleur ou malaise inhabituel.'];
  }
  if (safety.preferNot) {
    return ['Sans réponse détaillée, progresse avec prudence et évite toute accélération rapide.'];
  }
  const warnings = [];
  if (safety.limitations.includes('professional_advice') || safety.professionalAdvice) {
    warnings.push('Une limitation a été déclarée : demande l’avis d’un professionnel qualifié avant une reprise intense.');
  }
  if (safety.limitations.includes('chest_symptoms')) {
    warnings.push('En cas de douleur thoracique, difficulté respiratoire importante ou malaise sévère, arrête l’effort et sollicite rapidement une aide médicale appropriée.');
  }
  if (safety.limitations.includes('knees')) warnings.push('Privilégie des mouvements confortables pour les genoux.');
  if (safety.limitations.includes('back')) warnings.push('Privilégie des mouvements qui ne sollicitent pas de façon inconfortable le bas du dos.');
  if (safety.limitations.includes('shoulders')) warnings.push('Privilégie les mouvements qui ne sollicitent pas douloureusement les épaules.');
  if (safety.limitations.includes('balance')) warnings.push('Choisis des variantes stables près d’un appui.');
  if (safety.limitations.includes('mobility')) warnings.push('Respecte une amplitude réduite et confortable.');
  if (safety.returnAfterPause) warnings.push('Après une longue interruption, reprends avec prudence et sans augmenter rapidement l’intensité.');
  return warnings.length ? warnings : ['Respecte tes limites et progresse progressivement.'];
}

function evaluateExerciseCompatibility(exerciseId, profile) {
  const safety = normalizeSafetyProfile(profile);
  const data = SAFETY_EXERCISE_DATA[exerciseId];
  if (!safety || !safety.responded || safety.preferNot) {
    return { compatible: true, status: 'caution', reason: 'Aucune restriction détaillée déclarée.', alternative: null };
  }
  if (!data) {
    return { compatible: false, status: 'unknown', reason: 'Compatibilité non déterminée.', alternative: null };
  }
  const conflict = data.restrictions.find((restriction) => safety.limitations.includes(restriction));
  if (!conflict) {
    return { compatible: true, status: 'compatible', reason: 'Aucune restriction connue ne cible cet exercice.', alternative: null };
  }
  const alternative = data.alternatives.find((id) => {
    if (!SAFETY_EXERCISE_DATA[id]) return false;
    const altRestrictions = SAFETY_EXERCISE_DATA[id].restrictions || [];
    return !altRestrictions.some((restriction) => safety.limitations.includes(restriction));
  }) || null;
  return {
    compatible: false,
    status: 'blocked',
    reason: `Précaution déclarée : ${SAFETY_LIMITATION_LABELS[conflict] || conflict}.`,
    alternative,
  };
}

function applySafetyToExercises(exercises, profile) {
  const used = new Set();
  const planned = new Set(exercises.map((exercise) => exercise.id));
  let blocked = 0;
  let replaced = 0;
  let unknown = 0;
  const out = [];
  exercises.forEach((exercise) => {
    const decision = evaluateExerciseCompatibility(exercise.id, profile);
    if (decision.compatible) {
      out.push(exercise);
      used.add(exercise.id);
      return;
    }
    if (decision.status === 'unknown') unknown++;
    else blocked++;
    if (decision.alternative && !used.has(decision.alternative) && !planned.has(decision.alternative)) {
      const alt = { ...exercise, id: decision.alternative };
      const altData = typeof EXERCISES !== 'undefined' ? EXERCISES[decision.alternative] : null;
      if (altData && altData.type === 'hold' && alt.reps) {
        alt.holdSeconds = 20;
        delete alt.reps;
      } else if (altData && altData.type !== 'hold' && alt.holdSeconds) {
        alt.reps = 8;
        delete alt.holdSeconds;
      }
      if (decision.alternative !== 'fentes') delete alt.perLeg;
      out.push(alt);
      used.add(decision.alternative);
      replaced++;
    }
  });
  return { exercises: out, blocked, replaced, unknown };
}

// Complète une séance trop courte avec des mouvements doux compatibles avec les précautions déclarées.
function fillWithGentleExercises(exercises, profile, min = SAFETY_MIN_EXERCISES) {
  const out = exercises.slice();
  const present = new Set(out.map((exercise) => exercise.id));
  let added = 0;
  for (const id of SAFETY_GENTLE_FILLERS) {
    if (out.length >= min) break;
    if (present.has(id) || !evaluateExerciseCompatibility(id, profile).compatible) continue;
    out.push({ id, sets: 2, holdSeconds: 40 });
    present.add(id);
    added++;
  }
  return { exercises: out, added };
}

// Dernier garde-fou : quelle que soit la façon dont une liste d'exercices a été construite (séance, récupération,
// échauffement, adaptation du coach, reprise d'une séance en pause), seuls des exercices compatibles avec les
// précautions déclarées en sortent. Il réutilise les règles existantes (evaluateExerciseCompatibility) et
// uniquement les alternatives déjà documentées ; il n'invente aucun exercice et n'en ajoute aucun pour atteindre un quota.
//   status : 'complete' (au moins `min` exercices), 'short' (1 ou 2) ou 'impossible' (aucun : la séance ne doit pas démarrer).
//   Le minimum de 3 exercices est un objectif de confort, jamais une obligation de sécurité.
//   `policy` (facultative, résultat de evaluateSafetyPolicy) : applique en plus le plafond d'intensité ; maxIntensity null
//   (état « blocked ») n'autorise aucun exercice.
function enforceSafeExercises(exercises, profile, policy = null, min = SAFETY_MIN_EXERCISES) {
  if (typeof policy === 'number') { min = policy; policy = null; } // ancienne signature : (exercises, profile, min)
  const input = Array.isArray(exercises) ? exercises.filter((exercise) => exercise && typeof exercise.id === 'string') : [];
  const pass = applySafetyToExercises(input, profile);
  // Verrou final : on relit chaque exercice retenu, sans faire confiance à l'étape précédente.
  let safe = pass.exercises.filter((exercise) => evaluateExerciseCompatibility(exercise.id, profile).compatible);

  // Politique de sécurité (sous-lot 0b-2) : plafond d'intensité. Un exercice « unknown » compte comme « high ».
  // Un exercice écarté pour son intensité est remplacé par une alternative DÉJÀ documentée, compatible et autorisée.
  if (policy && typeof isExerciseIntensityAllowed === 'function') {
    const allowedByPolicy = (id) => isExerciseIntensityAllowed(id, policy.maxIntensity);
    const kept = [];
    const present = new Set(safe.map((exercise) => exercise.id));
    safe.forEach((exercise) => {
      if (allowedByPolicy(exercise.id)) {
        kept.push(exercise);
        return;
      }
      const data = SAFETY_EXERCISE_DATA[exercise.id];
      const alternative = data && data.alternatives.find((id) => SAFETY_EXERCISE_DATA[id] && !present.has(id)
        && evaluateExerciseCompatibility(id, profile).compatible && allowedByPolicy(id));
      if (!alternative) return;
      present.add(alternative);
      const next = { ...exercise, id: alternative };
      const altData = typeof EXERCISES !== 'undefined' ? EXERCISES[alternative] : null;
      if (altData && altData.type === 'hold' && next.reps) {
        next.holdSeconds = 20;
        delete next.reps;
      } else if (altData && altData.type !== 'hold' && next.holdSeconds) {
        next.reps = 8;
        delete next.holdSeconds;
      }
      if (alternative !== 'fentes') delete next.perLeg;
      kept.push(next);
    });
    safe = kept.filter((exercise) => allowedByPolicy(exercise.id) && evaluateExerciseCompatibility(exercise.id, profile).compatible);
  }

  const keptIds = new Set(safe.map((exercise) => exercise.id));
  const inputIds = new Set(input.map((exercise) => exercise.id));
  return {
    exercises: safe,
    removed: input.filter((exercise) => !keptIds.has(exercise.id)).map((exercise) => exercise.id),
    added: safe.filter((exercise) => !inputIds.has(exercise.id)).map((exercise) => exercise.id),
    status: safe.length === 0 ? 'impossible' : safe.length < min ? 'short' : 'complete',
  };
}

// Phrase d'explication d'un résultat de enforceSafeExercises (null si rien n'a changé).
function describeSafetyEnforcement(result) {
  if (!result) return null;
  const replaced = result.added.length;
  const dropped = Math.max(0, result.removed.length - replaced);
  if (!replaced && !dropped && result.status !== 'impossible') return null;
  const parts = [];
  if (replaced) parts.push(`${replaced} exercice${replaced > 1 ? 's' : ''} remplacé${replaced > 1 ? 's' : ''} par une option connue`);
  if (dropped) parts.push(`${dropped} exercice${dropped > 1 ? 's' : ''} retiré${dropped > 1 ? 's' : ''} pour prudence`);
  let text = parts.length ? `Précautions prises en compte : ${parts.join(', ')}.` : '';
  if (result.status === 'impossible') {
    text += ' Aucun exercice n’est compatible avec tes précautions : la séance n’est pas proposée. Demande l’avis d’un professionnel qualifié.';
  } else if (result.status === 'short') {
    text += ' Peu d’exercices sont compatibles avec tes précautions : demande l’avis d’un professionnel qualifié pour adapter ta séance.';
  }
  return text.trim();
}

// Signaux proposés pendant une séance (le bouton « Douleur ou malaise »). `urgent` : aide médicale à solliciter.
const SAFETY_SIGNALS = [
  { id: 'douleur', label: 'Douleur', urgent: false },
  { id: 'vertige', label: 'Vertige ou étourdissement', urgent: false },
  { id: 'malaise', label: 'Malaise ou nausée', urgent: false },
  { id: 'essoufflement', label: 'Essoufflement important', urgent: false },
  { id: 'douleur-thoracique', label: 'Douleur dans la poitrine', urgent: true },
  { id: 'difficulte-respiratoire-severe', label: 'Grande difficulté à respirer', urgent: true },
  { id: 'malaise-severe', label: 'Malaise sévère', urgent: true },
];

function computeSafetyStop(signal) {
  const urgent = ['douleur-thoracique', 'difficulte-respiratoire-severe', 'malaise-severe'];
  const stopSignals = ['douleur', 'malaise', 'vertige', 'essoufflement', ...urgent];
  const stop = stopSignals.includes(signal);
  const urgentStop = urgent.includes(signal);
  return {
    stop,
    urgent: urgentStop,
    message: urgentStop
      ? 'Arrête l’effort et sollicite rapidement une aide médicale appropriée.'
      : stop
        ? 'Arrête l’effort. Ne reprends pas tant que le symptôme n’a pas disparu.'
        : 'Continue seulement si tu te sens bien.',
  };
}
