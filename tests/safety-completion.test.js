// Sous-lot 0b-3 (corrections finales) : protection de logChallenge(), jeûne communautaire, gestion neutre de la série,
// absence d'incitation dans les parcours secondaires. Règles provisoires de produit (aucune validation médicale).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createApp, ROOT } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0); // jeudi 15 octobre 2026
const J = JSON.stringify;
const NONE = { status: 'none', responded: true, limitations: [] };
const declared = (limitations, extra = {}) => ({ status: 'declared', responded: true, limitations, ...extra });
const withAck = (s) => ({ ...s, acknowledgedAt: '2026-10-01' });
const CHEST = declared(['chest_symptoms']);
const FOUR = [1, 2, 4, 5];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function app(safety, settings = {}) {
  const a = createApp({ now: NOW });
  a.profile({ startDate: '2026-08-17', safety });
  a.settings({ equipment: ['chaise', 'charges', 'elastique'], trainingDays: FOUR, ...settings });
  return a;
}
const active = (a, id, startDate, log = {}) => a.set('hfc_challenges', { active: { [id]: { startDate, log } }, history: [] });
const logOf = (a, id) => a.run(`getChallengeData().active[${J(id)}].log`);

// ───────────── logChallenge() : la fonction elle-même est protégée ─────────────

test('logChallenge : un défi physique refusé ne peut pas être alimenté par un appel direct', () => {
  for (const id of ['pompes30', 'gainage30', 'squats30', 'kegel21']) {
    const a = app(CHEST);
    active(a, id, '2026-10-14');
    assert.strictEqual(a.run(`logChallenge(${J(id)}, 99)`), false, id);
    assert.deepStrictEqual(logOf(a, id), {}, `${id} : rien n'est écrit`);
    assert.strictEqual(a.run(`logChallenge(${J(id)}, 99, '2026-10-14')`), false);
  }
});

test('logChallenge : tous les profils bloquants refusent, tous les profils autorisants acceptent (défi d\'effort manuel)', () => {
  const blocking = [CHEST, declared(['chest_symptoms'], { chestContext: 'evaluated' }), withAck(declared(['chest_symptoms', 'knees'], { declined: true }))];
  blocking.forEach((s) => {
    const a = app(s);
    active(a, 'gainage30', '2026-10-14');
    assert.strictEqual(a.run("logChallenge('gainage30', 30)"), false, J(s));
  });
  // Genoux : « pompes » reste compatible mais défi à charge croissante interdit en situation restreinte
  const knees = app(declared(['knees']));
  active(knees, 'squats30', '2026-10-14');
  assert.strictEqual(knees.run("logChallenge('squats30', 15)"), false, 'exercice incompatible');
  const clear = app(NONE);
  active(clear, 'pompes30', '2026-10-14');
  assert.strictEqual(clear.run("logChallenge('pompes30', 5)"), true);
  assert.deepStrictEqual(logOf(clear, 'pompes30'), { '2026-10-15': 5 });
});

test('logChallenge : le défi d\'hydratation (non physique) continue de fonctionner, même si l\'entraînement est bloqué', () => {
  for (const s of [CHEST, declared(['chest_symptoms'], { chestContext: 'evaluated' }), declared(['professional_advice']), NONE, undefined]) {
    const a = app(s);
    active(a, 'eau14', '2026-10-14');
    assert.strictEqual(a.run("logChallenge('eau14', 1800)"), true, J(s));
    assert.deepStrictEqual(logOf(a, 'eau14'), { '2026-10-15': 1800 });
  }
});

test('logChallenge : confirmation de compréhension manquante = refus pour le défi Kegel (physique), pas pour l\'hydratation', () => {
  const a = app(undefined);
  active(a, 'kegel21', '2026-10-14');
  assert.strictEqual(a.run("logChallenge('kegel21', 1)"), false, 'non renseigné et non confirmé');
  assert.deepStrictEqual(logOf(a, 'kegel21'), {});
  active(a, 'eau14', '2026-10-14');
  assert.strictEqual(a.run("logChallenge('eau14', 1500)"), true, 'hydratation : jamais restreinte');
  active(a, 'kegel21', '2026-10-14');
  a.run('acknowledgeSafetyNotice()');
  assert.strictEqual(a.run("logChallenge('kegel21', 1)"), true, 'après confirmation, comme une séance');
});

