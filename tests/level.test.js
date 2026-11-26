const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

test('test de départ : exemple du parcours (18 squats, 8 pompes, 30 s) = niveau 3', () => {
  const app = createApp();
  const r = app.run('computeLevelFromTests({ squats: 18, pompes: 8, gainage: 30 })');
  assert.deepStrictEqual(r, { score: 3, scores: { squats: 4, pompes: 2, gainage: 3 } });
});

test('niveau borné entre 1 et 10, valeurs invalides = niveau 1', () => {
  const app = createApp();
  assert.strictEqual(app.run('computeLevelFromTests({ squats: 0, pompes: 0, gainage: 0 })').score, 1);
  assert.strictEqual(app.run('computeLevelFromTests({ squats: 999, pompes: 999, gainage: 999 })').score, 10);
  assert.strictEqual(app.run("computeLevelFromTests({ squats: 'x', pompes: -4, gainage: null })").score, 1);
});

test('les répétitions montent avec le niveau chiffré et on commence plus petit que « débutant »', () => {
  const app = createApp();
  const reps = (lvl) => app.run(`scaleExercise({ id: 'squat', sets: 3, reps: 20 }, ${lvl}, 1).reps`);
  assert.ok(reps(1) < reps(5) && reps(5) < reps(10));
  assert.ok(reps(1) < app.run("scaleExercise({ id: 'squat', sets: 3, reps: 20 }, 'debutant', 1).reps"));
});

test('l\'ancien niveau texte fonctionne toujours', () => {
  const app = createApp();
  assert.strictEqual(app.run("scaleExercise({ id: 'squat', sets: 3, reps: 20 }, 'avance', 1).reps"), 24);
});

test('la séance du jour utilise le niveau du test, sinon le niveau choisi', () => {
  const app = createApp();
  app.profile({ level: 'debutant', levelScore: 1 });
  const low = app.run('getTodayWorkout(getProfile()).exercises[0].reps');
  app.profile({ level: 'avance', levelScore: 10 });
  const high = app.run('getTodayWorkout(getProfile()).exercises[0].reps');
  assert.ok(low < high);
});

test('courbe de 12 semaines : monte, avec des semaines 4 et 8 allégées', () => {
  const app = createApp();
  const curve = app.run('getLevelCurve(3)');
  assert.strictEqual(curve.length, 12);
  assert.deepStrictEqual(curve.filter((c) => c.deload).map((c) => c.week), [4, 8]);
  assert.ok(curve[11].factor > curve[0].factor);
  assert.ok(curve[3].factor < curve[2].factor);
});

test('résultat submaximal normal reste prudent', () => {
  const app = createApp();
  const r = app.run('computeLevelFromTests({ squats: 8, pompes: 5, gainage: 20, effort: "modere" })');
  assert.ok(r.score >= 1 && r.score <= 10);
  assert.deepStrictEqual(r.scores, { squats: 6, pompes: 6, gainage: 5 });
});

test('épreuves ignorées ou absentes restent conservatrices', () => {
  const app = createApp();
  assert.strictEqual(app.run('computeLevelFromTests({})').score, 1);
  const skipped = app.run('computeLevelFromTests({ skipped: ["squats", "pompes", "gainage"] })');
  assert.strictEqual(skipped.score, 2);
});

test('test incomplet sans pénalité en valeur nulle', () => {
  const app = createApp();
  const r = app.run('computeLevelFromTests({ squats: 8, skipped: ["pompes", "gainage"] })');
  assert.ok(r.score >= 1 && r.score <= 4);
  assert.strictEqual(r.scores.pompes, null);
});

test('difficulté importante ne monte jamais le niveau', () => {
  const app = createApp();
  const r = app.run('computeLevelFromTests({ squats: 8, pompes: 5, gainage: 20, effort: "difficile" })');
  assert.strictEqual(r.score, 3);
});

test('arrêt ou signal de sécurité impose un niveau prudent', () => {
  const app = createApp();
  const interrupted = app.run('computeLevelFromTests({ squats: 8, pompes: 5, gainage: 20, interrupted: true })');
  const safety = app.run('computeLevelFromTests({ safetyStop: true, safetySignal: "douleur" })');
  assert.strictEqual(interrupted.score, 2);
  assert.ok(safety.score >= 1 && safety.score <= 2);
});

test('ancien profil avec niveau valide reste compatible', () => {
  const app = createApp();
  app.profile({ level: 'intermediaire', levelScore: 6, levelTests: { squats: 18, pompes: 8, gainage: 30 } });
  const profile = app.run('getProfile()');
  assert.strictEqual(profile.levelScore, 6);
  assert.strictEqual(profile.level, 'intermediaire');
});

test('nouveau protocole ne contient plus de test maximal ancien', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'test.html'), 'utf8');
  assert.doesNotMatch(html, /60 secondes/);
  assert.doesNotMatch(html, /jusqu.?à épuisement/);
  assert.doesNotMatch(html, /Combien de pompes sur les genoux d.affilée/);
  assert.match(html, /8 squats contrôlés maximum/);
  assert.match(html, /Arrêter le test maintenant/);
});
