// Sous-lot 0b-3 (corrections finales) — parcours navigateur : logChallenge() protégé, jeûne communautaire, série neutre,
// signal urgent sur Kegel (dispositif partagé), absence d'incitation dans les parcours secondaires.
// Règles provisoires de produit (aucune validation médicale).
const { test, expect } = require('@playwright/test');

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = () => iso(new Date());
const START_DATE = iso(new Date(Date.now() - 60 * DAY));
const FIXED = '2026-11-26T12:00:00'; // jeudi

const S = {
  none: { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' },
  unanswered: undefined,
  chest: { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false },
};

async function seed(page, safety, o = {}) {
  await page.addInitScript(({ safety, o, startDate }) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Test Final', goal: 'forme', level: 'debutant', startDate: o.startDate || startDate, ...(safety === undefined ? {} : { safety }) }));
      localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [1, 2, 4, 5], equipment: ['chaise', 'charges', 'elastique'], ...(o.settings || {}) }));
      if (o.challenges) localStorage.setItem('hfc_challenges', JSON.stringify(o.challenges));
      if (o.sessions) localStorage.setItem('hfc_sessions', JSON.stringify(o.sessions));
      if (o.suspension) localStorage.setItem('hfc_safety_suspension', JSON.stringify(o.suspension));
    }
  }, { safety, o, startDate: START_DATE });
  if (o.fixedTime) await page.clock.setFixedTime(new Date(o.fixedTime));
}
const setProfileSafety = (page, safety) => page.evaluate((s) => { const p = JSON.parse(localStorage.getItem('hfc_profile')); p.safety = s; localStorage.setItem('hfc_profile', JSON.stringify(p)); }, safety);
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const sess = (date) => ({ date, title: 'Haut du corps', duration: 20, exercises: [] });

// ───────────── logChallenge() : appels directs ─────────────

test('logChallenge : appel direct depuis la page — défis physiques refusés, hydratation acceptée, rien d\'écrit en cas de refus', async ({ page }) => {
  const start = iso(new Date(Date.now() - DAY));
  await seed(page, S.chest, { challenges: { active: { gainage30: { startDate: start, log: {} }, kegel21: { startDate: start, log: {} }, eau14: { startDate: start, log: {} } }, history: [] } });
  await page.goto('/challenges.html');
  const results = await page.evaluate(() => [logChallenge('gainage30', 99), logChallenge('kegel21', 1), logChallenge('eau14', 1500)]);
  expect(results).toEqual([false, false, true]);
  const data = await stored(page, 'hfc_challenges');
  expect(data.active.gainage30.log).toEqual({});
  expect(data.active.kegel21.log).toEqual({});
  expect(data.active.eau14.log[TODAY()]).toBe(1500);
  await page.reload(); // même état après rechargement
  expect(await page.evaluate(() => [logChallenge('gainage30', 5), logChallenge('eau14', 1600)])).toEqual([false, true]);
});

test('logChallenge : levée de la restriction = fonctionnement normal', async ({ page }) => {
  await seed(page, S.chest, { challenges: { active: { gainage30: { startDate: iso(new Date(Date.now() - DAY)), log: {} } }, history: [] } });
  await page.goto('/challenges.html');
  expect(await page.evaluate(() => logChallenge('gainage30', 20))).toBe(false);
  await setProfileSafety(page, S.none);
  await page.reload();
  expect(await page.evaluate(() => logChallenge('gainage30', 20))).toBe(true);
  expect((await stored(page, 'hfc_challenges')).active.gainage30.log[TODAY()]).toBe(20);
});

