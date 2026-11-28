// Sous-lot 0b-3 — parcours navigateur : Kegel (activité physique), défis suspendus, affichages sans pénalité visuelle,
// rappels et agenda de séances, test de niveau, et matrice « aucune porte d'entrée » après rechargements.
// Règles provisoires de produit (aucune validation médicale).
const { test, expect } = require('@playwright/test');

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const START_DATE = iso(new Date(Date.now() - DAY));
const FIXED = '2026-11-26T12:00:00'; // un jeudi : le lundi, le mardi et le mercredi de la semaine sont passés
const FIXED_START = '2026-10-20';

const S = {
  none: { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' },
  unanswered: { status: 'unanswered', responded: false, limitations: [], acknowledgedAt: '2026-10-01' },
  unansweredNoAck: undefined,
  declined: { status: 'declined', responded: true, preferNot: true, limitations: [], declined: true },
  pro: { status: 'declared', responded: true, limitations: ['professional_advice'], declined: false, professionalAdvice: true },
  chest: { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false },
  chestEvaluated: { status: 'declared', responded: true, limitations: ['chest_symptoms'], chestContext: 'evaluated', declined: false },
};

async function seed(page, safety, o = {}) {
  await page.addInitScript(({ safety, o, startDate }) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Test Activités', goal: 'forme', level: 'debutant', startDate: o.startDate || startDate, ...(safety === undefined ? {} : { safety }) }));
      localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise', 'charges', 'elastique'], ...(o.settings || {}) }));
      if (o.challenges) localStorage.setItem('hfc_challenges', JSON.stringify(o.challenges));
      if (o.sessions) localStorage.setItem('hfc_sessions', JSON.stringify(o.sessions));
    }
    if (o.notifications) {
      // Rappels : l'API de notification est simulée et chaque notification créée est comptée.
      window.__notifs = [];
      window.Notification = function (title, options) { window.__notifs.push({ title, options }); };
      window.Notification.permission = 'granted';
    }
  }, { safety, o, startDate: START_DATE });
  if (o.fixedTime) await page.clock.setFixedTime(new Date(o.fixedTime));
}
const setProfileSafety = (page, safety) => page.evaluate((s) => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = s; localStorage.setItem('hfc_profile', JSON.stringify(p)); }, safety);
async function otherTabSets(context, safety) {
  const other = await context.newPage();
  await other.goto('/settings.html');
  await setProfileSafety(other, safety);
  await other.close();
}
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

// ───────────── Kegel : activité physique ─────────────

