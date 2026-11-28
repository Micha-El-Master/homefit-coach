// Sous-lot 0 : garde-fou central « enforceSafeExercises » et correction des contournements D1 à D6.
//   D1 récupération · D2 échauffement/étirements · D3 matériel · D4 adaptations du coach · D5 reprise (voir tests/browser)
//   D6 remplacement manuel (voir tests/browser)
// Invariant vérifié partout : AUCUN exercice incompatible avec les précautions déclarées dans un résultat final.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');
const { computeSnapshot, loadFixture } = require('./safety-baseline');

const LIMS = ['knees', 'back', 'shoulders', 'balance', 'mobility'];
const SUBSETS = [];
for (let mask = 0; mask < 1 << LIMS.length; mask++) SUBSETS.push(LIMS.filter((_, i) => mask & (1 << i)));
const TITLES = ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio'];
const GOALS = ['forme', 'muscle', 'perte', 'discipline'];
const EQUIPMENTS = [[], ['chaise'], ['chaise', 'charges', 'elastique'], ['chaise', 'charges']];
const ADAPTATIONS = [
  { type: 'reduce-sets' },
  { type: 'light' },
  { type: 'shorter-rest' },
  { type: 'mini' },
  { type: 'comeback' },
  { type: 'no-equipment' },
  { type: 'swap-categories', categories: ['Jambes', 'Cardio'] },
  { type: 'swap-categories', categories: ['Haut du corps'] },
];

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const label = (s) => (s.length ? s.join('+') : 'aucune');

function appWith(limitations, equipment) {
  const app = createApp({ now: NOW });
  app.profile({ startDate: '2026-10-10', safety: { responded: true, limitations } });
  if (equipment) app.settings({ equipment });
  return app;
}

function incompatible(app, ids) {
  return ids.filter((id) => !app.run(`evaluateExerciseCompatibility(${JSON.stringify(id)}, getProfile()).compatible`));
}

// ───────────── A. enforceSafeExercises : contrat de la fonction ─────────────

test('enforceSafeExercises : résultat structuré et statuts complete / short / impossible', () => {
  const app = appWith([]);
  const full = app.run(`enforceSafeExercises([{id:'pompes',sets:3,reps:10},{id:'squat',sets:3,reps:10},{id:'crunch',sets:3,reps:10}], getProfile())`);
  assert.deepStrictEqual(Object.keys(full).sort(), ['added', 'exercises', 'removed', 'status']);
  assert.strictEqual(full.status, 'complete');

  const knees = appWith(['knees']);
  const short = knees.run(`enforceSafeExercises([{id:'curl-biceps',sets:3,reps:10},{id:'squat-jump',sets:3,reps:10}], getProfile())`);
  assert.strictEqual(short.status, 'short');
  // squat-jump (genoux) -> première alternative documentée compatible : « pont-fessier » (« squat » est bloqué par les genoux)
  assert.deepStrictEqual(short.exercises.map((e) => e.id), ['curl-biceps', 'pont-fessier']);
  const all = appWith(LIMS);
  const none = all.run(`enforceSafeExercises([{id:'burpees',sets:3,reps:10}], getProfile())`);
  assert.strictEqual(none.status, 'impossible');
  assert.deepStrictEqual(none.exercises, []);
  assert.deepStrictEqual(none.removed, ['burpees']);
});

test('enforceSafeExercises : retire ce qui est incompatible, ne remplace que par une alternative documentée', () => {
  const app = appWith(['shoulders']);
  const r = app.run(`enforceSafeExercises([{id:'pompes',sets:3,reps:10,perLeg:true},{id:'squat',sets:3,reps:10}], getProfile())`);
  assert.deepStrictEqual(r.removed, ['pompes']);
  assert.deepStrictEqual(r.added, ['curl-biceps']); // alternative documentée de pompes (SAFETY_EXERCISE_DATA)
  assert.deepStrictEqual(r.exercises.map((e) => e.id), ['curl-biceps', 'squat']);
  // Toute valeur ajoutée figure parmi les alternatives documentées de l'exercice retiré.
  assert.ok(app.run(`SAFETY_EXERCISE_DATA.pompes.alternatives.includes('curl-biceps')`));
});

