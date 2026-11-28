// Sous-lot 0b-1 — questionnaire de sécurité à quatre états (inscription et réglages), import avec fusion prudente,
// restauration de la copie locale, affichage mobile et hors ligne. Aucune décision de politique n'est testée ici.
const { test, expect } = require('@playwright/test');

const D = new Date(Date.now() - 86400000);
const START_DATE = `${D.getFullYear()}-${String(D.getMonth() + 1).padStart(2, '0')}-${String(D.getDate()).padStart(2, '0')}`;
const PROFILE = { name: 'Test Questionnaire', goal: 'forme', level: 'debutant', startDate: START_DATE };

// Prépare le stockage UNE SEULE FOIS par onglet (un rechargement ne doit pas effacer l'état de la page testée).
async function seed(page, safety, backup) {
  await page.addInitScript(({ profile, safety, backup }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('hfc_profile', JSON.stringify({ ...profile, ...(safety === undefined ? {} : { safety }) }));
    localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [1, 2, 4, 5] }));
    if (backup) {
      // Copie de sécurité locale : même forme qu'un export, avec ses propres précautions.
      localStorage.setItem('hfc_backup_snapshot', JSON.stringify({
        app: 'HomeFit Coach', savedAt: '2026-10-01T10:00:00.000Z', source: 'import',
        snapshot: { app: 'HomeFit Coach', schemaVersion: 1, profile: { ...profile, name: 'Copie ancienne', ...(backup.safety === undefined ? {} : { safety: backup.safety }) },
          sessions: [], kegel: [], adjustments: {}, water: {}, shopping: [], recovery: [] },
      }));
    }
  }, { profile: PROFILE, safety, backup: backup || null });
}

const storedSafety = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).safety);
const checked = (page, scope, selector) => page.locator(`${scope} ${selector}`).isChecked();

async function openOnboardingQuestionnaire(page) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('summary', { hasText: 'Précautions physiques' }).click();
  await expect(page.locator('#onboarding-safety')).toBeVisible();
}

async function finishOnboarding(page) {
  await page.getByLabel('Ton prénom').fill('Alex');
  await page.getByRole('radio', { name: 'Améliorer ma forme' }).click();
  await page.getByRole('radio', { name: 'Débutant' }).click();
  await page.getByRole('button', { name: 'Commencer mon programme' }).click();
  await page.waitForURL(/dashboard\.html|test\.html/);
}

// ───────────── Inscription ─────────────

test('inscription : « Aucune de ces situations » est exclusive ; le refus de répondre coexiste avec des situations', async ({ page }) => {
  await openOnboardingQuestionnaire(page);
  const S = '#onboarding-safety';
  await expect(page.getByText('Aucune de ces situations ne me concerne.')).toBeVisible();

  await page.locator(`${S} [data-safety="knees"]`).check();
  await page.locator(`${S} [data-safety="chest_symptoms"]`).check();
  await page.locator(`${S} [data-safety-none]`).check(); // « aucune » contredit tout le reste
  expect(await checked(page, S, '[data-safety="knees"]')).toBe(false);
  expect(await checked(page, S, '[data-safety="chest_symptoms"]')).toBe(false);
  expect(await checked(page, S, '[data-safety-none]')).toBe(true);

  await page.locator(`${S} [data-safety="back"]`).check(); // cocher une situation décoche « aucune »
  expect(await checked(page, S, '[data-safety-none]')).toBe(false);
  expect(await checked(page, S, '[data-safety="back"]')).toBe(true);

  // Le refus de répondre est une information indépendante : il coexiste avec les situations (aucune n'est effacée).
  await page.locator(`${S} [data-safety-prefer]`).check();
  expect(await checked(page, S, '[data-safety="back"]')).toBe(true);
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(true);
  await page.locator(`${S} [data-safety-none]`).check(); // « aucune » efface situations ET refus
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(false);
  expect(await checked(page, S, '[data-safety="back"]')).toBe(false);

  // Le choix reste modifiable avant l'enregistrement.
  await page.locator(`${S} [data-safety-none]`).uncheck();
  await page.locator(`${S} [data-safety="shoulders"]`).check();
  expect(await checked(page, S, '[data-safety="shoulders"]')).toBe(true);
});