for (const kind of ['chest', 'chestEvaluated']) {
  test(`Kegel (${kind}) : la routine est fermée, aucune activité physique ne démarre`, async ({ page }) => {
    await seed(page, S[kind]);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/kegel.html');
    await expect(page.locator('#start-kegel-btn')).toBeDisabled();
    await expect(page.locator('#start-kegel-btn')).toHaveText('Activité suspendue par précaution');
    await expect(page.locator('#kegel-policy')).toBeVisible();
    await expect(page.locator('#kegel-policy')).toContainText(kind === 'chest' ? 'services d’urgence locaux' : 'suis ses consignes');
    await page.reload(); // rechargement : même état
    await expect(page.locator('#start-kegel-btn')).toBeDisabled();
    await page.locator('#start-kegel-btn').click({ force: true }).catch(() => {});
    await expect(page.locator('#view-session')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
    expect(errors).toEqual([]);
  });
}

for (const [name, safety] of [['non renseigné', S.unansweredNoAck], ['refus de répondre', S.declined]]) {
  test(`Kegel (${name}) : confirmation de compréhension avant la routine, une seule fois`, async ({ page }) => {
    await seed(page, safety);
    await page.goto('/kegel.html');
    await expect(page.locator('#start-kegel-btn')).toBeEnabled();
    await page.locator('#start-kegel-btn').click();
    await expect(page.locator('#ack-overlay')).toBeVisible();
    await expect(page.locator('#view-session')).toBeHidden();
    await page.locator('#ack-confirm').click();
    await expect(page.locator('#view-session')).toBeVisible();
    expect((await stored(page, 'hfc_profile')).safety.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.goto('/kegel.html');
    await page.locator('#start-kegel-btn').click();
    await expect(page.locator('#ack-overlay')).toHaveCount(0);
    await expect(page.locator('#view-session')).toBeVisible();
  });
}

test('Kegel : « aucune situation » démarre directement ; avis professionnel ferme la routine (intensité non classée)', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto('/kegel.html');
  await page.locator('#start-kegel-btn').click();
  await expect(page.locator('#ack-overlay')).toHaveCount(0);
  await expect(page.locator('#view-session')).toBeVisible();

  const pro = await context.newPage();
  await seed(pro, S.pro);
  await pro.goto('/kegel.html');
  await expect(pro.locator('#start-kegel-btn')).toBeDisabled();
  await expect(pro.locator('#start-kegel-btn')).toHaveText('Routine indisponible avec tes précautions');
  await expect(pro.locator('#kegel-policy')).toContainText('intensité n’est pas classée');
});

test('Kegel : précautions modifiées dans un autre onglet — recalcul au clic, aucune routine lancée', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto('/kegel.html');
  await expect(page.locator('#start-kegel-btn')).toBeEnabled();
  // Témoin : la fenêtre de routine ne doit JAMAIS s'afficher, même une fraction de seconde (mémorisé malgré le rechargement).
  await page.evaluate(() => {
    new MutationObserver(() => { if (document.getElementById('view-session').style.display === 'block') sessionStorage.setItem('__routineShown', '1'); })
      .observe(document.getElementById('view-session'), { attributes: true, attributeFilter: ['style'] });
  });
  await otherTabSets(context, S.chest);
  await page.locator('#start-kegel-btn').click();
  await page.waitForFunction(() => document.getElementById('start-kegel-btn').disabled, null, { timeout: 8000 }); // la page s'est rechargée
  await expect(page.locator('#start-kegel-btn')).toHaveText('Activité suspendue par précaution');
  expect(await page.evaluate(() => sessionStorage.getItem('__routineShown'))).toBeNull();
  await expect(page.locator('#view-session')).toBeHidden();
});

test('Kegel : une routine en cours s\'arrête si l\'entraînement devient interdit', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto('/kegel.html');
  await page.locator('#start-kegel-btn').click();
  await expect(page.locator('#view-session')).toBeVisible();
  await otherTabSets(context, S.chest);
  await page.evaluate(() => runRep()); // répétition suivante : la politique est réévaluée
  await page.waitForFunction(() => document.getElementById('start-kegel-btn') && document.getElementById('start-kegel-btn').disabled, null, { timeout: 8000 });
  await expect(page.locator('#view-session')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull(); // la routine n'est pas enregistrée
});

test('Kegel : hors ligne, la page reste fermée (état bloqué) et la confirmation fonctionne', async ({ page, context }) => {
  await seed(page, S.unansweredNoAck);
  await page.goto('/kegel.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#start-kegel-btn').click();
  await expect(page.locator('#ack-overlay')).toBeVisible();
  await page.locator('#ack-confirm').click();
  await expect(page.locator('#view-session')).toBeVisible();
  await setProfileSafety(page, S.chest);
  await page.goto('/kegel.html');
  await expect(page.locator('#start-kegel-btn')).toBeDisabled();
  await context.setOffline(false);
});

// ───────────── Défis : Kegel suspendu, hydratation accessible, aucune pénalité visuelle ─────────────

test('défis : Kegel fermé et hydratation accessible quand l\'entraînement est bloqué', async ({ page }) => {
  await seed(page, S.chest);
  await page.goto('/challenges.html');
  await expect(page.locator('[data-act="start"][data-id="kegel21"]')).toBeDisabled();
  await expect(page.locator('[data-act="start"][data-id="pompes30"]')).toBeDisabled();
  await expect(page.locator('[data-act="start"][data-id="eau14"]')).toBeEnabled();
  await page.locator('[data-act="start"][data-id="eau14"]').click();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hfc_challenges')).active))).toEqual(['eau14']);
});

