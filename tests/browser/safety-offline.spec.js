// Précache du moteur de sécurité (correction minimale du Service Worker : trois scripts précachés + cache v20).
// Vérifie, dans un vrai navigateur : installation neuve hors ligne, mise à jour depuis une VRAIE installation v19 (l'ancien
// sw.js est servi tel qu'il était au dernier commit), séance, blocage, confirmation et reprise hors ligne, absence d'erreurs
// JavaScript et absence de mélange entre anciennes et nouvelles versions des fichiers.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SW_SOURCE = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE = SW_SOURCE.match(/const CACHE_NAME = '([^']+)'/)[1];
const ASSETS = [...SW_SOURCE.slice(SW_SOURCE.indexOf('const ASSETS'), SW_SOURCE.indexOf('];')).matchAll(/'([^']+)'/g)].map((m) => m[1]);
const SAFETY_SCRIPTS = ['js/safety-intensity.js', 'js/safety-policy.js', 'js/safety-ui.js'];
// Contenus de la version précédente (v19, commit fe91a72), figés dans tests/fixtures/v19 : l'état réel d'une installation existante.
// (Jeu de données plutôt que `git show`, pour fonctionner aussi dans un clone superficiel de l'intégration continue.)
const OLD = (file) => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'v19', path.basename(file)), 'utf8');

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const START_DATE = iso(new Date(Date.now() - DAY));
const ACK_TEXT = 'HomeFit adapte ses séances à partir des informations que tu choisis de communiquer. Si tu ne renseignes pas tes précautions, l’application ne peut pas vérifier que les exercices te conviennent. Tu peux compléter ton questionnaire dans les réglages à tout moment.';

const SAFETY = {
  none: { status: 'none', responded: true, limitations: [], declined: false, answeredAt: '2026-10-01' },
  unanswered: undefined,
  declined: { status: 'declined', responded: true, preferNot: true, limitations: [], declined: true },
  chest: { status: 'declared', responded: true, limitations: ['chest_symptoms'], declined: false },
};

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return errors;
}

// Écrit le profil et les réglages dans le stockage de l'origine (la page doit avoir été chargée au moins une fois).
async function setProfile(page, safety, inProgress = null) {
  await page.evaluate(({ safety, startDate, inProgress }) => {
    localStorage.setItem('hfc_profile', JSON.stringify({ name: 'Test Hors ligne', goal: 'forme', level: 'debutant', startDate, ...(safety === undefined ? {} : { safety }) }));
    localStorage.setItem('hfc_settings', JSON.stringify({ warmup: false, cooldown: false, restSeconds: 45, trainingDays: [0, 1, 2, 3, 4, 5, 6], equipment: ['chaise', 'charges', 'elastique'] }));
    if (inProgress) localStorage.setItem('hfc_inprogress', JSON.stringify({ ...inProgress, savedAt: Date.now() }));
    else localStorage.removeItem('hfc_inprogress');
  }, { safety, startDate: START_DATE, inProgress });
}

// Le précache est écrit en une seule fois (addAll) : on attend que le cache de la version courante soit complet.
async function waitForPrecache(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async (name) => {
    if (!(await caches.keys()).includes(name)) return 0;
    return (await (await caches.open(name)).keys()).length;
  }, CACHE), { timeout: 20000 }).toBeGreaterThanOrEqual(ASSETS.length);
}

const SAVED = {
  date: START_DATE, title: 'Jambes + Abdos', subtitle: 'Quadriceps, Fessiers, Abdominaux',
  exercises: [{ id: 'respiration-profonde', sets: 1, holdSeconds: 40 }, { id: 'chat-vache', sets: 1, holdSeconds: 40 }],
  restSeconds: 45, options: { warmup: false, cooldown: false }, queueIndex: 0, tally: {}, setLog: {}, elapsedMs: 1000, timerState: null,
};