test('inscription : situations + refus de répondre sont enregistrés ensemble', async ({ page }) => {
  await openOnboardingQuestionnaire(page);
  await page.locator('#onboarding-safety [data-safety="knees"]').check();
  await page.locator('#onboarding-safety [data-safety-prefer]').check();
  await finishOnboarding(page);
  const safety = await storedSafety(page);
  expect(safety.status).toBe('declared');
  expect(safety.limitations).toEqual(['knees']);
  expect(safety.declined).toBe(true);
  expect(safety.preferNot).toBe(false);
});

test('inscription : chaque réponse donne son état, sans rien inventer quand le questionnaire reste vide', async ({ page }) => {
  const scenarios = [
    { name: 'vide', act: async () => {}, expected: undefined },
    { name: 'aucune', act: async () => page.locator('#onboarding-safety [data-safety-none]').check(), expected: 'none' },
    { name: 'refus', act: async () => page.locator('#onboarding-safety [data-safety-prefer]').check(), expected: 'declined' },
    { name: 'situations', act: async () => { await page.locator('#onboarding-safety [data-safety="knees"]').check(); await page.locator('#onboarding-safety [data-safety="professional_advice"]').check(); }, expected: 'declared' },
  ];
  for (const sc of scenarios) {
    await openOnboardingQuestionnaire(page);
    await sc.act();
    await finishOnboarding(page);
    const safety = await storedSafety(page);
    if (sc.expected === undefined) {
      expect(safety, sc.name).toBeUndefined(); // « jamais rempli » : aucun enregistrement (et surtout pas « none »)
    } else {
      expect(safety.status, sc.name).toBe(sc.expected);
      expect(safety.responded, sc.name).toBe(true);
      expect(safety.answeredAt, sc.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    if (sc.expected === 'declared') expect(safety.limitations).toEqual(['knees', 'professional_advice']);
    if (sc.expected === 'declined') expect(safety.preferNot).toBe(true);
  }
});

// ───────────── Réglages ─────────────

test('réglages : les quatre états s\'enregistrent, se relisent après rechargement et s\'excluent', async ({ page }) => {
  await seed(page, undefined);
  await page.goto('/settings.html');
  const S = '#safety-settings';
  const line = page.locator('#safety-status-line');
  await expect(line).toContainText('questionnaire non renseigné');

  // aucune situation
  await page.locator(`${S} [data-safety-none]`).check();
  await page.locator('#safety-save').click();
  expect((await storedSafety(page)).status).toBe('none');
  await expect(line).toContainText('aucune situation déclarée');
  await page.reload();
  expect(await checked(page, S, '[data-safety-none]')).toBe(true);
  await expect(line).toContainText('aucune situation déclarée');

  // cocher des situations décoche « aucune »
  await page.locator(`${S} [data-safety="knees"]`).check();
  expect(await checked(page, S, '[data-safety-none]')).toBe(false);
  await page.locator(`${S} [data-safety="chest_symptoms"]`).check();
  await page.locator('#safety-save').click();
  let safety = await storedSafety(page);
  expect(safety.status).toBe('declared');
  expect(safety.limitations).toEqual(['knees', 'chest_symptoms']);
  expect(safety.chestContext).toBe('unspecified');
  await page.reload();
  expect(await checked(page, S, '[data-safety="knees"]')).toBe(true);
  expect(await checked(page, S, '[data-safety="chest_symptoms"]')).toBe(true);
  await expect(line).toContainText('2 situations déclarées');

  // « aucune » efface les situations cochées avant l'enregistrement (choix modifiable)
  await page.locator(`${S} [data-safety-none]`).check();
  expect(await checked(page, S, '[data-safety="knees"]')).toBe(false);
  await page.locator(`${S} [data-safety-none]`).uncheck();
  await page.locator(`${S} [data-safety-prefer]`).check();
  await page.locator('#safety-save').click();
  safety = await storedSafety(page);
  expect(safety.status).toBe('declined');
  expect(safety.limitations).toEqual([]);
  await page.reload();
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(true);
  await expect(line).toContainText('ne pas répondre');

  // tout décocher : retour à « non renseigné » (aucun enregistrement)
  await page.locator(`${S} [data-safety-prefer]`).uncheck();
  await page.locator('#safety-save').click();
  expect(await storedSafety(page)).toBeUndefined();
  await expect(line).toContainText('questionnaire non renseigné');
});

test('réglages : un ancien profil (sans status) est affiché et migré sans perdre ses situations', async ({ page }) => {
  await seed(page, { responded: true, preferNot: false, limitations: ['back', 'professional_advice'], returnAfterPause: false, professionalAdvice: true });
  await page.goto('/settings.html');
  const S = '#safety-settings';
  expect(await checked(page, S, '[data-safety="back"]')).toBe(true);
  expect(await checked(page, S, '[data-safety="professional_advice"]')).toBe(true);
  expect(await checked(page, S, '[data-safety-none]')).toBe(false);
  await expect(page.locator('#safety-status-line')).toContainText('2 situations déclarées');
  // Sans modification de l'utilisateur, rien n'est réécrit.
  expect((await storedSafety(page)).status).toBeUndefined();
  await page.locator('#safety-save').click();
  expect((await storedSafety(page)).status).toBe('declared');
});

// ───────────── Import, fusion prudente, restauration ─────────────

async function importFile(page, safety, name = 'Autre utilisateur') {
  const incoming = { app: 'HomeFit Coach', schemaVersion: 1, profile: { name, startDate: START_DATE, ...(safety === undefined ? {} : { safety }) }, sessions: [] };
  await page.locator('#import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await expect(page.locator('#import-preview')).toBeVisible();
}

test('import : une sauvegarde sans précautions conserve les précautions actuelles (aperçu, confirmation, restauration)', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['knees', 'chest_symptoms'] });
  await page.goto('/settings.html');
  await importFile(page, undefined);
  const preview = page.locator('#import-preview-text');
  await expect(preview).toContainText('Autre utilisateur');
  await expect(preview).toContainText('ne contient aucune information sur les précautions');
  await expect(preview).toContainText('Genoux ou jambes');
  await expect(preview).toContainText('Symptômes thoraciques');
  // Rien n'est modifié avant la confirmation.
  expect((await storedSafety(page)).limitations).toEqual(['knees', 'chest_symptoms']);

  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Autre utilisateur');
  await page.waitForLoadState('load');
  const safety = await storedSafety(page);
  expect(safety.status).toBe('declared');
  expect(safety.limitations).toEqual(['knees', 'chest_symptoms']);

  // La copie de sécurité locale existe et la restauration (sans perte de précaution) rétablit l'état précédent.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hfc_backup_snapshot')).snapshot.profile.name)).toBe('Test Questionnaire');
  await page.locator('#restore-backup-btn').click();
  await expect(page.locator('#restore-preview')).toBeVisible();
  await expect(page.locator('#restore-loss')).toBeHidden();
  await page.locator('#restore-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Test Questionnaire');
  expect((await storedSafety(page)).limitations).toEqual(['knees', 'chest_symptoms']);
});

