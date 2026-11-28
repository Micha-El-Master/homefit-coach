// Sous-lot 0b-2 : moteur central de politique de sécurité (js/safety-policy.js) et son intégration au moteur sportif.
// Les règles testées sont des garde-fous PROVISOIRES de produit : ces tests vérifient leur application, pas leur validité médicale.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const PHYSICAL = ['knees', 'back', 'shoulders', 'balance', 'mobility'];
const ALL_IDS = [...PHYSICAL, 'professional_advice', 'chest_symptoms'];
const TIERS = ['clear', 'caution', 'restricted', 'blocked'];
const ACTIONS = ['view', 'start-training', 'start-recovery', 'resume', 'adjust-up', 'start-challenge', 'start-cycle', 'coach-adapt', 'swap', 'start-activity'];
const ADAPTATIONS = ['reduce-sets', 'light', 'shorter-rest', 'no-equipment', 'mini', 'comeback', 'swap-categories'];
const TITLES = ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio'];
const pure = createApp({ now: NOW });
const rank = (t) => TIERS.indexOf(t);
const J = JSON.stringify;

const SAFE = (safety) => ({ safety });
const evalP = (safety, context) => pure.run(`evaluateSafetyPolicy(${J(SAFE(safety))}, ${J(context)})`);
const NONE = { status: 'none', responded: true, limitations: [] };
const withAck = (s) => ({ ...s, acknowledgedAt: '2026-10-01' });

function app(safety, extra = {}) {
  const a = createApp({ now: NOW });
  a.profile({ startDate: '2026-08-17', ...extra, safety });
  a.settings({ equipment: ['chaise', 'charges', 'elastique'], ...(extra.__settings || {}) });
  return a;
}
function declared(limitations, extra = {}) {
  return { status: 'declared', responded: true, limitations, ...extra };
}

// ───────────── Structure du résultat, pureté, déterminisme ─────────────

test('résultat : tous les champs fonctionnels demandés sont présents', () => {
  const p = evalP(NONE, { action: 'start-training' });
  ['version', 'tier', 'state', 'allowed', 'canStartTraining', 'canOfferRecovery', 'requiresAcknowledgement', 'maxIntensity',
    'allowIncrease', 'allowPhase2', 'allowAdjustUp', 'allowChallenges', 'volumeCap', 'reasons', 'messages', 'pendingValidation'].forEach((k) => assert.ok(k in p, k));
  assert.strictEqual(p.version, 1);
  assert.deepStrictEqual(pure.run('SAFETY_POLICY_ACTIONS'), ACTIONS);
});

test('pureté : déterministe, sans effet de bord, indépendante de l\'horloge et du profil gelé', () => {
  const result = pure.run(`(function () {
    const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
    const profile = deepFreeze({ name: 'x', safety: { status: 'declared', limitations: ['knees', 'chest_symptoms'], declined: true } });
    const before = JSON.stringify(profile);
    const a = evaluateSafetyPolicy(profile, { action: 'swap', exerciseId: 'squat' });
    const b = evaluateSafetyPolicy(profile, { action: 'swap', exerciseId: 'squat' });
    return { same: JSON.stringify(a) === JSON.stringify(b), untouched: JSON.stringify(profile) === before };
  })()`);
  assert.deepStrictEqual(result, { same: true, untouched: true });
  const later = createApp({ now: new Date(2030, 0, 1) });
  assert.deepStrictEqual(later.run(`evaluateSafetyPolicy(${J(SAFE(declared(['knees'])))}, { action: 'view' })`), evalP(declared(['knees']), { action: 'view' }));
});

test('indépendance : le moteur de politique ne dépend ni du DOM, ni du réseau, ni du stockage, ni de l\'IA', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'safety-policy.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ['document', 'window', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'navigator', 'Date', 'Math.random', 'deepseek', 'getProfile', 'readJSON', 'writeJSON'].forEach((word) => {
    assert.ok(!src.includes(word), `safety-policy.js ne doit pas utiliser « ${word} »`);
  });
});

// ───────────── Règles provisoires A à H ─────────────

test('A. questionnaire jamais renseigné : « caution », confirmation requise, aucune augmentation', () => {
  const p = evalP(undefined, { action: 'start-training' });
  assert.strictEqual(p.tier, 'caution');
  assert.strictEqual(p.state.status, 'unanswered');
  assert.strictEqual(p.requiresAcknowledgement, true);
  assert.strictEqual(p.allowed, false);
  assert.ok(p.reasons.includes('denied:acknowledgement-required'));
  assert.deepStrictEqual([p.allowIncrease, p.allowPhase2, p.allowAdjustUp, p.allowChallenges, p.volumeCap], [false, false, false, false, 1]);
  assert.ok(p.canStartTraining && p.canOfferRecovery, 'le niveau n\'interdit rien : seule la confirmation manque');
  assert.ok(p.messages.some((m) => m.id === 'caution-unanswered'));
  assert.ok(p.messages.some((m) => m.id === 'acknowledgement-required'));
  // Une fois la confirmation enregistrée, le démarrage est autorisé (sans lever aucune limite de progression).
  const ok = evalP(withAck({ status: 'unanswered' }), { action: 'start-training' });
  assert.strictEqual(ok.allowed, true);
  assert.strictEqual(ok.requiresAcknowledgement, false);
  assert.strictEqual(ok.allowIncrease, false);
});

test('B. refus de répondre : même politique prudente, le refus reste identifiable, jamais « aucune situation »', () => {
  const p = evalP({ status: 'declined', responded: true, preferNot: true }, { action: 'start-training' });
  assert.strictEqual(p.tier, 'caution');
  assert.strictEqual(p.state.status, 'declined');
  assert.strictEqual(p.state.declined, true);
  assert.ok(p.reasons.includes('questionnaire-declined'));
  assert.ok(p.messages.some((m) => m.id === 'caution-declined'));
  assert.strictEqual(p.requiresAcknowledgement, true);
  assert.deepStrictEqual([p.allowIncrease, p.allowPhase2, p.allowAdjustUp], [false, false, false]);
  assert.notStrictEqual(p.tier, 'clear');
});