test('défis : un défi Kegel déjà démarré est suspendu, sans jour « manqué »', async ({ page, context }) => {
  const challenges = { active: { kegel21: { startDate: iso(new Date(Date.now() - 6 * DAY)), log: {} } }, history: [] };
  const clear = await context.newPage();
  await seed(clear, S.none, { challenges });
  await clear.goto('/challenges.html');
  expect(await clear.locator('#active-list .calendar-cell.missed').count()).toBeGreaterThan(0); // témoin : sans restriction, des jours manqués apparaissent

  await seed(page, S.chest, { challenges });
  await page.goto('/challenges.html');
  await expect(page.locator('#active-list')).toContainText('suspendu par précaution');
  expect(await page.locator('#active-list .calendar-cell.missed').count()).toBe(0);
  await expect(page.locator('#active-list .calendar-cell[aria-label*="suspendu par précaution"]').first()).toBeVisible();
  await expect(page.locator('#active-list [data-act="log"]')).toHaveCount(0);
});

test('défis : un défi non atteint et suspendu est archivé « suspendu », jamais en échec ❌', async ({ page, context }) => {
  const challenges = { active: { kegel21: { startDate: iso(new Date(Date.now() - 40 * DAY)), log: {} } }, history: [] };
  const clear = await context.newPage();
  await seed(clear, S.none, { challenges });
  await clear.goto('/challenges.html');
  await expect(clear.locator('#history-list')).toContainText('❌'); // témoin : comportement historique sans restriction

  await seed(page, S.chest, { challenges });
  await page.goto('/challenges.html');
  await expect(page.locator('#history-list')).toContainText('suspendu par précaution');
  await expect(page.locator('#history-list')).toContainText('⏸️');
  await expect(page.locator('#history-list')).not.toContainText('❌');
  expect((await stored(page, 'hfc_challenges')).history[0].suspended).toBe(true);
});

// ───────────── Affichage : aucune pénalité visuelle ─────────────

test('accueil : aucune séance « manquée » affichée quand l\'entraînement est bloqué (⏸️ à la place)', async ({ page, context }) => {
  const clear = await context.newPage();
  await seed(clear, S.none, { fixedTime: FIXED, startDate: FIXED_START });
  await clear.goto('/dashboard.html');
  await expect(clear.locator('#week-strip')).toContainText('❌'); // témoin : les jours passés sans séance sont « manqués »
  await expect(clear.locator('#week-alert')).toBeVisible();

  await seed(page, S.chest, { fixedTime: FIXED, startDate: FIXED_START });
  await page.goto('/dashboard.html');
  const strip = page.locator('#week-strip');
  await expect(strip).toContainText('⏸️');
  await expect(strip).not.toContainText('❌');
  await expect(strip).not.toContainText('🔁');
  await expect(strip).not.toContainText('🏋️');
  await expect(page.locator('.week-strip-legend')).toContainText('suspendu par précaution');
  await expect(page.locator('.week-strip-legend')).not.toContainText('manqué');
  await expect(page.locator('#week-alert')).toBeHidden();
  await expect(page.locator('#today-cta')).toBeHidden();
  // Dans la fenêtre : la bande de la semaine ne déborde pas
  const box = await strip.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
});

test('bilan de la semaine : ni objectif, ni « manqué », ni conseil qui pousse à s\'entraîner quand l\'entraînement est bloqué', async ({ page, context }) => {
  const clear = await context.newPage();
  await seed(clear, S.none, { fixedTime: FIXED, startDate: FIXED_START });
  await clear.goto('/recap.html');
  await expect(clear.locator('#recap-status')).toHaveText('⏳ En cours'); // témoin
  await expect(clear.locator('#recap-sessions')).toContainText('/');

  await seed(page, S.chest, { fixedTime: FIXED, startDate: FIXED_START });
  await page.goto('/recap.html');
  await expect(page.locator('#recap-status')).toHaveText('⏸️ Entraînement suspendu par précaution');
  await expect(page.locator('#recap-sessions')).not.toContainText('/');
  await expect(page.locator('#r-tip')).toContainText('suspendu par précaution');
  await expect(page.locator('#r-tip')).not.toContainText(/manqu|reste|rattrapage|dynamique/);
  await expect(page.locator('body')).not.toContainText('❌');
});