test('logChallenge : politique absente ou illisible = rien n\'est enregistré (fail-closed), y compris pour l\'hydratation', () => {
  for (const id of ['gainage30', 'kegel21', 'eau14']) {
    const a = app(NONE);
    active(a, id, '2026-10-14');
    a.run('globalThis.evaluateSafetyPolicy = undefined;');
    assert.strictEqual(a.run(`logChallenge(${J(id)}, 5)`), false, id);
    assert.deepStrictEqual(logOf(a, id), {});
  }
  const broken = app(NONE);
  active(broken, 'gainage30', '2026-10-14');
  broken.run('globalThis.evaluateSafetyPolicy = () => ({ allowed: false, reasons: [] });');
  assert.strictEqual(broken.run("logChallenge('gainage30', 5)"), false);
});

test('logChallenge : entrées invalides ou inconnues refusées sans erreur et sans écriture', () => {
  const a = app(NONE);
  active(a, 'gainage30', '2026-10-14');
  const before = J(a.store.hfc_challenges);
  for (const call of ["logChallenge('inconnu', 5)", "logChallenge('__proto__', 5)", "logChallenge('constructor', 5)", "logChallenge('gainage30', 'abc')",
    "logChallenge('gainage30', NaN)", "logChallenge('gainage30', Infinity)", "logChallenge('gainage30', 5, 'pas-une-date')", "logChallenge('pompes30', 5)"]) {
    assert.strictEqual(a.run(call), false, call);
  }
  assert.strictEqual(J(a.store.hfc_challenges), before);
});