test('enforceSafeExercises : n\'ajoute jamais d\'exercice pour atteindre un quota', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    const input = ['squat', 'pompes', 'planche'].map((id) => ({ id, sets: 2, reps: 8 }));
    const r = app.run(`enforceSafeExercises(${JSON.stringify(input)}, getProfile())`);
    const inputIds = input.map((e) => e.id);
    r.added.forEach((id) => {
      const documented = inputIds.some((from) => app.run(`SAFETY_EXERCISE_DATA[${JSON.stringify(from)}].alternatives.includes(${JSON.stringify(id)})`));
      assert.ok(documented, `${label(limitations)} : « ${id} » n'est pas une alternative documentée`);
    });
    assert.ok(r.exercises.length <= input.length, `${label(limitations)} : plus d'exercices en sortie qu'en entrée`);
  });
});

test('enforceSafeExercises : idempotente et sans effet sur un profil sans restriction', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    const input = app.run(`getRecoveryWorkout().exercises.concat(WARMUP_ROUTINE, COOLDOWN_ROUTINE, SESSION_CYCLE.flatMap((s) => s.exercises))`);
    const once = app.run(`enforceSafeExercises(${JSON.stringify(input)}, getProfile())`);
    const twice = app.run(`enforceSafeExercises(${JSON.stringify(once.exercises)}, getProfile())`);
    assert.deepStrictEqual(twice.exercises, once.exercises, `${label(limitations)} : pas idempotente`);
    assert.deepStrictEqual(twice.removed, []);
    assert.deepStrictEqual(twice.added, []);
  });
  const free = appWith([]);
  const list = free.run('SESSION_CYCLE[1].exercises');
  assert.deepStrictEqual(free.run(`enforceSafeExercises(SESSION_CYCLE[1].exercises, getProfile()).exercises`), list);
});

test('enforceSafeExercises : profil absent, non renseigné ou « préfère ne pas répondre » = aucune modification', () => {
  const routine = 'WARMUP_ROUTINE.concat(COOLDOWN_ROUTINE, RECOVERY_ROUTINE)';
  [undefined, { responded: true, preferNot: true, limitations: [] }, { responded: false, limitations: [] }].forEach((safety) => {
    const app = createApp({ now: NOW });
    app.profile(safety ? { safety } : {});
    const r = app.run(`enforceSafeExercises(${routine}, getProfile())`);
    assert.deepStrictEqual(r.removed, []);
    assert.deepStrictEqual(r.added, []);
    assert.strictEqual(r.exercises.length, app.run(`${routine}.length`));
  });
  const noProfile = createApp({ now: NOW });
  assert.strictEqual(noProfile.run(`enforceSafeExercises(RECOVERY_ROUTINE, null).exercises.length`), 9);
});

test('enforceSafeExercises : entrées invalides ou exercice inconnu ne passent jamais', () => {
  const app = appWith(['knees']);
  assert.deepStrictEqual(app.run(`enforceSafeExercises(null, getProfile()).exercises`), []);
  assert.deepStrictEqual(app.run(`enforceSafeExercises('x', getProfile()).exercises`), []);
  assert.strictEqual(app.run(`enforceSafeExercises([], getProfile()).status`), 'impossible');
  const r = app.run(`enforceSafeExercises([null, {}, {id: 42}, {id: 'exercice-inconnu', sets: 1}, {id: 'curl-biceps', sets: 1, reps: 5}], getProfile())`);
  assert.deepStrictEqual(r.exercises.map((e) => e.id), ['curl-biceps']);
  assert.deepStrictEqual(r.removed, ['exercice-inconnu']);
});

test('describeSafetyEnforcement : null sans changement, message explicite sinon', () => {
  const app = appWith(['knees']);
  assert.strictEqual(app.run(`describeSafetyEnforcement(enforceSafeExercises([{id:'curl-biceps',sets:1,reps:5}], getProfile()))`), null);
  const none = app.run(`describeSafetyEnforcement(enforceSafeExercises([{id:'burpees',sets:1,reps:5}], getProfile()))`);
  assert.match(none, /Précautions prises en compte/);
  const all = appWith(LIMS);
  assert.match(all.run(`describeSafetyEnforcement(enforceSafeExercises([{id:'burpees',sets:1,reps:5}], getProfile()))`), /Aucun exercice n’est compatible.*professionnel/);
  assert.match(all.run(`describeSafetyEnforcement(enforceSafeExercises(RECOVERY_ROUTINE, getProfile()))`), /professionnel/);
});

