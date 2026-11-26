function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playBeep(frequency = 880, duration = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {
    /* audio unavailable, ignore */
  }
}

function createCountdown(seconds, { onTick, onComplete }) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.ceil(seconds) : 0);
  let remaining = safeSeconds;
  let deadline = null;
  let startedAtWall = null;
  let startedAtPerf = null;
  let intervalId = null;
  let completed = false;
  let paused = false;

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function wallNow() {
    return typeof Date !== 'undefined' ? Date.now() : 0;
  }

  function perfNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return null;
  }

  function calculateRemaining() {
    if (paused || deadline === null) return Math.max(0, remaining);
    const wallRemaining = deadline - wallNow();
    if (startedAtPerf !== null && perfNow() !== null) {
      const perfElapsed = perfNow() - startedAtPerf;
      const wallElapsed = wallNow() - startedAtWall;
      // Incohérence d'horloge : rester prudent, ne jamais rattraper artificiellement.
      if (Math.abs(perfElapsed - wallElapsed) > 5000) {
        return Math.min(safeSeconds, Math.max(0, remaining - Math.ceil(perfElapsed / 1000)));
      }
    }
    return Math.min(safeSeconds, Math.max(0, Math.ceil(wallRemaining / 1000)));
  }

  function finishOnce() {
    if (completed) return;
    completed = true;
    stopInterval();
    activeTimers.delete(timerObject);
    remaining = 0;
    onTick && onTick(0);
    playBeep(990, 250);
    onComplete && onComplete();
  }

  function sync() {
    if (completed || paused) return;
    remaining = calculateRemaining();
    onTick && onTick(remaining);
    if (remaining <= 3 && remaining > 0) {
      const urgentKey = remaining;
      if (sync.lastUrgent !== urgentKey) {
        sync.lastUrgent = urgentKey;
        playBeep(660, 100);
      }
    }
    if (remaining <= 0) finishOnce();
  }
  sync.lastUrgent = null;

  const timerObject = {
    start() {
      if (completed) return;
      if (intervalId !== null) {
        sync();
        return;
      }
      activeTimers.add(timerObject);
      paused = false;
      startedAtWall = wallNow();
      startedAtPerf = perfNow();
      deadline = startedAtWall + remaining * 1000;
      sync.lastUrgent = null;
      onTick && onTick(remaining);
      intervalId = setInterval(sync, 250);
    },
    cancel() {
      stopInterval();
      paused = true;
      activeTimers.delete(timerObject);
    },
    pause() {
      if (completed || paused) return remaining;
      remaining = calculateRemaining();
      stopInterval();
      paused = true;
      activeTimers.delete(timerObject);
      return Math.max(0, remaining);
    },
    resume(remainingOverride) {
      if (completed) return;
      if (typeof remainingOverride === 'number') remaining = Math.max(0, remainingOverride);
      if (intervalId !== null) stopInterval();
      activeTimers.add(timerObject);
      paused = false;
      startedAtWall = wallNow();
      startedAtPerf = perfNow();
      deadline = startedAtWall + remaining * 1000;
      sync.lastUrgent = null;
      onTick && onTick(remaining);
      intervalId = setInterval(sync, 250);
    },
    sync,
    getRemaining() {
      remaining = calculateRemaining();
      return Math.max(0, remaining);
    },
    getDeadline() {
      return deadline;
    },
    getState() {
      return { remaining: this.getRemaining(), deadline, paused, completed };
    },
    isCompleted() {
      return completed;
    },
  };
  return timerObject;
}

function createCountUp(targetSeconds, { onTick, onComplete }) {
  const target = Math.max(0, Number.isFinite(targetSeconds) ? Math.ceil(targetSeconds) : 0);
  let elapsed = 0;
  let intervalId = null;
  let deadline = null;
  let paused = false;
  let completed = false;

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function sync() {
    if (completed || paused) return;
    elapsed = Math.min(target, Math.max(0, Math.floor((Date.now() - deadline) / 1000)));
    onTick && onTick(elapsed);
    if (elapsed >= target) {
      completed = true;
      stopInterval();
      activeTimers.delete(timerObject);
      playBeep(990, 250);
      onComplete && onComplete();
    }
  }

  const timerObject = {
    start() {
      if (completed) return;
      if (intervalId !== null) {
        sync();
        return;
      }
      activeTimers.add(timerObject);
      paused = false;
      deadline = Date.now() - elapsed * 1000;
      onTick && onTick(elapsed);
      intervalId = setInterval(sync, 250);
    },
    cancel() {
      stopInterval();
      paused = true;
      activeTimers.delete(timerObject);
    },
    pause() {
      if (completed || paused) return elapsed;
      sync();
      stopInterval();
      paused = true;
      activeTimers.delete(timerObject);
      return elapsed;
    },
    resume() {
      if (completed) return;
      if (intervalId !== null) stopInterval();
      activeTimers.add(timerObject);
      paused = false;
      deadline = Date.now() - elapsed * 1000;
      onTick && onTick(elapsed);
      intervalId = setInterval(sync, 250);
    },
    sync,
    getElapsed() {
      if (!paused && !completed) sync();
      return elapsed;
    },
    getState() {
      return { elapsed, target, deadline, paused, completed };
    },
    isCompleted() {
      return completed;
    },
  };
  return timerObject;
}

function speak(text) {
  try {
    if (!getSettings().voice || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    /* synthèse vocale indisponible, ignore */
  }
}

let wakeLock = null;
let wakeLockWanted = false;
let wakeLockRequestId = 0;
const activeTimers = new Set();

function registerTimer(timer) {
  activeTimers.add(timer);
  return timer;
}

function unregisterTimer(timer) {
  activeTimers.delete(timer);
}

async function acquireWakeLock() {
  wakeLockWanted = true;
  const requestId = ++wakeLockRequestId;
  try {
    if (!navigator || !('wakeLock' in navigator)) return false;
    const lock = await navigator.wakeLock.request('screen');
    if (!wakeLockWanted || requestId !== wakeLockRequestId) {
      if (lock && typeof lock.release === 'function') lock.release();
      return false;
    }
    wakeLock = lock;
    if (lock && typeof lock.addEventListener === 'function') {
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function releaseWakeLock() {
  wakeLockWanted = false;
  wakeLockRequestId++;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// Le verrou est libéré automatiquement quand l'onglet passe en arrière-plan : on le reprend au retour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    activeTimers.forEach((timer) => {
      if (typeof timer.sync === 'function') timer.sync();
    });
    if (wakeLockWanted) acquireWakeLock();
  }
});
