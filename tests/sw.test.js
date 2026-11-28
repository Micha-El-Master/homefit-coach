const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const assets = [...sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];')).matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('service worker : chaque fichier listé existe', () => {
  const missing = assets.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepStrictEqual(missing, []);
});

test('service worker : toutes les pages et scripts de l\'application sont mis en cache hors ligne', () => {
  const files = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')), ...fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)];
  assert.deepStrictEqual(files.filter((f) => !assets.includes(f)), []);
});

// ───── Précache des scripts de sécurité (sous-lot 0b-2) ─────
const pageScripts = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('service worker : la version du cache a évolué (v20) pour que les installations existantes reçoivent les nouveaux scripts', () => {
  const match = sw.match(/const CACHE_NAME = 'homefit-coach-v(\d+)'/);
  assert.ok(match, 'CACHE_NAME introuvable');
  assert.ok(Number(match[1]) >= 20, `version ${match[1]} : la v19 ne précachait pas les scripts de sécurité`);
});

test('service worker : les trois scripts du moteur de sécurité sont précachés', () => {
  ['js/safety-intensity.js', 'js/safety-policy.js', 'js/safety-ui.js'].forEach((file) => assert.ok(assets.includes(file), `${file} absent du précache`));
});

test('service worker : tout script référencé par une page est précaché (aucune page ne dépend d\'un script absent hors ligne)', () => {
  const missing = [];
  pages.forEach((page) => pageScripts(page).forEach((src) => { if (!assets.includes(src)) missing.push(`${page} -> ${src}`); }));
  assert.deepStrictEqual(missing, []);
});

test('service worker : les scripts de sécurité sont listés dans l\'ordre réel de chargement des pages', () => {
  const order = ['js/safety.js', 'js/safety-intensity.js', 'js/safety-policy.js', 'js/safety-ui.js'];
  // Dans le précache
  const positions = order.map((file) => assets.indexOf(file));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions, 'ordre du précache');
  // Dans chaque page : l'ordre relatif des scripts de sécurité présents est le même
  let checked = 0;
  pages.forEach((page) => {
    const scripts = pageScripts(page);
    const present = order.filter((file) => scripts.includes(file));
    if (present.length < 2) return;
    assert.deepStrictEqual(present.map((file) => scripts.indexOf(file)), present.map((file) => scripts.indexOf(file)).sort((a, b) => a - b), `${page} : ordre de chargement`);
    // safety.js (deriveSafetyState) avant la politique, et la politique avant l'interface
    assert.ok(scripts.indexOf('js/safety.js') < scripts.indexOf('js/safety-policy.js') || !scripts.includes('js/safety-policy.js'), `${page} : safety.js après la politique`);
    if (scripts.includes('js/safety-ui.js')) assert.ok(scripts.includes('js/safety-policy.js'), `${page} : interface sans politique`);
    checked++;
  });
  assert.ok(checked >= 5, `pages vérifiées : ${checked}`);
});
