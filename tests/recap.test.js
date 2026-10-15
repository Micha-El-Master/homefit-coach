const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const session = (date, extra = {}) => ({
  date,
  title: 'Haut du corps',
  duration: 30,
  calories: 200,
  exercises: [
    { id: 'pompes', name: 'Pompes', totalReps: 40 },
    { id: 'planche', name: 'Planche', totalReps: 90 },
  ],
  ...extra,
});

function recap(sessions, days = [1, 3, 5]) {
  const app = createApp();
  app.settings({ trainingDays: days });
  app.sessions(sessions);
  return { app, r: app.run('getWeekRecap(mondayOf(new Date(2026, 9, 15)))') };
}

test('bilan : totaux, répétitions et maintiens séparés, ressentis', () => {
  const { r } = recap([session('2026-10-12', { feeling: 'dur' }), session('2026-10-14', { feeling: 'facile' }), session('2026-10-03')]);
  assert.strictEqual(r.count, 2, 'la séance du 3 octobre est d\'une autre semaine');
  assert.strictEqual(r.minutes, 60);
  assert.strictEqual(r.totalReps, 80);
  assert.strictEqual(r.holdSeconds, 180);
  assert.strictEqual(r.feelings.dur, 1);
  assert.strictEqual(r.feelings.facile, 1);
  assert.strictEqual(r.top[0].name, 'Planche');
  assert.ok(r.top.every((e) => e.total > 0));
});

test('conseils selon la semaine', () => {
  const tip = (sessions, current) => {
    const { app, r } = recap(sessions);
    return app.run(`getWeekTip(${JSON.stringify(r)}, ${current})`);
  };
  assert.match(tip([], true), /Pas encore de séance/);
  assert.match(tip([], false), /Aucune séance/);
  assert.match(tip([session('2026-10-12')], true), /Il te reste 2 séances/);
  assert.match(tip([session('2026-10-12')], false), /manqué 2 séances/);
  assert.match(tip([session('2026-10-12', { feeling: 'dur' }), session('2026-10-13', { feeling: 'dur' }), session('2026-10-14', { feeling: 'dur' })], false), /dures/);
  assert.match(tip([session('2026-10-12', { feeling: 'facile' }), session('2026-10-13', { feeling: 'facile' }), session('2026-10-14', { feeling: 'facile' })], false), /faciles/);
  assert.match(tip([session('2026-10-12'), session('2026-10-13'), session('2026-10-14'), session('2026-10-15')], false), /dépassé/);
});

test('bilan : un exercice non réalisé (0) n\'est pas classé', () => {
  const { r } = recap([session('2026-10-12', { exercises: [{ id: 'pompes', name: 'Pompes', totalReps: 0 }, { id: 'squat', name: 'Squat', totalReps: 30 }] })]);
  assert.deepStrictEqual(r.top.map((e) => e.name), ['Squat']);
});