test('C. aucune situation déclarée : « clear », fonctionnement normal, aucune limite ajoutée', () => {
  const p = evalP(NONE, { action: 'start-training' });
  assert.strictEqual(p.tier, 'clear');
  assert.strictEqual(p.allowed, true);
  assert.deepStrictEqual([p.allowIncrease, p.allowPhase2, p.allowAdjustUp, p.allowChallenges, p.volumeCap, p.maxIntensity], [true, true, true, true, null, 'high']);
  assert.deepStrictEqual(p.messages, []);
  assert.deepStrictEqual(p.pendingValidation, []);
  assert.strictEqual(p.requiresAcknowledgement, false);
});

test('D. situations physiques : « restricted », filtre d\'exercices existant, restrictions cumulatives, progression limitée', () => {
  PHYSICAL.forEach((id) => {
    const p = evalP(declared([id]), { action: 'start-training' });
    assert.strictEqual(p.tier, 'restricted', id);
    assert.strictEqual(p.allowed, true, id);
    assert.strictEqual(p.maxIntensity, 'high', `${id} : aucun plafond d'intensité propre aux situations physiques`);
    assert.deepStrictEqual([p.allowIncrease, p.allowPhase2, p.allowAdjustUp, p.volumeCap], [false, false, false, 1], id);
  });
  // Cumul : un exercice interdit par l'une quelconque des situations est refusé.
  const both = declared(['knees', 'back']);
  assert.strictEqual(evalP(both, { action: 'swap', exerciseId: 'squat' }).allowed, false); // genoux
  assert.strictEqual(evalP(both, { action: 'swap', exerciseId: 'superman' }).allowed, false); // dos
  assert.strictEqual(evalP(declared(['knees']), { action: 'swap', exerciseId: 'superman' }).allowed, true);
});

test('E. symptômes thoraciques : « blocked » quel que soit le contexte, « evaluated » n\'est pas une autorisation', () => {
  ['unspecified', 'new_or_unexplained', 'evaluated'].forEach((chestContext) => {
    const s = declared(['chest_symptoms'], { chestContext });
    const p = evalP(s, { action: 'start-training' });
    assert.strictEqual(p.tier, 'blocked', chestContext);
    assert.deepStrictEqual([p.canStartTraining, p.canOfferRecovery, p.maxIntensity], [false, false, null], chestContext);
    assert.strictEqual(p.allowed, false);
    assert.strictEqual(evalP(s, { action: 'resume', exercises: [{ id: 'respiration-profonde' }] }).allowed, false, `${chestContext} : reprise`);
    assert.strictEqual(evalP(s, { action: 'start-recovery' }).allowed, false, `${chestContext} : récupération non proposée`);
    assert.ok(p.messages.some((m) => /^chest-/.test(m.id)), chestContext);
    assert.ok(p.pendingValidation.includes('chest-blocks-training') && p.pendingValidation.includes('recovery-after-chest'));
  });
  assert.ok(evalP(declared(['chest_symptoms'], { chestContext: 'evaluated' }), { action: 'view' }).pendingValidation.includes('chest-context-policy'));
});

test('E. symptômes thoraciques : messages prudents, sans diagnostic, sans numéro d\'urgence, évaluation médicale conseillée', () => {
  ['unspecified', 'evaluated'].forEach((chestContext) => {
    const p = evalP(declared(['chest_symptoms'], { chestContext }), { action: 'view' });
    const text = p.messages.map((m) => m.text).join(' ');
    assert.ok(/professionnel de santé/.test(text) || chestContext === 'evaluated', `${chestContext} : évaluation médicale`);
    if (chestContext === 'unspecified') assert.ok(/services d’urgence locaux/.test(text), 'formulation générique des services d\'urgence');
    assert.ok(!/\b(15|17|18|112|911|999|144)\b/.test(text), 'aucun numéro d\'urgence inventé');
    assert.ok(!/diagnostic|maladie|infarctus|cardiaque|pathologie|AVC/i.test(text), 'aucun diagnostic');
  });
});

test('F. avis professionnel : « restricted », aucune haute intensité, tout exercice non classé compte comme haute intensité', () => {
  const p = evalP(declared(['professional_advice']), { action: 'start-training' });
  assert.strictEqual(p.tier, 'restricted');
  assert.strictEqual(p.maxIntensity, 'moderate');
  assert.ok(p.messages.some((m) => m.id === 'professional-advice-restricted'));
  assert.ok(p.pendingValidation.includes('professional-advice-limits') && p.pendingValidation.includes('intensity-classification'));
  // exercices : classés « low » autorisés ; « high » et « unknown » refusés
  assert.strictEqual(evalP(declared(['professional_advice']), { action: 'swap', exerciseId: 'respiration-profonde' }).allowed, true);
  assert.strictEqual(evalP(declared(['professional_advice']), { action: 'swap', exerciseId: 'burpees' }).allowed, false);
  assert.strictEqual(evalP(declared(['professional_advice']), { action: 'swap', exerciseId: 'pompes' }).allowed, false, 'pompes : non classé donc traité comme haute intensité');
  // Les consignes précises du professionnel ne sont jamais inventées : aucun champ ne les décrit.
  assert.ok(!('restrictions' in p) && !('professionalRestrictions' in p));
});

test('G. combinaisons : la règle la plus restrictive l\'emporte et rien ne s\'annule', () => {
  assert.strictEqual(evalP(declared(['chest_symptoms', 'knees', 'professional_advice']), { action: 'view' }).tier, 'blocked');
  const pro = evalP(declared(['professional_advice', 'knees']), { action: 'view' });
  assert.strictEqual(pro.tier, 'restricted');
  assert.strictEqual(pro.maxIntensity, 'moderate');
  assert.strictEqual(evalP(declared(['knees'], { declined: true }), { action: 'view' }).requiresAcknowledgement, true, 'refus + situation : confirmation requise');
  // Un état « aucune situation » + un refus ne se contredisent jamais : le refus l'emporte.
  assert.strictEqual(evalP({ status: 'none', declined: true }, { action: 'view' }).state.status, 'declined');
});

test('données absentes, inconnues ou mal formées : jamais « clear »', () => {
  const bad = [undefined, null, 'x', 42, [], {}, { status: 'inconnu' }, { status: 'none', responded: false }, { limitations: 'knees' },
    { responded: true, limitations: ['ancienne'] }, { status: 'declared' }, { status: 'none', preferNot: 'oui' }, { status: ['none'] }];
  bad.forEach((safety) => {
    const p = evalP(safety, { action: 'start-training' });
    assert.notStrictEqual(p.tier, 'clear', J(safety));
    assert.strictEqual(p.allowIncrease, false, J(safety));
  });
});

