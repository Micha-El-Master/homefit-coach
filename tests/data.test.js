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
  for (const bad of [
    '{}',
    '{"app":"autre"}',
    '[]',
    '{"app":"HomeFit Coach"}',
    '{"app":"HomeFit Coach","profile":{"name":"x","startDate":"2026-01-01"},"sessions":"non"}',
    '{"app":"HomeFit Coach","schemaVersion":999,"profile":{"name":"x","startDate":"2026-01-01"}}',
    'pas du json',
  ]) {
    assert.throws(() => app.run(`importData(${JSON.stringify(bad)})`), undefined, bad);
  }
  assert.strictEqual(JSON.stringify(app.store), before);
});

test('import : JSON invalide et profil corrompu ne modifient rien', () => {
  const app = seeded();
  const before = JSON.stringify(app.store);
  assert.throws(() => app.run(`importData('{')`));
  assert.throws(() => app.run(`importData(${JSON.stringify(JSON.stringify({ app: 'HomeFit Coach', profile: { name: '', startDate: '2026-01-01' }, sessions: [] }))})`));
  assert.strictEqual(JSON.stringify(app.store), before);
});

test('import : historique et tableaux imbriqués invalides sont refusés', () => {
  const app = seeded();
  const before = JSON.stringify(app.store);
  const bads = [
    { app: 'HomeFit Coach', profile: { name: 'Alice', startDate: '2026-01-01' }, kegel: 'non' },
    { app: 'HomeFit Coach', profile: { name: 'Alice', startDate: '2026-01-01' }, sessions: [{ date: '2026-99-99' }] },
    { app: 'HomeFit Coach', profile: { name: 'Alice', startDate: '2026-01-01' }, sessions: [{ date: '2026-01-01', duration: -1 }] },
  ];
  bads.forEach((bad) => assert.throws(() => app.run(`importData(${JSON.stringify(JSON.stringify(bad))})`)));
  assert.strictEqual(JSON.stringify(app.store), before);
});

test('import : anciennes sauvegardes compatibles restent utilisables', () => {
  const app = createApp();
  const legacy = {
    app: 'HomeFit Coach',
    exportedAt: '2026-10-10T12:00:00.000Z',
    profile: { name: 'Legacy', goal: 'forme', level: 'debutant', startDate: '2026-10-10' },
    sessions: [{ date: '2026-10-11', title: 'Haut du corps', duration: 20, calories: 100 }],
  };
  app.run(`importData(${JSON.stringify(JSON.stringify(legacy))})`);
  assert.strictEqual(app.run('getProfile().name'), 'Legacy');
  assert.strictEqual(app.run('getSessionLog().length'), 1);
});

test('import : aperçu liste profil, séances et catégories disponibles', () => {
  const app = seeded();
  const data = app.run('collectExportData()');
  const preview = app.run(`buildImportPreview(${JSON.stringify(JSON.stringify(data))})`);
  assert.strictEqual(preview.name, 'Alice');
  assert.strictEqual(preview.sessions, 1);
  assert.deepStrictEqual(preview.otherCategories, ['1 séance Kegel', 'hydratation', 'liste de courses']);
});

test('import : création de sauvegarde préalable vérifiée puis remplacement', () => {
  const app = seeded();
  const beforeProfile = app.store.hfc_profile;
  const incoming = {
    app: 'HomeFit Coach',
    schemaVersion: 1,
    profile: { name: 'Bob', goal: 'muscle', level: 'intermediaire', startDate: '2026-10-15' },
    sessions: [],
  };
  app.run(`importData(${JSON.stringify(JSON.stringify(incoming))})`);
  assert.strictEqual(app.run('getProfile().name'), 'Bob');
  const backup = app.run('getLocalBackup()');
  assert.strictEqual(JSON.parse(app.store.hfc_profile).name, 'Bob');
  assert.strictEqual(backup.snapshot.profile.name, 'Alice');
  assert.notStrictEqual(app.store.hfc_profile, beforeProfile);
});

test('import : échec de sauvegarde préalable ne modifie rien', () => {
  const app = seeded();
  const before = JSON.stringify(app.store);
  app.store.__failWrites = true;
  const incoming = { app: 'HomeFit Coach', profile: { name: 'Bob', startDate: '2026-10-15' } };
  assert.throws(() => app.run(`importData(${JSON.stringify(JSON.stringify(incoming))})`));
  assert.strictEqual(app.store.hfc_profile, JSON.parse(before).hfc_profile);
  assert.strictEqual(app.store.hfc_sessions, JSON.parse(before).hfc_sessions);
});