// ───────────── Rappels et agenda ─────────────

const REMINDER = { reminderEnabled: true, reminderTime: '00:00' };

test('rappel quotidien : envoyé quand l\'entraînement est autorisé, jamais quand il est bloqué', async ({ page, context }) => {
  const count = async (p, url) => { await p.goto(url); await p.waitForLoadState('load'); return p.evaluate(() => window.__notifs.length); };
  const results = {};
  for (const [name, safety] of [['none', S.none], ['unanswered', S.unanswered], ['chest', S.chest], ['chestEvaluated', S.chestEvaluated]]) {
    const p = await context.newPage();
    await seed(p, safety, { settings: REMINDER, notifications: true });
    results[name] = await count(p, '/dashboard.html');
    await p.close();
  }
  expect(results).toEqual({ none: 1, unanswered: 1, chest: 0, chestEvaluated: 0 });
  // Sur une page qui ne charge pas le moteur de sécurité, la politique n'est pas évaluable : aucun rappel (donnée inconnue).
  await seed(page, S.none, { settings: REMINDER, notifications: true });
  expect(await count(page, '/nutrition.html')).toBe(0);
  // La restriction levée, le rappel part sur une page qui évalue la politique.
  await setProfileSafety(page, S.chest);
  expect(await count(page, '/dashboard.html')).toBe(0);
  await setProfileSafety(page, S.none);
  expect(await count(page, '/dashboard.html')).toBe(1);
});

test('agenda de séances : fermé quand l\'entraînement est bloqué, disponible sinon', async ({ page, context }) => {
  await seed(page, S.chest, { settings: { trainingDays: [1, 3, 5] } });
  await page.goto('/settings.html');
  await expect(page.locator('#ics-btn')).toBeDisabled();
  await expect(page.locator('#reminder-note')).toContainText('suspendu par précaution');
  await expect(page.locator('#reminder-note')).toContainText('aucun rappel de séance');

  const clear = await context.newPage();
  await seed(clear, S.none, { settings: { trainingDays: [1, 3, 5] } });
  await clear.goto('/settings.html');
  await expect(clear.locator('#ics-btn')).toBeEnabled();
  const [download] = await Promise.all([clear.waitForEvent('download'), clear.locator('#ics-btn').click()]);
  expect(download.suggestedFilename()).toBe('homefit-coach-agenda.ics');
});

// ───────────── Test de niveau ─────────────

test('test de niveau : arrêté si l\'entraînement devient interdit en cours de test, rien n\'est enregistré', async ({ page, context }) => {
  await seed(page, S.none);
  await page.goto('/test.html');
  await page.locator('#lt-start').click();
  await expect(page.locator('#view-test')).toBeVisible();
  await otherTabSets(context, S.chest);
  await page.locator('#lt-next').click();
  await page.waitForFunction(() => document.getElementById('lt-start') && document.getElementById('lt-start').disabled, null, { timeout: 8000 });
  await expect(page.locator('#view-result')).toBeHidden();
  expect((await stored(page, 'hfc_profile')).levelScore).toBeUndefined();
});

// ───────────── Matrice : aucune porte d'entrée quand l'entraînement est bloqué ─────────────

