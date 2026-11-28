// Sous-lot 0b-3 : activités annexes classées selon leur nature réelle (Kegel = activité physique, hydratation = non physique),
// défis suspendus, rappels et agenda de séances, plan et série non modifiés.
// Les règles testées sont des garde-fous PROVISOIRES de produit (pas une validation médicale).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createApp } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const J = JSON.stringify;
const ALL_IDS = ['knees', 'back', 'shoulders', 'balance', 'mobility', 'professional_advice', 'chest_symptoms'];
const NONE = { status: 'none', responded: true, limitations: [] };
const declared = (limitations, extra = {}) => ({ status: 'declared', responded: true, limitations, ...extra });
const withAck = (s) => ({ ...s, acknowledgedAt: '2026-10-01' });
const pure = createApp({ now: NOW });
const evalP = (safety, context) => pure.run(`evaluateSafetyPolicy(${J({ safety })}, ${J(context)})`);
const activity = (safety, id) => evalP(safety, { action: 'start-activity', activity: id });

function app(safety, extra = {}) {
  const a = createApp({ now: NOW });
  a.profile({ startDate: '2026-08-17', ...extra, safety });
  a.settings({ equipment: ['chaise', 'charges', 'elastique'], trainingDays: [0, 1, 2, 3, 4, 5, 6], ...(extra.__settings || {}) });
  return a;
}

// ───────────── Classification des activités annexes ─────────────

test('activités : l\'hydratation n\'est pas une activité physique, le Kegel en est une (provisoire, documenté)', () => {
  const activities = pure.run('SAFETY_ACTIVITIES');
  assert.deepStrictEqual(Object.keys(activities).sort(), ['hydration', 'kegel']);
  assert.strictEqual(activities.hydration.physical, false);
  assert.strictEqual(activities.kegel.physical, true);
  assert.strictEqual(activities.kegel.intensity, 'unknown', 'aucune intensité inventée');
  Object.entries(activities).forEach(([id, a]) => {
    assert.strictEqual(a.status, 'provisional', id);
    assert.ok(a.basis && a.basis.length > 20, `${id} : base documentée`);
  });
  assert.ok(pure.run('SAFETY_POLICY_ACTIONS').includes('start-activity'));
  assert.ok(pure.run('SAFETY_POLICY_PARAMETERS')['activity-classification'], 'paramètre à valider déclaré');
});

test('hydratation : jamais restreinte, même si l\'entraînement est bloqué ou la confirmation non donnée', () => {
  const profiles = [undefined, { status: 'declined', responded: true, preferNot: true }, NONE, declared(['knees']), declared(['professional_advice']),
    declared(['chest_symptoms']), declared(['chest_symptoms'], { chestContext: 'evaluated' }), declared(['chest_symptoms', 'knees', 'professional_advice'], { declined: true })];
  profiles.forEach((safety) => {
    const p = activity(safety, 'hydration');
    assert.strictEqual(p.allowed, true, J(safety));
    assert.ok(p.pendingValidation.includes('activity-classification'));
  });
});

test('Kegel : activité physique — fermée si l\'entraînement est bloqué, quels que soient le contexte, la confirmation et les autres situations', () => {
  let count = 0;
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    if (!limitations.includes('chest_symptoms')) continue;
    for (const declined of [false, true]) for (const ack of [false, true]) for (const chestContext of ['unspecified', 'new_or_unexplained', 'evaluated']) {
      const s = declared(limitations, { declined, chestContext, ...(ack ? { acknowledgedAt: '2026-10-01' } : {}) });
      const p = activity(s, 'kegel');
      assert.strictEqual(p.allowed, false, J(s));
      assert.ok(p.reasons.includes('denied:tier-blocked'), J(s));
      count++;
    }
  }
  assert.strictEqual(count, 768); // 64 combinaisons contenant les symptômes thoraciques × refus × confirmation × 3 contextes
});

