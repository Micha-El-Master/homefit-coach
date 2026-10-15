const TOTAL_WEEKS = 12;

const STORAGE_KEYS = {
  PROFILE: 'hfc_profile',
  SESSIONS: 'hfc_sessions',
  KEGEL: 'hfc_kegel_sessions',
  SETTINGS: 'hfc_settings',
  ADJUST: 'hfc_adjust',
  WATER: 'hfc_water',
  SHOPPING: 'hfc_shopping',
  IN_PROGRESS: 'hfc_inprogress',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getProfile() {
  const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
  return raw ? JSON.parse(raw) : null;
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
}

function hasProfile() {
  return !!getProfile();
}

function getSessionLog() {
  const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
  return raw ? JSON.parse(raw) : [];
}

function addSessionLog(entry) {
  const log = getSessionLog();
  log.push(entry);
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(log));
}

function getKegelLog() {
  const raw = localStorage.getItem(STORAGE_KEYS.KEGEL);
  return raw ? JSON.parse(raw) : [];
}

function addKegelLog(entry) {
  const log = getKegelLog();
  log.push(entry);
  localStorage.setItem(STORAGE_KEYS.KEGEL, JSON.stringify(log));
}

// Jours d'entraînement par défaut selon l'ancien objectif (0 = dimanche … 6 = samedi).
const DEFAULT_TRAINING_DAYS = [1, 2, 4, 5];
const DAYS_BY_TARGET = { 1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] };

