// Sous-lot 0b-2 — parcours navigateur de la politique de sécurité : confirmation avant la première séance, état « blocked »
// sur tous les parcours, profil modifié dans un autre onglet, signal urgent, « trop facile », phase 2, hors ligne, mobile.
// Les règles testées sont des garde-fous PROVISOIRES de produit (pas une validation médicale).
const { test, expect } = require('@playwright/test');

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const START_DATE = iso(new Date(Date.now() - DAY));
const LONG_AGO = iso(new Date(Date.now() - 100 * DAY)); // programme de 12 semaines terminé

const ACK_TEXT = 'HomeFit adapte ses séances à partir des informations que tu choisis de communiquer. Si tu ne renseignes pas tes précautions, l’application ne peut pas vérifier que les exercices te conviennent. Tu peux compléter ton questionnaire dans les réglages à tout moment.';
const ACK_BUTTON = 'J’ai compris, continuer';

const S = {
  none: { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' },
  unanswered: undefined,
  declined: { status: 'declined', responded: true, preferNot: true, limitations: [], declined: true },
  knees: { status: 'declared', responded: true, limitations: ['knees'], declined: false },
  pro: { status: 'declared', responded: true, limitations: ['professional_advice'], declined: false, professionalAdvice: true },
  chest: { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false },
  chestEvaluated: { status: 'declared', responded: true, limitations: ['chest_symptoms'], chestContext: 'evaluated', declined: false },
};

async function seed(page, safety, { startDate = START_DATE, inProgress = null, adaptation = null, mode } = {}) {
  await page.addInitScript(({ safety, startDate, inProgress, adaptation, mode }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    sessionStorage.removeItem('coachAdaptation');
    localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Test Politique', goal: 'forme', level: 'debutant', startDate, ...(mode ? { mode } : {}), ...(safety === undefined ? {} : { safety }) }));
    localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise', 'charges', 'elastique'] }));
    if (inProgress) localStorage.setItem('hfc_inprogress', JSON.stringify({ ...inProgress, savedAt: Date.now() }));
    if (adaptation) sessionStorage.setItem('coachAdaptation', JSON.stringify(adaptation));
  }, { safety, startDate, inProgress, adaptation, mode });
}
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const SAVED = {
  date: START_DATE, title: 'Jambes + Abdos', subtitle: 'x',
  exercises: [{ id: 'respiration-profonde', sets: 1, holdSeconds: 40 }, { id: 'chat-vache', sets: 1, holdSeconds: 40 }],
  restSeconds: 45, options: { warmup: false, cooldown: false }, queueIndex: 0, tally: {}, setLog: {}, elapsedMs: 1000, timerState: null,
};
const workoutUrl = (title) => '/workout.html' + (title ? '?s=' + encodeURIComponent(title) : '');

// ───────────── Confirmation avant la première séance ─────────────

for (const kind of ['unanswered', 'declined']) {
  test(`confirmation (${kind}) : texte exact, séance seulement après « J'ai compris », jamais redemandée ensuite`, async ({ page }) => {
    await seed(page, S[kind]);
    await page.goto(workoutUrl());
    await page.locator('#start-btn').click();
    const dialog = page.locator('#ack-overlay');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(page.locator('#ack-text')).toHaveText(ACK_TEXT);
    await expect(page.locator('#ack-confirm')).toHaveText(ACK_BUTTON);
    await expect(page.locator('#view-work')).toBeHidden(); // aucune séance avant la confirmation
    expect((await stored(page, 'hfc_inprogress'))).toBeNull();
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ack-confirm');
    await page.locator('#ack-confirm').click();
    await expect(page.locator('#view-work')).toBeVisible();
    const safety = await stored(page, 'hfc_profile').then((p) => p.safety);
    expect(safety.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(safety.status).toBe(kind); // la confirmation ne transforme jamais l'état en « aucune situation »
    // Pas redemandée : nouvelle visite, nouveau démarrage.
    await page.goto(workoutUrl());
    await page.locator('#start-btn').click();
    await expect(page.locator('#ack-overlay')).toHaveCount(0);
    await expect(page.locator('#view-work')).toBeVisible();
  });
}

test('confirmation : jamais pour « aucune situation » ; Échap annule sans rien démarrer ni enregistrer', async ({ page }) => {
  await seed(page, S.none);
  await page.goto(workoutUrl());
  await page.locator('#start-btn').click();
  await expect(page.locator('#ack-overlay')).toHaveCount(0);
  await expect(page.locator('#view-work')).toBeVisible();

  const other = await page.context().newPage();
  await seed(other, S.unanswered);
  await other.goto(workoutUrl());
  await other.locator('#start-btn').click();
  await expect(other.locator('#ack-overlay')).toBeVisible();
  await other.keyboard.press('Escape');
  await expect(other.locator('#ack-overlay')).toHaveCount(0);
  await expect(other.locator('#view-work')).toBeHidden();
  await expect(other.locator('#view-list')).toBeVisible();
  expect((await stored(other, 'hfc_profile')).safety).toBeUndefined();
  // Le lien vers le questionnaire est proposé.
  await other.locator('#start-btn').click();
  await expect(other.locator('#ack-settings')).toHaveAttribute('href', /settings\.html#securite/);
});

test('confirmation : le niveau de séance est plafonné (aucune augmentation) même après confirmation', async ({ page }) => {
  await seed(page, S.unanswered, { startDate: iso(new Date(Date.now() - 60 * DAY)) }); // semaine 9
  await page.goto(workoutUrl('Haut du corps'));
  const exercises = await page.evaluate(() => today.exercises.map((e) => ({ id: e.id, sets: e.sets, reps: e.reps || null })));
  const base = await page.evaluate(() => WEEK_PROGRAM.find((d) => d.title === 'Haut du corps').exercises);
  exercises.forEach((e) => {
    const b = base.find((x) => x.id === e.id);
    expect(e.sets, e.id).toBeLessThanOrEqual(b.sets);
    expect(e.reps, e.id).toBeLessThanOrEqual(b.reps);
  });
});

// ───────────── État « blocked » : aucun parcours ne contourne l'interdiction ─────────────

for (const kind of ['chest', 'chestEvaluated']) {
  test(`état bloqué (${kind}) : accueil, séance, récupération, coach, défis et test de niveau sont tous fermés`, async ({ page }) => {
    await seed(page, S[kind]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Accueil : aucun accès à l'entraînement, message prudent sans diagnostic ni numéro.
    await page.goto('/dashboard.html');
    await expect(page.locator('#today-title')).toHaveText('Entraînement suspendu par précaution');
    await expect(page.locator('#today-cta')).toBeHidden();
    await expect(page.locator('#recovery-link')).toBeHidden();
    await expect(page.locator('#week-alert')).toBeHidden();
    const message = page.locator('#safety-policy-messages');
    await expect(message).toBeVisible();
    const text = await message.innerText();
    expect(text).toMatch(kind === 'chest' ? /services d’urgence locaux/ : /suis ses consignes/);
    expect(text).not.toMatch(/\b(15|17|18|112|911)\b|diagnostic|maladie/i);

    // Séance directe, séance de récupération directe, séance bonus : aucune.
    for (const url of [workoutUrl(), workoutUrl('Récupération'), workoutUrl('Full Body + Cardio')]) {
      await page.goto(url);
      await expect(page.locator('#start-btn')).toBeDisabled();
      await expect(page.locator('#start-btn')).toHaveText('Entraînement suspendu par précaution');
      await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0);
      await expect(page.locator('#phase-banner')).toBeVisible();
    }

    // Adaptation du coach injectée : jamais appliquée.
    await page.evaluate(() => sessionStorage.setItem('coachAdaptation', JSON.stringify({ type: 'light', label: 'Fatigue' })));
    await page.goto(workoutUrl());
    await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0);

    // Coach : « Appliquer » n'est jamais proposé.
    await page.goto('/coach.html');
    await expect(page.locator('#coach-policy')).toBeVisible();
    await page.locator('.situation-card', { hasText: 'fatigué' }).click();
    await expect(page.locator('#apply-btn')).toBeHidden();
    await expect(page.locator('#response-text')).toContainText('suspendu par précaution');

    // Défis : défis d'effort fermés, défis sans exercice non concernés.
    await page.goto('/challenges.html');
    await expect(page.locator('[data-act="start"][data-id="pompes30"]')).toBeDisabled();
    await expect(page.locator('[data-act="start"][data-id="squats30"]')).toBeDisabled();
    await expect(page.locator('[data-act="start"][data-id="eau14"]')).toBeEnabled();
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hfc_challenges') || '{"active":{}}').active))).toEqual([]);

    // Test de niveau : suspendu.
    await page.goto('/test.html');
    await expect(page.locator('#lt-start')).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('état bloqué : une séance en pause ne peut pas être reprise, même enregistrée avant la déclaration', async ({ page }) => {
  await seed(page, S.chest, { inProgress: SAVED });
  await page.goto(workoutUrl());
  await expect(page.locator('#resume-card')).toBeVisible();
  await expect(page.locator('#resume-btn')).toBeHidden();
  await expect(page.locator('#resume-text')).toContainText('ne correspond plus');
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull(); // rien n'est effacé en silence
});

test('état bloqué : un défi déjà en cours est suspendu (aucune cible d\'effort affichée)', async ({ page }) => {
  await seed(page, S.chest);
  await page.addInitScript(({ start }) => {
    if (!localStorage.getItem('hfc_challenges')) localStorage.setItem('hfc_challenges', JSON.stringify({ active: { pompes30: { startDate: start, log: {} } }, history: [] }));
  }, { start: START_DATE });
  await page.goto('/challenges.html');
  await expect(page.locator('#active-list')).toContainText('suspendu par précaution');
  await expect(page.locator('#active-list [data-act="log"]')).toHaveCount(0);
});

// ───────────── Niveaux « restricted » et « caution » ─────────────

test('avis professionnel : séance limitée aux exercices classés peu intenses, message, aucune augmentation', async ({ page }) => {
  await seed(page, S.pro);
  await page.goto(workoutUrl('Full Body + Cardio'));
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const info = await page.evaluate(() => today.exercises.map((e) => getExerciseIntensity(e.id).intensity));
  expect(info.length).toBeGreaterThan(0);
  info.forEach((level) => expect(level).toBe('low'));
  await expect(page.locator('#phase-banner-text')).toContainText('professionnel');
  await expect(page.locator('#start-btn')).toBeEnabled();
  await expect(page.locator('#adjust-easier')).toBeHidden();
});

test('« trop facile » : cinquante demandes ne changent rien sous « caution » et « restricted », mais restent possibles sous « clear »', async ({ page }) => {
  for (const [name, safety, ack] of [['unanswered', S.unanswered, true], ['knees', S.knees, false]]) {
    const p = await page.context().newPage();
    await seed(p, safety && { ...safety }, {});
    if (ack) await p.addInitScript(() => { if (!sessionStorage.getItem('__ack')) { sessionStorage.setItem('__ack', '1'); const prof = JSON.parse(localStorage.getItem('hfc_profile')); prof.safety = { status: 'unanswered', responded: false, limitations: [], acknowledgedAt: '2026-10-01' }; localStorage.setItem('hfc_profile', JSON.stringify(prof)); } });
    await p.goto(workoutUrl('Full Body + Cardio'));
    await p.locator('#start-btn').click();
    await expect(p.locator('#view-work')).toBeVisible();
    await expect(p.locator('#adjust-easier')).toBeHidden();
    await p.evaluate(() => { for (let i = 0; i < 50; i++) adjustCurrent(1); });
    expect(await p.evaluate(() => JSON.parse(localStorage.getItem('hfc_adjust') || '{}')), name).toEqual({});
    await p.close();
  }
  const clear = await page.context().newPage();
  await seed(clear, S.none);
  await clear.goto(workoutUrl('Full Body + Cardio'));
  await clear.locator('#start-btn').click();
  await expect(clear.locator('#view-work')).toBeVisible();
  await expect(clear.locator('#adjust-easier')).toBeVisible();
  await clear.evaluate(() => { adjustCurrent(1); });
  expect(Object.keys(await clear.evaluate(() => JSON.parse(localStorage.getItem('hfc_adjust') || '{}'))).length).toBe(1);
});

test('défis : charge croissante fermée sous « caution » ; défis sans exercice disponibles ; « clear » inchangé', async ({ page }) => {
  await seed(page, { status: 'unanswered', responded: false, limitations: [], acknowledgedAt: '2026-10-01' });
  await page.goto('/challenges.html');
  await expect(page.locator('[data-act="start"][data-id="pompes30"]')).toBeDisabled();
  await expect(page.locator('#catalog-list')).toContainText('questionnaire de sécurité');
  await expect(page.locator('[data-act="start"][data-id="eau14"]')).toBeEnabled();
  await page.locator('[data-act="start"][data-id="eau14"]').click();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hfc_challenges')).active))).toEqual(['eau14']);

  const clear = await page.context().newPage();
  await seed(clear, S.none);
  await clear.goto('/challenges.html');
  await expect(clear.locator('[data-act="start"][data-id="pompes30"]')).toBeEnabled();
  await clear.locator('[data-act="start"][data-id="pompes30"]').click();
  expect(await clear.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hfc_challenges')).active))).toEqual(['pompes30']);
});

test('défi à effort sans questionnaire : confirmation d\'abord, mais la charge croissante reste fermée', async ({ page }) => {
  await seed(page, S.knees);
  await page.goto('/challenges.html');
  await expect(page.locator('[data-act="start"][data-id="squats30"]')).toBeDisabled(); // genoux : exercice incompatible
  await expect(page.locator('#catalog-list')).toContainText('progression');
});

test('phase 2 : proposée en « clear », masquée sous « caution » et « restricted »', async ({ page }) => {
  await seed(page, S.none, { startDate: LONG_AGO });
  await page.goto('/dashboard.html');
  await expect(page.locator('#cycle-card')).toBeVisible();
  await expect(page.locator('#cycle-card [data-next="phase2"]')).toBeVisible();
  for (const safety of [{ status: 'unanswered', responded: false, limitations: [], acknowledgedAt: '2026-10-01' }, S.knees]) {
    const p = await page.context().newPage();
    await seed(p, safety, { startDate: LONG_AGO });
    await p.goto('/dashboard.html');
    await expect(p.locator('#cycle-card')).toBeVisible();
    await expect(p.locator('#cycle-card [data-next="phase2"]')).toBeHidden();
    await expect(p.locator('#phase2-unavailable')).toBeVisible();
    await expect(p.locator('#cycle-card [data-next="maintenance"]')).toBeVisible();
    // Même en forçant l'appel, le contrôle de la politique refuse.
    const refused = await p.evaluate(() => { try { startNextCycle('phase2'); return false; } catch (e) { return true; } });
    expect(refused).toBe(true);
    expect((await stored(p, 'hfc_profile')).mode).toBeUndefined();
    await p.close();
  }
});

// ───────────── Profil modifié dans un autre onglet ─────────────

test('autre onglet : un symptôme thoracique déclaré pendant que la séance est affichée bloque le démarrage', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto(workoutUrl('Full Body + Cardio'));
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const other = await context.newPage();
  await other.goto('/settings.html');
  await other.evaluate(() => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false }; localStorage.setItem('hfc_profile', JSON.stringify(p)); });
  await page.locator('#start-btn').click();
  await expect(page.locator('#toast')).toContainText('précautions ont changé');
  await expect(page.locator('#view-work')).toBeHidden();
  await page.waitForLoadState('load');
  await expect(page.locator('#start-btn')).toBeDisabled({ timeout: 8000 });
  await expect(page.locator('#start-btn')).toHaveText('Entraînement suspendu par précaution');
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
});

test('autre onglet : une restriction physique ajoutée met à jour la séance affichée avant tout démarrage', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto(workoutUrl('Jambes + Abdos'));
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const other = await context.newPage();
  await other.goto('/settings.html');
  await other.evaluate(() => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = { status: 'declared', responded: true, limitations: ['knees'], declined: false }; localStorage.setItem('hfc_profile', JSON.stringify(p)); });
  await page.locator('#start-btn').click();
  await expect(page.locator('#toast')).toContainText('précautions ont changé');
  await page.waitForFunction(() => !today.exercises.some((e) => e.id === 'squat'), null, { timeout: 8000 }); // la page se recharge d'elle-même
  await expect(page.locator('#exercise-list .exercise-item').first()).toBeVisible();
  const ids = await page.evaluate(() => today.exercises.map((e) => e.id));
  for (const id of ids) expect(await page.evaluate((x) => evaluateSafetyPolicy(getProfile(), { action: 'swap', exerciseId: x }).allowed, id)).toBe(true);
  expect(ids).not.toContain('squat');
});

test('reprise : une séance en pause est réévaluée (précautions modifiées avant la reprise)', async ({ page }) => {
  const saved = { ...SAVED, exercises: [{ id: 'pompes', sets: 3, reps: 10 }, { id: 'respiration-profonde', sets: 1, holdSeconds: 40 }] };
  await seed(page, S.none, { inProgress: saved });
  await page.goto(workoutUrl());
  await expect(page.locator('#resume-btn')).toBeVisible();
  // avis professionnel ajouté (pompes : intensité non classée donc traitée comme haute)
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = { status: 'declared', responded: true, limitations: ['professional_advice'], declined: false }; localStorage.setItem('hfc_profile', JSON.stringify(p)); });
  await page.reload();
  await expect(page.locator('#resume-card')).toBeVisible();
  await expect(page.locator('#resume-btn')).toBeHidden();
  await expect(page.locator('#resume-text')).toContainText('ne correspond plus');
});