test('Kegel : confirmation de compréhension comme une séance ; refusé sous plafond « moderate » (intensité non classée) ; autorisé sinon', () => {
  // clear : autorisé sans confirmation
  assert.strictEqual(activity(NONE, 'kegel').allowed, true);
  // caution : confirmation requise, puis autorisé
  const unanswered = activity(undefined, 'kegel');
  assert.strictEqual(unanswered.allowed, false);
  assert.ok(unanswered.reasons.includes('denied:acknowledgement-required'));
  assert.strictEqual(activity(withAck({ status: 'unanswered' }), 'kegel').allowed, true);
  assert.strictEqual(activity({ status: 'declined', responded: true, preferNot: true }, 'kegel').allowed, false);
  assert.strictEqual(activity(withAck({ status: 'declined', responded: true, preferNot: true }), 'kegel').allowed, true);
  // situations physiques : aucun plafond d'intensité propre, autorisé
  ['knees', 'back', 'shoulders', 'balance', 'mobility'].forEach((id) => assert.strictEqual(activity(declared([id]), 'kegel').allowed, true, id));
  // avis professionnel : plafond « moderate », intensité non classée = haute : refusé, avec la raison
  const pro = activity(declared(['professional_advice']), 'kegel');
  assert.strictEqual(pro.allowed, false);
  assert.ok(pro.reasons.includes('denied:activity-intensity:kegel'));
  assert.ok(pro.pendingValidation.includes('activity-classification'));
});

test('activités : une activité inconnue ou absente n\'est jamais autorisée implicitement', () => {
  [{ action: 'start-activity' }, { action: 'start-activity', activity: 'marche' }, { action: 'start-activity', activity: null },
    { action: 'start-activity', activity: '__proto__' }, { action: 'start-activity', activity: 'toString' }, { action: 'start-activity', activity: ['kegel'] }].forEach((ctx) => {
    const p = evalP(NONE, ctx);
    assert.strictEqual(p.allowed, false, J(ctx));
    assert.ok(p.reasons.includes('denied:activity-unknown'), J(ctx));
  });
});

test('activités : ajouter une restriction ne rend jamais le Kegel plus permissif (monotonie, toutes les situations)', () => {
  let edges = 0;
  for (let mask = 0; mask < 1 << ALL_IDS.length; mask++) {
    const limitations = ALL_IDS.filter((_, i) => mask & (1 << i));
    const base = withAck(declared(limitations));
    const before = activity(base, 'kegel').allowed;
    ALL_IDS.filter((id) => !limitations.includes(id)).forEach((id) => {
      const after = activity(withAck(declared([...limitations, id])), 'kegel').allowed;
      assert.ok(!after || before, `${J(limitations)} + ${id}`);
      edges++;
    });
  }
  assert.ok(edges > 400);
});

// ───────────── Défis ─────────────

test('défis : Kegel suit la politique (activité physique), hydratation reste accessible, un défi sans nature déclarée est refusé', () => {
  const policyFor = (safety, id) => app(safety).run(`getChallengePolicy(${J(id)})`);
  assert.strictEqual(pure.run('CHALLENGES.kegel21.activity'), 'kegel');
  assert.strictEqual(pure.run('CHALLENGES.eau14.activity'), 'hydration');
  const blocked = declared(['chest_symptoms']);
  assert.strictEqual(policyFor(blocked, 'kegel21').allowed, false);
  assert.strictEqual(policyFor(blocked, 'eau14').allowed, true);
  assert.strictEqual(policyFor(NONE, 'kegel21').allowed, true);
  assert.strictEqual(policyFor(declared(['professional_advice']), 'kegel21').allowed, false);
  assert.strictEqual(policyFor(undefined, 'kegel21').allowed, false, 'confirmation requise');
  assert.strictEqual(policyFor(withAck({ status: 'unanswered' }), 'kegel21').allowed, true);
  assert.strictEqual(policyFor(withAck({ status: 'unanswered' }), 'eau14').allowed, true);
  // Un défi sans exercice qui ne déclare pas sa nature n'est jamais autorisé implicitement.
  assert.strictEqual(evalP(NONE, { action: 'start-challenge', challenge: { exerciseIds: [], progressive: false } }).allowed, false);
  assert.ok(evalP(NONE, { action: 'start-challenge', challenge: { exerciseIds: [], progressive: false } }).reasons.includes('denied:challenge-unknown'));
});

test('défis : startChallenge refuse le Kegel bloqué (aucun défi créé), accepte l\'hydratation', () => {
  const a = app(declared(['chest_symptoms']));
  assert.strictEqual(a.run(`startChallenge('kegel21')`), false);
  assert.strictEqual(a.run('Object.keys(getChallengeData().active).length'), 0);
  assert.strictEqual(a.run(`startChallenge('eau14')`), true);
  assert.deepStrictEqual(a.run('Object.keys(getChallengeData().active)'), ['eau14']);
  assert.strictEqual(app(NONE).run(`startChallenge('kegel21')`), true);
});

