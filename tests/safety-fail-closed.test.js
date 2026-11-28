// Sous-lot 0b-3 (clôture) : l'absence du moteur de sécurité ou une erreur d'évaluation n'autorise JAMAIS une activité physique.
// Deux pannes simulées : moteur absent (script non chargé) et moteur qui lève une erreur.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const J = JSON.stringify;
const NONE = { status: 'none', responded: true, limitations: [] };
const PANNES = {
  absent: 'globalThis.evaluateSafetyPolicy = undefined;',
  erreur: "globalThis.evaluateSafetyPolicy = () => { throw new Error('boom'); };",
};

function broken(panne, extra = {}) {
  const a = createApp({ now: NOW });
  a.profile({ startDate: '2026-08-17', safety: NONE });
  a.settings({ trainingDays: [1, 2, 4, 5], equipment: ['chaise', 'charges', 'elastique'], ...extra });
  a.run(PANNES[panne]);
  return a;
}
// Résultat d'une tentative : { threw } ou { value }.
const attempt = (a, code) => { try { return { value: a.run(code) }; } catch (e) { return { threw: e.message }; } };
const refused = (r) => r.threw !== undefined || r.value === false || r.value === null || r.value === undefined;

for (const panne of Object.keys(PANNES)) {
  test(`moteur ${panne} : aucune séance, récupération ou adaptation n'est générée`, () => {
    const a = broken(panne);
    for (const code of ['getTodayWorkout(getProfile()).exercises', 'getRecoveryWorkout(getProfile()).exercises',
      "applyCoachAdaptation([{ id: 'pompes', sets: 3, reps: 10 }], { type: 'harder' }, getProfile())"]) {
      const r = attempt(a, code);
      assert.ok(r.threw !== undefined || (Array.isArray(r.value) && r.value.length === 0), `${code} : ${J(r)}`);
    }
  });

  test(`moteur ${panne} : aucun défi (même l'hydratation) n'est démarré ni alimenté, rien n'est archivé`, () => {
    const a = broken(panne);
    for (const id of ['pompes30', 'kegel21', 'eau14']) assert.ok(refused(attempt(a, `startChallenge(${J(id)})`)), id);
    assert.strictEqual(a.store.hfc_challenges, undefined);
    a.set('hfc_challenges', { active: { gainage30: { startDate: '2026-09-01', log: {} }, eau14: { startDate: '2026-09-01', log: {} } }, history: [] });
    assert.ok(refused(attempt(a, "logChallenge('gainage30', 30)")));
    assert.ok(refused(attempt(a, "logChallenge('eau14', 500)")));
    const before = a.store.hfc_challenges;
    attempt(a, 'finalizeChallenges()');
    assert.strictEqual(a.store.hfc_challenges, before, 'défis terminés non archivés en échec sans moteur : le défi reste actif');
  });

  test(`moteur ${panne} : aucune hausse de charge ni nouveau programme`, () => {
    const a = broken(panne);
    assert.ok(a.run("(() => { try { return changeAdjustment('pompes', 1); } catch (e) { return 'throws'; } })()") !== 1);
    assert.strictEqual(a.store.hfc_adjust, undefined, 'aucune hausse mémorisée');
    assert.ok(refused(attempt(a, "startNextCycle('standard')")));
    assert.strictEqual(JSON.parse(a.store.hfc_profile).cycle, undefined, 'profil inchangé');
  });

  test(`moteur ${panne} : aucun agenda de séances, aucun rappel, aucun texte d'incitation`, () => {
    const a = broken(panne, { reminderEnabled: true, reminderTime: '08:00' });
    a.run('globalThis.__dl = []; globalThis.downloadBlob = (b, n) => __dl.push(n);');
    assert.ok(refused(attempt(a, 'downloadICS()')));
    assert.deepStrictEqual(a.run('__dl'), []);
    assert.strictEqual(a.run('isTrainingAuthorizedNow()'), false);
    assert.strictEqual(a.run('isTrainingSuspendedNow()'), false, 'neutralisation de série : sans moteur, rien n\'est supposé');
    assert.doesNotMatch(a.run("buildFastICS({ start: '2026-12-02', days: 3 })"), /Récupération/);
    assert.doesNotMatch(a.run("getFastNote(fastPhaseOn('2026-10-17')) || ''"), /séance à|dernière séance complète/);
    const week = { count: 3, target: 4, minutes: 60, feelings: { dur: 0, bien: 0, facile: 3 } };
    assert.match(a.run(`getWeekTip(${J(week)}, true)`), /suspendu par précaution/, 'semaine en cours : texte neutre, aucune incitation');
    assert.doesNotMatch(a.run(`getWeekTip(${J({ ...week, count: 4 })}, false)`), /tu peux monter en intensité/, 'jamais d\'invitation à monter sans moteur');
  });
}

test('moteur absent ou en erreur : le moteur lui-même refuse une donnée illisible (fail-closed)', () => {
  const a = createApp({ now: NOW });
  for (const profile of [null, undefined, 'x', 12, [], { safety: 'x' }, { safety: { limitations: 'knees' } }, { safety: { status: 'inconnu' } }]) {
    for (const action of ['start-training', 'start-recovery', 'resume', 'adjust-up', 'start-challenge', 'start-cycle', 'coach-adapt', 'swap', 'start-activity', 'inconnue', undefined, null]) {
      const p = a.run(`evaluateSafetyPolicy(${J(profile === undefined ? null : profile)}, ${J({ action, activity: 'kegel' })})`);
      if (['start-training', 'start-recovery', 'resume', 'adjust-up', 'start-challenge', 'start-cycle', 'coach-adapt', 'swap', 'start-activity'].includes(action) && (profile === null || typeof profile !== 'object' || Array.isArray(profile))) {
        assert.strictEqual(p.allowed, false, `${J(profile)} / ${action}`);
      }
      if (action === 'inconnue' || action === undefined || action === null) assert.strictEqual(p.allowed, false, `action inconnue : ${J(profile)}`);
    }
  }
});
