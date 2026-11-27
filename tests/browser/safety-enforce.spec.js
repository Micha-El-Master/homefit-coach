// Sous-lot 0 — parcours navigateur : le garde-fou central dans workout.html
// (D2 échauffement/étirements, D4 adaptations du coach, D5 reprise d'une séance en pause, D6 remplacement manuel,
//  hors ligne). Les profils « genoux » et « dos » sont ceux de l'audit.
const { test, expect } = require('@playwright/test');

const START = new Date(Date.now() - 86400000);
const START_DATE = `${START.getFullYear()}-${String(START.getMonth() + 1).padStart(2, '0')}-${String(START.getDate()).padStart(2, '0')}`;

const PROFILES = {
  libre: { name: 'Libre', goal: 'forme', level: 'debutant', startDate: START_DATE },
  genoux: { name: 'Genoux', goal: 'forme', level: 'debutant', startDate: START_DATE, safety: { responded: true, limitations: ['knees'] } },
  dos: { name: 'Dos', goal: 'forme', level: 'debutant', startDate: START_DATE, safety: { responded: true, limitations: ['back'] } },
  genouxDos: { name: 'GenouxDos', goal: 'forme', level: 'debutant', startDate: START_DATE, safety: { responded: true, limitations: ['knees', 'back'] } },
  tout: { name: 'Tout', goal: 'forme', level: 'debutant', startDate: START_DATE, safety: { responded: true, limitations: ['knees', 'back', 'shoulders', 'balance', 'mobility'] } },
};