function seedChallenge(a, id, startDate, extra = {}) {
  a.set('hfc_challenges', { active: { [id]: { startDate, log: extra.log || {} } }, history: [] });
}

test('défis : un défi non atteint et suspendu par la politique est archivé « suspendu », sans échec', () => {
  // Kegel (21 jours) terminé, jamais fait, entraînement bloqué
  const blocked = app(declared(['chest_symptoms']));
  seedChallenge(blocked, 'kegel21', '2026-08-01');
  assert.strictEqual(blocked.run('finalizeChallenges()'), true);
  const entry = blocked.run('getChallengeData().history[0]');
  assert.strictEqual(entry.id, 'kegel21');
  assert.strictEqual(entry.success, false);
  assert.strictEqual(entry.suspended, true);
  assert.strictEqual(blocked.run('getCompletedChallengeCount()'), 0);

  // Sans restriction, le même défi non fait reste un échec ordinaire (comportement historique)
  const clear = app(NONE);
  seedChallenge(clear, 'kegel21', '2026-08-01');
  clear.run('finalizeChallenges()');
  const ordinary = clear.run('getChallengeData().history[0]');
  assert.strictEqual(ordinary.success, false);
  assert.ok(!('suspended' in ordinary));

  // L'hydratation n'est jamais suspendue
  const water = app(declared(['chest_symptoms']));
  seedChallenge(water, 'eau14', '2026-09-01');
  water.run('finalizeChallenges()');
  assert.ok(!('suspended' in water.run('getChallengeData().history[0]')));

  // Un défi d'effort incompatible avec les précautions est suspendu aussi
  const knees = app(declared(['knees']));
  seedChallenge(knees, 'squats30', '2026-08-01');
  knees.run('finalizeChallenges()');
  assert.strictEqual(knees.run('getChallengeData().history[0].suspended'), true);
});

