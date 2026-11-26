const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

test('profil sans précautions reste non renseigné', () => {
  const app = createApp();
  app.profile();
  const safety = app.run('normalizeSafetyProfile(getProfile())');
  assert.strictEqual(safety.responded, false);
  assert.strictEqual(safety.preferNot, false);
  assert.deepStrictEqual(safety.limitations, []);
});

test('profil préfère ne pas répondre reste prudent', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, preferNot: true, limitations: [] } });
  const safety = app.run('normalizeSafetyProfile(getProfile())');
  const warnings = app.run('getSafetyWarnings(getProfile())');
  assert.strictEqual(safety.preferNot, true);
  assert.match(warnings[0], /prudence|limitation|inconnu/i);
});

test('précautions déclarées sont modifiables et supprimables', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['knees'], preferNot: false } });
  assert.deepStrictEqual(app.run('normalizeSafetyProfile(getProfile()).limitations'), ['knees']);
  app.run(`saveSafetyProfile(getProfile(), { responded: false, preferNot: false, limitations: [] })`);
  assert.strictEqual(app.run('normalizeSafetyProfile(getProfile()).responded'), false);
});

test('exercice compatible avec restriction différente', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['knees'], preferNot: false } });
  const result = app.run(`evaluateExerciseCompatibility('curl-biceps', getProfile())`);
  assert.strictEqual(result.compatible, true);
});

test('exercice incompatible avec une restriction connue', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['knees'], preferNot: false } });
  const result = app.run(`evaluateExerciseCompatibility('squat-jump', getProfile())`);
  assert.strictEqual(result.compatible, false);
  assert.strictEqual(result.status, 'blocked');
});

test('compatibilité inconnue n’est pas garantie', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['knees'], preferNot: false } });
  const result = app.run(`evaluateExerciseCompatibility('exercice-inconnu', getProfile())`);
  assert.strictEqual(result.compatible, false);
  assert.strictEqual(result.status, 'unknown');
  assert.match(result.reason, /non déterminée/i);
});

test('alternative connue remplace un exercice incompatible', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['shoulders'], preferNot: false } });
  const result = app.run(`applySafetyToExercises([{ id: 'pompes', sets: 3, reps: 10 }], getProfile())`);
  assert.strictEqual(result.replaced, 1);
  assert.strictEqual(result.exercises[0].id, 'curl-biceps');
});

test('absence d’alternative documentée retire prudemment l’exercice', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, limitations: ['back'], preferNot: false } });
  const result = app.run(`applySafetyToExercises([{ id: 'exercice-inconnu', sets: 1, reps: 10 }], getProfile())`);
  assert.strictEqual(result.unknown, 1);
  assert.strictEqual(result.exercises.length, 0);
});

test('débutant sans restriction reste compatible', () => {
  const app = createApp();
  app.profile({ level: 'debutant', safety: { responded: false, preferNot: false, limitations: [] } });
  const result = app.run(`evaluateExerciseCompatibility('curl-biceps', getProfile())`);
  assert.strictEqual(result.compatible, true);
});

test('reprendre après interruption ajoute une prudence', () => {
  const app = createApp();
  app.profile({ safety: { responded: true, preferNot: false, returnAfterPause: true, limitations: [] } });
  const warnings = app.run('getSafetyWarnings(getProfile())');
  assert.ok(warnings.some((warning) => /longue interruption|prudence/i.test(warning)));
});

test('signaux douleur malaise vertige suspendent prudemment', () => {
  const app = createApp();
  const pain = app.run(`computeSafetyStop("douleur")`);
  const malaise = app.run(`computeSafetyStop("malaise")`);
  const vertige = app.run(`computeSafetyStop("vertige")`);
  assert.strictEqual(pain.stop, true);
  assert.strictEqual(malaise.stop, true);
  assert.strictEqual(vertige.stop, true);
});

test('données locales absentes ou anciennes restent sûres', () => {
  const app = createApp();
  assert.strictEqual(app.run('normalizeSafetyProfile(null).responded'), false);
  app.profile({ safety: { responded: true, limitations: ['ancienne_limitation'] } });
  const safety = app.run('normalizeSafetyProfile(getProfile())');
  assert.strictEqual(safety.responded, true);
  assert.deepStrictEqual(safety.limitations, []);
});

test('données malformées restent ignorées sans réponse implicite', () => {
  const app = createApp();
  app.profile({ safety: 'incorrect' });
  const safety = app.run('normalizeSafetyProfile(getProfile())');
  assert.strictEqual(safety.responded, false);
  assert.strictEqual(safety.preferNot, false);
});