test('logChallenge : une réussite obtenue avant la suspension reste une réussite ; une suspension n\'est ni réussite ni échec', () => {
  // 30 jours de gainage commencés le 2026-09-10, tous validés jusqu'au jour 28 (repos tous les 7 jours), puis blocage.
  const a = app(NONE);
  const log = {};
  const start = new Date(2026, 8, 10);
  for (let day = 1; day <= 30; day++) {
    if (day % 7 === 0) continue;
    const d = new Date(start); d.setDate(d.getDate() + day - 1);
    log[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 500;
  }
  active(a, 'gainage30', '2026-09-10', log);
  a.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  assert.strictEqual(a.run("logChallenge('gainage30', 1)"), false, 'plus rien ne s\'enregistre une fois bloqué');
  a.run('finalizeChallenges()');
  const done = a.run('getChallengeData().history[0]');
  assert.strictEqual(done.success, true);
  assert.ok(!('suspended' in done));
  assert.strictEqual(a.run('getCompletedChallengeCount()'), 1);

  // Défi inachevé au moment du blocage : suspendu, ni réussite ni échec, et aucune validation fictive
  const b = app(NONE);
  active(b, 'gainage30', '2026-09-10', { '2026-09-10': 500, '2026-09-11': 500 });
  b.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  assert.strictEqual(b.run("logChallenge('gainage30', 500, '2026-09-12')"), false);
  b.run('finalizeChallenges()');
  const suspended = b.run('getChallengeData().history[0]');
  assert.strictEqual(suspended.success, false);
  assert.strictEqual(suspended.suspended, true);
  assert.strictEqual(suspended.validated, 2, 'aucune validation ajoutée artificiellement');
  assert.strictEqual(b.run('getCompletedChallengeCount()'), 0);
});

test('logChallenge : les pages secondaires n\'écrivent jamais dans un défi en dehors de challenges.html (qui passe par la fonction protégée)', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const offenders = pages.filter((p) => /\b(logChallenge|saveChallengeData)\s*\(/.test(read(p)) && p !== 'challenges.html');
  assert.deepStrictEqual(offenders, [], 'partager.html et les autres pages ne modifient pas les défis');
  const scripts = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'challenges.js' && f !== 'storage.js');
  assert.deepStrictEqual(scripts.filter((f) => /\bsaveChallengeData\s*\(/.test(read(`js/${f}`))), []);
  // partager.html charge challenges.js sans le moteur : la lecture seule reste possible, aucune écriture n'est appelée
  assert.ok(!/logChallenge|startChallenge|finalizeChallenges/.test(read('partager.html')));
});

// ───────────── Gestion neutre de la série ─────────────

function streakApp(safety, sessions, suspension) {
  const a = app(safety);
  a.sessions(sessions);
  if (suspension) a.set('hfc_safety_suspension', suspension);
  return a;
}
const W1 = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03']; // semaine du 28/9, complète
const WEEK = (monday) => Array.from({ length: 7 }, (_, i) => { const d = new Date(monday + 'T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

test('série : une semaine suspendue sans séance ne casse pas la série, mais n\'ajoute rien', () => {
  const noRecord = streakApp(NONE, W1);
  assert.strictEqual(noRecord.run('getStreak()'), 0, 'témoin : sans suspension enregistrée, la semaine du 5/10 non faite casse la série');
  const suspended = streakApp(NONE, W1, WEEK('2026-10-05'));
  assert.strictEqual(suspended.run('getStreak()'), 1, 'série préservée (1), sans +1 pour la semaine suspendue');
  assert.strictEqual(suspended.run('getSessionLog().length'), 4, 'aucune séance fictive');
});

test('série : suspension longue (3 semaines) préservée ; suspension courte (1 jour) aussi', () => {
  const real = [...['2026-09-08', '2026-09-09', '2026-09-11', '2026-09-12'], ...['2026-09-15', '2026-09-16', '2026-09-18', '2026-09-19']];
  const long = streakApp(NONE, real, [...WEEK('2026-09-21'), ...WEEK('2026-09-28'), ...WEEK('2026-10-05')]);
  assert.strictEqual(long.run('getStreak()'), 2);
  const longNoRecord = streakApp(NONE, real);
  assert.strictEqual(longNoRecord.run('getStreak()'), 0);
  const short = streakApp(NONE, real, ['2026-09-23']);
  assert.strictEqual(short.run('getStreak()'), 0, 'les semaines suivantes non faites et non suspendues cassent toujours la série');
  const shortOnly = streakApp(NONE, [...W1, '2026-09-22', '2026-09-23', '2026-09-25', '2026-09-26'], ['2026-10-07']);
  assert.strictEqual(shortOnly.run('getStreak()'), 2, 'un seul jour suspendu dans une semaine non faite : neutre');
});

test('série : une semaine réellement réussie compte normalement, même avec des jours suspendus', () => {
  const sessions = [...W1, '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const a = streakApp(NONE, sessions, ['2026-10-05', '2026-10-06']);
  assert.strictEqual(a.run('getStreak()'), 2);
});

test('série : aucune récompense sportive — aucun badge de série ni progression ne s\'ajoute pendant une suspension', () => {
  const a = streakApp(NONE, [], WEEK('2026-10-05'));
  a.run('globalThis.J_BADGES = 0; Object.defineProperty(globalThis, "J_BADGES", { get: () => JSON.stringify(getBadgeStates()), configurable: true });');
  const before = { sessions: a.run('getSessionLog().length'), progress: a.run('getProgramProgress().sessionsCompleted'), badges: a.run('J_BADGES') };
  a.run('saveSafetyProfile(getProfile(), ' + J(CHEST) + ')');
  a.run('syncSafetySuspension()');
  const after = { sessions: a.run('getSessionLog().length'), progress: a.run('getProgramProgress().sessionsCompleted'), badges: a.run('J_BADGES') };
  assert.deepStrictEqual(after, before);
  assert.strictEqual(a.run('getStreak()'), 0, 'pas de série inventée');
});

test('série : seuls les jours (dates) sont mémorisés — jamais le motif ni la situation déclarée', () => {
  const a = app(declared(['chest_symptoms', 'knees']));
  a.run('syncSafetySuspension()');
  const stored = JSON.parse(a.store.hfc_safety_suspension);
  assert.deepStrictEqual(stored, ['2026-10-15']);
  assert.ok(!/chest|knees|poitrine|genou/i.test(a.store.hfc_safety_suspension));
  a.run('syncSafetySuspension()');
  assert.deepStrictEqual(JSON.parse(a.store.hfc_safety_suspension), ['2026-10-15'], 'idempotent');
});

test('série : seul un blocage mémorise un jour (clair, prudence, restreint, avis professionnel : aucun)', () => {
  for (const s of [NONE, undefined, declared(['knees']), declared(['professional_advice']), { status: 'declined', responded: true, preferNot: true, limitations: [], declined: true }]) {
    const a = app(s);
    a.run('syncSafetySuspension()');
    assert.strictEqual(a.store.hfc_safety_suspension, undefined, J(s));
  }
  for (const s of [CHEST, declared(['chest_symptoms'], { chestContext: 'evaluated' })]) {
    const a = app(s);
    a.run('syncSafetySuspension()');
    assert.deepStrictEqual(JSON.parse(a.store.hfc_safety_suspension), ['2026-10-15']);
  }
  const noEngine = app(CHEST);
  noEngine.run('globalThis.evaluateSafetyPolicy = undefined;');
  noEngine.run('syncSafetySuspension()');
  assert.strictEqual(noEngine.store.hfc_safety_suspension, undefined, 'politique illisible : on ne neutralise rien');
});

test('série : une modification du profil qui bloque est mémorisée immédiatement', () => {
  const a = app(NONE);
  a.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  assert.deepStrictEqual(JSON.parse(a.store.hfc_safety_suspension), ['2026-10-15']);
});

test('série et plan : levée de la restriction = fonctionnement normal ; les jours passés suspendus restent neutres', () => {
  // Bloqué du lundi au mercredi (jours enregistrés), levé jeudi : le plan ne compte ni jour manqué ni dette ni rattrapage pour ces jours.
  const a = streakApp(NONE, W1, ['2026-10-12', '2026-10-13', '2026-10-14']);
  const plan = a.run('getWeekPlan()');
  plan.days.slice(0, 3).forEach((d) => { assert.strictEqual(d.missed, false); assert.strictEqual(d.rescue, false); assert.strictEqual(d.suspended, true); });
  assert.strictEqual(plan.shortfall, 0);
  assert.strictEqual(plan.days[3].isToday, true);
  assert.ok(!plan.days[3].suspended, 'aujourd\'hui : levé, jour ordinaire');
  // Sans enregistrement de blocage, les mêmes jours sont manqués (comportement historique inchangé)
  const hist = streakApp(NONE, W1);
  const old = hist.run('getWeekPlan()');
  assert.strictEqual(old.days[0].missed, true);
  assert.ok(!('suspended' in old.days[0]));
  // Après levée, un jour ordinaire manqué compte à nouveau : semaine du 5/10 jamais suspendue et non faite = rupture
  const resumed = streakApp(NONE, W1, ['2026-09-21']);
  assert.strictEqual(resumed.run('getStreak()'), 0);
});

test('série : les séries historiques ne sont pas modifiées (aucune donnée de suspension = comportement identique)', () => {
  const s = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10'];
  const a = streakApp(NONE, s);
  assert.strictEqual(a.run('getStreak()'), 2);
  assert.strictEqual(a.store.hfc_safety_suspension, undefined, 'aucune écriture pour un profil non bloqué');
  const corrupted = streakApp(NONE, s, 'pas-un-tableau');
  assert.strictEqual(corrupted.run('getStreak()'), 2);
  const garbage = streakApp(NONE, s, ['x', 12, null, '2026-13-45']);
  assert.strictEqual(garbage.run('getStreak()'), 2, 'données de suspension invalides ignorées');
});

// ───────────── Jeûne communautaire : seule la politique centrale décide ─────────────

const FAST = { fasts: [{ start: '2026-10-14', days: 3 }] }; // jeûne 14-16/10, reprise 17-18/10, veille 13/10

test('jeûne : aucune règle médicale propre au jeûne dans le moteur de sécurité', () => {
  ['js/safety-policy.js', 'js/safety.js', 'js/safety-intensity.js', 'js/safety-ui.js'].forEach((f) => assert.ok(!/jeûne|jeune|fast/i.test(read(f)), f));
});

test('jeûne : un jour de jeûne, la récupération n\'est jamais proposée si l\'entraînement est bloqué ; elle l\'est sinon', () => {
  const blocked = app(CHEST, FAST);
  const w = blocked.run('getTodayWorkout(getProfile(), RECOVERY_TITLE)');
  assert.deepStrictEqual(w.exercises, []);
  assert.strictEqual(w.safetyStatus, 'blocked');
  assert.strictEqual(blocked.run('getRecoveryWorkout(getProfile()).exercises.length'), 0);
  assert.ok(app(NONE, FAST).run('getRecoveryWorkout(getProfile()).exercises.length') > 0, 'activité autorisée : inchangée');
  // la restriction « avis professionnel » s'applique aussi pendant le jeûne (aucune règle de jeûne ajoutée)
  const pro = app(declared(['professional_advice']), FAST).run('getRecoveryWorkout(getProfile()).exercises.map((e) => e.id)');
  const base = app(declared(['professional_advice'])).run('getRecoveryWorkout(getProfile()).exercises.map((e) => e.id)');
  assert.deepStrictEqual(pro, base);
});

test('jeûne : reprise et étapes successives — la décision est recalculée à chaque génération avec le profil actuel', () => {
  const a = app(NONE, FAST);
  assert.ok(a.run('getRecoveryWorkout(getProfile()).exercises.length') > 0);
  a.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  assert.strictEqual(a.run('getRecoveryWorkout(getProfile()).exercises.length'), 0, 'blocage entre deux étapes : rien');
  assert.strictEqual(a.run('getTodayWorkout(getProfile()).exercises.length'), 0);
  a.run(`saveSafetyProfile(getProfile(), ${J(NONE)})`);
  assert.ok(a.run('getRecoveryWorkout(getProfile()).exercises.length') > 0, 'levée : fonctionnement normal');
});

test('jeûne : les textes de veille et de reprise n\'annoncent aucune séance quand l\'entraînement n\'est pas autorisé', () => {
  const note = (a, iso) => a.run(`getFastNote(fastPhaseOn(${J(iso)}))`);
  const blocked = app(CHEST, FAST);
  assert.doesNotMatch(note(blocked, '2026-10-17'), /séance à|Remonte|dernière séance complète/);
  assert.match(note(blocked, '2026-10-17'), /aucune séance/);
  assert.match(note(blocked, '2026-10-13'), /aucune séance/);
  assert.doesNotMatch(note(blocked, '2026-10-13'), /dernière séance complète/);
  const ok = app(NONE, FAST);
  assert.match(note(ok, '2026-10-17'), /séance à 60 %/);
  assert.match(note(ok, '2026-10-13'), /dernière séance complète/);
  const noEngine = app(NONE, FAST);
  noEngine.run('globalThis.evaluateSafetyPolicy = undefined;');
  assert.match(note(noEngine, '2026-10-17'), /aucune séance/, 'politique illisible : aucune incitation');
  // le jour de jeûne lui-même ne contient aucune incitation (inchangé)
  assert.doesNotMatch(note(ok, '2026-10-15'), /séance à|Remonte/);
});

test('jeûne : l\'agenda du jeûne ne suggère aucune activité physique si l\'entraînement n\'est pas autorisé', () => {
  const ics = (a) => a.run("buildFastICS({ start: '2026-12-02', days: 3 })");
  assert.match(ics(app(NONE)), /Récupération douce/);
  assert.doesNotMatch(ics(app(CHEST)), /Récupération|séance|entra/i);
  const noEngine = app(NONE);
  noEngine.run('globalThis.evaluateSafetyPolicy = undefined;');
  assert.doesNotMatch(ics(noEngine), /Récupération/);
  assert.match(ics(app(CHEST)), /BEGIN:VEVENT/);
});

test('jeûne : la participation au jeûne (non physique) reste possible, même bloqué', () => {
  const a = app(CHEST);
  a.run("addFast('2026-12-02', 3)");
  assert.deepStrictEqual(a.run('getFasts()'), [{ start: '2026-12-02', days: 3 }]);
  a.run("removeFast('2026-12-02')");
  assert.deepStrictEqual(a.run('getFasts()'), []);
});

test('jeûne : jeune.html charge le moteur de sécurité (sinon plus aucun texte d\'entraînement n\'est affiché)', () => {
  const html = read('jeune.html');
  ['js/safety.js', 'js/safety-intensity.js', 'js/safety-policy.js'].forEach((s) => assert.ok(html.includes(`src="${s}"`), s));
  assert.ok(html.indexOf('safety-policy.js') < html.indexOf('js/app.js'));
});

// ───────────── Signal urgent : un seul système ─────────────

test('signal urgent : une seule fenêtre partagée (safety-ui.js) pour la séance et le Kegel, signaux de safety.js', () => {
  const ui = read('js/safety-ui.js');
  assert.strictEqual((ui.match(/function openSafetySignalDialog/g) || []).length, 1);
  const workout = read('workout.html');
  const kegel = read('kegel.html');
  assert.match(workout, /openSafetySignalDialog\(/);
  assert.match(kegel, /openSafetySignalDialog\(/);
  assert.doesNotMatch(kegel, /SAFETY_SIGNALS|computeSafetyStop/, 'pas de deuxième liste de signaux');
  assert.doesNotMatch(workout, /SAFETY_SIGNALS|computeSafetyStop|id="safety-overlay"/, 'plus de copie du dialogue dans workout.html');
  assert.strictEqual((read('js/safety.js').match(/const SAFETY_SIGNALS/g) || []).length, 1);
  // Kegel : aucun stockage durable de symptôme
  assert.doesNotMatch(kegel.slice(kegel.indexOf('kegel-safety-btn')), /localStorage|saveInProgress|writeJSON/);
});

test('signal urgent : le Kegel n\'enregistre jamais une routine arrêtée', () => {
  const kegel = read('kegel.html');
  assert.match(kegel, /function finishKegel\(\) \{\s*if \(kegelHalted\) return;/);
});
