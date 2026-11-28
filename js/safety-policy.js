// Moteur central de politique de sécurité (sous-lot 0b-2) — RÉFÉRENCE UNIQUE des décisions de sécurité.
//
// Pur et déterministe : ni DOM, ni réseau, ni stockage, ni horloge, ni IA. Il lit seulement le profil reçu
// (via deriveSafetyState) et le registre d'intensité (safety-intensity.js). Il est recalculé à CHAQUE action sensible :
// ne jamais conserver une ancienne décision.
//
// TRANSPARENCE MÉDICALE : les règles ci-dessous sont des garde-fous PROVISOIRES de produit, validés par le fondateur.
// Ce ne sont ni des recommandations médicales ni des règles validées par un professionnel. Chaque paramètre non validé est
// déclaré dans SAFETY_POLICY_PARAMETERS et listé dans `pendingValidation` des résultats. Rien ici ne diagnostique, ne
// déduit qu'une personne est médicalement apte, ne fixe un délai de reprise, une fréquence cardiaque, une limite de volume
// médicale ni un numéro d'urgence.

const SAFETY_POLICY_VERSION = 1;

const SAFETY_POLICY_ACTIONS = [
  'view',
  'start-training',
  'start-recovery',
  'resume',
  'adjust-up',
  'start-challenge',
  'start-cycle',
  'coach-adapt',
  'swap',
  'start-activity', // activité annexe hors séance (Kegel, hydratation…), classée par SAFETY_ACTIVITIES
];

// Niveaux, du moins au plus restrictif.
const SAFETY_POLICY_TIERS = ['clear', 'caution', 'restricted', 'blocked'];
const SAFETY_PHYSICAL_LIMITATIONS = ['knees', 'back', 'shoulders', 'balance', 'mobility'];
const SAFETY_CYCLE_MODES = ['standard', 'maintenance', 'phase2'];
// Adaptations du coach connues : ce sont toutes des réductions ou des substitutions (jamais une augmentation).
const SAFETY_KNOWN_ADAPTATIONS = ['reduce-sets', 'light', 'shorter-rest', 'no-equipment', 'mini', 'comeback', 'swap-categories'];

// Activités annexes, classées selon leur NATURE RÉELLE (et non selon leur présentation dans l'application) :
//   physical:false : aucune activité physique (suivi de l'hydratation) : jamais restreinte par la politique ;
//   physical:true  : activité physique : elle ne contourne jamais une interdiction d'entraînement, demande la confirmation
//                    de compréhension comme une séance, et respecte le plafond d'intensité (« unknown » compte comme « high »).
// Provisoire : aucune de ces classifications n'est validée (voir `activity-classification`).
const SAFETY_ACTIVITIES = {
  hydration: {
    physical: false,
    status: 'provisional',
    basis: 'Suivi de la consommation d’eau : aucune activité physique.',
  },
  kegel: {
    physical: true,
    intensity: 'unknown',
    status: 'provisional',
    basis: 'Routine guidée de contractions musculaires : activité physique. Intensité non classée (aucune donnée existante) : traitée comme haute intensité sous restriction.',
  },
};

// Textes de la confirmation avant la première séance. Ce n'est ni une autorisation médicale, ni une dispense de
// responsabilité, ni une garantie de sécurité.
const SAFETY_ACK_TEXT = 'HomeFit adapte ses séances à partir des informations que tu choisis de communiquer. Si tu ne renseignes pas tes précautions, l’application ne peut pas vérifier que les exercices te conviennent. Tu peux compléter ton questionnaire dans les réglages à tout moment.';
const SAFETY_ACK_BUTTON_LABEL = 'J’ai compris, continuer';