test('restauration : copie locale peut être restaurée', () => {
  const app = seeded();
  const incoming = { app: 'HomeFit Coach', profile: { name: 'Bob', startDate: '2026-10-15' }, sessions: [] };
  app.run(`importData(${JSON.stringify(JSON.stringify(incoming))})`);
  assert.strictEqual(app.run('getProfile().name'), 'Bob');
  app.run('restoreLocalBackup()');
  assert.strictEqual(app.run('getProfile().name'), 'Alice');
  assert.strictEqual(app.run('getSessionLog().length'), 1);
});

test('stockage : JSON corrompu retourne les valeurs sûres', () => {
  const app = seeded();
  app.store.hfc_profile = '{';
  app.store.hfc_sessions = '{';
  app.store.hfc_settings = '{';
  assert.strictEqual(app.run('getProfile()'), null);
  assert.deepStrictEqual(app.run('getSessionLog()'), []);
  assert.strictEqual(app.run('getSettings().theme'), 'auto');
});

test('stockage : écriture en échec retourne false', () => {
  const app = seeded();
  app.store.__failWrites = true;
  assert.strictEqual(app.run(`saveProfile({ name: 'Erreur', startDate: '2026-10-15' })`), false);
});

test('import : valeurs numériques hors limites sont refusées', () => {
  const app = seeded();
  const before = JSON.stringify(app.store);
  const bad = {
    app: 'HomeFit Coach',
    profile: {
      name: 'Alice',
      startDate: '2026-10-15',
      body: { weight: 300, height: 180, age: 30, sex: 'f', activity: 1.55 },
    },
  };
  assert.throws(() => app.run(`importData(${JSON.stringify(JSON.stringify(bad))})`));
  assert.strictEqual(JSON.stringify(app.store), before);
});

test('réinitialisation : crée une copie locale vérifiée avant la suppression', () => {
  const app = seeded();
  app.run('resetProgression()');
  const backup = app.run('getLocalBackup()');
  assert.strictEqual(backup.source, 'reset');
  assert.strictEqual(backup.snapshot.profile.name, 'Alice');
  assert.strictEqual(app.run('getSessionLog().length'), 0);
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

test('réinitialisation de la progression : conserve le profil, les préférences et les données non liées au suivi', () => {
  const app = seeded();
  app.profile({
    name: 'Alice',
    startDate: '2026-09-01',
    streakStart: '2026-08-01',
    cycle: 3,
    mode: 'phase2',
  });
  app.settings({
    theme: 'dark',
    trainingDays: [1, 3, 5],
    fasts: [{ start: '2026-10-20', days: 3 }],
    lastBackupAt: '2026-10-01T12:00:00.000Z',
    backupSnoozeUntil: '2026-10-18T12:00:00.000Z',
  });
  app.set('hfc_recovery', [{ date: '2026-10-05' }]);
  app.set('hfc_challenges', { active: { pompes30: {} }, history: [] });
  app.set('hfc_inprogress', { workout: 'today' });
  app.store.autre_site = 'garde-moi';

  app.run('resetProgression()');

  const profile = JSON.parse(app.store.hfc_profile);
  assert.strictEqual(profile.name, 'Alice');
  assert.strictEqual(profile.startDate, '2026-10-15');
  assert.strictEqual(profile.streakStart, '2026-10-15');
  assert.strictEqual(profile.cycle, 1);
  assert.strictEqual(profile.mode, 'standard');
  assert.strictEqual(app.run('getProgramProgress().week'), 1);
  assert.strictEqual(app.run('getProgramProgress().sessionsCompleted'), 0);
  assert.deepStrictEqual(JSON.parse(app.store.hfc_settings).trainingDays, [1, 3, 5]);
  assert.strictEqual(JSON.parse(app.store.hfc_settings).theme, 'dark');
  assert.deepStrictEqual(JSON.parse(app.store.hfc_settings).fasts, []);
  assert.strictEqual(JSON.parse(app.store.hfc_settings).lastBackupAt, null);
  assert.strictEqual(JSON.parse(app.store.hfc_settings).backupSnoozeUntil, null);
  assert.deepStrictEqual(JSON.parse(app.store.hfc_shopping), ['3 œufs']);
  assert.strictEqual(app.store.autre_site, 'garde-moi');
  for (const key of ['hfc_sessions', 'hfc_kegel_sessions', 'hfc_adjust', 'hfc_water', 'hfc_recovery', 'hfc_challenges', 'hfc_inprogress']) {
    assert.strictEqual(app.store[key], undefined, `${key} doit être supprimée`);
  }
});