test('reprise : sans confirmation de compréhension, la reprise la demande', async ({ page }) => {
  await seed(page, S.unanswered, { inProgress: SAVED });
  await page.goto(workoutUrl());
  await page.locator('#resume-btn').click();
  await expect(page.locator('#ack-overlay')).toBeVisible();
  await expect(page.locator('#view-work')).toBeHidden();
  await page.locator('#ack-confirm').click();
  await expect(page.locator('#view-work')).toBeVisible();
});

// ───────────── Signal urgent ─────────────

test('signal urgent : la séance en pause est effacée immédiatement, aucune reprise après rechargement, aucun détail conservé', async ({ page }) => {
  await seed(page, S.none);
  await page.goto(workoutUrl('Full Body + Cardio'));
  await page.locator('#start-btn').click();
  await expect(page.locator('#view-work')).toBeVisible();
  await page.locator('#safety-btn-work').click();
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull(); // pause à l'ouverture du menu
  await page.locator('.safety-signal', { hasText: 'poitrine' }).click();
  // Effacée AVANT tout clic sur « Arrêter la séance ».
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
  await expect(page.locator('#safety-cancel')).toBeHidden();
  await expect(page.locator('#safety-emergency')).toHaveText('Contacte les services d\'urgence locaux.');
  const emergency = await page.locator('#safety-emergency').innerText();
  expect(emergency).not.toMatch(/\b(15|112|911)\b/);
  await page.waitForTimeout(1500); // aucun minuteur ne ré-écrit la séance
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
  // Rechargement sans avoir cliqué sur « Arrêter » : pas de bouton de reprise.
  await page.reload();
  await expect(page.locator('#resume-card')).toBeHidden();
  const dump = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(dump).not.toMatch(/poitrine|thoracique-signal|douleur-thoracique|malaise-severe|difficulte-respiratoire/);
});

