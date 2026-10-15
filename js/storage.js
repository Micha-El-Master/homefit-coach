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
  RECOVERY: 'hfc_recovery',
  CHALLENGES: 'hfc_challenges',
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
    theme: 'auto',
    fontScale: 1,
    reduceMotion: false,
    reminderEnabled: false,
    reminderTime: '08:00',
    lastReminderDate: null,
    restSeconds: 45,
    trainingDays: DEFAULT_TRAINING_DAYS,
    equipment: ['chaise', 'charges'],
    diet: 'omnivore',
    lastBackupAt: null,
    backupSnoozeUntil: null,
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

function getRecoveryLog() {
  return readJSON(STORAGE_KEYS.RECOVERY, []);
}

function addRecoveryLog(entry) {
  const log = getRecoveryLog();
  log.push(entry);
  writeJSON(STORAGE_KEYS.RECOVERY, log);
}

function getChallengeData() {
  const data = readJSON(STORAGE_KEYS.CHALLENGES, null);
  return { active: (data && data.active) || {}, history: (data && data.history) || [] };
}

function saveChallengeData(data) {
  writeJSON(STORAGE_KEYS.CHALLENGES, data);
}

function getCompletedChallengeCount() {
  return getChallengeData().history.filter((h) => h.success).length;
}

// Objectif d'eau quotidien : 35 ml par kg si le poids est connu, sinon 2 litres.
function getWaterGoalMl() {
  const profile = getProfile();
  return profile && profile.body ? Math.round((profile.body.weight * 35) / 50) * 50 : 2000;
}

function getWaterOn(iso) {
  return readJSON(STORAGE_KEYS.WATER, {})[iso] || 0;
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

// Un « cycle » = 12 semaines à partir de profile.startDate. Après le cycle, on peut enchaîner (phase 2, entretien, recommencer)
// via startNextCycle() : startDate repart d'aujourd'hui, la série hebdomadaire reste calculée depuis streakStart.
function getProgramProgress() {
  const profile = getProfile();
  if (!profile) return null;
  const rawDay = Math.max(1, daysBetween(profile.startDate, todayISO()) + 1);
  const week = Math.min(TOTAL_WEEKS, Math.ceil(rawDay / 7));
  const allSessions = getSessionLog();
  const cycleSessions = allSessions.filter((s) => s.date >= profile.startDate);
  const sessionsCompleted = cycleSessions.length;
  const total = getTotalProgramSessions();
  const percent = Math.min(100, Math.round((sessionsCompleted / total) * 100));
  const totalMinutes = allSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalCalories = allSessions.reduce((sum, s) => sum + (s.calories || 0), 0);
  return {
    dayNumber: Math.min(rawDay, TOTAL_WEEKS * 7),
    week,
    totalWeeks: TOTAL_WEEKS,
    sessionsCompleted,
    totalProgramSessions: total,
    percent,
    totalMinutes,
    totalCalories,
    cycle: profile.cycle || 1,
    mode: profile.mode || 'standard',
    finished: rawDay > TOTAL_WEEKS * 7 || sessionsCompleted >= total,
  };
}

function startNextCycle(mode) {
  const profile = getProfile();
  profile.streakStart = profile.streakStart || profile.startDate;
  profile.startDate = todayISO();
  profile.cycle = (profile.cycle || 1) + 1;
  profile.mode = mode;
  saveProfile(profile);
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
  const profile = getProfile();
  const startIso = profile ? profile.streakStart || profile.startDate : '0000-00-00';
  let debt = 0;
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = isoOf(d);
    const isPast = iso < todayIso;
    const done = sessionDates.has(iso);

    // Avant le début du programme : ni séance attendue, ni retard, ni rattrapage.
    if (iso < startIso) {
      days.push({ iso, weekday: d.getDay(), type: 'rest', rescue: false, done, missed: false, isPast, isToday: false, beforeStart: true });
      continue;
    }
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
  const streakStart = profile.streakStart || profile.startDate;
  const startMonday = mondayOf(new Date(streakStart + 'T00:00:00'));
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
      const daysLeft = 7 - daysBetween(from, streakStart);
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

function collectExportData() {
  return {
    app: 'HomeFit Coach',
    exportedAt: new Date().toISOString(),
    profile: getProfile(),
    sessions: getSessionLog(),
    kegel: getKegelLog(),
    settings: getSettings(),
    adjustments: getAdjustments(),
    water: readJSON(STORAGE_KEYS.WATER, {}),
    shopping: readJSON(STORAGE_KEYS.SHOPPING, []),
    recovery: getRecoveryLog(),
    challenges: getChallengeData(),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function markBackup() {
  saveSettings({ ...getSettings(), lastBackupAt: new Date().toISOString(), backupSnoozeUntil: null });
}

// Jours écoulés depuis la dernière sauvegarde (null si jamais).
function daysSinceBackup(now = new Date()) {
  const at = getSettings().lastBackupAt;
  return at ? Math.floor((now.getTime() - new Date(at).getTime()) / 86400000) : null;
}

// Rappel de sauvegarde : au moins 3 séances à perdre, aucune sauvegarde depuis 7 jours, et pas de report en cours.
function shouldRemindBackup(now = new Date()) {
  if (getSessionLog().length < 3) return false;
  const snooze = getSettings().backupSnoozeUntil;
  if (snooze && new Date(snooze).getTime() > now.getTime()) return false;
  const days = daysSinceBackup(now);
  return days === null || days >= 7;
}

function snoozeBackupReminder(days = 3) {
  saveSettings({ ...getSettings(), backupSnoozeUntil: new Date(Date.now() + days * 86400000).toISOString() });
}

function exportData() {
  const blob = new Blob([JSON.stringify(collectExportData(), null, 2)], { type: 'application/json' });
  downloadBlob(blob, `homefit-coach-${todayISO()}.json`);
  markBackup();
}

// Partage natif (AirDrop, messages…) du fichier de sauvegarde, quand le navigateur le permet.
async function shareDataFile() {
  const file = new File([JSON.stringify(collectExportData(), null, 2)], `homefit-coach-${todayISO()}.json`, {
    type: 'application/json',
  });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title: 'Sauvegarde HomeFit Coach' });
  markBackup();
  return true;
}

// Vérifie la forme des données avant de toucher au stockage, pour ne pas écraser un profil sain par un fichier invalide.
function validateImportData(data) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(data) || data.app !== 'HomeFit Coach') throw new Error('Fichier invalide');
  if (!isObj(data.profile) || !data.profile.name || !data.profile.startDate) throw new Error('Profil manquant');
  if (data.sessions !== undefined && !Array.isArray(data.sessions)) throw new Error('Séances invalides');
  if (data.kegel !== undefined && !Array.isArray(data.kegel)) throw new Error('Historique Kegel invalide');
  if (data.settings !== undefined && !isObj(data.settings)) throw new Error('Réglages invalides');
}

