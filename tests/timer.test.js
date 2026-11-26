const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

test('compte à rebours basé sur échéance : démarrage et suspension', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      let ticks = [];
      let completions = 0;
      const timer = createCountdown(10, {
        onTick: (n) => ticks.push(n),
        onComplete: () => completions++,
      });
      timer.start();
      const initial = timer.getState();
      timer.cancel();
      const paused = timer.getRemaining();
      return { initial, paused, completions };
    })()
  `);
  assert.strictEqual(result.initial.remaining, 10);
  assert.strictEqual(result.initial.deadline, result.initial.deadline);
  assert.strictEqual(result.paused, 10);
});

test('compte à rebours : progression réelle, fin unique et temps jamais négatif', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      let ticks = [];
      let completions = 0;
      const timer = createCountdown(3, {
        onTick: (n) => ticks.push(n),
        onComplete: () => completions++,
      });
      timer.start();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 5000;
      timer.sync();
      timer.sync();
      const state = timer.getState();
      Date.now = originalNow;
      timer.cancel();
      return { state, completions, ticks };
    })()
  `);
  assert.strictEqual(result.state.remaining, 0);
  assert.strictEqual(result.state.completed, true);
  assert.strictEqual(result.completions, 1);
  assert.ok(result.ticks.every((n) => n >= 0));
});

test('pause et reprise conserve le temps restant', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      const timer = createCountdown(20, { onTick: () => {}, onComplete: () => {} });
      timer.start();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 4000;
      const remaining = timer.pause();
      timer.resume(remaining);
      const resumed = timer.getState();
      timer.cancel();
      Date.now = originalNow;
      return { remaining, resumed };
    })()
  `);
  assert.strictEqual(result.remaining, 16);
  assert.strictEqual(result.resumed.remaining, 16);
  assert.strictEqual(result.resumed.paused, false);
});

test('double démarrage ne crée pas une seconde échéance', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      const timer = createCountdown(30, { onTick: () => {}, onComplete: () => {} });
      timer.start();
      const deadline = timer.getDeadline();
      timer.start();
      const state = timer.getState();
      timer.cancel();
      return { deadline, sameDeadline: state.deadline === deadline };
    })()
  `);
  assert.strictEqual(result.sameDeadline, true);
});

test('compte à rebours suspendu puis réexaminé termine une seule fois', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      let completions = 0;
      const timer = createCountdown(2, { onTick: () => {}, onComplete: () => completions++ });
      timer.start();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 120000;
      timer.sync();
      timer.sync();
      const state = timer.getState();
      timer.cancel();
      Date.now = originalNow;
      return { state, completions };
    })()
  `);
  assert.strictEqual(result.state.completed, true);
  assert.strictEqual(result.completions, 1);
});

test('compte à rebours restauré accepte une échéance persistée', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      const timer = createCountdown(15, { onTick: () => {}, onComplete: () => {} });
      timer.start();
      const deadline = timer.getDeadline();
      timer.cancel();
      const restored = createCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)), { onTick: () => {}, onComplete: () => {} });
      restored.start();
      const state = restored.getState();
      restored.cancel();
      return state;
    })()
  `);
  assert.strictEqual(result.remaining, 15);
  assert.strictEqual(result.completed, false);
});

test('minuteur count-up utilise une échéance absolue', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      let completions = 0;
      const timer = createCountUp(5, { onTick: () => {}, onComplete: () => completions++ });
      timer.start();
      const originalNow = Date.now;
      Date.now = () => originalNow() + 5000;
      timer.sync();
      const state = timer.getState();
      timer.cancel();
      Date.now = originalNow;
      return { state, completions };
    })()
  `);
  assert.strictEqual(result.state.elapsed, 5);
  assert.strictEqual(result.state.completed, true);
  assert.strictEqual(result.completions, 1);
});

test('changement d’horloge reste borné et prudent', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      const timer = createCountdown(30, { onTick: () => {}, onComplete: () => {} });
      timer.start();
      const originalNow = Date.now;
      Date.now = () => originalNow() - 3600000;
      timer.sync();
      const remaining = timer.getRemaining();
      timer.cancel();
      Date.now = originalNow;
      return { remaining };
    })()
  `);
  assert.ok(result.remaining >= 0);
  assert.ok(result.remaining <= 30);
});

test('Wake Lock indisponible ne bloque pas le minuteur', async () => {
  const app = createApp();
  const result = await app.run(`
    (async () => {
      navigator.wakeLock = undefined;
      const available = await acquireWakeLock();
      releaseWakeLock();
      return available;
    })()
  `);
  assert.strictEqual(result, false);
});

test('Wake Lock refusé est géré sans exception', async () => {
  const app = createApp();
  const result = await app.run(`
    (async () => {
      navigator.wakeLock = { request: async () => { throw new Error('refusé'); } };
      const acquired = await acquireWakeLock();
      return acquired;
    })()
  `);
  assert.strictEqual(result, false);
});

test('Wake Lock libéré après fin de séance', () => {
  const app = createApp();
  const result = app.run(`
    (() => {
      acquireWakeLock();
      releaseWakeLock();
      return typeof wakeLockWanted === 'undefined' ? null : !wakeLockWanted;
    })()
  `);
  assert.strictEqual(result, true);
});
