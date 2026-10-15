const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Aujourd'hui : jeudi 15 octobre 2026.
function app() {
  const a = createApp();
  a.profile();
  return a;
}

test('défi pompes : objectif progressif, jour de repos tous les 7 jours', () => {
  const a = app();
  const t = (d) => a.run(`CHALLENGES.pompes30.target(${d})`);
  assert.strictEqual(t(1), 5);
  assert.ok(t(30) > t(15) && t(30) <= 40);
  assert.strictEqual(a.run('[7, 14, 21, 28].every((d) => isChallengeRestDay(CHALLENGES.pompes30, d))'), true);
  assert.strictEqual(a.run('isChallengeRestDay(CHALLENGES.pompes30, 8)'), false);
  assert.strictEqual(a.run('isChallengeRestDay(CHALLENGES.kegel21, 7)'), false);
});

test('défi manuel : statut de chaque jour (validé, manqué, repos, aujourd\'hui, à venir)', () => {
  const a = app();
  a.run(`startChallenge('pompes30')`);
  const data = a.run('getChallengeData()');
  data.active.pompes30.startDate = '2026-10-10'; // jour 6 aujourd'hui
  a.set('hfc_challenges', data);
  a.run(`logChallenge('pompes30', 20, '2026-10-10')`); // jour 1 (objectif 5) validé
  a.run(`logChallenge('pompes30', 2, '2026-10-11')`); // jour 2 (objectif 6) insuffisant
  const st = a.run(`getChallengeStatus('pompes30', getChallengeData().active.pompes30)`);
  const by = (n) => st.days[n - 1].status;
  assert.strictEqual(by(1), 'done');
  assert.strictEqual(by(2), 'missed', 'valeur sous l\'objectif');
  assert.strictEqual(by(3), 'missed');
  assert.strictEqual(by(6), 'today');
  assert.strictEqual(by(7), 'rest');
  assert.strictEqual(by(8), 'future');
  assert.strictEqual(st.dayNumber, 6);
});

test('défi Kegel : validation automatique depuis l\'historique Kegel', () => {
  const a = app();
  a.run(`startChallenge('kegel21')`);
  const data = a.run('getChallengeData()');
  data.active.kegel21.startDate = '2026-10-13';
  a.set('hfc_challenges', data);
  a.set('hfc_kegel_sessions', [{ date: '2026-10-13', duration: 140 }, { date: '2026-10-15', duration: 140 }]);
  const st = a.run(`getChallengeStatus('kegel21', getChallengeData().active.kegel21)`);
  assert.deepStrictEqual(st.days.slice(0, 3).map((d) => d.status), ['done', 'missed', 'done']);
});

test('défi eau : objectif basé sur le poids, validation depuis le suivi d\'eau', () => {
  const a = createApp();
  a.profile({ body: { weight: 80, height: 180, age: 30, sex: 'm', activity: 1.4 } });
  assert.strictEqual(a.run('getWaterGoalMl()'), 2800);
  assert.strictEqual(createApp().run('getWaterGoalMl()'), 2000);
  a.run(`startChallenge('eau14')`);
  const data = a.run('getChallengeData()');
  data.active.eau14.startDate = '2026-10-14';
  a.set('hfc_challenges', data);
  a.set('hfc_water', { '2026-10-14': 3000, '2026-10-15': 1000 });
  const st = a.run(`getChallengeStatus('eau14', getChallengeData().active.eau14)`);
  assert.deepStrictEqual(st.days.slice(0, 2).map((d) => d.status), ['done', 'today']);
});

test('fin de défi : relevé à partir de 80 % des jours d\'effort validés, sinon échoué', () => {
  const finish = (validatedCount) => {
    const a = app();
    a.run(`startChallenge('squats30')`);
    const data = a.run('getChallengeData()');
    data.active.squats30.startDate = '2026-09-01'; // 30 jours : terminé le 30 septembre
    let n = 0;
    for (let day = 1; day <= 30 && n < validatedCount; day++) {
      if (day % 7 === 0) continue; // jours de repos
      data.active.squats30.log[a.run(`challengeDayIso('2026-09-01', ${day})`)] = 999;
      n++;
    }
    a.set('hfc_challenges', data);
    assert.strictEqual(a.run('finalizeChallenges()'), true);
    return a.run('getChallengeData()');
  };
  const ok = finish(21); // 21 / 26 jours d'effort = 80,7 %
  assert.strictEqual(ok.history[0].required, 26);
  assert.strictEqual(ok.history[0].success, true);
  assert.deepStrictEqual(ok.active, {});
  assert.strictEqual(finish(20).history[0].success, false); // 76,9 %
});

test('un défi non terminé n\'est pas finalisé ; abandonner le supprime', () => {
  const a = app();
  a.run(`startChallenge('pompes30')`);
  assert.strictEqual(a.run('finalizeChallenges()'), false);
  assert.ok(a.run('Object.keys(getChallengeData().active).includes("pompes30")'));
  a.run(`abandonChallenge('pompes30')`);
  assert.deepStrictEqual(a.run('Object.keys(getChallengeData().active)'), []);
});

test('badges de défi : débloqués par les défis relevés', () => {
  const a = app();
  const unlocked = () => a.run(`getBadgeStates().filter((b) => b.unlocked && b.id.startsWith('challenge')).map((b) => b.id)`);
  assert.deepStrictEqual(unlocked(), []);
  a.set('hfc_challenges', { active: {}, history: [{ id: 'pompes30', success: true }, { id: 'kegel21', success: false }] });
  assert.deepStrictEqual(unlocked(), ['challenge-1']);
  a.set('hfc_challenges', { active: {}, history: [1, 2, 3].map((i) => ({ id: 'x' + i, success: true })) });
  assert.deepStrictEqual(unlocked(), ['challenge-1', 'challenge-3']);
});

test('les défis sont sauvegardés et restaurés avec le reste des données', () => {
  const a = app();
  a.run(`startChallenge('pompes30')`);
  const json = JSON.stringify(a.run('collectExportData()'));
  const b = createApp();
  b.run(`importData(${JSON.stringify(json)})`);
  assert.deepStrictEqual(b.run('Object.keys(getChallengeData().active)'), ['pompes30']);
});
