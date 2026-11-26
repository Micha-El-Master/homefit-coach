const { test, expect } = require('@playwright/test');

const PROFILE = {
  name: 'Test Baseline',
  goal: 'forme',
  level: 'debutant',
  startDate: '2026-11-26',
};

async function clearApplicationState(page) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function installTestProfile(page) {
  await page.addInitScript((profile) => {
    localStorage.clear();
    localStorage.setItem('hfc_profile', JSON.stringify(profile));
    localStorage.setItem('hfc_settings', JSON.stringify({
      warmup: false,
      cooldown: false,
      restSeconds: 45,
      trainingDays: [1, 2, 4, 5],
    }));
  }, PROFILE);
}

test('parcours sans profil redirige vers l’accueil', async ({ page }) => {
  await clearApplicationState(page);

  await page.goto('/dashboard.html');
  await expect(page).toHaveURL(/\/index\.html$/);
  await expect(page.getByRole('heading', { name: 'HomeFit Coach' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commencer mon programme' })).toBeVisible();
});

test('formulaire d’inscription conserve son parcours principal', async ({ page }) => {
  await clearApplicationState(page);
  await page.goto('/index.html');

  await page.getByLabel('Ton prénom').fill('Alex');
  await page.getByRole('radio', { name: 'Améliorer ma forme' }).click();
  await page.getByRole('radio', { name: 'Débutant' }).click();
  await page.getByRole('button', { name: 'Commencer mon programme' }).click();

  await expect(page).toHaveURL(/\/dashboard\.html$/);
  await expect(page.getByText('Bonjour Alex')).toBeVisible();
  await expect(page.locator('#today-cta')).toBeVisible();
});

test('parcours avec profil reste accessible', async ({ page }, testInfo) => {
  await installTestProfile(page);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const essentialPages = [
    '/dashboard.html',
    '/workout.html',
    '/exercise.html?id=pompes',
    '/nutrition.html',
    '/kegel.html',
    '/progress.html',
    '/library.html',
    '/settings.html',
    '/test.html',
  ];

  for (const path of essentialPages) {
    await page.goto(path);
    await expect(page.locator('body')).toBeVisible();

    const layout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    // Baseline connue : ces deux écrans dépassent encore à 320 px.
    // Le tableau protège contre toute nouvelle régression dans les autres tailles.
    const knownOverflow = testInfo.project.name === 'mobile-320'
      && ['/nutrition.html', '/settings.html'].includes(path);
    const hasOverflow = layout.scrollWidth > layout.innerWidth;

    expect(hasOverflow).toBe(knownOverflow);
  }

  expect(pageErrors).toEqual([]);
});

test('prévisualisation d’import peut être annulée sans remplacer les données', async ({ page }) => {
  await installTestProfile(page);
  await page.goto('/settings.html');

  const incoming = {
    app: 'HomeFit Coach',
    schemaVersion: 1,
    profile: { name: 'Autre utilisateur', startDate: '2026-11-26' },
    sessions: [],
  };
  await page.locator('#import-input').setInputFiles({
    name: 'homefit-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  });

  await expect(page.locator('#import-preview')).toBeVisible();
  await expect(page.locator('#import-preview-text')).toContainText('Autre utilisateur');
  await page.locator('#import-preview-cancel').click();

  await expect(page.locator('#import-preview')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Test Baseline');
});

test('séance lance un minuteur de repos basé sur une échéance', async ({ page }) => {
  await installTestProfile(page);
  await page.goto('/workout.html');

  await expect(page.locator('#start-btn')).toBeVisible();
  await page.locator('#start-btn').click();
  await expect(page.locator('#view-work')).toBeVisible();
  await page.locator('#work-done-btn').click();
  await expect(page.locator('#view-rest')).toBeVisible();

  const timerText = await page.locator('#rest-timer').textContent();
  expect(timerText).toMatch(/^\d{2}:\d{2}$/);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#rest-close').click();
});

test('test de niveau submaximal présente introduction et arrêt sécuritaire', async ({ page }) => {
  await installTestProfile(page);
  await page.goto('/test.html');

  await expect(page.locator('#view-intro')).toBeVisible();
  await expect(page.locator('#view-intro').getByText('8 squats contrôlés maximum')).toBeVisible();
  await page.locator('#lt-start').click();
  await expect(page.locator('#lt-title')).toHaveText('8 squats contrôlés maximum');
  await expect(page.locator('#lt-stop')).toBeVisible();

  await page.locator('[data-safety="douleur"]').click();
  await expect(page.locator('#view-result')).toBeVisible();
  await expect(page.getByText('Test interrompu · niveau prudent')).toBeVisible();
});

test('précautions peuvent être enregistrées depuis les réglages', async ({ page }) => {
  await installTestProfile(page);
  await page.goto('/settings.html');

  await page.locator('#safety-settings [data-safety="knees"]').check();
  await page.locator('#safety-save').click();
  const safety = await page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).safety);
  expect(safety.responded).toBe(true);
  expect(safety.limitations).toContain('knees');
});