// ───────────── Actions contextuelles ─────────────

test('actions : une action ou un contexte inconnu n\'est jamais autorisé implicitement', () => {
  assert.strictEqual(evalP(NONE, { action: 'inconnue' }).allowed, false);
  assert.strictEqual(evalP(NONE, {}).allowed, false);
  assert.strictEqual(pure.run(`evaluateSafetyPolicy(${J(SAFE(NONE))}).allowed`), false);
  assert.strictEqual(pure.run(`evaluateSafetyPolicy(${J(SAFE(NONE))}, null).allowed`), false);
  assert.strictEqual(evalP(NONE, { action: 'coach-adapt', adaptation: { type: 'surcharge' } }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'coach-adapt' }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'swap', exerciseId: 'exercice-inconnu' }).allowed, false);
  assert.strictEqual(evalP(undefined, { action: 'swap', exerciseId: 'exercice-inconnu' }).allowed, false, 'même sous « caution »');
  assert.strictEqual(evalP(NONE, { action: 'swap' }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'resume' }).allowed, false, 'contenu de la séance inconnu');
  assert.strictEqual(evalP(NONE, { action: 'resume', exercises: [] }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'resume', exercises: [{ id: 'exercice-inconnu' }] }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'start-challenge' }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'start-challenge', challenge: { exerciseIds: 'pompes', progressive: true } }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'start-cycle' }).allowed, false);
  assert.strictEqual(evalP(NONE, { action: 'start-cycle', mode: 'turbo' }).allowed, false);
});

test('actions : les 9 actions sur l\'état « clear »', () => {
  const ok = (c) => evalP(NONE, c).allowed;
  assert.ok(ok({ action: 'view' }) && ok({ action: 'start-training' }) && ok({ action: 'start-recovery' }) && ok({ action: 'adjust-up' }));
  assert.ok(ok({ action: 'resume', exercises: [{ id: 'pompes' }, { id: 'squat' }] }));
  assert.ok(ok({ action: 'start-challenge', challenge: { exerciseIds: ['pompes'], progressive: true } }));
  assert.ok(ok({ action: 'start-cycle', mode: 'phase2' }) && ok({ action: 'start-cycle', mode: 'standard' }) && ok({ action: 'start-cycle', mode: 'maintenance' }));
  ADAPTATIONS.forEach((type) => assert.ok(ok({ action: 'coach-adapt', adaptation: { type } }), type));
  assert.ok(ok({ action: 'swap', exerciseId: 'burpees' }));
});

test('actions : sous « caution » et « restricted », aucune augmentation (hausse, phase 2, défi à charge croissante)', () => {
  [withAck({ status: 'unanswered' }), withAck({ status: 'declined', preferNot: true, responded: true }), declared(['knees']), declared(['professional_advice'])].forEach((s) => {
    assert.strictEqual(evalP(s, { action: 'adjust-up' }).allowed, false, J(s));
    assert.strictEqual(evalP(s, { action: 'start-cycle', mode: 'phase2' }).allowed, false, J(s));
    assert.strictEqual(evalP(s, { action: 'start-cycle', mode: 'maintenance' }).allowed, true, 'les réductions restent autorisées');
    assert.strictEqual(evalP(s, { action: 'start-challenge', challenge: { exerciseIds: [], activity: 'hydration', progressive: true } }).allowed, false, J(s));
    assert.strictEqual(evalP(s, { action: 'start-challenge', challenge: { exerciseIds: [], activity: 'hydration', progressive: false } }).allowed, true, 'défi sans charge croissante ni activité physique');
  });
});

test('actions : confirmation requise avant toute action qui démarre un effort', () => {
  const unanswered = undefined;
  ['start-training', 'start-recovery'].forEach((action) => assert.strictEqual(evalP(unanswered, { action }).allowed, false, action));
  assert.strictEqual(evalP(unanswered, { action: 'resume', exercises: [{ id: 'respiration-profonde' }], recovery: true }).allowed, false);
  assert.strictEqual(evalP(unanswered, { action: 'start-challenge', challenge: { exerciseIds: ['squat'], progressive: false } }).allowed, false);
  assert.strictEqual(evalP(unanswered, { action: 'view' }).allowed, true);
  // La confirmation ne rend jamais autorisé un état bloqué.
  const blockedAcked = withAck(declared(['chest_symptoms'], { declined: true }));
  assert.strictEqual(evalP(blockedAcked, { action: 'start-training' }).allowed, false);
  assert.strictEqual(evalP(blockedAcked, { action: 'start-training' }).requiresAcknowledgement, false);
});

// ───────────── Invariants ─────────────

// Un profil est décrit par ses facettes ; la confirmation est donnée (précondition résolue par l'utilisateur, pas une restriction).
function profileOf(limitations, declinedFacet, chestContext = 'unspecified') {
  const status = limitations.length ? 'declared' : declinedFacet ? 'declined' : 'none';
  return { status, responded: true, limitations, declined: declinedFacet, chestContext, acknowledgedAt: '2026-10-01', answeredAt: '2026-10-01' };
}
const SAMPLE_CONTEXTS = [
  { action: 'view' }, { action: 'start-training' }, { action: 'start-recovery' }, { action: 'adjust-up' },
  { action: 'resume', exercises: [{ id: 'respiration-profonde' }, { id: 'pompes' }] },
  { action: 'resume', exercises: [{ id: 'respiration-profonde' }], recovery: true },
  { action: 'start-challenge', challenge: { exerciseIds: ['squat'], progressive: true } },
  { action: 'start-challenge', challenge: { exerciseIds: [], activity: 'hydration', progressive: false } },
  { action: 'start-challenge', challenge: { exerciseIds: [], activity: 'kegel', progressive: false } },
  { action: 'start-activity', activity: 'hydration' }, { action: 'start-activity', activity: 'kegel' },
  { action: 'start-cycle', mode: 'phase2' }, { action: 'start-cycle', mode: 'standard' },
  { action: 'coach-adapt', adaptation: { type: 'light' } }, { action: 'coach-adapt', adaptation: { type: 'swap-categories' } },
  { action: 'swap', exerciseId: 'respiration-profonde' }, { action: 'swap', exerciseId: 'pompes' }, { action: 'swap', exerciseId: 'burpees' }, { action: 'swap', exerciseId: 'squat' },
];