test('installation neuve : précache complet (v20), les trois scripts se chargent hors ligne sans visite préalable', async ({ page, context }) => {
  const errors = trackErrors(page);
  await page.goto('/index.html'); // seule page visitée en ligne
  await waitForPrecache(page);
  expect(await page.evaluate(() => caches.keys())).toEqual([CACHE]);

  // Chaque ressource listée, dont les trois scripts de sécurité, est dans le cache, sans qu'aucune autre page n'ait été visitée.
  const absent = await page.evaluate(async ({ name, assets }) => {
    const cache = await caches.open(name);
    const missing = [];
    for (const asset of assets) if (!(await cache.match(asset))) missing.push(asset);
    return missing;
  }, { name: CACHE, assets: ASSETS });
  expect(absent).toEqual([]);
  for (const script of SAFETY_SCRIPTS) expect(ASSETS).toContain(script);

  await setProfile(page, SAFETY.none);
  await context.setOffline(true);
  await page.goto('/workout.html'); // jamais visitée en ligne : servie par le précache
  await expect(page.locator('#start-btn')).toBeEnabled();
  const loaded = await page.evaluate(() => ({
    policy: typeof evaluateSafetyPolicy, intensity: typeof getExerciseIntensity, ui: typeof requestSafetyAcknowledgement,
    version: typeof SAFETY_POLICY_VERSION !== 'undefined' ? SAFETY_POLICY_VERSION : null,
  }));
  expect(loaded).toEqual({ policy: 'function', intensity: 'function', ui: 'function', version: 1 });
  // Les trois scripts sont bien les balises de la page, chargées sans connexion.
  for (const script of SAFETY_SCRIPTS) {
    expect(await page.evaluate((src) => !!document.querySelector(`script[src="${src}"]`), script)).toBe(true);
  }
  await page.locator('#start-btn').click();
  await expect(page.locator('#view-work')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hors ligne : blocage thoracique, confirmation (unanswered et declined), séance « aucune situation »', async ({ page, context }) => {
  const errors = trackErrors(page);
  await page.goto('/index.html');
  await waitForPrecache(page);
  await context.setOffline(true);

  // Symptômes thoraciques : aucune séance, aucune récupération, accueil fermé.
  await setProfile(page, SAFETY.chest);
  for (const url of ['/workout.html', '/workout.html?s=' + encodeURIComponent('Récupération')]) {
    await page.goto(url);
    await expect(page.locator('#start-btn')).toBeDisabled();
    await expect(page.locator('#exercise-list .exercise-item')).toHaveCount(0);
  }
  await page.goto('/dashboard.html');
  await expect(page.locator('#today-title')).toHaveText('Entraînement suspendu par précaution');
  await expect(page.locator('#today-cta')).toBeHidden();

  // Confirmation : unanswered puis declined, texte exact, séance seulement après confirmation.
  for (const kind of ['unanswered', 'declined']) {
    await setProfile(page, SAFETY[kind]);
    await page.goto('/workout.html');
    await page.locator('#start-btn').click();
    await expect(page.locator('#ack-overlay')).toBeVisible();
    await expect(page.locator('#ack-text')).toHaveText(ACK_TEXT);
    await expect(page.locator('#view-work')).toBeHidden();
    await page.locator('#ack-confirm').click();
    await expect(page.locator('#view-work')).toBeVisible();
    const safety = await page.evaluate(() => JSON.parse(localStorage.getItem('hfc_profile')).safety);
    expect(safety.status).toBe(kind);
    expect(safety.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }

  // « Aucune situation » : séance directe, sans confirmation.
  await setProfile(page, SAFETY.none);
  await page.goto('/workout.html');
  await page.locator('#start-btn').click();
  await expect(page.locator('#ack-overlay')).toHaveCount(0);
  await expect(page.locator('#view-work')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mise à jour depuis une installation v19 : le nouveau précache remplace l\'ancien, sans mélange, et la reprise fonctionne hors ligne', async ({ page, context }) => {
  const errors = trackErrors(page);
  const oldSw = OLD('sw.js');
  expect(oldSw).toContain("homefit-coach-v19");
  expect(oldSw).not.toContain('safety-policy');

  // Phase 1 : le navigateur reçoit l'ANCIEN sw.js (v19), exactement comme une installation existante.
  await context.route('**/sw.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: oldSw }));
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).join(','))).toBe('homefit-coach-v19');
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('homefit-coach-v19')).keys()).length)).toBeGreaterThan(50);
  // Le cache v19 ne contient aucun des trois scripts.
  const inV19 = await page.evaluate(async (scripts) => {
    const cache = await caches.open('homefit-coach-v19');
    const found = [];
    for (const s of scripts) if (await cache.match(s)) found.push(s);
    return found;
  }, SAFETY_SCRIPTS);
  expect(inV19).toEqual([]);

  // État réaliste d'une installation existante : anciennes versions de workout.html et safety.js dans le cache v19, séance en pause.
  await page.evaluate(async ({ workout, safety }) => {
    const cache = await caches.open('homefit-coach-v19');
    await cache.put(new Request(location.origin + '/workout.html'), new Response(workout, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    await cache.put(new Request(location.origin + '/js/safety.js'), new Response(safety, { headers: { 'content-type': 'text/javascript' } }));
  }, { workout: OLD('workout.html'), safety: OLD('js/safety.js') });
  await setProfile(page, SAFETY.none, SAVED);

  // Phase 2 : mise à jour vers le sw.js courant (v20).
  await context.unroute('**/sw.js');
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).join(',')), { timeout: 20000 }).toBe(CACHE);
  await waitForPrecache(page);
  expect(await page.evaluate(() => caches.keys())).toEqual([CACHE]); // l'ancien cache v19 est supprimé

  // Aucun mélange : chaque page et chaque script précachés sont identiques à ceux du serveur, y compris ceux qui étaient anciens dans la v19.
  const compared = ASSETS.filter((a) => /\.(js|html)$/.test(a) && a !== 'sw.js');
  expect(compared).toEqual(expect.arrayContaining([...SAFETY_SCRIPTS, 'js/safety.js', 'workout.html', 'dashboard.html', 'js/workouts.js', 'js/storage.js']));
  const mixed = [];
  for (const asset of compared) {
    const server = await (await page.request.get('/' + asset)).text();
    const cached = await page.evaluate(async ({ name, asset }) => { const r = await (await caches.open(name)).match(asset); return r ? r.text() : null; }, { name: CACHE, asset });
    if (cached !== server) mixed.push(asset);
  }
  expect(mixed).toEqual([]);

  // Hors ligne, après la mise à jour : la séance en pause est reprise avec les nouveaux scripts.
  await context.setOffline(true);
  await page.goto('/workout.html');
  await expect(page.locator('#resume-card')).toBeVisible();
  const globals = await page.evaluate(() => ({
    policy: typeof evaluateSafetyPolicy, enforce: typeof enforceSafeExercises.length, gate: typeof ensureSafetyAllows, version: SAFETY_POLICY_VERSION,
    scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((s) => s.includes('safety')),
  }));
  expect(globals.policy).toBe('function');
  expect(globals.gate).toBe('function'); // nouvelle version de workout.html (l'ancienne n'a pas ce contrôle)
  expect(globals.version).toBe(1);
  expect(globals.scripts).toEqual(['js/safety.js', ...SAFETY_SCRIPTS]);
  await page.locator('#resume-btn').click();
  await expect(page.locator('#view-work')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mise à jour depuis v19 : la reprise après mise à jour est réévaluée (symptômes thoraciques déclarés entre-temps)', async ({ page, context }) => {
  const errors = trackErrors(page);
  const oldSw = OLD('sw.js');
  await context.route('**/sw.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: oldSw }));
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).join(','))).toBe('homefit-coach-v19');
  await setProfile(page, SAFETY.chest, SAVED); // séance enregistrée, puis profil devenu « bloqué »
  await context.unroute('**/sw.js');
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).join(',')), { timeout: 20000 }).toBe(CACHE);
  await waitForPrecache(page);
  await context.setOffline(true);
  await page.goto('/workout.html');
  await expect(page.locator('#resume-card')).toBeVisible();
  await expect(page.locator('#resume-btn')).toBeHidden(); // aucune reprise en état bloqué
  await expect(page.locator('#start-btn')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('hfc_inprogress'))).not.toBeNull();
  expect(errors).toEqual([]);
});