test('import : une sauvegarde sans précautions n\'est jamais lue comme « aucune situation »', async ({ page }) => {
  await seed(page, undefined);
  await page.goto('/settings.html');
  await importFile(page, undefined);
  await expect(page.locator('#import-preview-text')).toContainText('le questionnaire reste non renseigné');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Autre utilisateur');
  expect(await storedSafety(page)).toBeUndefined();
});

test('import : des restrictions supplémentaires sont ajoutées sans en supprimer', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['knees'] });
  await page.goto('/settings.html');
  await importFile(page, { responded: true, limitations: ['back', 'chest_symptoms'] });
  const preview = page.locator('#import-preview-text');
  await expect(preview).toContainText('Précautions ajoutées depuis la sauvegarde');
  await expect(preview).toContainText('Bas du dos');
  await expect(preview).toContainText('Précautions actuelles conservées');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(async () => (await storedSafety(page)).limitations.length).toBe(3);
  expect((await storedSafety(page)).limitations).toEqual(['knees', 'back', 'chest_symptoms']);
});

test('import : une sauvegarde « aucune situation » ne supprime pas les situations de l\'appareil', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['shoulders', 'professional_advice'] });
  await page.goto('/settings.html');
  await importFile(page, { status: 'none', responded: true, limitations: [] });
  await expect(page.locator('#import-preview-text')).toContainText('Précautions actuelles conservées');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Autre utilisateur');
  const safety = await storedSafety(page);
  expect(safety.status).toBe('declared');
  expect(safety.limitations).toEqual(['shoulders', 'professional_advice']);
});