test('invariant 1 : ajouter une restriction ne rend jamais une action plus permissive (toutes les situations, 2 304 arêtes)', () => {
  const intensity = { null: 0, low: 1, moderate: 2, high: 3 };
  const noMore = (a, b, label) => {
    // b = a + une restriction
    assert.ok(rank(b.tier) >= rank(a.tier), `${label} : niveau`);
    assert.ok(intensity[b.maxIntensity] <= intensity[a.maxIntensity], `${label} : plafond d'intensité`);
    ['allowed', 'canStartTraining', 'canOfferRecovery', 'allowIncrease', 'allowPhase2', 'allowAdjustUp', 'allowChallenges'].forEach((k) => assert.ok(!b[k] || a[k], `${label} : ${k}`));
    assert.ok((a.volumeCap === null ? Infinity : a.volumeCap) >= (b.volumeCap === null ? Infinity : b.volumeCap), `${label} : plafond de volume`);
  };
  let edges = 0;
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    for (const declinedFacet of [false, true]) {
      const base = profileOf(limitations, declinedFacet);
      const successors = [];
      ALL_IDS.forEach((id) => { if (!limitations.includes(id)) successors.push(profileOf(ALL_IDS.filter((x) => x === id || limitations.includes(x)), declinedFacet)); });
      if (!declinedFacet) successors.push(profileOf(limitations, true));
      successors.forEach((next) => SAMPLE_CONTEXTS.forEach((ctx) => {
        // Un refus « seul » (aucune situation) change le niveau « clear » en « caution » : toujours moins permissif.
        noMore(evalP(base, ctx), evalP(next, ctx), `${J(base.limitations)}+${declinedFacet} -> ${J(next.limitations)}+${next.declined} / ${ctx.action}`);
        edges++;
      }));
    }
  }
  assert.ok(edges > 2000);
});

test('invariant 3 : un état bloqué ne peut être contourné par aucun parcours (toutes les combinaisons thoraciques)', () => {
  const effort = [
    { action: 'start-training' }, { action: 'start-recovery' },
    { action: 'resume', exercises: [{ id: 'respiration-profonde' }] }, { action: 'resume', exercises: [{ id: 'respiration-profonde' }], recovery: true },
    { action: 'adjust-up' }, { action: 'start-cycle', mode: 'phase2' },
    { action: 'start-challenge', challenge: { exerciseIds: ['squat'], progressive: true } },
    { action: 'start-challenge', challenge: { exerciseIds: ['planche'], progressive: false } },
    { action: 'start-challenge', challenge: { exerciseIds: [], activity: 'kegel', progressive: false } },
    { action: 'start-activity', activity: 'kegel' },
    ...ADAPTATIONS.map((type) => ({ action: 'coach-adapt', adaptation: { type } })),
    ...['respiration-profonde', 'pompes', 'burpees', 'squat', 'chat-vache'].map((exerciseId) => ({ action: 'swap', exerciseId })),
  ];
  let count = 0;
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    if (!limitations.includes('chest_symptoms')) continue;
    for (const declinedFacet of [false, true]) for (const ack of [false, true]) for (const chestContext of ['unspecified', 'new_or_unexplained', 'evaluated']) {
      const s = { ...profileOf(limitations, declinedFacet, chestContext), acknowledgedAt: ack ? '2026-10-01' : null };
      const view = evalP(s, { action: 'view' });
      assert.strictEqual(view.tier, 'blocked');
      assert.strictEqual(view.allowed, true, 'consulter les messages reste possible');
      effort.forEach((ctx) => { assert.strictEqual(evalP(s, ctx).allowed, false, `${J(s)} / ${ctx.action}`); count++; });
      assert.strictEqual(evalP(s, { action: 'start-cycle', mode: 'standard' }).allowed, true, 'recommencer un programme n\'est pas un effort');
    }
  }
  assert.ok(count > 5000);
});

test('invariant 3 (suite) : le moteur sportif ne génère aucune séance, aucune récupération, aucune adaptation en état bloqué', () => {
  ['unspecified', 'new_or_unexplained', 'evaluated'].forEach((chestContext) => {
    const a = app(declared(['chest_symptoms', 'knees'], { chestContext, declined: true, acknowledgedAt: '2026-10-01' }));
    [...TITLES, 'Récupération'].forEach((title) => {
      const w = a.run(`getTodayWorkout(getProfile(), ${J(title)})`);
      assert.deepStrictEqual(w.exercises, [], `${chestContext} / ${title}`);
      assert.strictEqual(w.safetyStatus, 'blocked');
      assert.strictEqual(w.policy.tier, 'blocked');
      assert.match(w.safetyNote, /évaluation|professionnel de santé|suis ses consignes/);
    });
    ADAPTATIONS.forEach((type) => {
      const r = a.run(`applyCoachAdaptation([{ id: 'respiration-profonde', sets: 1, holdSeconds: 40 }, { id: 'pompes', sets: 3, reps: 10 }], { type: ${J(type)} }, getProfile(), 45)`);
      assert.deepStrictEqual(r.exercises, [], `${chestContext} / ${type}`);
      assert.strictEqual(r.denied, true);
    });
    assert.strictEqual(a.run('startChallenge("pompes30")'), false);
    assert.strictEqual(a.run('Object.keys(getChallengeData().active).length'), 0);
    // « Recommencer » ou « Entretien » ne démarrent aucun effort ; la phase 2 est refusée.
    assert.throws(() => a.run(`startNextCycle('phase2')`), /précautions/);
  });
});

