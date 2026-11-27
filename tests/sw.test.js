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
