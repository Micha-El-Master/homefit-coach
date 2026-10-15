const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Aujourd'hui : jeudi 15 octobre 2026. Semaines : 28/9-4/10, 5-11/10, 12-18/10 (en cours).
function streak(days, sessions, { startDate = '2026-09-01', target } = {}) {
  const app = createApp();
  app.profile({ startDate });
  app.settings({ trainingDays: days });
  app.sessions(sessions);
  return app.run('getStreak()');
}

const FOUR = [1, 2, 4, 5];

test('deux semaines complètes sur des jours irréguliers = série de 2', () => {
  const s = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10'];
  assert.strictEqual(streak(FOUR, s), 2);
});

test('la semaine en cours incomplète ne casse pas la série', () => {
  const s = ['2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-12'];
  assert.strictEqual(streak(FOUR, s), 2);
});

test('la semaine en cours complète s\'ajoute à la série', () => {
  const s = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
  assert.strictEqual(streak(FOUR, s), 2);
});

test('une semaine passée incomplète casse la série', () => {
  const s = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-12'];
  assert.strictEqual(streak(FOUR, s, { startDate: '2026-09-28' }), 1);
  assert.strictEqual(streak(FOUR, ['2026-09-29', '2026-10-06']), 0);
});

test('l\'objectif plus bas valide la semaine plus facilement', () => {
  assert.strictEqual(streak([1, 4], ['2026-10-06', '2026-10-09']), 1);
});

test('la semaine de départ, partielle, demande moins de séances', () => {
  // Départ le vendredi 9 octobre : il ne reste que 3 jours (ven-dim), donc 3 séances valident cette première semaine.
  const start = { startDate: '2026-10-09' };
  assert.strictEqual(streak(FOUR, ['2026-10-09', '2026-10-10', '2026-10-11'], start), 1);
  assert.strictEqual(streak(FOUR, ['2026-10-09', '2026-10-10'], start), 0, 'avec 2 séances sur 3 possibles, la semaine n\'est pas validée');
});

test('sans profil la série vaut 0', () => {
  const app = createApp();
  assert.strictEqual(app.run('getStreak()'), 0);
});
