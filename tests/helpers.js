// Charge les scripts de l'application dans un contexte isolé (sans navigateur) avec un faux LocalStorage
// et une date « maintenant » fixe, pour tester la logique métier de façon déterministe.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/storage.js', 'js/exercises.js', 'js/illustrations.js', 'js/workouts.js', 'js/badges.js', 'js/recap.js', 'js/meals.js', 'js/challenges.js'];

function createApp({ now = new Date(2026, 9, 15, 12, 0, 0), store = {} } = {}) {
  const fixed = now.getTime();
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(fixed);
    }
    static now() {
      return fixed;
    }
  }

  const sandbox = {
    console,
    Date: FakeDate,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i) => Object.keys(store)[i] ?? null,
    },
    Blob,
    File,
    Response,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    CompressionStream,
    DecompressionStream,
    URL,
    navigator: {},
  };
  const context = vm.createContext(sandbox);
  FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), context, { filename: f }));

  return {
    store,
    // Les valeurs retournées sont clonées : les tableaux/objets d'un autre contexte ne se comparent pas en mode strict.
    run: (code) => {
      const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
      const result = vm.runInContext(code, context);
      return result && typeof result.then === 'function' ? result.then(clone) : clone(result);
    },
    set(key, value) {
      store[key] = typeof value === 'string' ? value : JSON.stringify(value);
    },
    settings(patch) {
      store.hfc_settings = JSON.stringify(patch);
    },
    profile(patch = {}) {
      store.hfc_profile = JSON.stringify({ name: 'Test', goal: 'forme', level: 'intermediaire', startDate: '2026-10-10', ...patch });
    },
    sessions(list) {
      store.hfc_sessions = JSON.stringify(list.map((s) => (typeof s === 'string' ? { date: s, title: 'Haut du corps', exercises: [] } : s)));
    },
  };
}

module.exports = { createApp, ROOT };
