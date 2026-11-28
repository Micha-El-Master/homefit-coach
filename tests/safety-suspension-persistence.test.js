// Sous-lot 0b-3 (finalisation) : persistance de la mémoire de suspension à l'export, à l'import et à la restauration.
// Règle de fusion unique : UNION des jours (jamais de raccourcissement). La mémoire ne contient que des dates et ne décide de rien :
// seule evaluateSafetyPolicy() autorise ou refuse, à partir du profil.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createApp, ROOT } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0); // jeudi 15 octobre 2026
const J = JSON.stringify;
const NONE = { status: 'none', responded: true, limitations: [] };
const CHEST = { status: 'declared', responded: true, limitations: ['chest_symptoms'] };
const KNEES = { status: 'declared', responded: true, limitations: ['knees'] };
const FOUR = [1, 2, 4, 5];
const W1 = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03'];
const WEEK = (monday) => Array.from({ length: 7 }, (_, i) => { const d = new Date(monday + 'T12:00:00'); d.setDate(d.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

function device(safety, { suspension, sessions = [] } = {}) {
  const a = createApp({ now: NOW });
  a.profile({ startDate: '2026-08-17', safety });
  a.settings({ equipment: ['chaise', 'charges', 'elastique'], trainingDays: FOUR });
  if (sessions.length) a.sessions(sessions);
  if (suspension) a.set('hfc_safety_suspension', suspension);
  return a;
}
const freshDevice = () => createApp({ now: NOW });
const exported = (a) => J(a.run('collectExportData()'));
const days = (a) => a.run('getSafetySuspensionDays()');
const policy = (a) => a.run("evaluateSafetyPolicy(getProfile(), { action: 'start-training' })");
const without = (a, field) => { const d = a.run('collectExportData()'); delete d[field]; return J(d); };

// ───────────── Export ─────────────

test('export : la suspension active est exportée, en dates seules, sans motif ni symptôme', () => {
  const a = device(CHEST, { suspension: ['2026-10-01', '2026-10-02'] });
  a.run('syncSafetySuspension()');
  const data = a.run('collectExportData()');
  assert.deepStrictEqual(data.safetySuspension, ['2026-10-01', '2026-10-02', '2026-10-15']);
  assert.ok(data.safetySuspension.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  assert.strictEqual(data.schemaVersion, 1);
  // Un profil non bloqué exporte une liste vide, jamais une donnée inventée
  assert.deepStrictEqual(device(NONE).run('collectExportData().safetySuspension'), []);
});

test('export : la mémoire ne contient aucun symptôme (seul le profil, déjà exporté avant, porte les précautions)', () => {
  const a = device({ ...CHEST, chestContext: 'new_or_unexplained' });
  a.run('syncSafetySuspension()');
  assert.doesNotMatch(J(a.run('collectExportData().safetySuspension')), /chest|poitrine|thorac|context|knees/i);
  assert.doesNotMatch(a.store.hfc_safety_suspension, /chest|poitrine|thorac|context|knees/i);
});

// ───────────── Import sur un nouvel appareil ─────────────

test('import sur un appareil neuf : la suspension active et son historique sont conservés', () => {
  const source = device(CHEST, { suspension: ['2026-10-01', '2026-10-02'] });
  source.run('syncSafetySuspension()');
  const target = freshDevice();
  target.run(`importData(${J(exported(source))})`);
  assert.deepStrictEqual(days(target), ['2026-10-01', '2026-10-02', '2026-10-15']);
  assert.strictEqual(target.run('isTrainingSuspendedNow()'), true);
  assert.strictEqual(policy(target).canStartTraining, false);
  assert.deepStrictEqual(policy(target).reasons.filter((r) => r.startsWith('denied:')), policy(source).reasons.filter((r) => r.startsWith('denied:')));
  assert.strictEqual(target.run('getTodayWorkout(getProfile()).exercises.length'), 0);
});

test('import : une suspension active ne disparaît pas, même vers un appareil actuellement « clair »', () => {
  const source = device(CHEST, { suspension: ['2026-10-12'] });
  source.run('syncSafetySuspension()');
  const target = device(NONE);
  target.run(`importData(${J(exported(source))})`);
  assert.strictEqual(policy(target).canStartTraining, false, 'précaution thoracique conservée par la fusion existante');
  assert.deepStrictEqual(days(target), ['2026-10-12', '2026-10-15']);
});

test('import : la sauvegarde d\'un appareil clair sur un appareil suspendu ne lève rien', () => {
  const target = device(CHEST, { suspension: ['2026-10-05', '2026-10-06'] });
  target.run('syncSafetySuspension()');
  const clearBackup = exported(device(NONE));
  target.run(`importData(${J(clearBackup)})`);
  assert.strictEqual(policy(target).canStartTraining, false);
  assert.deepStrictEqual(days(target), ['2026-10-05', '2026-10-06', '2026-10-15'], 'aucune suspension raccourcie');
});

// ───────────── Conflit entre sauvegardes : règle de l'union ─────────────

test('conflit : sauvegarde suspendue + appareil non suspendu = union ; appareil suspendu + sauvegarde non suspendue = union', () => {
  const a = device(CHEST, { suspension: ['2026-09-20', '2026-10-01'] });
  const b = device(NONE, { suspension: ['2026-10-01', '2026-10-08'] }); // chevauchement partiel, dont un jour commun
  const forward = device(NONE, { suspension: ['2026-10-01', '2026-10-08'] });
  forward.run(`importData(${J(exported(a))})`);
  assert.deepStrictEqual(days(forward), ['2026-09-20', '2026-10-01', '2026-10-08', '2026-10-15']);
  const backward = device(CHEST, { suspension: ['2026-09-20', '2026-10-01'] });
  backward.run(`importData(${J(exported(b))})`);
  assert.deepStrictEqual(days(backward), ['2026-09-20', '2026-10-01', '2026-10-08', '2026-10-15']);
  assert.strictEqual(policy(backward).canStartTraining, false);
});

test('conflit : la règle est la même quel que soit l\'ordre des imports (commutative et idempotente)', () => {
  const A = exported(device(KNEES, { suspension: ['2026-09-01', '2026-09-02'] }));
  const B = exported(device(NONE, { suspension: ['2026-09-02', '2026-09-03'] }));
  const run = (order) => { const t = freshDevice(); order.forEach((x) => t.run(`importData(${J(x)})`)); return days(t); };
  assert.deepStrictEqual(run([A, B]), run([B, A]));
  assert.deepStrictEqual(run([A, A, B, B]), run([A, B]));
});

// ───────────── Anciennes sauvegardes ─────────────

test('ancienne sauvegarde sans mémoire de suspension : acceptée, la mémoire de l\'appareil est conservée', () => {
  const source = device(NONE);
  const old = without(source, 'safetySuspension');
  assert.ok(!old.includes('safetySuspension'));
  const target = device(CHEST, { suspension: ['2026-10-05'] });
  target.run(`importData(${J(old)})`);
  assert.ok(days(target).includes('2026-10-05'), 'mémoire de l\'appareil non effacée par une sauvegarde sans cette donnée');
  assert.strictEqual(policy(target).canStartTraining, false);
  // Sauvegarde historique minimale (sans schemaVersion)
  const legacy = { app: 'HomeFit Coach', profile: { name: 'Ancien', startDate: '2026-01-01' } };
  const fresh = freshDevice();
  fresh.run(`importData(${J(J(legacy))})`);
  assert.deepStrictEqual(days(fresh), []);
  const fixtureDir = path.join(ROOT, 'tests', 'fixtures');
  assert.ok(fs.existsSync(fixtureDir));
});

test('compatibilité descendante : un ancien exemplaire de l\'application ignore le champ (schéma inchangé, champ additif)', () => {
  const data = device(CHEST, { suspension: ['2026-10-01'] }).run('collectExportData()');
  assert.strictEqual(data.schemaVersion, 1);
  assert.deepStrictEqual(Object.keys(data).filter((k) => !['safetySuspension'].includes(k)).sort(),
    ['adjustments', 'app', 'challenges', 'exportedAt', 'kegel', 'profile', 'recovery', 'schemaVersion', 'sessions', 'settings', 'shopping', 'water']);
});

// ───────────── Données malformées ou manipulées ─────────────

const MALFORMED = [
  ['chaîne', 'pas-un-tableau'], ['objet', { '2026-10-01': true }], ['null', null], ['nombre', 12],
  ['éléments non-chaînes', [20261001, null]], ['date impossible', ['2026-13-45']], ['date mal formée', ['01/10/2026']],
  ['objet avec motif médical', ['2026-10-01', { date: '2026-10-02', reason: 'chest_symptoms' }]],
  ['date future lointaine', ['2999-01-01']], ['trop de jours', Array.from({ length: 801 }, (_, i) => { const d = new Date(2024, 0, 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })],
  ['texte injecté', ['2026-10-01; DROP', '<script>']], ['proto', ['__proto__']],
];

test('données malformées ou manipulées : refusées avant toute utilisation, rien n\'est modifié', () => {
  for (const [label, bad] of MALFORMED) {
    const target = device(CHEST, { suspension: ['2026-10-05'] });
    const before = J(target.store);
    const payload = { ...JSON.parse(exported(device(NONE))), safetySuspension: bad };
    assert.throws(() => target.run(`importData(${J(J(payload))})`), /suspension invalide/i, label);
    assert.strictEqual(J(target.store), before, `${label} : aucune écriture (ni profil, ni mémoire, ni copie locale)`);
  }
});

test('données manipulées : un aperçu d\'import refuse aussi les données invalides', () => {
  const payload = { ...JSON.parse(exported(device(NONE))), safetySuspension: [{ a: 1 }] };
  assert.throws(() => freshDevice().run(`buildImportPreview(${J(J(payload))})`), /suspension invalide/i);
});

test('données manipulées : doublons et désordre normalisés ; demain accepté (fuseau), après-demain refusé', () => {
  const t = freshDevice();
  const payload = { ...JSON.parse(exported(device(NONE))), safetySuspension: ['2026-10-03', '2026-10-01', '2026-10-03', '2026-10-16'] };
  t.run(`importData(${J(J(payload))})`);
  assert.deepStrictEqual(days(t), ['2026-10-01', '2026-10-03', '2026-10-16']);
  const bad = { ...payload, safetySuspension: ['2026-10-17'] };
  assert.throws(() => freshDevice().run(`importData(${J(J(bad))})`), /suspension invalide/i);
});

test('mémoire locale corrompue : ignorée sans erreur (aucune date inventée)', () => {
  for (const raw of ['pas du json', '{"a":1}', '[12, null, "x", "2026-13-45", "2026-10-01"]']) {
    const a = device(NONE);
    a.store.hfc_safety_suspension = raw;
    assert.doesNotThrow(() => a.run('getSafetySuspensionDays()'));
    assert.ok(days(a).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  }
});

test('manipulation : aucune valeur importée ne peut contourner evaluateSafetyPolicy()', () => {
  // La politique ignore la mémoire : mêmes décisions avec n'importe quel contenu
  const profiles = [NONE, CHEST, KNEES, undefined, { status: 'declined', responded: true, limitations: [], declined: true }];
  for (const safety of profiles) {
    const outputs = [[], ['2026-10-14'], WEEK('2026-10-05'), ['2026-10-15']].map((mem) => {
      const a = device(safety, { suspension: mem });
      return J(['start-training', 'start-recovery', 'resume', 'start-activity'].map((action) => a.run(`evaluateSafetyPolicy(getProfile(), ${J({ action, activity: 'kegel' })})`)));
    });
    outputs.forEach((o) => assert.strictEqual(o, outputs[0]));
  }
  assert.ok(!/suspension|hfc_safety/i.test(fs.readFileSync(path.join(ROOT, 'js/safety-policy.js'), 'utf8')), 'le moteur ne lit pas la mémoire');
  // Une sauvegarde qui prétend « aucune situation » avec une mémoire vide ne débloque pas un appareil bloqué
  const target = device(CHEST, { suspension: ['2026-10-14'] });
  const claim = { ...JSON.parse(exported(device(NONE))), safetySuspension: [] };
  target.run(`importData(${J(J(claim))})`);
  assert.strictEqual(policy(target).canStartTraining, false);
  assert.deepStrictEqual(days(target).includes('2026-10-14'), true);
});

test('manipulation : une mémoire importée ne bloque pas à elle seule et n\'autorise rien', () => {
  const t = freshDevice();
  const payload = { ...JSON.parse(exported(device(NONE))), safetySuspension: ['2026-10-14', '2026-10-15'] };
  t.run(`importData(${J(J(payload))})`);
  assert.strictEqual(policy(t).allowed, true, 'décision fondée sur le profil uniquement');
  assert.strictEqual(t.run('isTrainingSuspendedNow()'), false);
});

// ───────────── Restauration locale ─────────────

test('restauration : une copie contenant une suspension la restitue, sans jamais raccourcir celle de l\'appareil', () => {
  const a = device(CHEST, { suspension: ['2026-10-01', '2026-10-02'] });
  a.run('createLocalBackup("test")');
  // L'appareil continue d'être suspendu après la copie
  a.set('hfc_safety_suspension', ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09']);
  a.run('restoreLocalBackup()');
  assert.deepStrictEqual(days(a), ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09', '2026-10-15']);
  assert.strictEqual(policy(a).canStartTraining, false);
  // Copie plus riche que l'appareil : les jours de la copie reviennent
  const b = device(CHEST, { suspension: ['2026-09-01'] });
  b.run('createLocalBackup("test")');
  b.set('hfc_safety_suspension', ['2026-10-10']);
  b.run('restoreLocalBackup()');
  assert.deepStrictEqual(days(b), ['2026-09-01', '2026-10-10', '2026-10-15']);
});

test('restauration : copie sans mémoire de suspension (ancienne copie) = mémoire de l\'appareil conservée', () => {
  const a = device(CHEST, { suspension: ['2026-10-05'] });
  const record = a.run('createLocalBackup("test")');
  const snapshot = a.run('getLocalBackup()');
  delete snapshot.snapshot.safetySuspension;
  a.set('hfc_backup_snapshot', snapshot);
  assert.ok(record);
  a.run('restoreLocalBackup()');
  assert.ok(days(a).includes('2026-10-05'));
});

test('restauration : une suspension active ne peut pas être effacée par une copie plus ancienne (précautions et mémoire)', () => {
  // Copie prise quand l'appareil était clair et sans mémoire ; l'appareil est ensuite devenu suspendu.
  const a = device(NONE);
  a.run('createLocalBackup("test")');
  a.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  assert.deepStrictEqual(days(a), ['2026-10-15']);
  assert.throws(() => a.run('restoreLocalBackup()'), /précautions|confirmation/i, 'protection existante : la perte de précaution exige une confirmation');
  assert.strictEqual(policy(a).canStartTraining, false);
  assert.deepStrictEqual(days(a), ['2026-10-15']);
  // Restauration protégée : précautions conservées, mémoire conservée
  a.run('restoreLocalBackup({ keepCurrentPrecautions: true })');
  assert.strictEqual(policy(a).canStartTraining, false);
  assert.deepStrictEqual(days(a), ['2026-10-15']);
  assert.strictEqual(a.run('getTodayWorkout(getProfile()).exercises.length'), 0, 'aucune séance interdite');
});

test('restauration exacte confirmée : les précautions peuvent être retirées par choix explicite, la mémoire historique reste', () => {
  const a = device(NONE);
  a.run('createLocalBackup("test")');
  a.run(`saveSafetyProfile(getProfile(), ${J(CHEST)})`);
  a.run('restoreLocalBackup({ confirmedSafetyLoss: true })');
  assert.strictEqual(policy(a).canStartTraining, true, 'choix explicite et confirmé de la personne');
  assert.deepStrictEqual(days(a), ['2026-10-15'], 'les jours déjà suspendus ne sont pas effacés');
  assert.strictEqual(a.run('getSessionLog().length'), 0, 'aucune séance fictive');
});

test('restauration : annuler une restauration (relancer) ne perd aucun jour', () => {
  const a = device(CHEST, { suspension: ['2026-10-01'] });
  a.run('createLocalBackup("test")');
  a.set('hfc_safety_suspension', ['2026-10-01', '2026-10-07']);
  a.run('restoreLocalBackup()');
  a.run('restoreLocalBackup()'); // annulation : état d'avant restauration
  assert.deepStrictEqual(days(a), ['2026-10-01', '2026-10-07', '2026-10-15']);
});

test('restauration : une séance en pause n\'est jamais restaurée ni exportée', () => {
  const a = device(CHEST);
  a.set('hfc_inprogress', { date: '2026-10-15', title: 'Haut du corps', exercises: [{ id: 'pompes' }], queueIndex: 0, savedAt: 1 });
  assert.ok(!('inProgress' in a.run('collectExportData()')) && !J(a.run('collectExportData()')).includes('inprogress'));
  a.run('createLocalBackup("test")');
  a.run('restoreLocalBackup()');
  assert.strictEqual(a.store.hfc_inprogress, undefined);
  a.set('hfc_inprogress', { date: '2026-10-15', title: 'X' });
  a.run(`importData(${J(exported(device(NONE)))})`);
  assert.strictEqual(a.store.hfc_inprogress, undefined);
});

// ───────────── Levée de restriction, série, atomicité ─────────────

test('levée de restriction après restauration : fonctionnement normal, historique conservé', () => {
  const source = device(CHEST, { suspension: ['2026-10-01'] });
  source.run('syncSafetySuspension()');
  const target = freshDevice();
  target.run(`importData(${J(exported(source))})`);
  assert.strictEqual(target.run('getTodayWorkout(getProfile()).exercises.length'), 0);
  target.run(`saveSafetyProfile(getProfile(), ${J(NONE)})`);
  assert.strictEqual(policy(target).canStartTraining, true);
  assert.strictEqual(target.run('isTrainingSuspendedNow()'), false);
  assert.ok(target.run('getTodayWorkout(getProfile()).exercises.length') > 0, 'la mémoire ne bloque rien après la levée');
  assert.deepStrictEqual(days(target), ['2026-10-01', '2026-10-15']);
  const plan = target.run('getWeekPlan()');
  assert.ok(plan.days.every((d) => d.missed === false || d.isPast === false || !d.suspended));
});

test('série : la série neutralisée survit à export/import/restauration sans séance fictive', () => {
  const source = device(CHEST, { sessions: W1, suspension: WEEK('2026-10-05') });
  assert.strictEqual(source.run('getStreak()'), 1);
  const target = freshDevice();
  target.run(`importData(${J(exported(source))})`);
  assert.strictEqual(target.run('getStreak()'), 1, 'série préservée à l\'identique');
  assert.strictEqual(target.run('getSessionLog().length'), 4, 'aucune séance ajoutée');
  assert.deepStrictEqual(target.run('getSessionLog().map((s) => s.date)'), W1);
  assert.strictEqual(target.run('getProgramProgress().sessionsCompleted'), source.run('getProgramProgress().sessionsCompleted'));
  // Témoin : sans la mémoire, la même série est rompue (c'est elle qui la préserve)
  const noMemory = device(CHEST, { sessions: W1 });
  noMemory.set('hfc_safety_suspension', []);
  assert.strictEqual(noMemory.run('getStreak()'), 0);
  // Restauration locale
  source.run('createLocalBackup("test")');
  source.set('hfc_safety_suspension', []);
  source.run('restoreLocalBackup()');
  assert.strictEqual(source.run('getStreak()'), 1);
  assert.strictEqual(source.run('getSessionLog().length'), 4);
});

test('atomicité : un échec d\'écriture de la mémoire annule tout l\'import', () => {
  const target = device(KNEES, { suspension: ['2026-10-05'] });
  const before = { profile: target.store.hfc_profile, memory: target.store.hfc_safety_suspension, sessions: target.store.hfc_sessions };
  target.run(`globalThis.__set = localStorage.setItem; globalThis.__failed = false; localStorage.setItem = (k, v) => { if (k === 'hfc_safety_suspension' && !__failed) { __failed = true; throw new Error('quota'); } return __set.call(localStorage, k, v); };`);
  const source = device(CHEST, { suspension: ['2026-10-08'] });
  assert.throws(() => target.run(`importData(${J(exported(source))})`), /suspension/i);
  assert.strictEqual(target.store.hfc_profile, before.profile, 'profil inchangé');
  assert.strictEqual(target.store.hfc_safety_suspension, before.memory, 'mémoire inchangée');
  assert.strictEqual(target.store.hfc_sessions, before.sessions);
});

test('aperçu d\'import : indique le nombre de jours de suspension sans rien écrire', () => {
  const target = device(NONE);
  const before = J(target.store);
  const preview = target.run(`buildImportPreview(${J(exported(device(CHEST, { suspension: ['2026-10-01', '2026-10-02'] })))})`);
  assert.strictEqual(preview.suspensionDays, 2);
  assert.strictEqual(J(target.store), before);
  assert.strictEqual(target.run(`buildImportPreview(${J(without(device(NONE), 'safetySuspension'))}).suspensionDays`), 0);
});

test('plafond : la fusion ne dépasse jamais 800 jours et écarte les plus anciens', () => {
  const many = (n, from) => Array.from({ length: n }, (_, i) => { const d = new Date(from, 0, 1 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const a = device(NONE, { suspension: many(700, 2024) });
  const incoming = { ...JSON.parse(exported(device(NONE))), safetySuspension: many(300, 2022) };
  a.run(`importData(${J(J(incoming))})`);
  const result = days(a);
  assert.strictEqual(result.length, 800);
  assert.strictEqual(result[result.length - 1], many(700, 2024)[699], 'les jours récents sont conservés');
});

test('effacement des données : la mémoire est effacée avec le reste', () => {
  const a = device(CHEST, { suspension: ['2026-10-01'] });
  a.run('eraseAllData()');
  assert.strictEqual(a.store.hfc_safety_suspension, undefined);
});

test('atomicité : un échec après l\'écriture de la mémoire la restaure aussi (rollback complet)', () => {
  const target = device(KNEES, { suspension: ['2026-10-05'] });
  const before = { profile: target.store.hfc_profile, memory: target.store.hfc_safety_suspension };
  target.run(`globalThis.__rm = localStorage.removeItem; globalThis.__once = false; localStorage.removeItem = (k) => { if (k === 'hfc_inprogress' && !__once) { __once = true; throw new Error('échec'); } return __rm.call(localStorage, k); };`);
  const source = device(CHEST, { suspension: ['2026-10-08'] });
  assert.throws(() => target.run(`importData(${J(exported(source))})`), /échec/);
  target.run('localStorage.removeItem = __rm;');
  assert.strictEqual(target.store.hfc_profile, before.profile, 'profil inchangé');
  assert.strictEqual(target.store.hfc_safety_suspension, before.memory, 'mémoire inchangée : aucun jour ajouté ni perdu');
});