// ───────────── B. D1 : récupération ─────────────

test('D1 récupération : aucun exercice incompatible pour les 32 combinaisons de précautions', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    const w = app.run('getRecoveryWorkout()');
    const ids = w.exercises.map((e) => e.id);
    assert.deepStrictEqual(incompatible(app, ids), [], `${label(limitations)} : ${ids}`);
    assert.strictEqual(new Set(ids).size, ids.length, `doublon : ${label(limitations)}`);
    assert.ok(app.run(`${JSON.stringify(ids)}.every((id) => !!EXERCISES[id])`));
    // Même résultat par le chemin « getTodayWorkout » (titre Récupération) : le profil est bien transmis.
    assert.deepStrictEqual(app.run(`getTodayWorkout(getProfile(), RECOVERY_TITLE).exercises.map((e) => e.id)`), ids);
    if (ids.length < 3) assert.match(w.safetyNote, /professionnel/, `${label(limitations)} : avertissement manquant`);
    assert.strictEqual(w.safetyStatus, ids.length === 0 ? 'impossible' : ids.length < 3 ? 'short' : 'complete');
  });
});

test('D1 récupération : exemple de l\'audit (genoux + dos + épaules + équilibre) ne garde que la respiration', () => {
  const app = appWith(['knees', 'back', 'shoulders', 'balance']);
  assert.deepStrictEqual(app.run('getRecoveryWorkout().exercises.map((e) => e.id)'), ['respiration-profonde']);
});

test('D1 récupération : sans précaution, les 9 exercices historiques sont conservés dans l\'ordre', () => {
  const app = createApp({ now: NOW });
  app.profile();
  assert.deepStrictEqual(app.run('getRecoveryWorkout().exercises.map((e) => e.id)'), app.run('RECOVERY_ROUTINE.map((e) => e.id)'));
  assert.strictEqual(app.run('getRecoveryWorkout().safetyNote'), undefined);
});

test('D1 récupération un jour de jeûne : la séance automatique respecte aussi les précautions', () => {
  const app = appWith(['knees']);
  app.settings({ fasts: [{ start: '2026-10-14', days: 3 }] });
  assert.strictEqual(app.run('fastPhaseOn(todayISO()).phase'), 'fast');
  const ids = app.run('getTodayWorkout(getProfile(), RECOVERY_TITLE).exercises.map((e) => e.id)');
  assert.deepStrictEqual(incompatible(app, ids), []);
  assert.ok(!ids.includes('etirement-quadriceps') && !ids.includes('posture-enfant'));
});

// ───────────── C. D2 : échauffement et étirements ─────────────

test('D2 échauffement et étirements : filtrés comme les séances, uniquement par des alternatives documentées', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    ['WARMUP_ROUTINE', 'COOLDOWN_ROUTINE'].forEach((name) => {
      const r = app.run(`enforceSafeExercises(${name}, getProfile())`);
      assert.deepStrictEqual(incompatible(app, r.exercises.map((e) => e.id)), [], `${name} / ${label(limitations)}`);
      assert.strictEqual(new Set(r.exercises.map((e) => e.id)).size, r.exercises.length, `doublon ${name} / ${label(limitations)}`);
      const sources = app.run(`${name}.map((e) => e.id)`);
      r.added.forEach((id) => {
        const documented = sources.some((from) => app.run(`SAFETY_EXERCISE_DATA[${JSON.stringify(from)}].alternatives.includes(${JSON.stringify(id)})`));
        assert.ok(documented, `${name} / ${label(limitations)} : « ${id} » n'est pas une alternative documentée`);
      });
    });
  });
  // Cas de l'audit : genoux seuls -> ni genoux-hauts ni jumping-jacks ; genoux-hauts est remplacé par son alternative documentée.
  const knees = appWith(['knees']);
  const r = knees.run(`enforceSafeExercises(WARMUP_ROUTINE, getProfile())`);
  assert.deepStrictEqual(r.exercises.map((e) => e.id), ['respiration-profonde', 'rotations-bras', 'rotations-hanches']);
  assert.deepStrictEqual(r.removed.sort(), ['genoux-hauts', 'jumping-jacks']);
  assert.deepStrictEqual(r.added, ['respiration-profonde']);
});