function importData(jsonString) {
  const data = JSON.parse(jsonString);
  validateImportData(data);
  saveProfile(data.profile);
  writeJSON(STORAGE_KEYS.SESSIONS, data.sessions || []);
  writeJSON(STORAGE_KEYS.KEGEL, data.kegel || []);
  if (data.settings) saveSettings(data.settings);
  writeJSON(STORAGE_KEYS.ADJUST, data.adjustments || {});
  writeJSON(STORAGE_KEYS.WATER, data.water || {});
  writeJSON(STORAGE_KEYS.SHOPPING, data.shopping || []);
  writeJSON(STORAGE_KEYS.RECOVERY, data.recovery || []);
  if (data.challenges) writeJSON(STORAGE_KEYS.CHALLENGES, data.challenges);
  else localStorage.removeItem(STORAGE_KEYS.CHALLENGES);
  clearInProgress();
}

// Efface toutes les données de l'application (clés hfc_*) sur cet appareil.
function eraseAllData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k) => k && k.startsWith('hfc_')).forEach((k) => localStorage.removeItem(k));
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function streamToBytes(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Code de transfert : sauvegarde JSON compressée (gzip) puis encodée en texte, à copier d'un appareil à l'autre.
async function buildTransferCode() {
  const bytes = new TextEncoder().encode(JSON.stringify(collectExportData()));
  if (typeof CompressionStream === 'undefined') return 'HFC0:' + bytesToBase64(bytes);
  const gz = await streamToBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
  return 'HFC1:' + bytesToBase64(gz);
}

async function readTransferCode(code) {
  const text = code.trim();
  const prefix = text.slice(0, 5);
  let bytes;
  try {
    bytes = base64ToBytes(text.slice(5).replace(/\s+/g, ''));
  } catch (e) {
    throw new Error('Code invalide');
  }
  if (prefix === 'HFC1:') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas lire ce code');
    bytes = await streamToBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  } else if (prefix !== 'HFC0:') {
    throw new Error('Code invalide');
  }
  return new TextDecoder().decode(bytes);
}

// Agenda (.ics) : un événement hebdomadaire récurrent sur les jours d'entraînement choisis, à l'heure du rappel.
function buildICS(now = new Date()) {
  const days = getTrainingDays();
  const [h, m] = (getSettings().reminderTime || '08:00').split(':').map(Number);
  const codes = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' };
  const pad = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  let first = null;
  for (let i = 0; i < 8 && !first; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (days.includes(d.getDay()) && d >= now) first = d;
  }
  const end = new Date(first.getTime() + 45 * 60000);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HomeFit Coach//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:homefit-${now.getTime()}@homefit-coach`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${local(first)}`,
    `DTEND:${local(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => codes[d]).join(',')};COUNT=${days.length * TOTAL_WEEKS}`,
    'SUMMARY:Séance HomeFit Coach',
    'DESCRIPTION:Ouvre HomeFit Coach pour lancer ta séance du jour.',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Séance HomeFit Coach dans 10 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function downloadICS() {
  downloadBlob(new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' }), 'homefit-coach-agenda.ics');
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