test('partager.html : sans moteur de sécurité, logChallenge() ne peut rien enregistrer', async ({ page }) => {
  await seed(page, S.none, { challenges: { active: { gainage30: { startDate: iso(new Date(Date.now() - DAY)), log: {} }, eau14: { startDate: iso(new Date(Date.now() - DAY)), log: {} } }, history: [] } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/partager.html');
  expect(await page.evaluate(() => typeof evaluateSafetyPolicy)).toBe('undefined');
  expect(await page.evaluate(() => [logChallenge('gainage30', 20), logChallenge('eau14', 500)])).toEqual([false, false]);
  const data = await stored(page, 'hfc_challenges');
  expect(data.active.gainage30.log).toEqual({});
  expect(data.active.eau14.log).toEqual({});
  expect(errors).toEqual([]);
});

test('défis : l\'interface « Enregistrer ma journée » ne contourne pas la politique (blocage dans un autre onglet)', async ({ page, context }) => {
  await seed(page, S.none, { challenges: { active: { gainage30: { startDate: TODAY(), log: {} } }, history: [] } });
  await page.goto('/challenges.html');
  await expect(page.locator('[data-act="log"][data-id="gainage30"]')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/settings.html');
  await setProfileSafety(other, S.chest);
  await other.close();
  await page.locator('[data-act="log"][data-id="gainage30"]').click(); // l'écran est périmé : la fonction protégée refuse
  expect((await stored(page, 'hfc_challenges')).active.gainage30.log).toEqual({});
  expect(await page.evaluate(() => 'gainage30' in pending)).toBe(true); // la saisie n'est pas considérée comme enregistrée
  await expect(page.locator('#active-list')).toContainText('suspendu par précaution');
});

test('défis : une réussite antérieure reste une réussite à l\'écran après un blocage', async ({ page }) => {
  const history = [{ id: 'gainage30', startDate: '2026-08-01', validated: 26, required: 26, success: true }, { id: 'kegel21', startDate: '2026-08-01', validated: 3, required: 21, success: false, suspended: true }];
  await seed(page, S.chest, { challenges: { active: {}, history } });
  await page.goto('/challenges.html');
  await expect(page.locator('#history-list')).toContainText('🏅');
  await expect(page.locator('#history-list')).toContainText('26/26');
  await expect(page.locator('#history-list')).toContainText('suspendu par précaution');
  await expect(page.locator('#history-list')).not.toContainText('❌');
});

// ───────────── Jeûne communautaire ─────────────

const fastToday = () => ({ fasts: [{ start: iso(new Date(Date.now() - DAY)), days: 3 }] });

test('jeûne (bloqué) : accueil, séance de récupération et page du jeûne n\'incitent ni ne démarrent aucune activité physique', async ({ page }) => {
  await seed(page, S.chest, { settings: fastToday() });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-cta')).toBeHidden();
  await expect(page.locator('#recovery-link')).toBeHidden();
  const fastCard = await page.locator('#fast-card').innerText();
  expect(fastCard).not.toMatch(/récupération douce|séance/i);

  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#start-btn')).toBeDisabled();
  await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0);

  await page.goto('/jeune.html');
  await expect(page.locator('#legend-training')).toBeHidden();
  await expect(page.locator('#fast-excused')).toBeHidden();
  await expect(page.locator('#prep-eve')).toBeHidden();
  await expect(page.locator('#prep-refeed')).toBeHidden();
  await expect(page.locator('#fast-intro')).toContainText('Aucune séance n’est proposée');
  await expect(page.locator('#legend-fast')).not.toContainText('récupération douce');
  expect(await page.locator('.cal-cell.training').count()).toBe(0);
  const sr = await page.locator('.cal-cell .sr-only').allInnerTexts();
  expect(sr.some((t) => /séance prévue|séance à/.test(t))).toBe(false);
  // La participation au jeûne (non physique) reste possible
  await expect(page.locator('#next-fast')).toBeVisible();
  expect(errors).toEqual([]);
  // Pas de reprise après rechargement
  await page.reload();
  await expect(page.locator('#legend-training')).toBeHidden();
});

test('jeûne annoncé à venir (bloqué) : la carte de l\'accueil n\'annonce aucune séance ni récupération', async ({ page }) => {
  const upcoming = { fasts: [{ start: iso(new Date(Date.now() + 3 * DAY)), days: 3 }] };
  const clear = await page.context().newPage();
  await seed(clear, S.none, { settings: upcoming });
  await clear.goto('/dashboard.html');
  await expect(clear.locator('#fast-text')).toContainText('récupération douce'); // témoin : texte habituel quand c'est autorisé
  await seed(page, S.chest, { settings: upcoming });
  await page.goto('/dashboard.html');
  await expect(page.locator('#fast-card')).toBeVisible();
  await expect(page.locator('#fast-title')).toHaveText('🌿 Prochain jeûne');
  expect(await page.locator('#fast-text').innerText()).not.toMatch(/séance|récupération douce/i);
});

test('jeûne (autorisé) : fonctionnement normal, récupération douce proposée', async ({ page }) => {
  await seed(page, S.none, { settings: fastToday() });
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-cta')).toBeVisible();
  await page.goto('/jeune.html');
  await expect(page.locator('#legend-training')).toBeVisible();
  await expect(page.locator('#prep-eve')).toBeVisible();
  await expect(page.locator('#legend-fast')).toContainText('récupération douce');
  expect(await page.locator('.cal-cell.training').count()).toBeGreaterThan(0);
  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#start-btn')).toBeEnabled();
});

test('jeûne : blocage entre deux pages (reprise, étapes successives) — la politique est réévaluée, aucune récupération lancée', async ({ page }) => {
  await seed(page, S.none, { settings: fastToday() });
  await page.goto('/workout.html?s=' + encodeURIComponent('Récupération'));
  await expect(page.locator('#start-btn')).toBeEnabled();
  await setProfileSafety(page, S.chest);
  await page.reload();
  await expect(page.locator('#start-btn')).toBeDisabled();
  await setProfileSafety(page, S.none);
  await page.reload();
  await expect(page.locator('#start-btn')).toBeEnabled();
});

test('jeûne : l\'agenda du jeûne ne contient aucune suggestion d\'activité quand l\'entraînement est bloqué', async ({ page }) => {
  await seed(page, S.chest, { settings: fastToday() });
  await page.goto('/jeune.html');
  const ics = await page.evaluate(() => buildFastICS({ start: '2026-12-02', days: 3 }));
  expect(ics).not.toMatch(/Récupération|séance/i);
  await setProfileSafety(page, S.none);
  await page.reload();
  expect(await page.evaluate(() => buildFastICS({ start: '2026-12-02', days: 3 }))).toMatch(/Récupération douce/);
});

// ───────────── Série neutre ─────────────

test('série : un blocage mémorise seulement le jour, la série acquise est préservée et le plan n\'affiche ni ❌ ni 🔁', async ({ page }) => {
  // Jeudi 26/11 : semaines du 9/11 et du 16/11 complètes (série 2), semaine du 16/11… on prend 9/11 et 16/11 réussies.
  const sessions = ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-17', '2026-11-18', '2026-11-20', '2026-11-21'].map(sess);
  await seed(page, S.chest, { fixedTime: FIXED, startDate: '2026-10-20', sessions });
  await page.goto('/dashboard.html');
  expect(await page.evaluate(() => getStreak())).toBe(2);
  expect(await stored(page, 'hfc_safety_suspension')).toEqual(['2026-11-26']);
  expect(await page.evaluate(() => JSON.stringify(getSafetySuspensionDays()))).not.toMatch(/chest|poitrine/);
  const strip = await page.locator('#week-strip').innerText();
  expect(strip).not.toMatch(/❌|🔁/);
  expect(await page.evaluate(() => getSessionLog().length)).toBe(8); // aucune séance fictive
});

test('série : semaine passée suspendue ne casse pas la série ; levée de la restriction = reprise normale', async ({ page }) => {
  // Semaine du 9/11 suspendue (jours mémorisés, aucune séance) ; semaine du 2/11 réussie ; semaine du 16/11 non faite, non suspendue.
  const sessions = ['2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07'].map(sess);
  const suspension = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  await seed(page, S.chest, { fixedTime: FIXED, startDate: '2026-10-20', sessions, suspension });
  await page.goto('/dashboard.html');
  // Semaine du 16/11 : non faite et non suspendue = rupture historique (comportement inchangé pour les jours non suspendus)
  expect(await page.evaluate(() => getStreak())).toBe(0);
  await page.evaluate(() => localStorage.setItem('hfc_safety_suspension', JSON.stringify(['2026-11-09', '2026-11-10', '2026-11-16', '2026-11-17'])));
  expect(await page.evaluate(() => getStreak())).toBe(1); // semaines 16/11 et 9/11 neutres, 2/11 réussie
  // Levée : les semaines suspendues restent neutres, la semaine en cours repart normalement
  await setProfileSafety(page, S.none);
  await page.reload();
  expect(await page.evaluate(() => getStreak())).toBe(1);
  await expect(page.locator('#today-cta')).toBeVisible();
  // Une semaine future non faite casserait la série comme avant
});

test('série : le plan d\'une semaine avec jours suspendus passés affiche ⏸️ et pas ❌ après la levée', async ({ page }) => {
  await seed(page, S.none, { fixedTime: FIXED, startDate: '2026-10-20', suspension: ['2026-11-23', '2026-11-24', '2026-11-25'], settings: { trainingDays: [1, 2, 3, 4, 5] } });
  await page.goto('/dashboard.html');
  const strip = await page.locator('#week-strip').innerText();
  expect(strip).not.toMatch(/❌|🔁/);
  expect((strip.match(/⏸️/g) || []).length).toBe(3);
  await expect(page.locator('#week-alert')).toBeHidden();
});

// ───────────── Signal urgent sur Kegel ─────────────

async function startKegel(page, safety = S.none) {
  await seed(page, safety);
  await page.goto('/kegel.html');
  await page.locator('#start-kegel-btn').click();
  await expect(page.locator('#view-session')).toBeVisible();
}

test('Kegel : le signal urgent interrompt la routine, rien n\'est enregistré, aucune reprise après rechargement', async ({ page }) => {
  await startKegel(page);
  await expect(page.locator('#kegel-safety-btn')).toBeVisible();
  await page.locator('#kegel-safety-btn').click();
  await expect(page.locator('#safety-overlay')).toBeVisible();
  await page.locator('.safety-signal', { hasText: 'poitrine' }).click();
  await expect(page.locator('#safety-cancel')).toBeHidden(); // aucune reprise possible
  await expect(page.locator('#safety-later')).toBeHidden();
  await expect(page.locator('#safety-emergency')).toHaveText('Contacte les services d\'urgence locaux.');
  expect(await page.evaluate(() => kegelHalted)).toBe(true);
  expect(await page.evaluate(() => /\b(15|112|911)\b/.test(document.getElementById('safety-emergency').textContent))).toBe(false);
  await page.waitForTimeout(1500); // le minuteur ne rédémarre pas
  expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
  // Aucun détail médical conservé durablement
  const keys = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  expect(JSON.stringify(keys)).not.toMatch(/poitrine|thoracique|douleur-thoracique|malaise|vertige/i);
  await page.evaluate(() => runRep()); // même un appel direct ne relance rien
  expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
  await page.locator('#safety-stop').click();
  await page.waitForURL('**/dashboard.html');
  await page.goto('/kegel.html'); // rechargement : routine fermée, retour à l'intro, aucune routine en cours
  await expect(page.locator('#view-session')).toBeHidden();
  await expect(page.locator('#view-intro')).toBeVisible();
});

test('Kegel : « Tout va bien » ne reprend qu\'après réévaluation de la politique', async ({ page, context }) => {
  await startKegel(page);
  await page.locator('#kegel-safety-btn').click();
  await page.locator('#safety-cancel').click();
  await expect(page.locator('#safety-overlay')).toHaveCount(0);
  await expect(page.locator('#view-session')).toBeVisible(); // reprise : politique toujours favorable

  // Précautions modifiées pendant la pause : la reprise est refusée, la page se recharge fermée
  await page.locator('#kegel-safety-btn').click();
  const other = await context.newPage();
  await other.goto('/settings.html');
  await setProfileSafety(other, S.chest);
  await other.close();
  await page.locator('#safety-cancel').click();
  await page.waitForFunction(() => document.getElementById('start-kegel-btn') && document.getElementById('start-kegel-btn').disabled, null, { timeout: 8000 });
  await expect(page.locator('#view-session')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
});

test('Kegel : un signal non urgent arrête aussi la routine ; réévaluation avant toute nouvelle routine', async ({ page }) => {
  await startKegel(page);
  await page.locator('#kegel-safety-btn').click();
  await page.locator('.safety-signal', { hasText: 'Douleur' }).first().click();
  await expect(page.locator('#safety-cancel')).toBeHidden();
  await expect(page.locator('#safety-later')).toBeHidden(); // la mise de côté n'existe pas pour Kegel
  await page.locator('#safety-stop').click();
  await page.waitForURL('**/dashboard.html');
  expect(await page.evaluate(() => localStorage.getItem('hfc_kegel_sessions'))).toBeNull();
  await setProfileSafety(page, S.chest);
  await page.goto('/kegel.html');
  await expect(page.locator('#start-kegel-btn')).toBeDisabled(); // nouvelle activité réévaluée
});

test('séance : le signal urgent partagé fonctionne comme avant (effacement immédiat, pas de reprise)', async ({ page }) => {
  await seed(page, S.none);
  await page.goto('/workout.html?s=' + encodeURIComponent('Full Body + Cardio'));
  await page.locator('#start-btn').click();
  await page.locator('#safety-btn-work').click();
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull();
  await page.locator('.safety-signal', { hasText: 'poitrine' }).click();
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).toBeNull();
  await expect(page.locator('#safety-later')).toBeHidden();
});

// ───────────── Parcours secondaires : aucune incitation ─────────────

const INCITING = /Commencer l.entraînement|Faire une séance bonus|Récupération douce \(|Rattrapage|garder ta série|Il te manque \d+ séance/;

test('parcours secondaires (bloqué) : accueil, coach, bilan, défis, jeûne, réglages — aucune incitation à s\'entraîner', async ({ page }) => {
  await seed(page, S.chest, { fixedTime: FIXED, startDate: '2026-10-20', settings: { ...fastToday(), reminderEnabled: true, reminderTime: '08:00' } });
  for (const url of ['/dashboard.html', '/coach.html', '/recap.html', '/challenges.html', '/jeune.html', '/progress.html']) {
    await page.goto(url);
    const text = await page.locator('body').innerText();
    expect(text, url).not.toMatch(INCITING);
  }
  await page.goto('/settings.html');
  await expect(page.locator('#ics-btn')).toBeDisabled();
  await expect(page.locator('#reminder-note')).toContainText('aucun rappel de séance n’est envoyé');
});

test('parcours secondaires : sans moteur de sécurité (page partager.html), aucun rappel ni activité n\'est déclenché', async ({ page }) => {
  await seed(page, S.none, { settings: { reminderEnabled: true, reminderTime: '00:00' } });
  await page.addInitScript(() => { window.__notifs = 0; window.Notification = function () { window.__notifs++; }; window.Notification.permission = 'granted'; });
  await page.goto('/partager.html');
  expect(await page.evaluate(() => typeof evaluateSafetyPolicy)).toBe('undefined');
  expect(await page.evaluate(() => window.__notifs)).toBe(0);
});