test('matrice : toutes les entrées d\'activité physique restent fermées (symptômes thoraciques), y compris après rechargements', async ({ page }) => {
  await seed(page, S.chest);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const checks = {
    '/dashboard.html': async () => { await expect(page.locator('#today-cta')).toBeHidden(); await expect(page.locator('#recovery-link')).toBeHidden(); },
    '/workout.html': async () => { await expect(page.locator('#start-btn')).toBeDisabled(); await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0); },
    ['/workout.html?s=' + encodeURIComponent('Récupération')]: async () => { await expect(page.locator('#start-btn')).toBeDisabled(); await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0); },
    '/kegel.html': async () => { await expect(page.locator('#start-kegel-btn')).toBeDisabled(); },
    '/test.html': async () => { await expect(page.locator('#lt-start')).toBeDisabled(); },
    '/challenges.html': async () => {
      for (const id of ['pompes30', 'gainage30', 'squats30', 'kegel21']) await expect(page.locator(`[data-act="start"][data-id="${id}"]`)).toBeDisabled();
      await expect(page.locator('[data-act="start"][data-id="eau14"]')).toBeEnabled();
    },
    '/coach.html': async () => { await page.locator('.situation-card', { hasText: 'fatigué' }).click(); await expect(page.locator('#apply-btn')).toBeHidden(); },
    '/settings.html': async () => { await expect(page.locator('#ics-btn')).toBeDisabled(); },
  };
  for (const [url, check] of Object.entries(checks)) {
    await page.goto(url);
    await check();
    await page.reload();
    await check();
  }
  expect(errors).toEqual([]);
  // Rien n'a démarré : aucune séance, aucun Kegel, aucune séance en pause.
  expect(await page.evaluate(() => [localStorage.getItem('hfc_sessions'), localStorage.getItem('hfc_kegel_sessions'), localStorage.getItem('hfc_inprogress'), localStorage.getItem('hfc_recovery')])).toEqual([null, null, null, null]);
});

test('matrice : après levée de la restriction, les mêmes entrées se rouvrent (aucun état résiduel)', async ({ page }) => {
  await seed(page, S.chest);
  await page.goto('/kegel.html');
  await expect(page.locator('#start-kegel-btn')).toBeDisabled();
  await setProfileSafety(page, S.none);
  await page.goto('/kegel.html');
  await expect(page.locator('#start-kegel-btn')).toBeEnabled();
  await page.goto('/workout.html');
  await expect(page.locator('#start-btn')).toBeEnabled();
  await page.goto('/test.html');
  await expect(page.locator('#lt-start')).toBeEnabled();
});

// ───────────── Coach et invitations ─────────────

test('coach : aucun conseil qui pousse à reprendre ou à s\'entraîner quand l\'entraînement est bloqué', async ({ page, context }) => {
  const old = [{ date: '2026-09-01', title: 'Haut du corps', exercises: [] }];
  const clear = await context.newPage();
  await seed(clear, S.none, { fixedTime: FIXED, startDate: FIXED_START, sessions: old });
  await clear.goto('/coach.html');
  await expect(clear.locator('#advice-text')).toContainText('Je reprends après une pause'); // témoin : conseil historique sans restriction

  await seed(page, S.chest, { fixedTime: FIXED, startDate: FIXED_START, sessions: old });
  await page.goto('/coach.html');
  await expect(page.locator('#advice-text')).toContainText('suspendu par précaution');
  await expect(page.locator('#advice-text')).not.toContainText(/reprends|reprise|séance date/);
});

test('invitation de défi de groupe : le Kegel est fermé quand l\'entraînement est bloqué, l\'hydratation reste accessible', async ({ page, context }) => {
  await seed(page, S.chest);
  await page.goto('/challenges.html?defi=kegel21&debut=' + START_DATE);
  await expect(page.locator('#join-challenge')).toBeDisabled();
  await expect(page.locator('.app-shell')).toContainText('suspendu');
  expect(await page.evaluate(() => localStorage.getItem('hfc_challenges'))).toBeNull();

  const water = await context.newPage();
  await seed(water, S.chest);
  await water.goto('/challenges.html?defi=eau14&debut=' + START_DATE);
  await expect(water.locator('#join-challenge')).toBeEnabled();
  await water.locator('#join-challenge').click();
  expect(await water.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hfc_challenges')).active))).toEqual(['eau14']);
});
