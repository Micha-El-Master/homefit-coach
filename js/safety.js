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

function normalizeSafetyProfile(profile) {
  if (!isPlainSafetyObject(profile)) return { responded: false, preferNot: false, limitations: [], returnAfterPause: false, professionalAdvice: false };
  const value = isPlainSafetyObject(profile.safety) ? profile.safety : null;
  if (!value) return { responded: false, preferNot: false, limitations: [], returnAfterPause: false, professionalAdvice: false };
  const limitations = Array.isArray(value.limitations)
    ? value.limitations.filter((id) => SAFETY_LIMITATION_IDS.includes(id))
    : [];
  return {
    responded: value.responded === true,
    preferNot: value.preferNot === true,
    limitations,
    returnAfterPause: value.returnAfterPause === true,
    professionalAdvice: value.professionalAdvice === true,
  };
}

function getSafetyProfile(profile) {
  return normalizeSafetyProfile(profile);
}

function saveSafetyProfile(profile, safety) {
  if (!isPlainSafetyObject(profile)) return false;
  const normalized = normalizeSafetyProfile({ safety });
  profile.safety = normalized;
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