// Paramètres provisoires. `needs` : qui doit valider. `question` : repère du questionnaire de validation (M1 à M9).
const SAFETY_POLICY_PARAMETERS = {
  'caution-tier': {
    rule: 'Questionnaire non renseigné ou refusé : niveau « caution », confirmation avant toute séance, aucune augmentation.',
    status: 'provisional', needs: 'produit + médical', question: 'M9',
  },
  'acknowledgement-content': {
    rule: 'Texte et déclenchement de la confirmation « J’ai compris, continuer ».',
    status: 'provisional', needs: 'médical', question: 'M9',
  },
  'restricted-progression': {
    rule: 'Situations physiques déclarées : filtre d’exercices existant, aucune augmentation de charge, niveau plafonné à la séance de base.',
    status: 'provisional', needs: 'sport + médical', question: 'M6',
  },
  'volume-cap': {
    rule: 'Plafond de volume = séance de base (facteur 1,0) dès que le niveau n’est pas « clear ».',
    status: 'provisional', needs: 'sport + médical', question: 'M6',
  },
  'professional-advice-limits': {
    rule: 'Avis professionnel : aucune haute intensité (plafond « moderate », « unknown » traité comme « high »). Les consignes exactes du professionnel ne sont pas connues.',
    status: 'provisional', needs: 'médical', question: 'M4',
  },
  'intensity-classification': {
    rule: 'Classification d’intensité des exercices (registre safety-intensity.js) : aucune n’est validée.',
    status: 'provisional', needs: 'sport + médical', question: 'M5',
  },
  'chest-blocks-training': {
    rule: 'Symptômes thoraciques déclarés (nouveaux, inexpliqués, non précisés ou évalués) : aucun entraînement, aucune reprise.',
    status: 'provisional', needs: 'médical', question: 'M1',
  },
  'chest-context-policy': {
    rule: 'Contexte « evaluated » : n’est PAS une autorisation de reprendre ; traité comme les autres contextes tant qu’aucune règle n’est validée.',
    status: 'provisional', needs: 'médical', question: 'M1/M3',
  },
  'recovery-after-chest': {
    rule: 'Aucune séance de récupération proposée en cas de symptômes thoraciques déclarés.',
    status: 'provisional', needs: 'médical', question: 'M2',
  },
  'urgent-signal-handling': {
    rule: 'Signal urgent en séance : arrêt immédiat, effacement de la séance en pause, aucune reprise, aucun détail médical conservé.',
    status: 'provisional', needs: 'médical', question: 'M7',
  },
  'messages-wording': {
    rule: 'Formulation des messages affichés à l’utilisateur.',
    status: 'provisional', needs: 'médical', question: 'M7/M8',
  },
  'activity-classification': {
    rule: 'Activités annexes : l’hydratation n’est pas une activité physique (jamais restreinte) ; le Kegel en est une (même interdiction qu’une séance, confirmation requise, intensité non classée donc traitée comme haute).',
    status: 'provisional', needs: 'sport + médical', question: 'M2/M5',
  },
};

// Messages affichés. Prudents, sans diagnostic, sans numéro d'urgence (« services d'urgence locaux »).
const SAFETY_POLICY_MESSAGES = {
  'acknowledgement-required': { severity: 'caution', text: SAFETY_ACK_TEXT },
  'caution-unanswered': {
    severity: 'caution',
    text: 'Ton questionnaire de sécurité n’est pas renseigné : HomeFit ne peut pas vérifier que les exercices te conviennent. Ta progression est limitée. Tu peux le compléter dans les réglages.',
  },
  'caution-declined': {
    severity: 'caution',
    text: 'Tu as choisi de ne pas répondre au questionnaire de sécurité : HomeFit ne peut pas vérifier que les exercices te conviennent. Ta progression est limitée. Tu peux le compléter dans les réglages.',
  },
  'data-ambiguous': {
    severity: 'caution',
    text: 'Certaines informations de ton questionnaire n’ont pas pu être lues : par prudence, elles ne sont pas considérées comme « aucune situation ».',
  },
  'physical-restricted': {
    severity: 'caution',
    text: 'Les exercices qui ne correspondent pas à tes précautions sont écartés, et ta progression est limitée.',
  },
  'professional-advice-restricted': {
    severity: 'warning',
    text: 'Un professionnel t’a conseillé de limiter certains efforts. HomeFit ne connaît pas ses consignes exactes : respecte-les. Par prudence, seuls les exercices classés comme peu intenses sont proposés, et ta progression est limitée.',
  },
  'chest-blocked': {
    severity: 'warning',
    text: 'Tu as indiqué des symptômes thoraciques ou une difficulté respiratoire inhabituelle. Par prudence, HomeFit ne propose aucun entraînement pour le moment. Demande une évaluation à un professionnel de santé avant de reprendre une activité physique. Si les symptômes sont graves ou persistent, contacte les services d’urgence locaux.',
  },
  'chest-evaluated-unvalidated': {
    severity: 'warning',
    text: 'Tu as indiqué que tes symptômes thoraciques ont été évalués. HomeFit ne peut pas vérifier ce que ton professionnel de santé t’autorise : suis ses consignes. Par prudence, aucun entraînement n’est proposé pour le moment.',
  },
};

function safetyTierRank(tier) {
  const index = SAFETY_POLICY_TIERS.indexOf(tier);
  return index === -1 ? SAFETY_POLICY_TIERS.length - 1 : index; // niveau inconnu : le plus restrictif
}

