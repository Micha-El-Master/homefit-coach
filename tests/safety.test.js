const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

test('profil sans précautions reste non renseigné', () => {
  const app = createApp();
  app.profile({ safety: undefined });
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
  // Sous-lot 0b-1 : une situation inconnue est une donnée ambiguë. Elle n'est jamais assimilée à « aucune situation »
  // (avant : responded:true, soit en pratique « aucune restriction »). L'état prudent est « unanswered ».
  assert.strictEqual(safety.status, 'unanswered');
  assert.strictEqual(safety.responded, false);
  assert.deepStrictEqual(safety.limitations, []);
});

test('données malformées restent ignorées sans réponse implicite', () => {
  const app = createApp();
  app.profile({ safety: 'incorrect' });
  const safety = app.run('normalizeSafetyProfile(getProfile())');
  assert.strictEqual(safety.responded, false);
  assert.strictEqual(safety.preferNot, false);
});

test('alternatives de sécurité : toutes existent et sont documentées', () => {
  const app = createApp();
  const bad = app.run(`Object.entries(SAFETY_EXERCISE_DATA).flatMap(([id, d]) => [id, ...d.alternatives].filter((x) => !EXERCISES[x] || !SAFETY_EXERCISE_DATA[x]))`);
  assert.deepStrictEqual(bad, []);
  assert.deepStrictEqual(app.run('SAFETY_GENTLE_FILLERS.filter((id) => !EXERCISES[id] || !SAFETY_EXERCISE_DATA[id])'), []);
});

test('aucune combinaison de précautions ne vide une séance (au moins 3 exercices jusqu\'à 2 précautions)', () => {
  const ids = ['knees', 'back', 'shoulders', 'balance', 'mobility'];
  const combos = [];
  for (let mask = 1; mask < 1 << ids.length; mask++) combos.push(ids.filter((_, i) => mask & (1 << i)));
  const app = createApp({ now: new Date(2026, 10, 27, 12) });
  const titles = ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio'];
  combos.forEach((limitations) => {
    app.profile({ startDate: '2026-11-01', safety: { responded: true, limitations } });
    titles.forEach((title) => {
      const w = app.run(`getTodayWorkout(getProfile(), ${JSON.stringify(title)})`);
      const list = w.exercises.map((e) => e.id);
      assert.ok(list.length >= 1, `${limitations.join('+')} / ${title} : séance vide`);
      if (limitations.length <= 2) assert.ok(list.length >= 3, `${limitations.join('+')} / ${title} : ${list.length} exercice(s)`);
      if (list.length < 3) assert.match(w.safetyNote, /professionnel/, `${limitations.join('+')} / ${title} : pas d'avertissement`);
      assert.strictEqual(new Set(list).size, list.length, `doublon : ${limitations.join('+')} / ${title}`);
      assert.ok(app.run(`${JSON.stringify(list)}.every((id) => !!EXERCISES[id])`), `exercice inconnu : ${list}`);
      list.forEach((id) => {
        const r = app.run(`evaluateExerciseCompatibility(${JSON.stringify(id)}, getProfile())`);
        assert.ok(r.compatible, `${id} incompatible avec ${limitations.join('+')}`);
      });
    });
  });
});

test('séance complétée : la note de sécurité l\'explique', () => {
  const app = createApp({ now: new Date(2026, 10, 27, 12) });
  app.profile({ startDate: '2026-11-01', safety: { responded: true, limitations: ['knees', 'back'] } });
  const w = app.run("getTodayWorkout(getProfile(), 'Full Body + Cardio')");
  assert.match(w.safetyNote, /mouvements? doux ajoutés?/);
});

test('sans précaution, la séance n\'est pas modifiée', () => {
  const app = createApp({ now: new Date(2026, 10, 27, 12) });
  app.profile({ startDate: '2026-11-01' });
  const w = app.run("getTodayWorkout(getProfile(), 'Haut du corps')");
  assert.strictEqual(w.exercises.length, 5);
  assert.strictEqual(w.safetyNote, null);
});

test('note de sécurité : un exercice remplacé n\'est pas aussi compté comme retiré', () => {
  const app = createApp({ now: new Date(2026, 10, 27, 12) });
  app.profile({ startDate: '2026-11-01', safety: { responded: true, limitations: ['shoulders'] } });
  const w = app.run("getTodayWorkout(getProfile(), 'Haut du corps')");
  assert.match(w.safetyNote, /1 exercice remplacé/);
  assert.match(w.safetyNote, /4 exercices retirés/);
});

test('signaux du bouton « Douleur ou malaise » : chacun arrête la séance, l\'urgence est cohérente', () => {
  const app = createApp();
  const signals = app.run('SAFETY_SIGNALS');
  assert.ok(signals.length >= 4);
  assert.strictEqual(new Set(signals.map((s) => s.id)).size, signals.length);
  signals.forEach((s) => {
    const decision = app.run(`computeSafetyStop(${JSON.stringify(s.id)})`);
    assert.strictEqual(decision.stop, true, `${s.id} doit arrêter la séance`);
    assert.strictEqual(decision.urgent, s.urgent, `${s.id} : urgence incohérente`);
  });
  assert.ok(signals.some((s) => s.urgent) && signals.some((s) => !s.urgent));
});
