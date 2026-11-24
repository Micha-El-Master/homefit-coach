const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Jeûne du mercredi 14 au vendredi 16 octobre 2026 (semaine du lundi 12).
const FAST = { start: '2026-10-14', days: 3 };
const phase = (app, iso) => app.run(`(() => { const p = fastPhaseOn('${iso}'); return p && { phase: p.phase, day: p.day, factor: p.factor }; })()`);

function withFast(extra = {}) {
  const app = createApp({ now: new Date(2026, 9, 14, 12, 0, 0) });
  app.profile({ startDate: '2026-09-01' });
  app.settings({ trainingDays: [1, 3, 5], fasts: [FAST], ...extra });
  return app;
}

test('phases : veille, jours de jeûne, reprise à 60 % puis 70 %, retour à la normale', () => {
  const app = withFast();
  assert.strictEqual(phase(app, '2026-10-12'), null);
  assert.deepStrictEqual(phase(app, '2026-10-13'), { phase: 'prep', day: 0, factor: 1 });
  assert.deepStrictEqual(phase(app, '2026-10-14'), { phase: 'fast', day: 1, factor: 0 });
  assert.deepStrictEqual(phase(app, '2026-10-16'), { phase: 'fast', day: 3, factor: 0 });
  assert.deepStrictEqual(phase(app, '2026-10-17'), { phase: 'refeed', day: 1, factor: 0.6 });
  assert.deepStrictEqual(phase(app, '2026-10-18'), { phase: 'refeed', day: 2, factor: 0.7 });
  assert.strictEqual(phase(app, '2026-10-19'), null);
});

test('plan de la semaine : les jours de jeûne ne sont ni séance ni retard', () => {
  const app = withFast();
  app.sessions([]);
  const plan = app.run('getWeekPlan(new Date(2026, 9, 18, 12))');
  const line = plan.days.map((d) => d.type + (d.missed ? '✗' : '')).join(' ');
  // lun (séance faite ? non, ratée) mar repos, mer/jeu/ven = jeûne, sam/dim repos : le rattrapage du lundi raté se fait mardi
  assert.deepStrictEqual(plan.days.slice(2, 5).map((d) => d.type), ['fast', 'fast', 'fast']);
  assert.ok(!plan.days.slice(2, 5).some((d) => d.missed), line);
});

test('objectif de la semaine : les séances prévues un jour de jeûne sont dispensées', () => {
  const app = withFast();
  assert.strictEqual(app.run("getWeekTarget('2026-10-12')"), 1); // lun reste ; mer et ven dispensés
  assert.strictEqual(app.run("getWeekTarget('2026-10-19')"), 3);
});

test('la série n\'est pas cassée par une semaine de jeûne', () => {
  const app = withFast();
  app.sessions(['2026-10-12']);
  assert.ok(app.run('getStreak()') >= 1);
});

test('reprise : le volume de la séance est réduit, le jeûne affiche un message', () => {
  const reps = (nowDay) => {
    const app = createApp({ now: new Date(2026, 9, nowDay, 12, 0, 0) });
    app.profile({ startDate: '2026-09-01', levelScore: 6, level: 'intermediaire' });
    app.settings({ trainingDays: [1, 3, 5], fasts: [FAST] });
    return app.run("getTodayWorkout(getProfile(), 'Jambes + Abdos').exercises[0].reps");
  };
  const normal = reps(20);
  assert.ok(reps(17) < reps(18) && reps(18) < normal);
  const app = withFast();
  assert.match(app.run('getTodayWorkout(getProfile()).fastNote'), /Jeûne, jour 1 sur 3/);
});

test('jeûnes : validation, ajout, retrait, dédoublonnage', () => {
  const app = createApp({ now: new Date(2026, 9, 1, 12, 0, 0) });
  app.settings({ fasts: [{ start: 'nimporte', days: 3 }, { start: '2026-10-14', days: 9 }, { start: '2026-10-14', days: 3 }, { start: '2026-10-14', days: 2 }] });
  assert.deepStrictEqual(app.run('getFasts()'), [{ start: '2026-10-14', days: 3 }]);
  app.run("addFast('2026-11-04', 3)");
  app.run("addFast('2026-11-04', 2)");
  assert.deepStrictEqual(app.run('getFasts()').map((f) => f.start + ':' + f.days), ['2026-10-14:3', '2026-11-04:2']);
  app.run("removeFast('2026-10-14')");
  assert.deepStrictEqual(app.run('getFasts()'), [{ start: '2026-11-04', days: 2 }]);
  assert.strictEqual(app.run("getUpcomingFast('2026-10-01').start"), '2026-11-04');
  assert.strictEqual(app.run("getUpcomingFast('2026-11-06')"), null);
});

test('communaute.json : les jeûnes annoncés sont validés (durée 3 par défaut)', () => {
  const app = createApp();
  const cfg = app.run("sanitizeCommunityConfig({ fasts: [{ start: '2026-12-02' }, { start: '2026-12-31', days: 3 }, { start: 'x' }, { start: '2027-01-06', days: 40 }] })");
  assert.deepStrictEqual(cfg.fasts, [{ start: '2026-12-02', days: 3 }, { start: '2026-12-31', days: 3 }]);
  assert.deepStrictEqual(app.run('sanitizeCommunityConfig(null).fasts'), []);
});

test('agenda du jeûne : événement sur toute la durée, fin exclusive', () => {
  const app = createApp();
  const ics = app.run("buildFastICS({ start: '2026-12-02', days: 3 })");
  assert.match(ics, /DTSTART;VALUE=DATE:20261202/);
  assert.match(ics, /DTEND;VALUE=DATE:20261205/);
});
