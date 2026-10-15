const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

test('progression : +3 % par semaine, semaines 4 et 8 allégées', () => {
  const app = createApp();
  const f = (w) => app.run(`getProgressionFactor(${w})`);
  assert.strictEqual(f(1), 1);
  assert.ok(Math.abs(f(2) - 1.03) < 1e-9);
  assert.ok(f(4) < f(3), 'la semaine 4 est plus légère que la 3');
  assert.ok(f(8) < f(7), 'la semaine 8 est plus légère que la 7');
  assert.ok(f(12) > f(9));
  assert.strictEqual(app.run('getWeekPhase(4).deload'), true);
  assert.strictEqual(app.run('getWeekPhase(5).deload'), false);
});

test('scaleExercise : niveau, ressenti, ajustement et série supplémentaire', () => {
  const app = createApp();
  app.settings({});
  const scale = (ex, level, week, feeling) => app.run(`scaleExercise(${JSON.stringify(ex)}, '${level}', ${week}, ${feeling ? `'${feeling}'` : 'null'})`);
  assert.strictEqual(scale({ id: 'pompes', sets: 4, reps: 12 }, 'intermediaire', 1, null).reps, 12);
  assert.strictEqual(scale({ id: 'pompes', sets: 4, reps: 12 }, 'debutant', 1, null).reps, 10);
  assert.strictEqual(scale({ id: 'pompes', sets: 4, reps: 12 }, 'avance', 1, null).reps, 14);
  assert.strictEqual(scale({ id: 'pompes', sets: 4, reps: 12 }, 'intermediaire', 1, 'dur').reps, 11);
  assert.strictEqual(scale({ id: 'squat', sets: 3, reps: 15 }, 'intermediaire', 9, null).sets, 4, 'série en plus à partir de la semaine 9');
  assert.strictEqual(scale({ id: 'squat', sets: 3, reps: 15 }, 'intermediaire', 8, null).sets, 3, 'pas de série en plus en semaine allégée');
  assert.strictEqual(scale({ id: 'planche', sets: 3, holdSeconds: 30 }, 'intermediaire', 1, null).holdSeconds, 30);
  app.set('hfc_adjust', { pompes: -2 });
  assert.strictEqual(scale({ id: 'pompes', sets: 4, reps: 12 }, 'intermediaire', 1, null).reps, 10);
});

test('ressenti : deux séances « dur » ou « facile » de suite changent la tendance', () => {
  const app = createApp();
  app.sessions([{ date: '2026-10-01', feeling: 'dur', exercises: [] }, { date: '2026-10-02', feeling: 'dur', exercises: [] }]);
  assert.strictEqual(app.run('getFeelingTrend()'), 'dur');
  app.sessions([{ date: '2026-10-01', feeling: 'dur', exercises: [] }, { date: '2026-10-02', feeling: 'facile', exercises: [] }]);
  assert.strictEqual(app.run('getFeelingTrend()'), null);
  app.sessions([{ date: '2026-10-02', feeling: 'facile', exercises: [] }]);
  assert.strictEqual(app.run('getFeelingTrend()'), null, 'une seule séance ne suffit pas');
});

test('programme selon l\'objectif', () => {
  const ids = (goal, title = 'Haut du corps') => {
    const app = createApp();
    app.profile({ goal });
    app.settings({ equipment: ['chaise', 'charges', 'elastique'] });
    const w = app.run(`getTodayWorkout(getProfile(), '${title}')`);
    return w.exercises.map((e) => `${e.id}:${e.sets}`);
  };
  assert.strictEqual(ids('forme').length, 5);
  assert.strictEqual(ids('muscle')[0], 'pompes:5');
  assert.strictEqual(ids('muscle')[1], 'pike-pushup:4');
  assert.strictEqual(ids('perte').length, 6);
  assert.strictEqual(ids('perte').at(-1), 'mountain-climbers:3');
  assert.strictEqual(ids('discipline').length, 4);
});

test('programme : la série supplémentaire de la semaine 9 s\'applique aux exercices à 3 séries', () => {
  const app = createApp();
  app.profile({ goal: 'perte', startDate: '2026-08-01' }); // semaine 11 le 15 octobre
  app.settings({ equipment: ['chaise', 'charges', 'elastique'] });
  const w = app.run(`getTodayWorkout(getProfile(), 'Haut du corps')`);
  assert.strictEqual(w.week, 11);
  assert.strictEqual(w.exercises.at(-1).sets, 4);
});

