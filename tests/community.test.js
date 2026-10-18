const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

// Aujourd'hui : jeudi 15 octobre 2026.
const cfgOf = (app, raw) => app.run(`sanitizeCommunityConfig(${JSON.stringify(raw)})`);

test('configuration : valeurs par défaut quand le fichier est absent ou invalide', () => {
  const app = createApp();
  for (const raw of [null, 'texte', 42, []]) {
    const cfg = cfgOf(app, raw);
    assert.strictEqual(cfg.links.channel, '');
    assert.strictEqual(cfg.nextCohort, null);
    assert.strictEqual(cfg.announcement, null);
    assert.match(cfg.appUrl, /^https:\/\/.+\/$/);
  }
});

test('configuration : seuls les liens WhatsApp en https sont acceptés', () => {
  const app = createApp();
  const links = (l) => cfgOf(app, { links: l }).links;
  assert.deepStrictEqual(links({ channel: 'https://whatsapp.com/channel/abc', community: 'https://chat.whatsapp.com/xyz' }), {
    channel: 'https://whatsapp.com/channel/abc',
    community: 'https://chat.whatsapp.com/xyz',
  });
  assert.deepStrictEqual(links({ channel: 'javascript:alert(1)', community: 'http://chat.whatsapp.com/x' }), { channel: '', community: '' });
  assert.deepStrictEqual(links({ channel: 'https://evil.example/whatsapp.com', community: 'https://whatsapp.com.evil.example/x' }), { channel: '', community: '' });
});

test('configuration : cohorte, annonce et défi validés et bornés', () => {
  const app = createApp();
  const cfg = cfgOf(app, {
    nextCohort: { start: '2026-11-02', label: 'Cohorte 1', seats: 50 },
    announcement: { id: 'a1', title: 'T'.repeat(200), text: 'x'.repeat(1000), until: '2026-12-01', linkLabel: 'Voir', linkUrl: 'https://exemple.org/page' },
    weeklyChallenge: { from: '2026-11-02', title: 'Défi', text: 'Texte', challengeId: 'pompes30' },
  });
  assert.deepStrictEqual(cfg.nextCohort, { start: '2026-11-02', label: 'Cohorte 1', seats: 50 });
  assert.strictEqual(cfg.announcement.title.length, 80);
  assert.strictEqual(cfg.announcement.text.length, 400);
  assert.strictEqual(cfg.weeklyChallenge.challengeId, 'pompes30');

  assert.strictEqual(cfgOf(app, { nextCohort: { start: 'demain' } }).nextCohort, null);
  assert.strictEqual(cfgOf(app, { nextCohort: { start: '2026-02-31' } }).nextCohort, null, 'date inexistante');
  assert.strictEqual(cfgOf(app, { announcement: { title: 'sans id' } }).announcement, null);
  const bad = cfgOf(app, { announcement: { id: 'a', title: 'T', linkUrl: 'javascript:alert(1)', linkLabel: 'clic' } }).announcement;
  assert.strictEqual(bad.linkUrl, '', 'lien dangereux supprimé');
  assert.strictEqual(bad.linkLabel, '');
});

test('annonce : masquée si expirée ou fermée par l\'utilisateur', () => {
  const app = createApp();
  const cfg = cfgOf(app, { announcement: { id: 'a1', title: 'Salut', until: '2026-10-20' } });
  const vis = (dismissed, today) => app.run(`visibleAnnouncement(${JSON.stringify(cfg)}, ${JSON.stringify(dismissed)}, '${today}')`);
  assert.strictEqual(vis([], '2026-10-15').id, 'a1');
  assert.strictEqual(vis([], '2026-10-20').id, 'a1', 'visible le dernier jour');
  assert.strictEqual(vis([], '2026-10-21'), null);
  assert.strictEqual(vis(['a1'], '2026-10-15'), null);
});

test('défi de la semaine : visible à partir de sa date', () => {
  const app = createApp();
  const cfg = cfgOf(app, { weeklyChallenge: { from: '2026-10-19', title: 'Défi' } });
  const cur = (today) => app.run(`currentWeeklyChallenge(${JSON.stringify(cfg)}, '${today}')`);
  assert.strictEqual(cur('2026-10-18'), null);
  assert.strictEqual(cur('2026-10-19').title, 'Défi');
});

test('lien de cohorte : dates valides entre -60 jours et +1 an', () => {
  const app = createApp();
  const parse = (v) => app.run(`parseCohortParam(${JSON.stringify(v)}, '2026-10-15')`);
  assert.deepStrictEqual(parse('2026-11-02'), { date: '2026-11-02', future: true, daysUntil: 18 });
  assert.deepStrictEqual(parse('2026-10-15'), { date: '2026-10-15', future: false, daysUntil: 0 });
  assert.strictEqual(parse('2026-10-05').future, false, 'cohorte déjà commencée');
  for (const bad of [null, '', 'abc', '2026-13-01', '2026-02-31', '2026-11-31', '2026-06-01', '2028-01-01', '<script>']) assert.strictEqual(parse(bad), null, String(bad));
});

