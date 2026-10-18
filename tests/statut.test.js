const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Aujourd'hui : jeudi 15 octobre 2026.
const CFG = { appUrl: 'https://micha-el-master.github.io/homefit-coach/' };
const PROFILE = { name: 'Léa', startDate: '2026-09-28', cohort: '2026-09-28', body: { weight: 70 } };

const sess = (date, extra = {}) => ({ date, title: 'Haut du corps', duration: 32, calories: 210, feeling: 'bien', exercises: [{ id: 'pompes', name: 'Pompes', totalReps: 42 }, { id: 'planche', name: 'Planche', totalReps: 90 }, { id: 'squat', name: 'Squat', totalReps: 60 }], ...extra });
const run = (app, code) => app.run(code);
const j = JSON.stringify;

test('carte semaine : anneau, bannière et statistiques', () => {
  const app = createApp();
  const recap = { from: '2026-10-12', to: '2026-10-18', count: 3, target: 4, minutes: 95, totalReps: 320 };
  const s = run(app, `buildWeekSpec(${j(recap)}, 2, ${j(PROFILE)}, ${j(CFG)})`);
  assert.strictEqual(s.title, 'Semaine 3');
  assert.strictEqual(s.hero.value, '3/4');
  assert.strictEqual(s.hero.fraction, 0.75);
  assert.strictEqual(s.banner, '⏳ En cours');
  assert.deepStrictEqual(s.stats.map((x) => x.value), ['95', '320', '2']);
  assert.strictEqual(s.cohort, 'Cohorte du 28 septembre');
  assert.match(s.caption, /Semaine 3 : 3\/4 séances, 95 min, 320 répétitions\. 🔥 2 semaines de suite/);
  assert.match(s.caption, /index\.html\?cohorte=2026-09-28/);
});

test('carte semaine : objectif atteint, sans série on montre les séances visées', () => {
  const app = createApp();
  const recap = { from: '2026-10-12', to: '2026-10-18', count: 4, target: 4, minutes: 120, totalReps: 0 };
  const s = run(app, `buildWeekSpec(${j(recap)}, 0, {}, ${j(CFG)})`);
  assert.strictEqual(s.banner, '✅ Objectif atteint');
  assert.strictEqual(s.hero.fraction, 1);
  assert.deepStrictEqual(s.stats[2], { value: '4', label: 'séances visées' });
  assert.ok(!/répétitions/.test(s.caption), 'pas de répétitions à 0');
  assert.match(s.caption, /Essaie avec moi : https:\/\/micha-el-master\.github\.io\/homefit-coach\/$/);
  assert.strictEqual(s.title, 'Ma semaine');
});

test('confidentialité : prénom seulement sur demande, jamais de poids', () => {
  const app = createApp();
  const recap = { from: '2026-10-12', to: '2026-10-18', count: 3, target: 4, minutes: 95, totalReps: 320 };
  const off = run(app, `buildWeekSpec(${j(recap)}, 1, ${j(PROFILE)}, ${j(CFG)})`);
  const on = run(app, `buildWeekSpec(${j(recap)}, 1, ${j(PROFILE)}, ${j(CFG)}, { includeName: true })`);
  assert.strictEqual(off.name, '');
  assert.strictEqual(on.name, 'Léa');
  for (const spec of [off, on]) assert.ok(!/70|poids|weight/i.test(JSON.stringify(spec)), 'aucun poids dans la carte');
  assert.ok(!/Léa/.test(on.caption), 'le prénom n\'est pas dans la légende');
});

test('carte séance : durée, répétitions, gainage séparé, numéro de séance', () => {
  const app = createApp();
  const s = run(app, `buildSessionSpec(${j(sess('2026-10-14'))}, 7, ${j(PROFILE)}, ${j(CFG)})`);
  assert.strictEqual(s.title, 'Séance Haut du corps');
  assert.strictEqual(s.subtitle, 'mercredi 14 octobre');
  assert.strictEqual(s.hero.value, '32');
  assert.deepStrictEqual(s.stats.map((x) => x.label), ['répétitions', 's de gainage', 'séances au total']);
  assert.strictEqual(s.stats[0].value, '102'); // 42 + 60, la planche (90 s) est comptée à part
  assert.strictEqual(s.stats[1].value, '90');
  assert.strictEqual(s.stats[2].value, '7');
  assert.match(s.caption, /Séance terminée : Haut du corps, 32 min, 102 répétitions/);
});

test('carte séance : ancien format sans détail des exercices', () => {
  const app = createApp();
  const old = { date: '2026-10-14', title: 'Dos + Biceps', duration: 28, calories: 180, exercises: [] };
  const s = run(app, `buildSessionSpec(${j(old)}, 1, {}, ${j(CFG)})`);
  assert.deepStrictEqual(s.stats.map((x) => x.label), ['kcal estimées', 'séance au total']);
  assert.ok(s.stats.length >= 1 && s.stats.every((x) => x.value));
  assert.doesNotMatch(s.caption, /répétitions/);
});

test('succès : seuls les badges débloqués et les défis relevés sont proposés', () => {
  const app = createApp();
  app.profile();
  app.settings({ trainingDays: [1, 2, 4, 5] });
  assert.deepStrictEqual(run(app, 'getAchievements().map((a) => a.id)'), []);
  app.sessions(['2026-10-01']);
  app.set('hfc_challenges', { active: {}, history: [{ id: 'pompes30', startDate: '2026-09-01', validated: 24, required: 26, success: true }, { id: 'kegel21', startDate: '2026-09-01', validated: 5, required: 21, success: false }] });
  assert.deepStrictEqual(run(app, 'getAchievements().map((a) => a.id)'), ['badge:first-session', 'badge:challenge-1', 'challenge:0']);
});