test('matériel : les exercices infaisables sont remplacés ou retirés', () => {
  const build = (equipment, title) => {
    const app = createApp();
    app.profile({ goal: 'forme' });
    app.settings({ equipment });
    return app.run(`getTodayWorkout(getProfile(), '${title}')`);
  };
  const full = build(['chaise', 'charges', 'elastique'], 'Dos + Biceps');
  assert.strictEqual(full.exercises.length, 5);
  assert.strictEqual(full.equipmentNote, null);

  const none = build([], 'Dos + Biceps');
  assert.ok(none.equipmentNote);
  none.exercises.forEach((e) => assert.deepStrictEqual(app().run(`EXERCISES['${e.id}'].requires || []`), []));
  assert.ok(none.exercises.length < 5, 'la séance dos est raccourcie sans matériel');

  const upper = build([], 'Haut du corps');
  const upperIds = upper.exercises.map((e) => e.id);
  assert.strictEqual(new Set(upperIds).size, upperIds.length, 'pas de doublon après remplacement');
  assert.ok(upperIds.includes('pompes'));

  function app() {
    return createApp();
  }
});

test('matériel : le type (répétitions / maintien) suit l\'exercice de remplacement', () => {
  const app = createApp();
  const r = app.run(`applyEquipment([{ id: 'tirage-elastique', sets: 3, reps: 12 }], [])`);
  assert.strictEqual(r.exercises.length, 1);
  const ex = r.exercises[0];
  const type = app.run(`EXERCISES['${ex.id}'].type`);
  assert.ok(type === 'hold' ? ex.holdSeconds && !ex.reps : ex.reps && !ex.holdSeconds);
});

test('intégrité : tous les exercices référencés existent', () => {
  const app = createApp();
  const missing = app.run(`
    const ids = new Set();
    WEEK_PROGRAM.filter((d) => d.exercises).forEach((d) => d.exercises.forEach((e) => ids.add(e.id)));
    Object.values(FINISHERS).forEach((e) => ids.add(e.id));
    [...WARMUP_ROUTINE, ...COOLDOWN_ROUTINE].forEach((e) => ids.add(e.id));
    Object.values(FALLBACKS_BY_CATEGORY).flat().forEach((id) => ids.add(id));
    Object.values(EXERCISES).forEach((e) => (e.alternatives || []).forEach((id) => ids.add(id)));
    [...ids].filter((id) => !EXERCISES[id]);
  `);
  assert.deepStrictEqual([...missing], []);
});

test('intégrité : chaque exercice avec photo a toutes ses images', () => {
  const fs = require('fs');
  const path = require('path');
  const { ROOT } = require('./helpers');
  const app = createApp();
  const entries = app.run('[...PHOTO_EXERCISES].map((id) => [PHOTO_ALIAS[id] || id, PHOTO_FRAMES[id] || 2])');
  const absent = [];
  for (const [id, frames] of entries) {
    for (let n = 0; n < frames; n++) {
      if (!fs.existsSync(path.join(ROOT, 'images', 'exercises', `${id}-${n}.jpg`))) absent.push(`${id}-${n}`);
    }
  }
  assert.deepStrictEqual(absent, []);
});

test('intégrité : les exercices du programme ont un matériel connu', () => {
  const app = createApp();
  const unknown = app.run(`Object.values(EXERCISES).flatMap((e) => e.requires || []).filter((r) => !EQUIPMENT[r])`);
  assert.deepStrictEqual([...unknown], []);
});

test('crédits : chaque photo sous licence CC BY-SA est créditée, les autres citent la source libre', () => {
  const app = createApp();
  assert.match(app.run(`photoCredit(EXERCISES['burpees'])`), /Taco Fleur.*CC BY-SA 4\.0/s);
  assert.match(app.run(`photoCredit(EXERCISES['squat'])`), /free-exercise-db/);
  assert.strictEqual(app.run(`photoCredit(EXERCISES['jumping-jacks'])`), '');
});
