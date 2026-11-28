// Sous-lot 0b-3 (clôture) — parcours navigateur : moteur de sécurité absent (script bloqué) ou en erreur au moment du clic.
// Aucune activité physique ne démarre ; aucune porte d'entrée n'est proposée comme active.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' }); // le script bloqué ne doit pas être servi par un cache

const NONE = { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' };
const START = '2026-01-01';

async function seed(page) {
  await page.addInitScript((safety) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Panne', goal: 'forme', level: 'debutant', startDate: '2026-01-01', safety }));
    localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise', 'charges', 'elastique'] }));
  }, NONE);
}
const RECOVERY = '/workout.html?s=' + encodeURIComponent('Récupération');

const ENTRIES = [
  ['séance', '/workout.html', '#start-btn', '#view-work'],
  ['récupération', RECOVERY, '#start-btn', '#view-work'],
  ['Kegel', '/kegel.html', '#start-kegel-btn', '#view-session'],
  ['test de niveau', '/test.html', '#lt-start', '#view-test'],
];

// ───────────── Moteur absent ─────────────

for (const [label, url, button, view] of ENTRIES) {
  test(`moteur absent : ${label} — porte d'entrée fermée et rien ne démarre`, async ({ page }) => {
    await page.route('**/js/safety-policy.js', (r) => r.abort());
    await seed(page);
    await page.goto(url);
    expect(await page.evaluate(() => typeof evaluateSafetyPolicy)).toBe('undefined');
    await expect(page.locator(button)).toBeDisabled();
    await expect(page.locator(button)).toContainText('Indisponible');
    await page.locator(button).click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    await expect(page.locator(view)).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('hfc_sessions'))).toBeNull();
  });
}

test('moteur absent : accueil — aucun lien vers une séance, ni de récupération', async ({ page }) => {
  await page.route('**/js/safety-policy.js', (r) => r.abort());
  await seed(page);
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-cta')).toContainText('Indisponible');
  expect(await page.locator('#today-cta').getAttribute('href')).toBeNull();
  expect(await page.locator('#recovery-link').getAttribute('href')).toBeNull();
  await page.locator('#today-cta').click({ force: true, timeout: 2000 }).catch(() => {});
  expect(new URL(page.url()).pathname).toBe('/dashboard.html');
});

test('moteur absent : réglages — agenda de séances indisponible, défis sans bouton de démarrage', async ({ page }) => {
  await page.route('**/js/safety-policy.js', (r) => r.abort());
  await seed(page);
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.goto('/settings.html');
  await expect(page.locator('#ics-btn')).toBeDisabled();
  await page.locator('#ics-btn').click({ force: true, timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  expect(downloads).toEqual([]);
  await page.goto('/challenges.html');
  await expect(page.locator('[data-act="start"]')).toHaveCount(0);
});

test('moteur absent : accueil du jeûne et bilan sans incitation (textes neutres)', async ({ page }) => {
  await page.route('**/js/safety-policy.js', (r) => r.abort());
  await seed(page);
  await page.goto('/jeune.html');
  await expect(page.locator('#legend-training')).toBeHidden();
  await expect(page.locator('#fast-excused')).toBeHidden();
  await page.goto('/partager.html');
  expect(await page.evaluate(() => typeof evaluateSafetyPolicy)).toBe('undefined');
});

// ───────────── Moteur en erreur au moment du clic ─────────────

const BREAK = () => { window.evaluateSafetyPolicy = () => { throw new Error('panne simulée'); }; };

for (const [label, url, button, view] of ENTRIES) {
  test(`moteur en erreur au clic : ${label} — rien ne démarre`, async ({ page }) => {
    await seed(page);
    await page.goto(url);
    await expect(page.locator(button)).toBeEnabled();
    await page.evaluate(BREAK);
    await page.locator(button).click().catch(() => {});
    await page.waitForTimeout(400);
    await expect(page.locator(view)).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
  });
}

test('moteur en erreur au clic : défis — démarrage et enregistrement refusés', async ({ page }) => {
  await seed(page);
  await page.goto('/challenges.html');
  await page.evaluate(BREAK);
  await page.locator('[data-act="start"][data-id="eau14"]').click().catch(() => {});
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => localStorage.getItem('hfc_challenges'))).toBeNull();
  const result = await page.evaluate(() => { try { return startChallenge('pompes30'); } catch (e) { return 'erreur'; } });
  expect(result).not.toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('hfc_challenges'))).toBeNull();
});