test('messages de partage : totaux seulement, lien de cohorte inclus', () => {
  const app = createApp();
  const cfg = cfgOf(app, {});
  const recap = { from: '2026-10-12', to: '2026-10-18', count: 3, target: 4, minutes: 95, totalReps: 320, holdSeconds: 90 };
  const withCohort = app.run(`buildRecapShareText(${JSON.stringify(recap)}, 2, ${JSON.stringify(cfg)}, { name: 'Léa', cohort: '2026-11-02', body: { weight: 70 } })`);
  assert.match(withCohort, /3\/4 séances/);
  assert.match(withCohort, /95 min/);
  assert.match(withCohort, /320 répétitions/);
  assert.match(withCohort, /Série : 2 semaines/);
  assert.match(withCohort, /Cohorte du 2 novembre/);
  assert.match(withCohort, /index\.html\?cohorte=2026-11-02/);
  assert.ok(!/Léa|70|poids/i.test(withCohort), 'ni prénom, ni poids dans le message');

  const solo = app.run(`buildRecapShareText(${JSON.stringify({ ...recap, count: 1, target: 1, totalReps: 0 })}, 0, ${JSON.stringify(cfg)}, { name: 'Léa' })`);
  assert.ok(!/Série|Cohorte|répétitions/.test(solo));
  assert.match(solo, /Essaie avec moi/);
});

test('invitation : cohorte du profil, sinon prochaine cohorte annoncée, sinon lien simple', () => {
  const app = createApp();
  const cfgNone = cfgOf(app, {});
  const cfgNext = cfgOf(app, { nextCohort: { start: '2026-11-09', label: 'C2' } });
  const invite = (cfg, profile) => app.run(`buildInviteText(${JSON.stringify(cfg)}, ${JSON.stringify(profile)})`);
  assert.match(invite(cfgNext, { cohort: '2026-11-02' }), /2026-11-02/);
  assert.match(invite(cfgNext, {}), /2026-11-09/);
  const plain = invite(cfgNone, {});
  assert.ok(!/cohorte/i.test(plain.split('\n')[1]));
  assert.match(plain, /github\.io\/homefit-coach\/$/);
});

test('lien WhatsApp : message encodé dans l\'URL', () => {
  const app = createApp();
  const url = app.run(`whatsappShareLink('Salut & bienvenue ! 100 % 💪\\nLigne 2')`);
  assert.ok(url.startsWith('https://wa.me/?text='));
  const decoded = decodeURIComponent(url.split('text=')[1]);
  assert.strictEqual(decoded, 'Salut & bienvenue ! 100 % 💪\nLigne 2');
  assert.ok(!url.includes(' ') && !url.includes('\n'));
});

test('cohorte à venir : le programme démarre à la date de la cohorte et la série d\'origine est conservée', () => {
  const app = createApp();
  app.profile({ startDate: '2026-09-01' });
  app.run(`joinCohort('2026-11-02')`);
  const p = app.run('getProfile()');
  assert.strictEqual(p.startDate, '2026-11-02');
  assert.strictEqual(p.cohort, '2026-11-02');
  assert.strictEqual(p.streakStart, '2026-09-01');
  assert.strictEqual(p.cycle, 2);
  const prog = app.run('getProgramProgress()');
  assert.strictEqual(prog.notStarted, true);
  assert.strictEqual(prog.startsInDays, 18);
  assert.strictEqual(prog.sessionsCompleted, 0);
  assert.strictEqual(prog.finished, false);
});

test('cohorte déjà commencée : l\'arrivant démarre aujourd\'hui, sans retard à rattraper', () => {
  const app = createApp();
  app.profile({ startDate: '2026-09-01' });
  app.run(`joinCohort('2026-10-05')`);
  const p = app.run('getProfile()');
  assert.strictEqual(p.startDate, '2026-10-15');
  assert.strictEqual(p.cohort, '2026-10-05');
  assert.strictEqual(app.run('getProgramProgress().notStarted'), false);
});

test('programme non démarré : la série ne casse pas et aucun jour n\'est « manqué »', () => {
  const app = createApp();
  app.profile({ startDate: '2026-11-02' });
  app.settings({ trainingDays: [1, 2, 4, 5] });
  app.sessions([]);
  assert.strictEqual(app.run('getStreak()'), 0);
  const plan = app.run('getWeekPlan()');
  assert.ok(plan.days.every((d) => !d.missed && !d.rescue));
  assert.strictEqual(plan.shortfall, 0);
});

test('défi synchronisé : départ futur accepté, retard limité à 3 jours', () => {
  const app = createApp();
  const start = (iso) => app.run(`resolveChallengeStart(${JSON.stringify(iso)}, '2026-10-15')`);
  assert.strictEqual(start('2026-11-02'), '2026-11-02', 'futur');
  assert.strictEqual(start('2026-10-15'), '2026-10-15');
  assert.strictEqual(start('2026-10-13'), '2026-10-13', '2 jours de retard accepté');
  assert.strictEqual(start('2026-10-12'), '2026-10-12', '3 jours de retard accepté');
  assert.strictEqual(start('2026-10-11'), '2026-10-15', 'plus de 3 jours : démarre aujourd\'hui');
  for (const bad of [null, '', 'abc', '15/10/2026', '2026-11-31']) assert.strictEqual(start(bad), '2026-10-15');
});

test('défi synchronisé : un défi qui n\'a pas commencé ne compte aucun jour manqué ni ne se finalise', () => {
  const app = createApp();
  app.profile();
  app.run(`startChallenge('pompes30', '2026-11-02')`);
  const entry = app.run('getChallengeData().active.pompes30');
  assert.strictEqual(entry.startDate, '2026-11-02');
  const st = app.run(`getChallengeStatus('pompes30', getChallengeData().active.pompes30)`);
  assert.ok(st.days.every((d) => d.status === 'future' || d.status === 'rest'));
  assert.strictEqual(st.finished, false);
  assert.strictEqual(st.dayNumber < 1, true);
  assert.strictEqual(app.run('finalizeChallenges()'), false);
});

test('date en français sans dépendance au fuseau', () => {
  const app = createApp();
  assert.strictEqual(app.run(`formatDateFr('2026-11-02')`), 'lundi 2 novembre');
  assert.strictEqual(app.run(`formatDateFr('2026-11-02', false)`), '2 novembre');
});
