const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

function seeded() {
  const app = createApp();
  app.profile({ name: 'Alice', goal: 'muscle' });
  app.settings({ trainingDays: [1, 3, 5], voice: true });
  app.sessions([{ date: '2026-10-05', title: 'Haut du corps', duration: 30, calories: 200, feeling: 'bien', exercises: [{ id: 'pompes', name: 'Pompes', totalReps: 40, sets: [10, 10, 10, 10] }] }]);
  app.set('hfc_kegel_sessions', [{ date: '2026-10-05', duration: 140 }]);
  app.set('hfc_adjust', { pompes: -2 });
  app.set('hfc_water', { '2026-10-05': 1500 });
  app.set('hfc_shopping', ['3 œufs']);
  return app;
}

test('export puis import restaure toutes les données', () => {
  const source = seeded();
  const json = JSON.stringify(source.run('collectExportData()'));
  const target = createApp();
  target.run(`importData(${JSON.stringify(json)})`);
  assert.deepStrictEqual(JSON.parse(target.store.hfc_profile), JSON.parse(source.store.hfc_profile));
  assert.deepStrictEqual(JSON.parse(target.store.hfc_sessions), JSON.parse(source.store.hfc_sessions));
  assert.deepStrictEqual(JSON.parse(target.store.hfc_adjust), { pompes: -2 });
  assert.deepStrictEqual(JSON.parse(target.store.hfc_shopping), ['3 œufs']);
  assert.deepStrictEqual(target.run('getTrainingDays()'), [1, 3, 5]);
});

test('import : un fichier invalide est refusé sans rien écraser', () => {
  const app = seeded();
  const before = JSON.stringify(app.store);
  for (const bad of ['{}', '{"app":"autre"}', '[]', '{"app":"HomeFit Coach"}', '{"app":"HomeFit Coach","profile":{"name":"x","startDate":"2026-01-01"},"sessions":"non"}', 'pas du json']) {
    assert.throws(() => app.run(`importData(${JSON.stringify(bad)})`), undefined, bad);
  }
  assert.strictEqual(JSON.stringify(app.store), before);
});

test('code de transfert : aller-retour compressé', async () => {
  const source = seeded();
  const code = await source.run('buildTransferCode()');
  assert.ok(code.startsWith('HFC1:'));
  const json = await createApp().run(`readTransferCode(${JSON.stringify(code)})`);
  assert.strictEqual(JSON.parse(json).profile.name, 'Alice');
});

test('code de transfert : tolère les retours à la ligne, refuse les codes invalides', async () => {
  const source = seeded();
  const code = await source.run('buildTransferCode()');
  const wrapped = code.slice(0, 20) + '\n  ' + code.slice(20);
  const json = await createApp().run(`readTransferCode(${JSON.stringify(wrapped)})`);
  assert.strictEqual(JSON.parse(json).app, 'HomeFit Coach');
  await assert.rejects(createApp().run(`readTransferCode('XXXX:abc')`));
  await assert.rejects(createApp().run(`readTransferCode('HFC1:%%%')`));
});

test('agenda : événement hebdomadaire sur les jours choisis', () => {
  const app = createApp({ now: new Date(2026, 9, 15, 7, 0, 0) }); // jeudi 7h, avant 8h
  app.settings({ trainingDays: [1, 4], reminderTime: '08:00' });
  const ics = app.run('buildICS()');
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=24\r\n/);
  assert.match(ics, /DTSTART:20261015T080000\r\n/, 'le jeudi 15 à 8h est la première occurrence');
  assert.match(ics, /DTEND:20261015T084500\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('agenda : si l\'heure du jour est passée, la première occurrence est la suivante', () => {
  const app = createApp({ now: new Date(2026, 9, 15, 9, 0, 0) });
  app.settings({ trainingDays: [1, 4], reminderTime: '08:00' });
  assert.match(app.run('buildICS()'), /DTSTART:20261019T080000\r\n/);
});

test('sauvegarde : rappel après 7 jours sans export, seulement si assez de données', () => {
  const app = createApp(); // 15 octobre 2026
  app.profile();
  app.settings({});
  app.sessions(['2026-10-01', '2026-10-02']);
  assert.strictEqual(app.run('shouldRemindBackup()'), false, 'moins de 3 séances : rien à perdre');
  app.sessions(['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.strictEqual(app.run('daysSinceBackup()'), null);
  assert.strictEqual(app.run('shouldRemindBackup()'), true, 'jamais sauvegardé');
  app.run('markBackup()');
  assert.strictEqual(app.run('daysSinceBackup()'), 0);
  assert.strictEqual(app.run('shouldRemindBackup()'), false);
  assert.strictEqual(app.run(`shouldRemindBackup(new Date(2026, 9, 22, 13))`), true, '7 jours plus tard');
  assert.strictEqual(app.run(`shouldRemindBackup(new Date(2026, 9, 21, 13))`), false, '6 jours plus tard');
});

test('sauvegarde : « plus tard » reporte le rappel de 3 jours', () => {
  const app = createApp();
  app.profile();
  app.settings({});
  app.sessions(['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.strictEqual(app.run('shouldRemindBackup()'), true);
  app.run('snoozeBackupReminder(3)');
  assert.strictEqual(app.run('shouldRemindBackup()'), false);
  assert.strictEqual(app.run(`shouldRemindBackup(new Date(Date.now() + 4 * 86400000))`), true);
});

test('effacement : supprime toutes les clés de l\'application et rien d\'autre', () => {
  const app = seeded();
  app.store.autre_site = 'garde-moi';
  app.run('eraseAllData()');
  assert.deepStrictEqual(Object.keys(app.store), ['autre_site']);
});