test('import : l\'annulation laisse précautions et données intactes', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['balance'] });
  await page.goto('/settings.html');
  const before = await page.evaluate(() => localStorage.getItem('hfc_profile'));
  await importFile(page, { status: 'none', responded: true, limitations: [] });
  await page.locator('#import-preview-cancel').click();
  await expect(page.locator('#import-preview')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('hfc_profile'))).toBe(before);
});

// ───────────── Affichage mobile et hors ligne ─────────────

test('mobile : le questionnaire reste lisible et ne déborde pas (inscription et réglages)', async ({ page }) => {
  // On vérifie le questionnaire lui-même : la page d'inscription a déjà un bouton qui dépasse de 10 px à 320 px
  // (constaté sur le commit de référence, hors périmètre de ce sous-lot).
  const viewport = page.viewportSize();
  const insideViewport = (selector) => page.evaluate(([sel, width]) => {
    const rows = [...document.querySelectorAll(`${sel} label`)];
    return rows.length > 0 && rows.every((row) => { const r = row.getBoundingClientRect(); return r.left >= 0 && r.right <= width + 1; });
  }, [selector, viewport.width]);

  await openOnboardingQuestionnaire(page);
  expect(await insideViewport('#onboarding-safety')).toBe(true);
  const none = page.locator('#onboarding-safety [data-safety-none]');
  await none.scrollIntoViewIfNeeded();
  const box = await none.locator('xpath=ancestor::label').boundingBox();
  // Au moins aussi grande que les options existantes (mêmes cibles tactiles qu'avant, sans les réduire).
  const existing = await page.locator('#onboarding-safety [data-safety="knees"]').locator('xpath=ancestor::label').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(existing.height - 1);
  await expect(page.getByText('Aucune de ces situations ne me concerne.')).toBeVisible();

  await page.evaluate((profile) => localStorage.setItem('hfc_profile', JSON.stringify(profile)), PROFILE);
  await page.goto('/settings.html');
  await page.locator('#safety-settings [data-safety-none]').scrollIntoViewIfNeeded();
  expect(await insideViewport('#safety-settings')).toBe(true);
  await expect(page.locator('#safety-status-line')).toBeVisible();
  // (La page des réglages déborde déjà de 28 px à 320 px à cause d'un autre bouton : constaté sur le commit de référence.)
  const statusLine = await page.locator('#safety-status-line').boundingBox();
  expect(statusLine.x + statusLine.width).toBeLessThanOrEqual(viewport.width + 1);
});

test('hors ligne : le questionnaire des réglages fonctionne sans réseau', async ({ page, context }) => {
  await seed(page, undefined);
  await page.goto('/settings.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#safety-settings [data-safety-none]').check();
  await page.locator('#safety-save').click();
  expect((await storedSafety(page)).status).toBe('none');
  await page.reload();
  expect(await checked(page, '#safety-settings', '[data-safety-none]')).toBe(true);
  await context.setOffline(false);
});

// ───────────── Facette « refus de répondre » : coexistence avec des situations ─────────────