test('D2 phase sans mouvement compatible : statut « impossible » (la phase est alors ignorée par workout.html)', () => {
  const app = appWith(LIMS);
  const r = app.run(`enforceSafeExercises([{ id: 'burpees', sets: 1, holdSeconds: 30 }, { id: 'squat-jump', sets: 1, holdSeconds: 30 }], getProfile())`);
  assert.strictEqual(r.status, 'impossible');
  assert.deepStrictEqual(r.exercises, []);
});

// ───────────── D. D3 : matériel ─────────────

test('D3 matériel : applyEquipment avec profil ne choisit jamais un remplaçant incompatible', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    EQUIPMENTS.forEach((equipment) => {
      TITLES.forEach((title) => {
        const day = app.run(`SESSION_CYCLE.find((s) => s.title === ${JSON.stringify(title)}).exercises`);
        const safe = app.run(`applySafetyToExercises(${JSON.stringify(day)}, getProfile()).exercises`);
        const out = app.run(`applyEquipment(${JSON.stringify(safe)}, ${JSON.stringify(equipment)}, getProfile()).exercises`);
        assert.deepStrictEqual(incompatible(app, out.map((e) => e.id)), [], `${label(limitations)} / ${title} / ${equipment}`);
      });
    });
  });
});

test('D3 matériel : sans profil, applyEquipment garde son comportement historique (2 arguments)', () => {
  const app = createApp({ now: NOW });
  app.profile();
  const r = app.run(`applyEquipment([{ id: 'tirage-elastique', sets: 3, reps: 12 }], [])`);
  assert.deepStrictEqual(r, app.run(`applyEquipment([{ id: 'tirage-elastique', sets: 3, reps: 12 }], [], null)`));
});

test('D3 matériel : le garde-fou final rattrape un remplaçant incompatible produit par l\'ancienne logique', () => {
  // Cas de l'audit : profil dos, séance « Dos + Biceps », sans matériel : l'ancien enchaînement réintroduisait « superman ».
  const app = appWith(['back'], []);
  const day = app.run(`SESSION_CYCLE.find((s) => s.title === 'Dos + Biceps').exercises`);
  const safe = app.run(`applySafetyToExercises(${JSON.stringify(day)}, getProfile()).exercises`);
  const legacy = app.run(`applyEquipment(${JSON.stringify(safe)}, []).exercises`); // sans profil = ancien comportement
  assert.ok(incompatible(app, legacy.map((e) => e.id)).length > 0, 'le contournement D3 doit exister dans l\'ancienne logique (sinon ce test ne prouve rien)');
  const guarded = app.run(`enforceSafeExercises(${JSON.stringify(legacy)}, getProfile())`);
  assert.deepStrictEqual(incompatible(app, guarded.exercises.map((e) => e.id)), []);
});

// ───────────── E. Invariant exhaustif sur les séances finales ─────────────

test('invariant : 2 048 combinaisons (32 précautions × 4 matériels × 4 objectifs × 4 séances), aucun exercice incompatible', () => {
  let count = 0;
  SUBSETS.forEach((limitations) => {
    EQUIPMENTS.forEach((equipment) => {
      const app = appWith(limitations, equipment);
      GOALS.forEach((goal) => {
        app.profile({ startDate: '2026-10-10', goal, safety: { responded: true, limitations } });
        TITLES.forEach((title) => {
          const w = app.run(`getTodayWorkout(getProfile(), ${JSON.stringify(title)})`);
          const ids = w.exercises.map((e) => e.id);
          count++;
          assert.deepStrictEqual(incompatible(app, ids), [], `${label(limitations)} / ${equipment} / ${goal} / ${title} : ${ids}`);
          assert.strictEqual(new Set(ids).size, ids.length, `doublon : ${ids}`);
          assert.strictEqual(w.safetyStatus, ids.length === 0 ? 'impossible' : ids.length < 3 ? 'short' : 'complete');
          if (ids.length < 3) assert.match(w.safetyNote, /professionnel/);
        });
      });
    });
  });
  assert.strictEqual(count, 2048);
});