async function setup(page, profile, { settings = {}, inProgress = null, adaptation = null } = {}) {
  await page.addInitScript(
    ({ profile, settings, inProgress, adaptation }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('hfc_profile', JSON.stringify(profile));
      localStorage.setItem(
        'hfc_settings',
        JSON.stringify({ warmup: true, cooldown: true, restSeconds: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise', 'charges', 'elastique'], ...settings })
      );
      if (inProgress) localStorage.setItem('hfc_inprogress', JSON.stringify({ ...inProgress, savedAt: Date.now() }));
      if (adaptation) sessionStorage.setItem('coachAdaptation', JSON.stringify(adaptation));
    },
    { profile, settings, inProgress, adaptation }
  );
}

// Identifiants incompatibles avec le profil courant parmi une liste d'identifiants.
const incompatibleIds = (page, ids) =>
  page.evaluate((list) => list.filter((id) => !evaluateExerciseCompatibility(id, getProfile()).compatible), ids);

function savedSession(overrides = {}) {
  return {
    date: START_DATE,
    title: 'Jambes + Abdos',
    subtitle: 'Quadriceps, Fessiers, Abdominaux',
    exercises: [
      { id: 'squat', sets: 3, reps: 10 },
      { id: 'pont-fessier', sets: 3, reps: 10 },
      { id: 'curl-biceps', sets: 3, reps: 10 },
    ],
    restSeconds: 45,
    options: { warmup: false, cooldown: false },
    queueIndex: 0,
    tally: {},
    setLog: {},
    elapsedMs: 1000,
    timerState: null,
    ...overrides,
  };
}

test('D1 récupération : genoux + dos, aucun exercice incompatible dans la liste affichée', async ({ page }) => {
  await setup(page, PROFILES.genouxDos);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const ids = await page.evaluate(() => today.exercises.map((e) => e.id));
  expect(ids.length).toBeGreaterThan(0);
  expect(await incompatibleIds(page, ids)).toEqual([]);
  // Les exercices affichés sont bien ceux de la séance filtrée.
  expect(await page.locator('#exercise-list .exercise-item').count()).toBe(ids.length);
  expect(errors).toEqual([]);
});

test('D1 récupération : toutes précautions, séance courte avec avertissement professionnel', async ({ page }) => {
  await setup(page, PROFILES.tout);
  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#phase-banner')).toBeVisible();
  await expect(page.locator('#phase-banner-text')).toContainText('professionnel');
  const ids = await page.evaluate(() => today.exercises.map((e) => e.id));
  expect(ids).toEqual(['respiration-profonde']);
  await expect(page.locator('#start-btn')).toBeEnabled();
});

test('D2 échauffement et étirements : aucun mouvement incompatible dans la file de la séance (genoux, dos)', async ({ page }) => {
  for (const key of ['genoux', 'dos']) {
    const p = await page.context().newPage();
    await setup(p, PROFILES[key]);
    await p.goto('/workout.html?s=' + encodeURIComponent('Jambes + Abdos'));
    // Genoux : échauffement et étirements modifiés. Dos : seuls les étirements le sont (aucun échauffement concerné,
    // l'affichage historique reste alors inchangé).
    if (key === 'genoux') await expect(p.locator('#opt-warmup-desc')).toContainText('adapté');
    else await expect(p.locator('#opt-warmup-desc')).toHaveText('4 mouvements · ~2 min');
    await expect(p.locator('#opt-cooldown-desc')).toContainText('adapté');
    await p.locator('#start-btn').click();
    await expect(p.locator('#view-work')).toBeVisible();
    const ids = await p.evaluate(() => queue.filter((s) => s.exercise).map((s) => s.exercise.id));
    const phases = await p.evaluate(() => queue.filter((s) => s.phase).map((s) => s.phase));
    expect(phases).toContain('warmup');
    expect(phases).toContain('cooldown');
    expect(await incompatibleIds(p, ids), `profil ${key}`).toEqual([]);
    await p.close();
  }
});

test('D2 profil sans précaution : échauffement et étirements historiques inchangés', async ({ page }) => {
  await setup(page, PROFILES.libre);
  await page.goto('/workout.html?s=' + encodeURIComponent('Jambes + Abdos'));
  await expect(page.locator('#opt-warmup-desc')).toHaveText('4 mouvements · ~2 min');
  await expect(page.locator('#opt-cooldown-desc')).toHaveText('5 étirements · ~2 min 30');
  await page.locator('#start-btn').click();
  const sequence = await page.evaluate(() => ({
    warmup: queue.filter((s) => s.phase === 'warmup').map((s) => s.exercise.id),
    cooldown: queue.filter((s) => s.phase === 'cooldown').map((s) => s.exercise.id),
    expectedWarmup: WARMUP_ROUTINE.map((e) => e.id),
    expectedCooldown: COOLDOWN_ROUTINE.map((e) => e.id),
  }));
  expect(sequence.warmup).toEqual(sequence.expectedWarmup);
  expect(sequence.cooldown).toEqual(sequence.expectedCooldown);
});

test('D4 adaptations du coach : jamais d\'exercice incompatible (genoux, dos)', async ({ page }) => {
  const adaptations = [
    { type: 'swap-categories', categories: ['Jambes', 'Cardio'], label: 'Genou' },
    { type: 'swap-categories', categories: ['Haut du corps'], label: 'Épaule' },
    { type: 'no-equipment', label: 'Déplacement' },
    { type: 'mini', label: 'Express' },
    { type: 'light', label: 'Fatigue' },
    { type: 'comeback', label: 'Reprise' },
    { type: 'reduce-sets', label: 'Dos' },
  ];
  for (const key of ['genoux', 'dos']) {
    for (const adaptation of adaptations) {
      for (const title of ['Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio']) {
        const p = await page.context().newPage();
        await setup(p, PROFILES[key], { adaptation, settings: { warmup: false, cooldown: false } });
        await p.goto('/workout.html?s=' + encodeURIComponent(title));
        await expect(p.locator('#coach-banner')).toBeVisible();
        const ids = await p.evaluate(() => today.exercises.map((e) => e.id));
        expect(ids.length, `${key}/${adaptation.type}/${title}`).toBeGreaterThan(0);
        expect(await incompatibleIds(p, ids), `${key}/${adaptation.type}/${title} : ${ids}`).toEqual([]);
        await p.close();
      }
    }
  }
});

test('D5 reprise : une séance en pause incompatible avec les précautions actuelles n\'est pas reprise telle quelle', async ({ page }) => {
  await setup(page, PROFILES.genoux, { inProgress: savedSession() });
  await page.goto('/workout.html');
  await expect(page.locator('#resume-card')).toBeVisible();
  await expect(page.locator('#resume-text')).toContainText('ne correspond plus');
  await expect(page.locator('#resume-btn')).toBeHidden();
  await expect(page.locator('#restart-btn')).toHaveText('Recommencer une séance adaptée');
  // Rien n'est supprimé tant que l'utilisateur n'a pas choisi de recommencer.
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull();
  // La séance proposée à la place respecte les précautions.
  const ids = await page.evaluate(() => today.exercises.map((e) => e.id));
  expect(await incompatibleIds(page, ids)).toEqual([]);
  await page.locator('#restart-btn').click();
  await expect(page.locator('#resume-card')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
  // Les séances déjà terminées ne sont jamais touchées.
  expect(await page.evaluate(() => localStorage.getItem('hfc_sessions'))).toBeNull();
});

test('D5 reprise : séance compatible reprise normalement (sans précaution)', async ({ page }) => {
  await setup(page, PROFILES.libre, { inProgress: savedSession() });
  await page.goto('/workout.html');
  await expect(page.locator('#resume-card')).toBeVisible();
  await expect(page.locator('#resume-btn')).toBeVisible();
  await page.locator('#resume-btn').click();
  await expect(page.locator('#view-work')).toBeVisible();
});

test('D5 reprise : séance enregistrée avec les routines complètes refusée si les précautions les modifient', async ({ page }) => {
  // Exercices compatibles avec les genoux, mais échauffement actif et sauvegarde antérieure au garde-fou (routines complètes).
  const saved = savedSession({
    exercises: [{ id: 'curl-biceps', sets: 3, reps: 10 }],
    options: { warmup: true, cooldown: false },
  });
  await setup(page, PROFILES.genoux, { inProgress: saved });
  await page.goto('/workout.html');
  await expect(page.locator('#resume-btn')).toBeHidden();
  await expect(page.locator('#resume-text')).toContainText('ne correspond plus');
});

test('D6 remplacement manuel : seules les alternatives compatibles sont proposées (genoux)', async ({ page }) => {
  await setup(page, PROFILES.genoux, { settings: { warmup: false, cooldown: false } });
  await page.goto('/workout.html?s=' + encodeURIComponent('Jambes + Abdos'));
  const swapButtons = page.locator('.swap-btn');
  const count = await swapButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await swapButtons.nth(i).click();
  const altIds = await page.locator('.alt-chip').evaluateAll((els) => els.map((e) => e.dataset.altId));
  expect(await incompatibleIds(page, altIds)).toEqual([]);
});

test('D6 remplacement manuel : sans précaution, toutes les alternatives historiques restent proposées', async ({ page }) => {
  await setup(page, PROFILES.libre, { settings: { warmup: false, cooldown: false } });
  await page.goto('/workout.html?s=' + encodeURIComponent('Haut du corps'));
  const result = await page.evaluate(() => {
    document.querySelectorAll('.swap-btn').forEach((b) => b.click());
    return today.exercises.map((ex, idx) => ({
      expected: (EXERCISES[ex.id].alternatives || []).length,
      shown: document.querySelectorAll(`#alt-panel-${idx} .alt-chip`).length,
    }));
  });
  result.forEach((r) => expect(r.shown).toBe(r.expected));
  expect(await page.locator('text=Aucune alternative compatible').count()).toBe(0);
});

test('hors ligne : la page de séance filtre toujours les exercices sans réseau', async ({ page, context }) => {
  await setup(page, PROFILES.genouxDos);
  await page.goto('/workout.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est maintenant contrôlée par le Service Worker
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const ids = await page.evaluate(() => today.exercises.map((e) => e.id));
  expect(await incompatibleIds(page, ids)).toEqual([]);
  await context.setOffline(false);
});