// Évalue la politique pour un profil et une action. Retourne toujours un objet complet ; `allowed` vaut false par défaut
// pour toute action ou donnée inconnue (jamais une autorisation implicite).
function evaluateSafetyPolicy(profile, context) {
  const ctx = context !== null && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const action = SAFETY_POLICY_ACTIONS.includes(ctx.action) ? ctx.action : null;
  const state = deriveSafetyState(profile);

  const reasons = [];
  const pendingValidation = [];
  const messages = [];
  const addPending = (id) => { if (!pendingValidation.includes(id)) pendingValidation.push(id); };
  const addMessage = (id) => {
    if (messages.some((m) => m.id === id)) return;
    messages.push({ id, severity: SAFETY_POLICY_MESSAGES[id].severity, text: SAFETY_POLICY_MESSAGES[id].text, status: 'provisional' });
  };

  let tier = 'clear';
  const raise = (next) => { if (safetyTierRank(next) > safetyTierRank(tier)) tier = next; };
  let maxIntensity = 'high';
  let canStartTraining = true;
  let canOfferRecovery = true;

  // A / B — questionnaire non renseigné ou refusé : même politique prudente ; le refus reste identifiable.
  if (state.status === 'unanswered') {
    reasons.push('questionnaire-unanswered');
    raise('caution');
    addMessage('caution-unanswered');
    addPending('caution-tier');
  }
  if (state.declined) {
    reasons.push('questionnaire-declined');
    raise('caution');
    addMessage('caution-declined');
    addPending('caution-tier');
  }
  if (state.ambiguous) {
    reasons.push('data-ambiguous');
    raise('caution');
    addMessage('data-ambiguous');
    addPending('caution-tier');
  }

  // D — situations physiques : « restricted » ; le filtre d'exercices existant s'applique, les restrictions s'additionnent.
  if (state.limitations.some((id) => SAFETY_PHYSICAL_LIMITATIONS.includes(id))) {
    reasons.push('physical-limitations');
    raise('restricted');
    addMessage('physical-restricted');
    addPending('restricted-progression');
  }

  // F — avis professionnel : aucune haute intensité ; tout exercice non classé compte comme haute intensité.
  if (state.professionalAdvice) {
    reasons.push('professional-advice');
    raise('restricted');
    maxIntensity = 'moderate';
    addMessage('professional-advice-restricted');
    addPending('professional-advice-limits');
    addPending('intensity-classification');
  }

  // E — symptômes thoraciques : « blocked » quel que soit le contexte (« evaluated » n'est pas une autorisation).
  if (state.chestSymptoms) {
    reasons.push(state.chestContext === 'evaluated' ? 'chest-symptoms-evaluated-unvalidated' : 'chest-symptoms-unevaluated');
    raise('blocked');
    canStartTraining = false;
    canOfferRecovery = false;
    maxIntensity = null;
    addMessage(state.chestContext === 'evaluated' ? 'chest-evaluated-unvalidated' : 'chest-blocked');
    addPending('chest-blocks-training');
    addPending('recovery-after-chest');
    if (state.chestContext === 'evaluated') addPending('chest-context-policy');
  }

  // Progression : seule la situation « clear » (questionnaire rempli, aucune situation) conserve le moteur historique.
  const unrestricted = tier === 'clear';
  const allowIncrease = unrestricted;
  const allowPhase2 = unrestricted;
  const allowAdjustUp = unrestricted;
  const allowChallenges = unrestricted;
  const volumeCap = unrestricted ? null : 1;
  if (!unrestricted) addPending('volume-cap');

  // Confirmation de compréhension : questionnaire non renseigné ou refusé (même avec des situations déclarées).
  const requiresAcknowledgement = (state.status === 'unanswered' || state.declined) && !state.acknowledgedAt;
  if (requiresAcknowledgement) {
    addMessage('acknowledgement-required');
    addPending('acknowledgement-content');
  }
  if (messages.length) addPending('messages-wording');

  // Un exercice est autorisé s'il est compatible avec les précautions ET dans le plafond d'intensité.
  const exerciseDenial = (id) => {
    // Un exercice absent des données de sécurité n'est jamais autorisé (une donnée inconnue n'est pas une autorisation implicite).
    if (typeof id !== 'string' || !id || !Object.prototype.hasOwnProperty.call(SAFETY_EXERCISE_DATA, id)) return 'exercise-unknown';
    if (!evaluateExerciseCompatibility(id, profile).compatible) return `exercise-incompatible:${id}`;
    if (!isExerciseIntensityAllowed(id, maxIntensity)) return `exercise-intensity:${id}`;
    return null;
  };

  // Une activité annexe suit sa nature réelle : non physique = jamais restreinte ; physique = mêmes garde-fous qu'une séance.
  const activityDenials = (activityId) => {
    const activity = typeof activityId === 'string' && Object.prototype.hasOwnProperty.call(SAFETY_ACTIVITIES, activityId) ? SAFETY_ACTIVITIES[activityId] : null;
    if (!activity) return ['activity-unknown'];
    addPending('activity-classification');
    if (!activity.physical) return [];
    const codes = [];
    if (!canStartTraining) codes.push('tier-blocked');
    if (requiresAcknowledgement) codes.push('acknowledgement-required');
    if (!isIntensityLevelAllowed(activity.intensity, maxIntensity)) codes.push(`activity-intensity:${activityId}`);
    return codes;
  };

  // ── Décision pour l'action demandée ──
  const denied = [];
  const deny = (code) => { if (!denied.includes(code)) denied.push(code); };
  if (action === null) {
    deny('unknown-action');
  } else if (action === 'start-training') {
    if (!canStartTraining) deny('tier-blocked');
    if (requiresAcknowledgement) deny('acknowledgement-required');
  } else if (action === 'start-recovery') {
    if (!canOfferRecovery) deny('recovery-not-offered');
    if (requiresAcknowledgement) deny('acknowledgement-required');
  } else if (action === 'resume') {
    // Une séance enregistrée est RÉÉVALUÉE avec le profil actuel : son contenu doit être connu et rester autorisé.
    const recovery = ctx.recovery === true;
    if (recovery ? !canOfferRecovery : !canStartTraining) deny(recovery ? 'recovery-not-offered' : 'tier-blocked');
    if (requiresAcknowledgement) deny('acknowledgement-required');
    if (!Array.isArray(ctx.exercises) || ctx.exercises.length === 0) deny('resume-content-unknown');
    else ctx.exercises.forEach((exercise) => { const code = exerciseDenial(exercise && exercise.id); if (code) deny(code); });
  } else if (action === 'adjust-up') {
    if (!allowAdjustUp) deny('increase-not-allowed');
  } else if (action === 'start-challenge') {
    const challenge = ctx.challenge;
    const hasActivity = challenge !== null && typeof challenge === 'object' && challenge.activity !== undefined;
    if (challenge === null || typeof challenge !== 'object' || !Array.isArray(challenge.exerciseIds) || typeof challenge.progressive !== 'boolean'
        || (challenge.exerciseIds.length === 0 && !hasActivity)) {
      deny('challenge-unknown'); // un défi sans exercice doit déclarer sa nature (activité) : jamais une autorisation implicite
    } else {
      if (challenge.exerciseIds.length > 0) {
        // Défi qui prescrit de l'effort : mêmes garde-fous qu'une séance.
        if (!canStartTraining) deny('tier-blocked');
        if (requiresAcknowledgement) deny('acknowledgement-required');
        challenge.exerciseIds.forEach((id) => { const code = exerciseDenial(id); if (code) deny(code); });
      }
      if (hasActivity) activityDenials(challenge.activity).forEach(deny);
      if (challenge.progressive && !allowChallenges) deny('progressive-challenge-not-allowed');
    }
  } else if (action === 'start-cycle') {
    if (!SAFETY_CYCLE_MODES.includes(ctx.mode)) deny('cycle-mode-unknown');
    else if (ctx.mode === 'phase2' && !allowPhase2) deny('phase2-not-allowed');
  } else if (action === 'coach-adapt') {
    const type = ctx.adaptation && ctx.adaptation.type;
    if (!SAFETY_KNOWN_ADAPTATIONS.includes(type)) deny('adaptation-unknown');
    if (!canStartTraining) deny('tier-blocked');
  } else if (action === 'swap') {
    if (!canStartTraining) deny('tier-blocked');
    const code = exerciseDenial(ctx.exerciseId);
    if (code) deny(code);
  } else if (action === 'start-activity') {
    activityDenials(ctx.activity).forEach(deny);
  } // 'view' : toujours autorisée (affichage des messages et des pages)

  return {
    version: SAFETY_POLICY_VERSION,
    action,
    tier,
    state: {
      status: state.status,
      declined: state.declined,
      limitations: state.limitations.slice(),
      chestContext: state.chestContext,
      ambiguous: state.ambiguous,
    },
    allowed: denied.length === 0,
    canStartTraining,
    canOfferRecovery,
    requiresAcknowledgement,
    maxIntensity,
    allowIncrease,
    allowPhase2,
    allowAdjustUp,
    allowChallenges,
    volumeCap,
    reasons: reasons.concat(denied.map((code) => `denied:${code}`)),
    messages,
    pendingValidation,
  };
}

// Paramètres provisoires (pour la documentation et les tests) : tous, tant qu'aucune validation n'a eu lieu.
function listProvisionalSafetyParameters() {
  return Object.keys(SAFETY_POLICY_PARAMETERS).filter((id) => SAFETY_POLICY_PARAMETERS[id].status !== 'validated');
}