test('signal non urgent : le comportement existant est conservé (séance mise de côté reprenable)', async ({ page }) => {
  await seed(page, S.none);
  await page.goto(workoutUrl('Full Body + Cardio'));
  await page.locator('#start-btn').click();
  await page.locator('#safety-btn-work').click();
  await page.locator('.safety-signal', { hasText: 'Vertige' }).click();
  await expect(page.locator('#safety-later')).toBeVisible();
  await page.locator('#safety-later').click();
  await page.waitForURL('**/dashboard.html');
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull();
});

// ───────────── Hors ligne et mobile ─────────────

test('hors ligne : la confirmation et le blocage fonctionnent sans réseau', async ({ page, context }) => {
  await seed(page, S.unanswered);
  await page.goto(workoutUrl());
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#start-btn').click();
  await expect(page.locator('#ack-overlay')).toBeVisible();
  await page.locator('#ack-confirm').click();
  await expect(page.locator('#view-work')).toBeVisible();
  // Blocage hors ligne
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false }; localStorage.setItem('hfc_profile', JSON.stringify(p)); });
  await page.goto(workoutUrl());
  await expect(page.locator('#start-btn')).toBeDisabled();
  await context.setOffline(false);
});

test('mobile : la confirmation et les messages restent lisibles dans l\'écran', async ({ page }) => {
  const viewport = page.viewportSize();
  const inside = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box.x, selector).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 1);
  };
  await seed(page, S.unanswered);
  await page.goto(workoutUrl());
  await page.locator('#start-btn').click();
  for (const sel of ['#ack-overlay .safety-panel', '#ack-confirm', '#ack-settings']) await inside(sel);
  await page.keyboard.press('Escape');

  const blocked = await page.context().newPage();
  await seed(blocked, S.chest);
  await blocked.goto('/dashboard.html');
  const messageBox = await blocked.locator('#safety-policy-messages').boundingBox();
  expect(messageBox.x).toBeGreaterThanOrEqual(0);
  expect(messageBox.x + messageBox.width).toBeLessThanOrEqual(viewport.width + 1);
});