test('invariant : séances de reprise après jeûne (volume réduit) toujours sûres', () => {
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations);
    app.settings({ fasts: [{ start: '2026-10-12', days: 3 }] });
    assert.strictEqual(app.run('fastPhaseOn(todayISO()).phase'), 'refeed');
    TITLES.forEach((title) => {
      const ids = app.run(`getTodayWorkout(getProfile(), ${JSON.stringify(title)}).exercises.map((e) => e.id)`);
      assert.deepStrictEqual(incompatible(app, ids), [], `${label(limitations)} / ${title}`);
    });
  });
});

// ───────────── F. D4 : adaptations du coach ─────────────

test('D4 adaptations du coach : invariant sur 32 précautions × 4 séances × 8 adaptations (1 024 scénarios)', () => {
  let count = 0;
  SUBSETS.forEach((limitations) => {
    const app = appWith(limitations, ['chaise', 'charges', 'elastique']);
    TITLES.forEach((title) => {
      ADAPTATIONS.forEach((adaptation) => {
        const r = app.run(`(function () {
          const w = getTodayWorkout(getProfile(), ${JSON.stringify(title)});
          const a = applyCoachAdaptation(w.exercises, ${JSON.stringify(adaptation)}, getProfile(), 45);
          return { ids: a.exercises.map((e) => e.id), rest: a.restSeconds, status: a.guard.status };
        })()`);
        count++;
        // (swap-categories peut produire un doublon sans lien avec la sécurité : comportement historique conservé.)
        assert.deepStrictEqual(incompatible(app, r.ids), [], `${label(limitations)} / ${title} / ${adaptation.type}${adaptation.categories || ''} : ${r.ids}`);
      });
    });
  });
  assert.strictEqual(count, 1024);
});

test('D4 adaptations du coach : exemples de l\'audit (genoux, séance Jambes + Abdos)', () => {
  const app = appWith(['knees'], ['chaise', 'charges', 'elastique']);
  const ids = app.run(`applyCoachAdaptation(getTodayWorkout(getProfile(), 'Jambes + Abdos').exercises, { type: 'swap-categories', categories: ['Jambes', 'Cardio'] }, getProfile(), 45).exercises.map((e) => e.id)`);
  assert.ok(!ids.includes('squat'), `squat (genoux) ne doit pas revenir : ${ids}`);
  assert.deepStrictEqual(incompatible(app, ids), []);
});

test('D4 adaptations du coach : sans restriction, comportement identique à l\'ancien code de workout.html', () => {
  // Référence : les transformations exactement telles qu'elles étaient écrites en ligne dans workout.html.
  const legacy = `(function (exercises, adaptation, restSeconds) {
    let today = { exercises }; let REST_SECONDS = restSeconds;
    if (adaptation.type === 'reduce-sets' || adaptation.type === 'light') today.exercises = today.exercises.map((ex) => ({ ...ex, sets: Math.max(1, ex.sets - 1) }));
    if (adaptation.type === 'shorter-rest' || adaptation.type === 'light') REST_SECONDS = Math.min(REST_SECONDS, 30);
    if (adaptation.type === 'no-equipment') today.exercises = applyEquipment(today.exercises, []).exercises;
    if (adaptation.type === 'mini') today.exercises = today.exercises.slice(0, 3).map((ex) => ({ ...ex, sets: Math.min(2, ex.sets) }));
    if (adaptation.type === 'comeback') today.exercises = today.exercises.map((ex) => ({ ...ex, sets: Math.max(1, ex.sets - 1),
      ...(ex.reps ? { reps: Math.max(1, Math.round(ex.reps * 0.8)) } : {}), ...(ex.holdSeconds ? { holdSeconds: Math.max(10, Math.round(ex.holdSeconds * 0.8)) } : {}) }));
    if (adaptation.type === 'swap-categories') today.exercises = today.exercises.map((ex) => { const data = EXERCISES[ex.id];
      if (adaptation.categories.includes(data.category) && data.alternatives && data.alternatives.length) return { ...ex, id: data.alternatives[0] }; return ex; });
    return { exercises: today.exercises, restSeconds: REST_SECONDS };
  })`;
  [undefined, { responded: true, preferNot: true, limitations: [] }, { responded: true, limitations: [] }].forEach((safety) => {
    const app = createApp({ now: NOW });
    app.profile(safety ? { startDate: '2026-10-10', safety } : { startDate: '2026-10-10' });
    app.settings({ equipment: ['chaise', 'charges', 'elastique'] });
    TITLES.forEach((title) => {
      ADAPTATIONS.forEach((adaptation) => {
        const call = (fn) => app.run(`(function () { const w = getTodayWorkout(getProfile(), ${JSON.stringify(title)}); return (${fn})(w.exercises, ${JSON.stringify(adaptation)}, 45); })()`);
        const before = call(legacy);
        const after = app.run(`(function () { const w = getTodayWorkout(getProfile(), ${JSON.stringify(title)}); const a = applyCoachAdaptation(w.exercises, ${JSON.stringify(adaptation)}, getProfile(), 45); return { exercises: a.exercises, restSeconds: a.restSeconds }; })()`);
        assert.deepStrictEqual(after, before, `${title} / ${adaptation.type}${adaptation.categories || ''}`);
      });
    });
  });
});

