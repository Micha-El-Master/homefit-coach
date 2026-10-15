const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Semaine du lundi 5 au dimanche 11 octobre 2026.
const D = (n) => `2026-10-${String(n).padStart(2, '0')}`;

function plan({ days, done = [], nowDay }) {
  const app = createApp();
  app.settings({ trainingDays: days });
  app.sessions(done.map(D));
  const result = app.run(`getWeekPlan(new Date(2026, 9, ${nowDay}, 12))`);
  const line = result.days.map((d) => (d.type === 'training' ? (d.rescue ? 'R' : 'T') : '-') + (d.done ? '✓' : d.missed ? '✗' : '')).join(' ');
  return { line, shortfall: result.shortfall };
}

test('plan normal : les jours choisis sont des jours d\'entraînement', () => {
  assert.deepStrictEqual(plan({ days: [1, 3, 5], done: [5], nowDay: 6 }), { line: 'T✓ - T - T - -', shortfall: 0 });
});

test('lundi raté : le mardi (repos) devient un jour de rattrapage', () => {
  assert.deepStrictEqual(plan({ days: [1, 3, 5], nowDay: 6 }), { line: 'T✗ R T - T - -', shortfall: 0 });
});

test('rattrapage effectué : plus de dette', () => {
  assert.deepStrictEqual(plan({ days: [1, 3, 5], done: [6], nowDay: 7 }), { line: 'T✗ R✓ T - T - -', shortfall: 0 });
});

test('rattrapage lui-même raté : le prochain jour de repos prend le relais', () => {
  assert.deepStrictEqual(plan({ days: [1, 3, 5], nowDay: 7 }), { line: 'T✗ R✗ T R T - -', shortfall: 0 });
});

test('le rattrapage tombe sur le premier jour de repos, pas sur un jour d\'entraînement', () => {
  assert.deepStrictEqual(plan({ days: [1, 2, 4, 5], done: [6], nowDay: 7 }), { line: 'T✗ T✓ R T T - -', shortfall: 0 });
});

test('plus de jour de repos libre : un manque est signalé', () => {
  assert.deepStrictEqual(plan({ days: [1, 2, 3, 4, 5, 6], nowDay: 11 }), { line: 'T✗ T✗ T✗ T✗ T✗ T✗ R', shortfall: 5 });
});

test('une séance faite un jour de repos compte comme une avance', () => {
  assert.deepStrictEqual(plan({ days: [1, 3], done: [6, 7, 8], nowDay: 11 }), { line: 'T✗ R✓ T✓ -✓ - - -', shortfall: 0 });
});

test('un jour de repos sans dette reste un jour de repos', () => {
  assert.deepStrictEqual(plan({ days: [1, 3, 5], done: [5], nowDay: 6 }).line.split(' ')[1], '-');
});

test('ancien réglage « objectif hebdomadaire » migré en jours', () => {
  const app = createApp();
  app.settings({ weeklyTarget: 3 });
  assert.deepStrictEqual(app.run('getTrainingDays()'), [1, 3, 5]);
  assert.strictEqual(app.run('getWeeklyTarget()'), 3);
});

test('l\'objectif est le nombre de jours choisis', () => {
  const app = createApp();
  app.settings({ trainingDays: [0, 2, 4, 6] });
  assert.strictEqual(app.run('getWeeklyTarget()'), 4);
  assert.strictEqual(app.run('getTotalProgramSessions()'), 48);
});

test('avant le début du programme : aucun jour manqué ni rattrapage', () => {
  const app = createApp();
  app.profile({ startDate: '2026-10-08' }); // jeudi
  app.settings({ trainingDays: [1, 2, 4, 5] });
  app.sessions([]);
  const result = app.run('getWeekPlan(new Date(2026, 9, 8, 12))');
  const line = result.days.map((d) => (d.beforeStart ? '·' : d.type === 'training' ? (d.rescue ? 'R' : 'T') : '-') + (d.missed ? '✗' : '')).join(' ');
  assert.strictEqual(line, '· · · T T - -');
  assert.strictEqual(result.shortfall, 0);
});