test('réglages : situations + refus de répondre s\'affichent ensemble et survivent à l\'enregistrement', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['knees'], declined: true, acknowledgedAt: '2026-10-05' });
  await page.goto('/settings.html');
  const S = '#safety-settings';
  expect(await checked(page, S, '[data-safety="knees"]')).toBe(true);
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(true);
  expect(await checked(page, S, '[data-safety-none]')).toBe(false);
  await expect(page.locator('#safety-status-line')).toContainText('1 situation déclarée');
  await expect(page.locator('#safety-status-line')).toContainText('ne pas répondre');

  // Enregistrer sans rien changer ne supprime ni la situation ni le refus.
  await page.locator('#safety-save').click();
  let safety = await storedSafety(page);
  expect(safety.limitations).toEqual(['knees']);
  expect(safety.declined).toBe(true);
  expect(safety.acknowledgedAt).toBe('2026-10-05');

  // Ajouter une situation ne décoche pas le refus ; seul un décochage explicite le retire.
  await page.locator(`${S} [data-safety="back"]`).check();
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(true);
  await page.locator(`${S} [data-safety-prefer]`).uncheck();
  await page.locator('#safety-save').click();
  safety = await storedSafety(page);
  expect(safety.limitations).toEqual(['knees', 'back']);
  expect(safety.declined).toBe(false);
  await page.reload();
  expect(await checked(page, S, '[data-safety-prefer]')).toBe(false);
});

test('import : genoux déclarés sur l\'appareil + sauvegarde « préfère ne pas répondre » = les deux sont conservés', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['knees'] });
  await page.goto('/settings.html');
  await importFile(page, { status: 'declined', responded: true, preferNot: true, limitations: [] });
  const preview = page.locator('#import-preview-text');
  await expect(preview).toContainText('Genoux ou jambes');
  await expect(preview).toContainText('refus de répondre conservé');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Autre utilisateur');
  const safety = await storedSafety(page);
  expect(safety.status).toBe('declared');
  expect(safety.limitations).toEqual(['knees']);
  expect(safety.declined).toBe(true);
  await page.reload();
  await expect(page.locator('#safety-status-line')).toContainText('ne pas répondre');
});

test('import : refus sur l\'appareil + sauvegarde avec situations = le refus reste identifiable', async ({ page }) => {
  await seed(page, { status: 'declined', responded: true, preferNot: true, limitations: [], acknowledgedAt: '2026-10-05' });
  await page.goto('/settings.html');
  await importFile(page, { status: 'declared', responded: true, limitations: ['back'] });
  await expect(page.locator('#import-preview-text')).toContainText('refus de répondre conservé');
  await expect(page.locator('#import-preview-text')).toContainText('Ton choix de ne pas répondre');
  await page.locator('#import-preview-confirm').click();
  await expect.poll(async () => (await storedSafety(page)).limitations.length).toBe(1);
  const safety = await storedSafety(page);
  expect(safety.limitations).toEqual(['back']);
  expect(safety.declined).toBe(true);
  expect(safety.acknowledgedAt).toBe('2026-10-05');
});

// ───────────── Restauration de la copie locale : protection des précautions ─────────────

const CURRENT = { status: 'declared', responded: true, limitations: ['knees', 'chest_symptoms'], declined: true };
const OLD_COPY = { safety: { status: 'declared', responded: true, limitations: ['knees'] } };

async function openRestore(page) {
  await page.goto('/settings.html');
  await page.locator('#restore-backup-btn').click();
  await expect(page.locator('#restore-preview')).toBeVisible();
}

test('restauration : une copie plus ancienne affiche les précautions qui seraient supprimées, sans rien écrire', async ({ page }) => {
  await seed(page, CURRENT, OLD_COPY);
  await openRestore(page);
  await expect(page.locator('#restore-preview-text')).toContainText('Copie ancienne');
  const loss = page.locator('#restore-loss-text');
  await expect(loss).toBeVisible();
  await expect(loss).toContainText('Symptômes thoraciques');
  await expect(loss).toContainText('ne pas répondre');
  await expect(page.locator('#restore-confirm')).toBeHidden();
  // La suppression exige une confirmation explicite : le bouton reste désactivé tant que la case n'est pas cochée.
  await expect(page.locator('#restore-exact')).toBeDisabled();
  await expect(page.locator('#restore-keep')).toBeEnabled();
  // Rien n'a été modifié.
  const safety = await storedSafety(page);
  expect(safety.limitations).toEqual(['knees', 'chest_symptoms']);
  expect(safety.declined).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Test Questionnaire');
});

