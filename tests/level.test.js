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
