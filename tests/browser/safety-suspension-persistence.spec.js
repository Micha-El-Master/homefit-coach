// Sous-lot 0b-3 (finalisation) — persistance de la mémoire de suspension : import par l'interface, restauration locale,
// données manipulées, série préservée sans séance fictive. Règle unique : union des jours, jamais de raccourcissement.
const { test, expect } = require('@playwright/test');

const FIXED = '2026-11-26T12:00:00'; // jeudi
const START = '2026-10-20';
const CHEST = { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false };
const NONE = { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' };
const sess = (date) => ({ date, title: 'Haut du corps', duration: 20, exercises: [] });
const REAL = ['2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07'].map(sess); // semaine du 2/11 réussie
const NEUTRAL_WEEK = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'];

async function seed(page, safety, { suspension, sessions, backup } = {}) {
  await page.addInitScript(({ safety, suspension, sessions, backup }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Appareil', goal: 'forme', level: 'debutant', startDate: '2026-10-20', ...(safety === undefined ? {} : { safety }) }));
    localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [1, 2, 4, 5], equipment: ['chaise'] }));
    if (suspension) localStorage.setItem('hfc_safety_suspension', JSON.stringify(suspension));
    if (sessions) localStorage.setItem('hfc_sessions', JSON.stringify(sessions));
    if (backup) localStorage.setItem('hfc_backup_snapshot', JSON.stringify({ app: 'HomeFit Coach', savedAt: '2026-11-20T10:00:00.000Z', source: 'import', snapshot: backup }));
  }, { safety, suspension, sessions, backup });
  await page.clock.setFixedTime(new Date(FIXED));
}
const backupOf = (o = {}) => ({ app: 'HomeFit Coach', schemaVersion: 1, profile: { name: 'Sauvegarde', startDate: START, ...(o.safety === undefined ? {} : { safety: o.safety }) },
  sessions: o.sessions || [], kegel: [], adjustments: {}, water: {}, shopping: [], recovery: [], ...(o.suspension === undefined ? {} : { safetySuspension: o.suspension }) });
const importJson = async (page, data) => {
  await page.locator('#import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
};
const memory = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_safety_suspension') || '[]'));

test('import par l\'interface : une sauvegarde suspendue arrive sur un appareil clair, suspension et série conservées', async ({ page }) => {
  await seed(page, NONE);
  await page.goto('/settings.html');
  await importJson(page, backupOf({ safety: CHEST, sessions: REAL, suspension: NEUTRAL_WEEK }));
  await expect(page.locator('#import-preview-text')).toContainText('Suspension de sécurité');
  await expect(page.locator('#import-preview-text')).toContainText('8 jours');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Sauvegarde');
  expect(await memory(page)).toEqual([...NEUTRAL_WEEK, '2026-11-26']);
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-title')).toHaveText('Entraînement suspendu par précaution');
  await expect(page.locator('#today-cta')).toBeHidden();
  expect(await page.evaluate(() => getStreak())).toBe(1); // semaines du 9/11 et du 16/11 neutres, semaine du 2/11 réussie, semaine en cours non cassée
  expect(await page.evaluate(() => getSessionLog().map((s) => s.date))).toEqual(REAL.map((s) => s.date)); // aucune séance fictive
  expect(await page.locator('#week-strip').innerText()).not.toMatch(/❌|🔁/);
});

test('import par l\'interface : un appareil suspendu garde ses jours quand on importe une sauvegarde claire (et reste bloqué)', async ({ page }) => {
  await seed(page, CHEST, { suspension: ['2026-11-02', '2026-11-03'] });
  await page.goto('/settings.html');
  await importJson(page, backupOf({ safety: NONE, suspension: [] }));
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Sauvegarde');
  expect(await memory(page)).toEqual(['2026-11-02', '2026-11-03', '2026-11-26']);
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-title')).toHaveText('Entraînement suspendu par précaution');
});

test('import par l\'interface : ancienne sauvegarde sans la donnée acceptée, mémoire de l\'appareil conservée', async ({ page }) => {
  await seed(page, CHEST, { suspension: ['2026-11-05'] });
  await page.goto('/settings.html');
  const old = backupOf({ safety: CHEST });
  await importJson(page, old);
  await expect(page.locator('#import-preview-text')).not.toContainText('Suspension de sécurité');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Sauvegarde');
  expect(await memory(page)).toEqual(['2026-11-05', '2026-11-26']);
});

for (const [label, bad] of [['objet avec motif', [{ date: '2026-11-01', reason: 'chest_symptoms' }]], ['date impossible', ['2026-02-31x']], ['trop lointaine', ['2999-01-01']], ['chaîne', 'oui']]) {
  test(`import par l'interface : mémoire manipulée (${label}) refusée sans rien modifier`, async ({ page }) => {
    await seed(page, CHEST, { suspension: ['2026-11-05'] });
    await page.goto('/settings.html');
    const before = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await importJson(page, backupOf({ safety: NONE, suspension: bad }));
    await expect(page.locator('#import-status')).toContainText('Mémoire de suspension invalide');
    await expect(page.locator('#import-preview')).toBeHidden();
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(before);
  });
}

test('restauration locale : la copie récupère ses jours sans effacer ceux de l\'appareil ; précautions protégées', async ({ page }) => {
  const backup = backupOf({ safety: NONE, sessions: REAL, suspension: ['2026-11-02'] });
  backup.profile = { ...backup.profile, name: 'Copie' };
  await seed(page, CHEST, { suspension: ['2026-11-12', '2026-11-13'], backup });
  await page.goto('/settings.html');
  await page.locator('#restore-backup-btn').click();
  await expect(page.locator('#restore-loss')).toBeVisible(); // la copie supprimerait la précaution thoracique : confirmation exigée
  await page.locator('#restore-keep').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Copie');
  expect(await memory(page)).toEqual(['2026-11-02', '2026-11-12', '2026-11-13', '2026-11-26']);
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-title')).toHaveText('Entraînement suspendu par précaution'); // précaution conservée
  expect(await page.evaluate(() => getSessionLog().length)).toBe(4);
  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#start-btn')).toBeDisabled();
});

test('restauration exacte confirmée puis levée : fonctionnement normal, jours historiques conservés', async ({ page }) => {
  const backup = backupOf({ safety: NONE });
  await seed(page, CHEST, { suspension: ['2026-11-10'], backup });
  await page.goto('/settings.html');
  await page.locator('#restore-backup-btn').click();
  await page.locator('#restore-confirm-loss').check();
  await page.locator('#restore-exact').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Sauvegarde');
  expect(await memory(page)).toEqual(['2026-11-10', '2026-11-26']); // l'ancien jour est conservé ; aujourd'hui avait été mémorisé (appareil bloqué avant la restauration)
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-cta')).toBeVisible();
  expect(await page.evaluate(() => getSessionLog().length)).toBe(0);
});