test('invariant 4 : cinquante « trop facile » ne dépassent jamais les limites autorisées', () => {
  const content = (a, title = 'Full Body + Cardio') => a.run(`getTodayWorkout(getProfile(), ${J(title)}).exercises.map((e) => [e.id, e.sets, e.reps || null, e.holdSeconds || null])`);
  [undefined, { status: 'declined', responded: true, preferNot: true }, declared(['knees']), declared(['professional_advice']), declared(['shoulders', 'back'])].forEach((safety) => {
    const base = app(safety && withAck(safety) || withAck({ status: 'unanswered' }));
    const abused = app(safety && withAck(safety) || withAck({ status: 'unanswered' }));
    const before = content(base);
    for (let i = 0; i < 50; i++) abused.run(`changeAdjustment('burpees', 2)`);
    for (let i = 0; i < 50; i++) abused.run(`changeAdjustment('planche', 5)`);
    assert.deepStrictEqual(abused.run('getAdjustments()'), {}, `${J(safety)} : aucune hausse mémorisée`);
    assert.deepStrictEqual(content(abused), before, `${J(safety)} : contenu inchangé`);
    // Même une hausse déjà présente dans les données (ancienne version) est ignorée ; une baisse reste appliquée.
    abused.set('hfc_adjust', { burpees: 80, planche: 90, 'mountain-climbers': -3 });
    const after = abused.run(`getTodayWorkout(getProfile(), 'Full Body + Cardio').exercises`);
    after.forEach((e) => {
      if (e.id === 'burpees') assert.ok(e.reps <= 10, `burpees ${e.reps}`);
      if (e.id === 'planche') assert.ok(e.holdSeconds <= 30, `planche ${e.holdSeconds}`);
    });
  });
  // Sans restriction (« clear »), le comportement historique reste : les hausses s'accumulent et s'appliquent.
  const free = app(NONE);
  const start = free.run(`getTodayWorkout(getProfile(), 'Full Body + Cardio').exercises.find((e) => e.id === 'burpees').reps`);
  for (let i = 0; i < 50; i++) free.run(`changeAdjustment('burpees', 2)`);
  assert.strictEqual(free.run('getAdjustments().burpees'), 100);
  assert.strictEqual(free.run(`getTodayWorkout(getProfile(), 'Full Body + Cardio').exercises.find((e) => e.id === 'burpees').reps`), start + 100);
});

test('progression : sous « caution » et « restricted », aucun facteur n\'augmente la séance de base (niveau, semaine, phase 2, ressenti, objectif)', () => {
  const baseProgram = pure.run('WEEK_PROGRAM.filter((d) => d.type === "training").map((d) => ({ title: d.title, exercises: d.exercises }))');
  const profiles = [withAck({ status: 'unanswered' }), withAck({ status: 'declined', responded: true, preferNot: true }), declared(['mobility']), declared(['mobility'], { declined: true, acknowledgedAt: '2026-10-01' })];
  let cases = 0;
  profiles.forEach((safety) => ['muscle', 'perte', 'forme', 'discipline'].forEach((goal) => ['2026-10-10', '2026-08-17', '2026-07-20'].forEach((startDate) => {
    const a = createApp({ now: NOW });
    a.profile({ startDate, goal, levelScore: 10, mode: 'phase2', safety });
    a.settings({ equipment: ['chaise', 'charges', 'elastique'] });
    a.sessions([{ date: '2026-10-10', title: 'Haut du corps', exercises: [], feeling: 'facile' }, { date: '2026-10-12', title: 'Jambes + Abdos', exercises: [], feeling: 'facile' }]);
    for (let i = 0; i < 50; i++) a.run(`changeAdjustment('pompes', 2)`);
    baseProgram.forEach((day) => {
      const w = a.run(`getTodayWorkout(getProfile(), ${J(day.title)})`);
      assert.ok(w.feeling !== 'facile', 'le ressenti « facile » n\'est pas appliqué');
      w.exercises.forEach((ex) => {
        const base = day.exercises.find((b) => b.id === ex.id);
        if (!base) return; // exercice remplacé ou ajouté par la sécurité : comparé par les invariants de séance
        assert.ok(ex.sets <= base.sets, `${J(safety)}/${goal}/${startDate} ${ex.id} : séries ${ex.sets} > ${base.sets}`);
        if (base.reps) assert.ok(ex.reps <= base.reps, `${ex.id} : répétitions ${ex.reps} > ${base.reps}`);
        if (base.holdSeconds) assert.ok(ex.holdSeconds <= base.holdSeconds, `${ex.id} : durée ${ex.holdSeconds} > ${base.holdSeconds}`);
        cases++;
      });
      assert.ok(w.exercises.length <= day.exercises.length, `${day.title} : aucun exercice ajouté (finisher « perte »)`);
    });
  })));
  assert.ok(cases > 200);
});

test('progression : les réductions restent appliquées sous « caution » (semaine allégée, ressenti « dur », baisses mémorisées)', () => {
  const a = app(withAck({ status: 'unanswered' }), { startDate: '2026-09-27' }); // semaine 4 : allégée
  a.sessions([{ date: '2026-10-10', title: 'Haut du corps', exercises: [], feeling: 'dur' }, { date: '2026-10-12', title: 'Jambes + Abdos', exercises: [], feeling: 'dur' }]);
  a.set('hfc_adjust', { pompes: -3 });
  const w = a.run(`getTodayWorkout(getProfile(), 'Haut du corps')`);
  const pompes = w.exercises.find((e) => e.id === 'pompes');
  assert.ok(pompes.reps < 12 - 3 + 1, `pompes réduites : ${pompes.reps}`);
  assert.strictEqual(w.feeling, 'dur');
});

test('invariant 7 : le profil « none » (clear) conserve les résultats historiques et reçoit les mêmes séances qu\'un profil sans politique', () => {
  const none = app(NONE);
  const strip = (w) => { const { safetyStatus, policy, ...rest } = w; return rest; };
  TITLES.concat('Récupération').forEach((title) => {
    const w = none.run(`getTodayWorkout(getProfile(), ${J(title)})`);
    assert.strictEqual(w.policy.tier, 'clear');
    // Même contenu que le moteur appelé sans aucune politique (scaleExercise sans 7e argument = comportement historique).
    if (title !== 'Récupération') {
      const legacy = none.run(`(function () { const w = getTodayWorkout(getProfile(), ${J(title)}); return w.exercises.map((e) => scaleExercise({ ...e, reps: e.reps, holdSeconds: e.holdSeconds }, getProfile().levelScore || getProfile().level, w.week, w.feeling, w.mode, 1).id); })()`);
      assert.deepStrictEqual(legacy, w.exercises.map((e) => e.id));
    }
    assert.ok(w.exercises.length >= 3);
  });
  assert.strictEqual(strip(none.run(`getTodayWorkout(getProfile(), 'Haut du corps')`)).safetyNote, null);
});

// ───────────── Intégration au moteur sportif ─────────────

