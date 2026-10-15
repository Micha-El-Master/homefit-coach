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
  let remaining = seconds;
  let intervalId = null;

  function tick() {
    remaining -= 1;
    onTick && onTick(remaining);
    if (remaining <= 3 && remaining > 0) playBeep(660, 100);
    if (remaining <= 0) {
      clearInterval(intervalId);
      playBeep(990, 250);
      onComplete && onComplete();
    }
  }

  return {
    start() {
      onTick && onTick(remaining);
      intervalId = setInterval(tick, 1000);
    },
    cancel() {
      clearInterval(intervalId);
    },
  };
}

function createCountUp(targetSeconds, { onTick, onComplete }) {
  let elapsed = 0;
  let intervalId = null;

  return {
    start() {
      onTick && onTick(elapsed);
      intervalId = setInterval(() => {
        elapsed += 1;
        onTick && onTick(elapsed);
        if (elapsed >= targetSeconds) {
          clearInterval(intervalId);
          playBeep(990, 250);
          onComplete && onComplete();
        }
      }, 1000);
    },
    cancel() {
      clearInterval(intervalId);
    },
  };
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

async function acquireWakeLock() {
  wakeLockWanted = true;
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    /* refusé ou non supporté, ignore */
  }
}

function releaseWakeLock() {
  wakeLockWanted = false;
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// Le verrou est libéré automatiquement quand l'onglet passe en arrière-plan : on le reprend au retour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLockWanted) acquireWakeLock();
});