test('D4 adaptations du coach : mini garde 3 exercices au plus, light et reduce-sets ne retirent aucune série à 1', () => {
  const app = appWith([], ['chaise', 'charges', 'elastique']);
  const w = app.run(`(function () { const t = getTodayWorkout(getProfile(), 'Haut du corps'); return {
    mini: applyCoachAdaptation(t.exercises, { type: 'mini' }, getProfile(), 45).exercises,
    light: applyCoachAdaptation(t.exercises, { type: 'light' }, getProfile(), 45),
    base: t.exercises }; })()`);
  assert.strictEqual(w.mini.length, 3);
  assert.ok(w.mini.every((e) => e.sets <= 2));
  assert.strictEqual(w.light.restSeconds, 30);
  assert.ok(w.light.exercises.every((e, i) => e.sets === Math.max(1, w.base[i].sets - 1)));
});

// ───────────── G. Non-régression : profils sans restriction ─────────────

test('non-régression : le profil « aucune situation » (none) garde le comportement historique à l\'identique (408 cas)', () => {
  // Les profils « non renseigné » et « préfère ne pas répondre » (niveau « caution » depuis le sous-lot 0b-2) sont testés dans
  // tests/safety-policy.test.js ; l'instantané historique complet reste dans le fichier de référence.
  const expected = loadFixture();
  const actual = computeSnapshot(['repondu-sans-limitation']);
  const expectedNone = Object.fromEntries(Object.entries(expected).filter(([k]) => k.startsWith('repondu-sans-limitation|')));
  assert.strictEqual(Object.keys(expected).length, 1224);
  assert.strictEqual(Object.keys(expectedNone).length, 408);
  assert.deepStrictEqual(Object.keys(actual).sort(), Object.keys(expectedNone).sort());
  const diff = Object.keys(expectedNone).filter((k) => actual[k] !== expectedNone[k]);
  assert.deepStrictEqual(diff, [], `cas modifiés : ${diff.slice(0, 5)}`);
});

test('non-régression : sans précaution, la séance n\'a pas de note de sécurité et garde ses 5 exercices', () => {
  const app = createApp({ now: NOW });
  app.profile({ startDate: '2026-10-10' });
  app.settings({ equipment: ['chaise', 'charges', 'elastique'] });
  TITLES.forEach((title) => {
    const w = app.run(`getTodayWorkout(getProfile(), ${JSON.stringify(title)})`);
    assert.strictEqual(w.exercises.length, 5);
    assert.strictEqual(w.safetyNote, null);
    assert.strictEqual(w.safetyStatus, 'complete');
  });
});

test('non-régression : la récupération ne compte toujours ni dans les séances ni dans la série', () => {
  const app = appWith(['knees', 'back']);
  app.run(`addRecoveryLog({ date: '2026-10-14', duration: 8 })`);
  assert.strictEqual(app.run('getSessionLog().length'), 0);
  assert.strictEqual(app.run('getProgramProgress().sessionsCompleted'), 0);
  assert.strictEqual(app.run('getRecoveryLog().length'), 1);
});