test('séances : tous les profils (128 situations × refus) respectent compatibilité ET plafond d\'intensité', () => {
  let count = 0;
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    for (const declinedFacet of [false, true]) {
      const a = app(profileOf(limitations, declinedFacet));
      [...TITLES, 'Récupération'].forEach((title) => {
        const w = a.run(`getTodayWorkout(getProfile(), ${J(title)})`);
        const ids = w.exercises.map((e) => e.id);
        count++;
        ids.forEach((id) => {
          assert.ok(a.run(`evaluateExerciseCompatibility(${J(id)}, getProfile()).compatible`), `${J(limitations)}/${title} : ${id} incompatible`);
          assert.ok(a.run(`isExerciseIntensityAllowed(${J(id)}, ${J(w.policy.maxIntensity)})`), `${J(limitations)}/${title} : ${id} au-dessus du plafond ${w.policy.maxIntensity}`);
        });
        if (limitations.includes('chest_symptoms')) assert.deepStrictEqual(ids, []);
        else assert.ok(new Set(ids).size === ids.length);
      });
    }
  }
  assert.strictEqual(count, 128 * 2 * 5);
});

test('avis professionnel : la séance ne contient que des exercices de faible intensité (registre provisoire)', () => {
  const a = app(declared(['professional_advice']));
  TITLES.concat('Récupération').forEach((title) => {
    const w = a.run(`getTodayWorkout(getProfile(), ${J(title)})`);
    assert.ok(w.exercises.length >= 1, title);
    w.exercises.forEach((e) => assert.strictEqual(a.run(`getExerciseIntensity(${J(e.id)}).intensity`), 'low', `${title} : ${e.id}`));
    assert.strictEqual(w.policy.maxIntensity, 'moderate');
  });
});

test('récupération : proposée aux profils non bloqués avec le contenu historique, jamais en cas de symptômes thoraciques', () => {
  const full = app(NONE).run(`getRecoveryWorkout().exercises.map((e) => e.id)`);
  assert.strictEqual(full.length, 9);
  assert.deepStrictEqual(app(declared(['professional_advice'])).run('getRecoveryWorkout().exercises.map((e) => e.id)'), full);
  assert.deepStrictEqual(app(withAck({ status: 'unanswered' })).run('getRecoveryWorkout().exercises.map((e) => e.id)'), full);
  const blocked = app(declared(['chest_symptoms'], { chestContext: 'evaluated' })).run('getRecoveryWorkout()');
  assert.deepStrictEqual(blocked.exercises, []);
  assert.strictEqual(blocked.safetyStatus, 'blocked');
});

test('adaptations du coach : ne peuvent jamais assouplir la politique (toutes les adaptations, tous les profils restreints)', () => {
  const profiles = [withAck({ status: 'unanswered' }), declared(['professional_advice']), declared(['knees', 'back']), declared(['shoulders'], { declined: true, acknowledgedAt: '2026-10-01' })];
  profiles.forEach((safety) => ADAPTATIONS.forEach((type) => TITLES.forEach((title) => {
    const a = app(safety);
    const r = a.run(`(function () {
      const w = getTodayWorkout(getProfile(), ${J(title)});
      const adapted = applyCoachAdaptation(w.exercises, { type: ${J(type)}, categories: ['Jambes', 'Cardio', 'Haut du corps'] }, getProfile(), 45);
      return { before: w.exercises, after: adapted.exercises, max: w.policy.maxIntensity };
    })()`);
    r.after.forEach((e) => {
      assert.ok(a.run(`evaluateExerciseCompatibility(${J(e.id)}, getProfile()).compatible`), `${type}/${title} : ${e.id}`);
      assert.ok(a.run(`isExerciseIntensityAllowed(${J(e.id)}, ${J(r.max)})`), `${type}/${title} : ${e.id} au-dessus du plafond`);
      // Les adaptations qui ne changent pas la nature des exercices ne peuvent qu'alléger, exercice par exercice.
      if (['reduce-sets', 'light', 'comeback', 'mini', 'shorter-rest'].includes(type)) {
        const before = r.before.find((b) => b.id === e.id);
        assert.ok(before, `${type}/${title} : ${e.id} ajouté`);
        assert.ok(e.sets <= before.sets, `${type}/${title}/${e.id} : séries augmentées`);
        if (before.reps) assert.ok(e.reps <= before.reps, `${type}/${title}/${e.id} : répétitions augmentées`);
        if (before.holdSeconds) assert.ok(e.holdSeconds <= before.holdSeconds, `${type}/${title}/${e.id} : durée augmentée`);
      }
    });
    // Toutes les adaptations : jamais plus d'exercices ni plus de séries au total (une substitution garde le volume de l'exercice remplacé).
    const sets = (list) => list.reduce((sum, e) => sum + e.sets, 0);
    assert.ok(r.after.length <= r.before.length, `${type}/${title} : exercices ajoutés`);
    assert.ok(sets(r.after) <= sets(r.before), `${type}/${title} : séries ajoutées`);
  })));
});

test('adaptations du coach : un type inconnu n\'est pas appliqué (jamais une autorisation implicite)', () => {
  const a = app(NONE);
  const exercises = [{ id: 'pompes', sets: 3, reps: 10 }];
  const r = a.run(`applyCoachAdaptation(${J(exercises)}, { type: 'surcharge', factor: 3 }, getProfile(), 45)`);
  assert.strictEqual(r.denied, true);
  assert.deepStrictEqual(r.exercises, exercises);
  assert.strictEqual(r.restSeconds, 45);
});

test('reprise : une séance enregistrée est réévaluée avec le profil actuel (changement de profil avant reprise)', () => {
  const saved = [{ id: 'squat', sets: 3, reps: 10 }, { id: 'burpees', sets: 3, reps: 10 }, { id: 'respiration-profonde', sets: 1, holdSeconds: 40 }];
  const decide = (safety, extra = {}) => evalP(safety, { action: 'resume', exercises: saved, ...extra });
  assert.strictEqual(decide(NONE).allowed, true);
  // même séance, profil modifié ensuite :
  assert.strictEqual(decide(declared(['knees'])).allowed, false);
  assert.ok(decide(declared(['knees'])).reasons.includes('denied:exercise-incompatible:squat'));
  assert.ok(decide(declared(['professional_advice'])).reasons.includes('denied:exercise-intensity:burpees'));
  assert.strictEqual(decide(declared(['chest_symptoms'])).allowed, false);
  assert.strictEqual(decide({ status: 'unanswered' }).allowed, false);
  assert.ok(decide({ status: 'unanswered' }).reasons.includes('denied:acknowledgement-required'));
  assert.strictEqual(decide(withAck({ status: 'unanswered' })).allowed, true, 'séance compatible + confirmation donnée');
});