test('défis : un défi réellement réussi reste une réussite, même si l\'entraînement est bloqué ensuite', () => {
  const a = app(declared(['chest_symptoms']));
  const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(2026, 7, 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  a.set('hfc_kegel_sessions', days.map((date) => ({ date, duration: 140 })));
  seedChallenge(a, 'kegel21', '2026-08-01');
  a.run('finalizeChallenges()');
  const entry = a.run('getChallengeData().history[0]');
  assert.strictEqual(entry.success, true);
  assert.ok(!('suspended' in entry));
  assert.strictEqual(a.run('getCompletedChallengeCount()'), 1);
});

test('défis : l\'archive d\'un défi suspendu reste valide à l\'export et à l\'import', () => {
  const a = app(declared(['chest_symptoms']));
  a.settings({ trainingDays: [1, 2, 3, 4, 5] });
  seedChallenge(a, 'kegel21', '2026-08-01');
  a.run('finalizeChallenges()');
  const json = J(a.run('collectExportData()'));
  const target = createApp({ now: NOW });
  target.run(`importData(${J(json)})`);
  assert.strictEqual(target.run('getChallengeData().history[0].suspended'), true);
});

// ───────────── Rappels de séance ─────────────

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const REMINDER_SOURCE = APP_SOURCE.slice(APP_SOURCE.indexOf('function checkDailyReminder'), APP_SOURCE.indexOf('\n}\n', APP_SOURCE.indexOf('function checkDailyReminder')) + 3);

function reminderApp(safety, { engine = true } = {}) {
  const a = app(safety);
  a.settings({ reminderEnabled: true, reminderTime: '08:00', trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise'] });
  a.run(`globalThis.__notifs = [];
    window.Notification = function (title, options) { globalThis.__notifs.push({ title, options }); };
    window.Notification.permission = 'granted';
    globalThis.Notification = window.Notification;`);
  if (!engine) a.run('globalThis.evaluateSafetyPolicy = undefined;');
  a.run(REMINDER_SOURCE);
  return a;
}
const notifications = (a) => { a.run('checkDailyReminder()'); return a.run('__notifs.length'); };

test('rappels : envoyés quand l\'entraînement est autorisé, jamais quand il est bloqué', () => {
  assert.ok(REMINDER_SOURCE.startsWith('function checkDailyReminder'), 'fonction extraite');
  assert.strictEqual(notifications(reminderApp(NONE)), 1);
  assert.strictEqual(notifications(reminderApp(withAck({ status: 'unanswered' }))), 1);
  assert.strictEqual(notifications(reminderApp(declared(['knees']))), 1);
  assert.strictEqual(notifications(reminderApp(declared(['professional_advice']))), 1);
  assert.strictEqual(notifications(reminderApp(declared(['chest_symptoms']))), 0);
  assert.strictEqual(notifications(reminderApp(declared(['chest_symptoms'], { chestContext: 'evaluated' }))), 0);
  assert.strictEqual(notifications(reminderApp(withAck(declared(['chest_symptoms', 'knees'], { declined: true })))), 0);
});

test('rappels : un rappel bloqué n\'est pas marqué comme envoyé ; sans moteur de sécurité, rien n\'est envoyé', () => {
  const blocked = reminderApp(declared(['chest_symptoms']));
  blocked.run('checkDailyReminder()');
  assert.strictEqual(blocked.run('getSettings().lastReminderDate'), null);
  assert.strictEqual(notifications(reminderApp(NONE, { engine: false })), 0, 'politique non évaluable : donnée inconnue, aucun rappel');
  // Une fois la restriction levée, le rappel part (et une seule fois par jour).
  const a = reminderApp(declared(['chest_symptoms']));
  a.run('checkDailyReminder()');
  a.run(`saveSafetyProfile(getProfile(), ${J(NONE)})`);
  a.run('checkDailyReminder()');
  a.run('checkDailyReminder()');
  assert.strictEqual(a.run('__notifs.length'), 1);
});

test('rappels : le texte de rappel n\'est jamais construit pour un profil bloqué (aucune incitation ni « garder ta série »)', () => {
  const a = reminderApp(declared(['chest_symptoms']));
  a.run('checkDailyReminder()');
  assert.deepStrictEqual(a.run('__notifs'), []);
  const ok = reminderApp(NONE);
  ok.run('checkDailyReminder()');
  assert.match(ok.run('__notifs[0].options.body'), /séance/);
});

// ───────────── Agenda de séances ─────────────

test('agenda : l\'export de séances est refusé quand l\'entraînement n\'est pas autorisé, et rien n\'est créé', () => {
  const trial = (safety, { engine = true } = {}) => {
    const a = app(safety);
    a.settings({ trainingDays: [1, 3, 5], equipment: ['chaise'] });
    a.run('globalThis.__downloads = []; globalThis.downloadBlob = (blob, name) => __downloads.push(name);');
    if (!engine) a.run('globalThis.evaluateSafetyPolicy = undefined;');
    return { result: a.run('downloadICS()'), downloads: a.run('__downloads') };
  };
  assert.deepStrictEqual(trial(NONE), { result: true, downloads: ['homefit-coach-agenda.ics'] });
  assert.deepStrictEqual(trial(withAck({ status: 'unanswered' })), { result: true, downloads: ['homefit-coach-agenda.ics'] });
  assert.deepStrictEqual(trial(declared(['chest_symptoms'])), { result: false, downloads: [] });
  assert.deepStrictEqual(trial(declared(['chest_symptoms'], { chestContext: 'evaluated' })), { result: false, downloads: [] });
  assert.deepStrictEqual(trial(NONE, { engine: false }), { result: false, downloads: [] }, 'politique non évaluable : rien');
});

test('agenda : buildICS (génération pure) reste inchangé', () => {
  const a = app(NONE);
  a.settings({ trainingDays: [1, 3, 5], reminderTime: '08:00' });
  const ics = a.run('buildICS()');
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BYDAY=MO,WE,FR/);
});

// ───────────── Plan et série : la logique n'est pas modifiée ─────────────

test('plan et série : la politique ne modifie ni le plan de la semaine ni la série (seul l\'affichage change)', () => {
  const profiles = [NONE, declared(['chest_symptoms']), withAck({ status: 'unanswered' }), declared(['knees'])];
  const sessions = [{ date: '2026-10-05', title: 'Haut du corps', exercises: [] }, { date: '2026-10-07', title: 'Jambes + Abdos', exercises: [] }];
  const outputs = profiles.map((safety) => {
    const a = app(safety);
    a.settings({ trainingDays: [1, 2, 4, 5], equipment: ['chaise'] });
    a.sessions(sessions);
    return J({ plan: a.run('getWeekPlan()'), streak: a.run('getStreak()'), target: a.run('getWeekTarget(isoOf(mondayOf(new Date())))'), progress: a.run('getProgramProgress().sessionsCompleted') });
  });
  outputs.forEach((out) => assert.strictEqual(out, outputs[0]));
});
