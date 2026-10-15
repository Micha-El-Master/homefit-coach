function guardProfile() {
  const page = location.pathname.split('/').pop();
  if (page === 'index.html' || page === '') return;
  if (!hasProfile()) {
    location.href = 'index.html';
  }
}

function applyTheme() {
  const settings = getSettings();
  document.documentElement.setAttribute('data-theme', settings.theme);
}

function toggleTheme() {
  const settings = getSettings();
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings(settings);
  applyTheme();
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

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  guardProfile();
  highlightNav();
  initThemeToggle();
  registerServiceWorker();
  checkDailyReminder();
});