test('défis : une charge croissante n\'est proposée qu\'en niveau « clear » ; l\'hydratation (non physique) n\'est jamais restreinte', () => {
  const policyFor = (safety, id) => app(safety).run(`getChallengePolicy(${J(id)})`);
  ['pompes30', 'gainage30', 'squats30'].forEach((id) => {
    assert.strictEqual(policyFor(NONE, id).allowed, true, id);
    assert.strictEqual(policyFor(withAck({ status: 'unanswered' }), id).allowed, false, id);
    assert.strictEqual(policyFor(declared(['professional_advice']), id).allowed, false, id);
    assert.strictEqual(policyFor(declared(['chest_symptoms']), id).allowed, false, id);
  });
  // L'hydratation n'est pas une activité physique : jamais restreinte. Le Kegel en est une (voir tests/safety-activities.test.js).
  assert.strictEqual(policyFor(declared(['knees']), 'eau14').allowed, true);
  assert.strictEqual(policyFor(declared(['chest_symptoms']), 'eau14').allowed, true, 'hydratation accessible même si l\'entraînement est bloqué');
  assert.strictEqual(policyFor(declared(['chest_symptoms']), 'kegel21').allowed, false, 'Kegel = activité physique');
  assert.strictEqual(policyFor(NONE, 'defi-inconnu').allowed, false);
  // exercice incompatible : refus explicite, aucun défi démarré
  const knees = app(declared(['knees']));
  assert.strictEqual(knees.run(`startChallenge('squats30')`), false);
  assert.strictEqual(knees.run('Object.keys(getChallengeData().active).length'), 0);
  assert.strictEqual(knees.run(`startChallenge('eau14')`), true);
  assert.match(knees.run(`challengeDenialMessage(getChallengePolicy('squats30'))`), /progression|exercice/);
});

test('cycles : la phase 2 exige le niveau « clear » ; recommencer ou passer en entretien reste possible', () => {
  const cycle = (safety, mode) => {
    const a = app(safety);
    try { a.run(`startNextCycle(${J(mode)})`); return a.run('getProfile().mode'); } catch (e) { return 'refusé'; }
  };
  assert.strictEqual(cycle(NONE, 'phase2'), 'phase2');
  assert.strictEqual(cycle(withAck({ status: 'unanswered' }), 'phase2'), 'refusé');
  assert.strictEqual(cycle(declared(['knees']), 'phase2'), 'refusé');
  assert.strictEqual(cycle(withAck({ status: 'unanswered' }), 'maintenance'), 'maintenance');
  assert.strictEqual(cycle(declared(['knees']), 'standard'), 'standard');
  assert.strictEqual(cycle(NONE, 'inconnu'), 'refusé');
  // un profil déjà en phase 2 qui devient restreint ne bénéficie plus du +20 %
  const stale = app(declared(['mobility']), { mode: 'phase2' });
  const clear = app(NONE, { mode: 'phase2' });
  const reps = (a) => a.run(`getTodayWorkout(getProfile(), 'Haut du corps').exercises.find((e) => e.id === 'pompes').reps`);
  assert.ok(reps(stale) < reps(clear));
});

// ───────────── Registre d'intensité ─────────────

test('registre : tous les exercices du catalogue sont déclarés, aucun n\'est « validated », aucune classe inventée', () => {
  const a = createApp({ now: NOW });
  const catalogue = a.run('Object.keys(EXERCISES)');
  const registry = a.run('Object.keys(SAFETY_INTENSITY_REGISTRY)');
  assert.deepStrictEqual(registry.filter((id) => !catalogue.includes(id)), [], 'exercices inconnus du catalogue');
  assert.deepStrictEqual(catalogue.filter((id) => !registry.includes(id)), [], 'exercices non déclarés');
  assert.deepStrictEqual(a.run('listProvisionalIntensities().length'), registry.length, 'aucune classification validée');
  registry.forEach((id) => assert.strictEqual(a.run(`getExerciseIntensity(${J(id)}).status`), 'provisional', id));
  // Les classes ne sont attribuées que sur preuve existante dans le code :
  const gentle = a.run('RECOVERY_ROUTINE.map((e) => e.id).concat(SAFETY_GENTLE_FILLERS)');
  const cardio = a.run('Object.values(EXERCISES).filter((e) => e.category === "Cardio").map((e) => e.id)');
  registry.forEach((id) => {
    const { intensity } = a.run(`getExerciseIntensity(${J(id)})`);
    if (intensity === 'low') assert.ok(gentle.includes(id), `${id} : « low » sans routine douce existante`);
    if (intensity === 'high') assert.ok(cardio.includes(id), `${id} : « high » sans catégorie Cardio`);
    assert.notStrictEqual(intensity, 'moderate', `${id} : aucune classe « moderate » n'est attestée`);
  });
  assert.ok(a.run('Object.values(SAFETY_INTENSITY_REGISTRY).every((e) => e.basis && e.basis.length > 10)'), 'chaque classification documente sa base');
});

test('registre : « unknown » vaut « high » ; un plafond absent ou inconnu n\'autorise rien', () => {
  const a = createApp({ now: NOW });
  const allowed = (id, max) => a.run(`isExerciseIntensityAllowed(${J(id)}, ${J(max)})`);
  assert.strictEqual(a.run(`getExerciseIntensity('exercice-inconnu').intensity`), 'unknown');
  assert.strictEqual(allowed('respiration-profonde', 'low'), true);
  assert.strictEqual(allowed('respiration-profonde', 'moderate'), true);
  assert.strictEqual(allowed('pompes', 'moderate'), false, 'unknown traité comme high');
  assert.strictEqual(allowed('pompes', 'low'), false);
  assert.strictEqual(allowed('pompes', 'high'), true);
  assert.strictEqual(allowed('burpees', 'moderate'), false);
  assert.strictEqual(allowed('exercice-inconnu', 'moderate'), false);
  [null, undefined, 'tres-haut', 3, {}].forEach((max) => assert.strictEqual(allowed('respiration-profonde', max), false, J(max)));
});

