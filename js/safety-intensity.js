// Registre central de l'intensité des exercices (sous-lot 0b-2).
//
// DONNÉES SEULES, pour être relues et validées séparément par un professionnel du sport et de la santé.
// AUCUNE de ces classifications n'est une validation médicale ou sportive : toutes sont « provisional ».
//
// Règle de construction : on ne classe QUE ce que le code existant atteste. Tout le reste reste « unknown »
// (« à classer par validation sportive »), et « unknown » est traité comme « high » dès qu'une restriction s'applique
// (voir isExerciseIntensityAllowed). Aucune valeur n'est inventée.
//   low     : l'exercice appartient à une routine douce déjà définie par le code (récupération, mouvements doux de
//             compensation, étirements) ;
//   high    : l'exercice relève de la catégorie « Cardio » dans le catalogue des exercices ;
//   moderate: AUCUN exercice n'est classé « moderate » : aucune donnée existante ne l'atteste ;
//   unknown : tous les autres (renforcement, gainage, échauffement dynamique…).
// Conséquence connue : avec ces classifications provisoires, une restriction « intensité modérée au plus » (avis professionnel)
// ne laisse passer que les mouvements doux. Les classer permettrait de proposer davantage, mais seulement après validation.

const SAFETY_INTENSITY_LEVELS = ['low', 'moderate', 'high', 'unknown'];

const SAFETY_INTENSITY_BASIS_GENTLE = 'Appartient aux routines douces existantes (RECOVERY_ROUTINE et SAFETY_GENTLE_FILLERS).';
const SAFETY_INTENSITY_BASIS_CARDIO = 'Catégorie « Cardio » du catalogue des exercices (EXERCISES).';
const SAFETY_INTENSITY_BASIS_NONE = 'Aucune donnée existante : à classer par validation sportive.';

const SAFETY_INTENSITY_REGISTRY = {
  // ── Mouvements doux (provisoire : attesté par les routines existantes) ──
  'respiration-profonde': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'chat-vache': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'rotations-hanches': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'rotations-bras': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'etirement-quadriceps': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'etirement-ischios': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'etirement-pectoraux': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'etirement-epaules': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },
  'posture-enfant': { intensity: 'low', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_GENTLE },

  // ── Cardio (provisoire : attesté par la catégorie du catalogue) ──
  burpees: { intensity: 'high', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_CARDIO },
  'mountain-climbers': { intensity: 'high', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_CARDIO },
  'star-jump': { intensity: 'high', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_CARDIO },
  'squat-jump': { intensity: 'high', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_CARDIO },
  'jumping-jacks': { intensity: 'high', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_CARDIO },

  // ── Non classés (aucune donnée existante) : traités comme « high » en situation restreinte ──
  'genoux-hauts': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  pompes: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'pike-pushup': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'dips-chaise': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'extension-triceps': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'elevations-laterales': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  squat: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  fentes: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'pont-fessier': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  mollets: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  crunch: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  superman: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'rowing-serviette': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'curl-biceps': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'tirage-elastique': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  'gainage-dorsal': { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
  planche: { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE },
};

// Rang d'intensité : « unknown » vaut « high » (jamais une autorisation implicite).
const SAFETY_INTENSITY_RANK = { low: 1, moderate: 2, high: 3, unknown: 3 };

// Classification d'un exercice. Tout identifiant absent du registre est « unknown », en statut provisoire.
function getExerciseIntensity(exerciseId) {
  const entry = typeof exerciseId === 'string' && Object.prototype.hasOwnProperty.call(SAFETY_INTENSITY_REGISTRY, exerciseId)
    ? SAFETY_INTENSITY_REGISTRY[exerciseId]
    : null;
  if (!entry || !SAFETY_INTENSITY_LEVELS.includes(entry.intensity)) {
    return { intensity: 'unknown', status: 'provisional', basis: SAFETY_INTENSITY_BASIS_NONE, registered: !!entry };
  }
  return { intensity: entry.intensity, status: entry.status === 'validated' ? 'validated' : 'provisional', basis: entry.basis, registered: true };
}

// maxIntensity : 'low' | 'moderate' | 'high' | null (null = rien n'est autorisé).
// « unknown » est considéré « high » : n'est autorisé que lorsque le plafond est « high ».
// Un plafond ou un niveau inconnu n'est jamais une autorisation implicite.
function isIntensityLevelAllowed(level, maxIntensity) {
  if (maxIntensity === null || maxIntensity === undefined) return false;
  const ceiling = SAFETY_INTENSITY_RANK[maxIntensity];
  const rank = SAFETY_INTENSITY_RANK[level];
  if (ceiling === undefined || rank === undefined) return false;
  return rank <= ceiling;
}

function isExerciseIntensityAllowed(exerciseId, maxIntensity) {
  return isIntensityLevelAllowed(getExerciseIntensity(exerciseId).intensity, maxIntensity);
}

// Exercices dont la classification reste provisoire (tous, tant qu'aucune validation n'a eu lieu) : pour la documentation.
function listProvisionalIntensities() {
  return Object.keys(SAFETY_INTENSITY_REGISTRY).filter((id) => getExerciseIntensity(id).status !== 'validated');
}
