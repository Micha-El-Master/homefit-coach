function guardProfile() {
  const page = location.pathname.split('/').pop();
  if (page === 'index.html' || page === '') return;
  if (!hasProfile()) {
    location.href = 'index.html';
  }
}

const NAV_ITEMS = [
  { href: 'dashboard.html', icon: '🏠', label: 'Accueil' },
  { href: 'workout.html', icon: '🏋️', label: 'Séance' },
  { href: 'nutrition.html', icon: '🥗', label: 'Nutrition' },
  { href: 'kegel.html', icon: '🧘', label: 'Kegel' },
  { href: 'progress.html', icon: '📈', label: 'Progrès' },
];

function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  nav.innerHTML = `<div class="nav-inner">${NAV_ITEMS.map(
    (i) => `<a href="${i.href}" data-nav-link><span class="nav-icon" aria-hidden="true">${i.icon}</span>${i.label}</a>`
  ).join('')}</div>`;
}

function resolveTheme(setting) {
  if (setting === 'dark' || setting === 'light') return setting;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const settings = getSettings();
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(settings.theme));
  root.style.zoom = settings.fontScale && settings.fontScale !== 1 ? String(settings.fontScale) : '';
  if (settings.reduceMotion) root.setAttribute('data-reduce-motion', '');
  else root.removeAttribute('data-reduce-motion');
}

function toggleTheme() {
  const settings = getSettings();
  settings.theme = resolveTheme(settings.theme) === 'dark' ? 'light' : 'dark';
  saveSettings(settings);
  applyTheme();
}

// En mode « automatique », on suit le réglage clair/sombre du système en direct.
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSettings().theme === 'auto') applyTheme();
  });
}

function initThemeToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  btn.addEventListener('click', toggleTheme);
}

function highlightNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const target = link.getAttribute('href');
    link.classList.toggle('active', target === page);
    if (target === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function checkDailyReminder() {
  if (!hasProfile()) return;
  const settings = getSettings();
  if (!settings.reminderEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today = todayISO();
  if (settings.lastReminderDate === today) return;

  const now = new Date();
  const [h, m] = (settings.reminderTime || '08:00').split(':').map(Number);
  const reminderMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < reminderMinutes) return;

  // Rappel seulement les jours d'entraînement du plan (y compris un jour de rattrapage) sans séance faite.
  const todayPlan = getWeekPlan().days.find((d) => d.isToday);
  if (!todayPlan || todayPlan.type !== 'training' || todayPlan.done) return;

  new Notification('HomeFit Coach', {
    body: todayPlan.rescue
      ? "Jour de rattrapage : fais ta séance d'aujourd'hui pour garder ta série 🔥"
      : "N'oublie pas ta séance d'aujourd'hui 💪",
    icon: 'icons/icon-192.png',
  });
  settings.lastReminderDate = today;
  saveSettings(settings);
}

const APP_VERSION = '2.0';

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

// Demande au navigateur de ne pas effacer les données de l'appli en cas de manque de place ou d'inactivité.
async function ensurePersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (e) {
    return false;
  }
}

// Invite d'installation (Chrome/Android) : on la garde pour la proposer au bon moment.
let installPromptEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  document.dispatchEvent(new Event('install-available'));
});

async function promptInstall() {
  if (!installPromptEvent) return false;
  installPromptEvent.prompt();
  const { outcome } = await installPromptEvent.userChoice;
  installPromptEvent = null;
  return outcome === 'accepted';
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function levelLabel(level) {
  return { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' }[level] || level;
}

function goalLabel(goal) {
  return {
    muscle: 'Prendre du muscle',
    perte: 'Perdre du poids',
    forme: 'Améliorer ma condition physique',
  }[goal] || goal;
}

applyTheme();

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  renderBottomNav();
  guardProfile();
  highlightNav();
  initThemeToggle();
  registerServiceWorker();
  checkDailyReminder();
  if (hasProfile()) ensurePersistentStorage();
});