test('carte badge et carte défi', () => {
  const app = createApp();
  app.profile({ cohort: '2026-09-28' });
  app.settings({});
  app.sessions(['2026-10-01', '2026-10-02']);
  app.set('hfc_challenges', { active: {}, history: [{ id: 'pompes30', startDate: '2026-09-01', validated: 24, required: 26, success: true }] });
  const badge = run(app, `buildAchievementSpec('badge:first-session', getProfile(), ${j(CFG)})`);
  assert.strictEqual(badge.hero.emoji, '🎉');
  assert.strictEqual(badge.hero.title, 'Premier pas');
  assert.strictEqual(badge.banner, '🏅 Badge débloqué');
  assert.strictEqual(badge.stats[0].value, '2');
  const ch = run(app, `buildAchievementSpec('challenge:0', getProfile(), ${j(CFG)})`);
  assert.strictEqual(ch.hero.title, '30 jours de pompes');
  assert.strictEqual(ch.hero.desc, '24/26 jours validés');
  assert.deepStrictEqual(ch.stats.map((x) => x.value), ['24', '92%', '30']);
  assert.match(ch.caption, /Défi relevé : 30 jours de pompes \(24\/26 jours validés\)/);
  assert.strictEqual(run(app, `buildAchievementSpec('badge:inconnu', getProfile(), ${j(CFG)})`), null);
});

test('progression : candidats = exercices qui ont réellement progressé, triés par gain relatif', () => {
  const app = createApp();
  const log = [
    { date: '2026-09-22', exercises: [{ id: 'pompes', totalReps: 40 }, { id: 'squat', totalReps: 60 }, { id: 'curl-biceps', totalReps: 30 }] },
    { date: '2026-09-29', exercises: [{ id: 'pompes', totalReps: 48 }, { id: 'squat', totalReps: 60 }] },
    { date: '2026-10-06', exercises: [{ id: 'pompes', totalReps: 64 }, { id: 'squat', totalReps: 55 }, { id: 'curl-biceps', totalReps: 45 }] },
  ];
  const c = run(app, `listProgressCandidates(${j(log)})`);
  assert.deepStrictEqual(c.map((x) => x.id), ['pompes', 'curl-biceps'], 'squat a régressé : exclu ; pompes +60 % devant curl +50 %');
  assert.deepStrictEqual(c.find((x) => x.id === 'pompes'), { id: 'pompes', name: 'Pompes', from: 40, to: 64, gain: 24 });
  const s = run(app, `buildProgressSpec('pompes', ${j(log)}, ${j(PROFILE)}, ${j(CFG)})`);
  assert.deepStrictEqual(s.hero, { kind: 'delta', from: '40', to: '64', unit: 'répétitions', percent: 60 });
  assert.deepStrictEqual(s.stats.map((x) => x.value), ['+24', '3', '2']);
  assert.match(s.caption, /Pompes : 40 → 64 répétitions depuis ma première séance \(\+60 %\)/);
});

test('progression : exercice tenu en secondes, et pas assez de données', () => {
  const app = createApp();
  const log = [{ date: '2026-09-22', exercises: [{ id: 'planche', totalReps: 60 }] }, { date: '2026-10-06', exercises: [{ id: 'planche', totalReps: 90 }] }];
  assert.strictEqual(run(app, `buildProgressSpec('planche', ${j(log)}, {}, ${j(CFG)})`).hero.unit, 'secondes');
  assert.strictEqual(run(app, `buildProgressSpec('planche', ${j(log.slice(0, 1))}, {}, ${j(CFG)})`), null);
  assert.deepStrictEqual(run(app, `listProgressCandidates(${j(log.slice(0, 1))})`), []);
});

test('description pour lecteur d\'écran : résume le contenu de chaque type de carte', () => {
  const app = createApp();
  const recap = { from: '2026-10-12', to: '2026-10-18', count: 3, target: 4, minutes: 95, totalReps: 320 };
  const d = run(app, `describeSpec(buildWeekSpec(${j(recap)}, 2, ${j(PROFILE)}, ${j(CFG)}))`);
  assert.match(d, /3\/4 séances cette semaine/);
  assert.match(d, /95 minutes/);
  const log = [{ date: '2026-09-22', exercises: [{ id: 'pompes', totalReps: 40 }] }, { date: '2026-10-06', exercises: [{ id: 'pompes', totalReps: 64 }] }];
  assert.match(run(app, `describeSpec(buildProgressSpec('pompes', ${j(log)}, {}, ${j(CFG)}))`), /40 puis 64 répétitions/);
});

test('numéro de semaine du programme : seulement entre 1 et 12', () => {
  const app = createApp();
  assert.strictEqual(run(app, `programWeekOf({ startDate: '2026-09-28' }, '2026-10-12')`), 3);
  assert.strictEqual(run(app, `programWeekOf({ startDate: '2026-09-28' }, '2026-09-20')`), null, 'avant le départ');
  assert.strictEqual(run(app, `programWeekOf({ startDate: '2026-01-05' }, '2026-10-12')`), null, 'après le cycle');
});