function getSettings() {
  const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  const defaults = {
    theme: 'light',
    reminderEnabled: false,
    reminderTime: '08:00',
    lastReminderDate: null,
    restSeconds: 45,
    trainingDays: DEFAULT_TRAINING_DAYS,
    voice: false,
    warmup: true,
    cooldown: true,
  };
  const saved = raw ? JSON.parse(raw) : {};
  const merged = { ...defaults, ...saved };
  // Migration : ancien réglage « nombre de séances par semaine » → jours équivalents.
  if (!saved.trainingDays && saved.weeklyTarget) {
    merged.trainingDays = DAYS_BY_TARGET[saved.weeklyTarget] || DEFAULT_TRAINING_DAYS;
  }
  return merged;
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function getTrainingDays() {
  const days = getSettings().trainingDays;
  return Array.isArray(days) && days.length ? days : DEFAULT_TRAINING_DAYS;
}

// L'objectif hebdomadaire est simplement le nombre de jours d'entraînement choisis.
function getWeeklyTarget() {
  return getTrainingDays().length;
}

function getTotalProgramSessions() {
  return getWeeklyTarget() * TOTAL_WEEKS;
}

function getAdjustments() {
  return readJSON(STORAGE_KEYS.ADJUST, {});
}

// Écart de répétitions (ou de secondes) mémorisé par exercice via « trop dur / trop facile ».
function changeAdjustment(exerciseId, delta) {
  const adj = getAdjustments();
  adj[exerciseId] = (adj[exerciseId] || 0) + delta;
  writeJSON(STORAGE_KEYS.ADJUST, adj);
  return adj[exerciseId];
}

function setLastSessionFeeling(feeling) {
  const log = getSessionLog();
  if (!log.length) return;
  log[log.length - 1].feeling = feeling;
  writeJSON(STORAGE_KEYS.SESSIONS, log);
}

// 'dur' ou 'facile' si les deux dernières séances ont reçu le même ressenti, sinon null.
function getFeelingTrend() {
  const last = getSessionLog().slice(-2);
  if (last.length < 2) return null;
  if (last.every((s) => s.feeling === 'dur')) return 'dur';
  if (last.every((s) => s.feeling === 'facile')) return 'facile';
  return null;
}

function getInProgress() {
  return readJSON(STORAGE_KEYS.IN_PROGRESS, null);
}

function saveInProgress(state) {
  writeJSON(STORAGE_KEYS.IN_PROGRESS, state);
}

function clearInProgress() {
  localStorage.removeItem(STORAGE_KEYS.IN_PROGRESS);
}

function getWaterToday() {
  const water = readJSON(STORAGE_KEYS.WATER, {});
  return water[todayISO()] || 0;
}

function addWater(ml) {
  const water = readJSON(STORAGE_KEYS.WATER, {});
  const today = todayISO();
  water[today] = Math.max(0, (water[today] || 0) + ml);
  writeJSON(STORAGE_KEYS.WATER, water);
  return water[today];
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function getProgramProgress() {
  const profile = getProfile();
  if (!profile) return null;
  const dayNumber = Math.max(1, daysBetween(profile.startDate, todayISO()) + 1);
  const week = Math.min(TOTAL_WEEKS, Math.ceil(dayNumber / 7));
  const sessions = getSessionLog();
  const sessionsCompleted = sessions.length;
  const percent = Math.min(100, Math.round((sessionsCompleted / getTotalProgramSessions()) * 100));
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalCalories = sessions.reduce((sum, s) => sum + (s.calories || 0), 0);
  return {
    dayNumber: Math.min(dayNumber, TOTAL_WEEKS * 7),
    week,
    totalWeeks: TOTAL_WEEKS,
    sessionsCompleted,
    totalProgramSessions: getTotalProgramSessions(),
    percent,
    totalMinutes,
    totalCalories,
  };
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// Plan de la semaine (lun-dim) : jours d'entraînement choisis, + rattrapage.
// Un jour d'entraînement passé sans séance « crée une dette » : le premier jour de repos suivant
// de la même semaine devient un jour d'entraînement (rescue) pour garder la série.
// Une séance faite un jour de repos non converti compte comme avance et annule une dette future.
function getWeekPlan(now = new Date()) {
  const monday = mondayOf(now);
  const planned = new Set(getTrainingDays());
  const sessionDates = new Set(getSessionLog().map((s) => s.date));
  const todayIso = isoOf(now);
  let debt = 0;
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoOf(d);
    const isPast = iso < todayIso;
    const done = sessionDates.has(iso);
    let type = planned.has(d.getDay()) ? 'training' : 'rest';
    let rescue = false;

    if (type === 'rest' && debt > 0) {
      type = 'training';
      rescue = true;
      debt--;
    }
    const missed = type === 'training' && isPast && !done;
    if (missed) debt++;
    else if (type === 'rest' && done) debt--;

    days.push({ iso, weekday: d.getDay(), type, rescue, done, missed, isPast, isToday: iso === todayIso });
  }
  return { days, shortfall: Math.max(0, debt) };
}

// Série = semaines consécutives (lun-dim) avec au moins l'objectif hebdomadaire de séances, quels que soient les jours.
// La semaine en cours ne casse jamais la série tant qu'elle n'est pas terminée.
function getStreak() {
  const profile = getProfile();
  if (!profile) return 0;
  const sessions = getSessionLog();
  const startMonday = mondayOf(new Date(profile.startDate + 'T00:00:00'));
  const currentMonday = mondayOf(new Date());
  let streak = 0;

  for (let monday = new Date(currentMonday); monday >= startMonday; monday.setDate(monday.getDate() - 7)) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const from = isoOf(monday);
    const to = isoOf(sunday);
    const count = sessions.filter((s) => s.date >= from && s.date <= to).length;

    const weeklyTarget = getWeeklyTarget();
    let target = weeklyTarget;
    if (monday.getTime() === startMonday.getTime()) {
      const daysLeft = 7 - daysBetween(from, profile.startDate);
      target = Math.min(weeklyTarget, daysLeft);
    }

    if (count >= target) {
      streak++;
    } else if (monday.getTime() !== currentMonday.getTime()) {
      break;
    }
  }
  return streak;
}

function exportData() {
  const data = {
    app: 'HomeFit Coach',
    exportedAt: new Date().toISOString(),
    profile: getProfile(),
    sessions: getSessionLog(),
    kegel: getKegelLog(),
    settings: getSettings(),
    adjustments: getAdjustments(),
    water: readJSON(STORAGE_KEYS.WATER, {}),
    shopping: readJSON(STORAGE_KEYS.SHOPPING, []),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `homefit-coach-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(jsonString) {
  const data = JSON.parse(jsonString);
  if (data.profile) saveProfile(data.profile);
  if (data.sessions) localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(data.sessions));
  if (data.kegel) localStorage.setItem(STORAGE_KEYS.KEGEL, JSON.stringify(data.kegel));
  if (data.settings) saveSettings(data.settings);
  if (data.adjustments) writeJSON(STORAGE_KEYS.ADJUST, data.adjustments);
  if (data.water) writeJSON(STORAGE_KEYS.WATER, data.water);
  if (data.shopping) writeJSON(STORAGE_KEYS.SHOPPING, data.shopping);
}

function getWeekStats() {
  const sessions = getSessionLog();
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = (now.getDay() + 6) % 7;
  startOfWeek.setDate(now.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  const thisWeek = sessions.filter((s) => new Date(s.date + 'T00:00:00') >= startOfWeek);
  const repsByExercise = {};
  let totalMinutes = 0;
  thisWeek.forEach((s) => {
    totalMinutes += s.duration || 0;
    (s.exercises || []).forEach((ex) => {
      repsByExercise[ex.id] = (repsByExercise[ex.id] || 0) + (ex.totalReps || 0);
    });
  });

  return {
    sessionsThisWeek: thisWeek.length,
    targetSessionsPerWeek: getWeeklyTarget(),
    totalMinutes,
    repsByExercise,
  };
}