test('paramètres : tous provisoires, identifiables dans le code et dans les résultats', () => {
  const a = createApp({ now: NOW });
  const params = a.run('SAFETY_POLICY_PARAMETERS');
  assert.ok(Object.keys(params).length >= 10);
  Object.entries(params).forEach(([id, p]) => {
    assert.strictEqual(p.status, 'provisional', id);
    assert.ok(p.rule && p.needs && p.question, id);
  });
  assert.deepStrictEqual(a.run('listProvisionalSafetyParameters()').sort(), Object.keys(params).sort());
  // chaque paramètre cité par un résultat existe
  const seen = new Set();
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    [false, true].forEach((d) => evalP(profileOf(limitations, d), { action: 'start-training' }).pendingValidation.forEach((id) => seen.add(id)));
  }
  [undefined, { status: 'declined', preferNot: true }, { status: 'none', declined: true }].forEach((s) => evalP(s, { action: 'view' }).pendingValidation.forEach((id) => seen.add(id)));
  seen.forEach((id) => assert.ok(params[id], `paramètre cité mais non déclaré : ${id}`));
  assert.ok(seen.size >= 8);
});

test('messages : provisoires, prudents, sans diagnostic ni numéro d\'urgence', () => {
  const a = createApp({ now: NOW });
  const messages = a.run('SAFETY_POLICY_MESSAGES');
  Object.entries(messages).forEach(([id, m]) => {
    assert.ok(['caution', 'warning'].includes(m.severity), id);
    assert.ok(!/\b(15|17|18|112|911|999|144)\b/.test(m.text), `${id} : numéro d'urgence`);
    assert.ok(!/diagnostic|maladie|infarctus|cardiaque|pathologie|\bAVC\b|\bapte\b|aptitude/i.test(m.text), `${id} : formulation médicale`);
    assert.ok(!/garantit|garantie|autorisation médicale|sans risque/i.test(m.text.replace(/ne constitue pas une garantie/g, '')), `${id} : promesse de sécurité`);
  });
  assert.strictEqual(messages['acknowledgement-required'].text, a.run('SAFETY_ACK_TEXT'));
  assert.strictEqual(a.run('SAFETY_ACK_BUTTON_LABEL'), 'J’ai compris, continuer');
  evalP(declared(['chest_symptoms'], { declined: true }), { action: 'view' }).messages.forEach((m) => assert.strictEqual(m.status, 'provisional'));
});

// ───────────── Non-régression de la séance de référence ─────────────

test('non-régression : sous « clear », aucune séance de référence n\'est modifiée par la politique (408 cas, voir l\'instantané)', () => {
  const { computeSnapshot, loadFixture } = require('./safety-baseline');
  const expected = Object.fromEntries(Object.entries(loadFixture()).filter(([k]) => k.startsWith('repondu-sans-limitation|')));
  const actual = computeSnapshot(['repondu-sans-limitation']);
  assert.strictEqual(Object.keys(actual).length, 408);
  assert.deepStrictEqual(Object.keys(actual).filter((k) => actual[k] !== expected[k]), []);
});

test('non-régression : sous « caution », la séance ne contient jamais plus que celle d\'un profil « clear » (mêmes exercices, jamais plus de volume)', () => {
  let cases = 0;
  ['unanswered', 'declined'].forEach((kind) => ['forme', 'muscle', 'perte', 'discipline'].forEach((goal) => ['2026-10-10', '2026-09-14', '2026-08-17'].forEach((startDate) => {
    const clear = createApp({ now: NOW });
    clear.profile({ startDate, goal, safety: NONE });
    clear.settings({ equipment: ['chaise', 'charges', 'elastique'] });
    const caution = createApp({ now: NOW });
    caution.profile({ startDate, goal, safety: withAck(kind === 'unanswered' ? { status: 'unanswered' } : { status: 'declined', responded: true, preferNot: true }) });
    caution.settings({ equipment: ['chaise', 'charges', 'elastique'] });
    TITLES.forEach((title) => {
      const q = `getTodayWorkout(getProfile(), ${J(title)}).exercises`;
      const c = clear.run(q);
      const k = caution.run(q);
      k.forEach((e) => {
        const ref = c.find((x) => x.id === e.id);
        assert.ok(ref, `${kind}/${goal}/${title} : ${e.id} absent de la séance « clear »`);
        assert.ok(e.sets <= ref.sets && (e.reps || 0) <= (ref.reps || 0) && (e.holdSeconds || 0) <= (ref.holdSeconds || 0), `${kind}/${goal}/${title}/${e.id}`);
        cases++;
      });
    });
  })));
  assert.ok(cases > 400);
});

// ───────────── Documentation des paramètres provisoires ─────────────

test('documentation : docs/safety-policy-provisional.md reste synchronisée avec les paramètres et le registre', (t) => {
  const fs = require('fs');
  const path = require('path');
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'safety-policy-provisional.md'), 'utf8');
  const a = createApp({ now: NOW });
  const params = Object.keys(a.run('SAFETY_POLICY_PARAMETERS'));
  params.forEach((id) => assert.ok(doc.includes(`\`${id}\``), `paramètre non documenté : ${id}`));
  const registry = a.run('Object.keys(SAFETY_INTENSITY_REGISTRY)');
  registry.forEach((id) => assert.ok(doc.includes(`\`${id}\``), `exercice du registre non documenté : ${id}`));
  assert.match(doc, /aucune règle de ce document n'est validée/i);
  // Classes documentées = classes du registre
  ['low', 'high', 'unknown'].forEach((level) => {
    const ids = registry.filter((id) => a.run(`getExerciseIntensity(${J(id)}).intensity`) === level);
    const section = doc.split(`**\`${level}\`**`)[1] || '';
    ids.forEach((id) => assert.ok(section.includes(`\`${id}\``), `${id} : classe « ${level} » absente de la documentation`));
  });
  // Résultat de test : liste des paramètres encore provisoires (identifiables dans les résultats de tests).
  t.diagnostic(`paramètres provisoires (${params.length}) : ${a.run('listProvisionalSafetyParameters()').join(', ')}`);
  t.diagnostic(`classifications d'intensité provisoires (${a.run('listProvisionalIntensities().length')}) : aucune validée`);
});