test('restauration : annuler laisse précautions et données intactes', async ({ page }) => {
  await seed(page, CURRENT, OLD_COPY);
  const before = await (async () => { await page.goto('/settings.html'); return page.evaluate(() => [localStorage.getItem('hfc_profile'), localStorage.getItem('hfc_backup_snapshot')]); })();
  await page.locator('#restore-backup-btn').click();
  await page.locator('#restore-cancel').click();
  await expect(page.locator('#restore-preview')).toBeHidden();
  expect(await page.evaluate(() => [localStorage.getItem('hfc_profile'), localStorage.getItem('hfc_backup_snapshot')])).toEqual(before);
});

test('restauration : « conserver mes précautions actuelles » restaure le reste sans rien supprimer', async ({ page }) => {
  await seed(page, CURRENT, OLD_COPY);
  await openRestore(page);
  await page.locator('#restore-keep').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Copie ancienne');
  const safety = await storedSafety(page);
  expect(safety.limitations).toEqual(['knees', 'chest_symptoms']);
  expect(safety.declined).toBe(true);
});

test('restauration exacte : confirmation explicite obligatoire, puis annulation possible', async ({ page }) => {
  await seed(page, CURRENT, OLD_COPY);
  await openRestore(page);
  await page.locator('#restore-confirm-loss').check();
  await expect(page.locator('#restore-exact')).toBeEnabled();
  await page.locator('#restore-confirm-loss').uncheck();
  await expect(page.locator('#restore-exact')).toBeDisabled();
  await page.locator('#restore-confirm-loss').check();
  await page.locator('#restore-exact').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Copie ancienne');
  await page.waitForLoadState('load');
  // (La restauration exacte réécrit l'enregistrement de la copie tel quel : on vérifie l'état lu par l'application.)
  let safety = await page.evaluate(() => deriveSafetyState(getProfile()));
  expect(safety.limitations).toEqual(['knees']);
  expect(safety.declined).toBe(false);

  // L'état précédent est conservé dans la copie locale : relancer la restauration l'annule (aucune précaution n'est alors supprimée).
  await page.locator('#restore-backup-btn').click();
  await expect(page.locator('#restore-preview')).toBeVisible();
  await expect(page.locator('#restore-loss')).toBeHidden();
  await page.locator('#restore-confirm').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Test Questionnaire');
  safety = await page.evaluate(() => deriveSafetyState(getProfile()));
  expect(safety.limitations).toEqual(['knees', 'chest_symptoms']);
  expect(safety.declined).toBe(true);
});

test('restauration : une copie ancienne sans précautions n\'est jamais lue comme « aucune situation »', async ({ page }) => {
  await seed(page, { status: 'declared', responded: true, limitations: ['back'] }, { safety: undefined });
  await openRestore(page);
  await expect(page.locator('#restore-preview-text')).toContainText('questionnaire non renseigné');
  await expect(page.locator('#restore-loss-text')).toContainText('Bas du dos');
  await page.locator('#restore-keep').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Copie ancienne');
  expect((await storedSafety(page)).limitations).toEqual(['back']);
});

test('restauration : mobile et hors ligne — la fiche reste lisible et fonctionne sans réseau', async ({ page, context }) => {
  await seed(page, CURRENT, OLD_COPY);
  await page.goto('/settings.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#restore-backup-btn').click();
  await expect(page.locator('#restore-preview')).toBeVisible();
  const viewport = page.viewportSize();
  for (const sel of ['#restore-preview-text', '#restore-loss-text', '#restore-keep', '#restore-exact', '#restore-cancel']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(viewport.width + 1);
  }
  await page.locator('#restore-keep').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).name)).toBe('Copie ancienne');
  expect((await storedSafety(page)).limitations).toEqual(['knees', 'chest_symptoms']);
  await context.setOffline(false);
});
