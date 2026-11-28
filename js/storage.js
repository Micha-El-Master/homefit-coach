const TOTAL_WEEKS = 12;
const DATA_SCHEMA_VERSION = 1;
const LOCAL_BACKUP_KEY = 'hfc_backup_snapshot';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_SESSIONS = 10000;
const MAX_IMPORT_KEGEL = 10000;

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
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return localStorage.getItem(key) === serialized;
  } catch (e) {
    return false;
  }
}

function getProfile() {
  const profile = readJSON(STORAGE_KEYS.PROFILE, null);
  return isPlainObject(profile) ? profile : null;
}

function saveProfile(profile) {
  return writeJSON(STORAGE_KEYS.PROFILE, profile);
}

function hasProfile() {
  return !!getProfile();
}

// ───────────── Accusé de compréhension avant la première séance ─────────────
// Demandé lorsque le questionnaire de sécurité n'est pas renseigné (« unanswered ») ou a été refusé (facette `declined`).
// Ce n'est ni une autorisation médicale, ni une dispense de responsabilité, ni une garantie de sécurité.
// Les textes (SAFETY_ACK_TEXT, SAFETY_ACK_BUTTON_LABEL) et la décision (requiresAcknowledgement) viennent de safety-policy.js ;
// l'interface (fenêtre de confirmation) est dans safety-ui.js.

function needsSafetyAcknowledgement(profile = getProfile()) {
  return evaluateSafetyPolicy(profile, { action: 'view' }).requiresAcknowledgement;
}

// Enregistre « j'ai compris » (date du jour). Sans effet pour les états « none » et « declared ».
function acknowledgeSafetyNotice(todayIso = todayISO()) {
  const profile = getProfile();
  if (!profile) return false;
  const state = deriveSafetyState(profile);
  if (state.status !== 'unanswered' && !state.declined) return true;
  profile.safety = buildSafetyRecord({ ...state, acknowledgedAt: todayIso });
  return saveProfile(profile);
}

function getSessionLog() {
  const log = readJSON(STORAGE_KEYS.SESSIONS, []);
  return Array.isArray(log) ? log : [];
}

function addSessionLog(entry) {
  const log = getSessionLog();
  log.push(entry);
  writeJSON(STORAGE_KEYS.SESSIONS, log);
}

function getKegelLog() {
  const log = readJSON(STORAGE_KEYS.KEGEL, []);
  return Array.isArray(log) ? log : [];
}

function addKegelLog(entry) {
  const log = getKegelLog();
  log.push(entry);
  writeJSON(STORAGE_KEYS.KEGEL, log);
}

// Jours d'entraînement par défaut selon l'ancien objectif (0 = dimanche … 6 = samedi).
const DEFAULT_TRAINING_DAYS = [1, 2, 4, 5];
const DAYS_BY_TARGET = { 1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] };

function getSettings() {
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
    dismissedAnnouncements: [],
    fasts: [],
    voice: false,
    warmup: true,
    cooldown: true,
  };
  const savedRaw = readJSON(STORAGE_KEYS.SETTINGS, {});
  const saved = isPlainObject(savedRaw) ? savedRaw : {};
  const merged = { ...defaults, ...saved };
  // Migration : ancien réglage « nombre de séances par semaine » → jours équivalents.
  if (!saved.trainingDays && saved.weeklyTarget) {
    merged.trainingDays = DAYS_BY_TARGET[saved.weeklyTarget] || DEFAULT_TRAINING_DAYS;
  }
  return merged;
}

function saveSettings(settings) {
  return writeJSON(STORAGE_KEYS.SETTINGS, settings);
}

function getTrainingDays() {
  const days = getSettings().trainingDays;
  return Array.isArray(days) && days.length ? days : DEFAULT_TRAINING_DAYS;
}

// L'objectif hebdomadaire est simplement le nombre de jours d'entraînement choisis.
function getWeeklyTarget() {
  return getTrainingDays().length;
}

// Jeûne communautaire : liste de { start: 'AAAA-MM-JJ', days: 1 à 14 } choisie par l'utilisateur (réglages).
// Pendant le jeûne : séances remplacées par de la récupération douce ; ensuite reprise progressive.
// La reprise dure environ la moitié du jeûne (au moins 2 jours) : 60 % du volume, puis +10 % par jour jusqu'à 90 %.
const FAST_REFEED_START = 0.6;
const FAST_REFEED_STEP = 0.1;
const FAST_REFEED_CAP = 0.9;

function fastRefeedDays(fastDays) {
  return Math.max(2, Math.ceil(fastDays / 2));
}

function fastRefeedFactor(index) {
  return Math.round(Math.min(FAST_REFEED_CAP, FAST_REFEED_START + FAST_REFEED_STEP * index) * 100) / 100;
}
const FAST_MAX_DAYS = 14;

function sanitizeFasts(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .filter((f) => f && isIsoDate(f.start) && Number.isInteger(f.days) && f.days >= 1 && f.days <= FAST_MAX_DAYS && !seen.has(f.start) && seen.add(f.start))
    .map((f) => ({ start: f.start, days: f.days }))
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(-24);
}

function getFasts() {
  return sanitizeFasts(getSettings().fasts);
}

function addFast(start, days = 3) {
  const fasts = sanitizeFasts([...getFasts().filter((f) => f.start !== start), { start, days }]);
  saveSettings({ ...getSettings(), fasts });
  return fasts;
}

function removeFast(start) {
  saveSettings({ ...getSettings(), fasts: getFasts().filter((f) => f.start !== start) });
}

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Phase d'un jour par rapport aux jeûnes : 'prep' (veille), 'fast' (jour n sur N), 'refeed' (reprise, jour 1 ou 2), sinon null.
function fastPhaseOn(iso, fasts = getFasts()) {
  for (const f of fasts) {
    const offset = daysBetween(f.start, iso);
    if (offset === -1) return { phase: 'prep', fast: f, day: 0, days: f.days, factor: 1 };
    if (offset >= 0 && offset < f.days) return { phase: 'fast', fast: f, day: offset + 1, days: f.days, factor: 0 };
    const after = offset - f.days;
    if (after >= 0 && after < fastRefeedDays(f.days)) return { phase: 'refeed', fast: f, day: after + 1, days: f.days, refeedDays: fastRefeedDays(f.days), factor: fastRefeedFactor(after) };
  }
  return null;
}

// Prochain jeûne (en cours ou à venir) à partir d'aujourd'hui.
function getUpcomingFast(todayIso = todayISO(), fasts = getFasts()) {
  return fasts.find((f) => addDaysISO(f.start, f.days - 1) >= todayIso) || null;
}

// Objectif de séances d'une semaine (lun-dim) : les séances prévues un jour de jeûne sont dispensées.
function getWeekTarget(mondayIso) {
  const planned = getTrainingDays();
  let excused = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDaysISO(mondayIso, i);
    const weekday = new Date(iso + 'T12:00:00').getDay();
    const phase = fastPhaseOn(iso);
    if (planned.includes(weekday) && phase && phase.phase === 'fast') excused++;
  }
  return Math.max(0, getWeeklyTarget() - excused);
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
  // Politique de sécurité : une hausse n'est jamais mémorisée si elle est interdite (les baisses restent toujours possibles).
  if (delta > 0 && typeof evaluateSafetyPolicy === 'function' && !evaluateSafetyPolicy(getProfile(), { action: 'adjust-up' }).allowed) {
    return adj[exerciseId] || 0;
  }
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

// Vrai seulement pour une date AAAA-MM-JJ qui existe (refuse 2026-02-31, que Date.parse accepte).
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// « lundi 2 novembre »
function formatDateFr(iso, withWeekday = true) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    ...(withWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'long',
  });
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
  const offset = daysBetween(profile.startDate, todayISO());
  const rawDay = Math.max(1, offset + 1);
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
    // Programme qui démarre plus tard (cohorte à venir) : nombre de jours avant le départ.
    notStarted: offset < 0,
    startsInDays: offset < 0 ? -offset : 0,
  };
}

// Rejoindre une cohorte : le programme démarre à la date de la cohorte (ou aujourd'hui si elle a déjà commencé,
// pour ne pas pénaliser un arrivant en retard). La série hebdomadaire d'origine est conservée.
function joinCohort(dateIso, todayIso = todayISO()) {
  const profile = getProfile();
  profile.streakStart = profile.streakStart || profile.startDate;
  profile.startDate = dateIso >= todayIso ? dateIso : todayIso;
  profile.cycle = (profile.cycle || 1) + 1;
  profile.mode = 'standard';
  profile.cohort = dateIso;
  saveProfile(profile);
}

function startNextCycle(mode) {
  if (typeof evaluateSafetyPolicy === 'function' && !evaluateSafetyPolicy(getProfile(), { action: 'start-cycle', mode }).allowed) {
    throw new Error('Ce programme n’est pas disponible avec tes précautions actuelles.');
  }
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
    // Jour de jeûne : ni séance attendue ni retard (la semaine est dispensée de ces séances).
    const fastPhase = fastPhaseOn(iso);
    if (fastPhase && fastPhase.phase === 'fast') {
      days.push({ iso, weekday: d.getDay(), type: 'fast', fastDay: fastPhase.day, fastDays: fastPhase.days, rescue: false, done, missed: false, isPast, isToday: iso === todayIso });
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

    const weeklyTarget = getWeekTarget(from);
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
    schemaVersion: DATA_SCHEMA_VERSION,
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return value.length;
}

function migrateImportData(data) {
  if (!isPlainObject(data)) throw new Error('Fichier invalide');
  if (data.app !== 'HomeFit Coach') throw new Error('Fichier invalide');
  if (data.schemaVersion !== undefined && data.schemaVersion !== DATA_SCHEMA_VERSION) {
    throw new Error('Version de sauvegarde inconnue');
  }
  const migrated = { ...data, schemaVersion: DATA_SCHEMA_VERSION };
  if (migrated.sessions === undefined) migrated.sessions = [];
  if (migrated.kegel === undefined) migrated.kegel = [];
  if (migrated.adjustments === undefined) migrated.adjustments = {};
  if (migrated.water === undefined) migrated.water = {};
  if (migrated.shopping === undefined) migrated.shopping = [];
  if (migrated.recovery === undefined) migrated.recovery = [];
  return migrated;
}

function validateIsoDateOptional(value) {
  return value === undefined || (typeof value === 'string' && isIsoDate(value));
}

// Vérifie la forme des données avant de toucher au stockage, pour ne pas écraser un profil sain par un fichier invalide.
function validateImportData(data) {
  const migrated = migrateImportData(data);
  if (!isPlainObject(migrated.profile) || typeof migrated.profile.name !== 'string'
      || !migrated.profile.name.trim() || migrated.profile.name.length > 100
      || typeof migrated.profile.startDate !== 'string' || !isIsoDate(migrated.profile.startDate)) {
    throw new Error('Profil invalide');
  }
  if (migrated.profile.goal !== undefined && !['muscle', 'perte', 'forme', 'discipline'].includes(migrated.profile.goal)) {
    throw new Error('Objectif invalide');
  }
  if (migrated.profile.level !== undefined
      && !['debutant', 'intermediaire', 'avance'].includes(migrated.profile.level)
      && typeof migrated.profile.level !== 'number') {
    throw new Error('Niveau invalide');
  }
  if (migrated.profile.levelScore !== undefined
      && (!Number.isFinite(migrated.profile.levelScore) || migrated.profile.levelScore < 1 || migrated.profile.levelScore > 10)) {
    throw new Error('Score de niveau invalide');
  }
  if (migrated.profile.safety !== undefined) {
    const safety = migrated.profile.safety;
    const allowed = ['knees', 'back', 'shoulders', 'balance', 'mobility', 'professional_advice', 'chest_symptoms'];
    // Sous-lot 0b-1 : `status` (unanswered | declined | none | declared), `chestContext`, `chestSymptoms`, `answeredAt`
    // et `acknowledgedAt` sont facultatifs : les anciennes sauvegardes (sans ces champs) restent valides.
    const optionalDate = (value) => value === undefined || value === null || (typeof value === 'string' && isIsoDate(value));
    if (!isPlainObject(safety)
        || (safety.responded !== undefined && typeof safety.responded !== 'boolean')
        || (safety.preferNot !== undefined && typeof safety.preferNot !== 'boolean')
        || (safety.returnAfterPause !== undefined && typeof safety.returnAfterPause !== 'boolean')
        || (safety.professionalAdvice !== undefined && typeof safety.professionalAdvice !== 'boolean')
        || (safety.chestSymptoms !== undefined && typeof safety.chestSymptoms !== 'boolean')
        || (safety.declined !== undefined && typeof safety.declined !== 'boolean')
        || (safety.status !== undefined && !['unanswered', 'declined', 'none', 'declared'].includes(safety.status))
        || (safety.chestContext !== undefined && !['unspecified', 'new_or_unexplained', 'evaluated'].includes(safety.chestContext))
        || !optionalDate(safety.answeredAt)
        || !optionalDate(safety.acknowledgedAt)
        || (safety.limitations !== undefined && (!Array.isArray(safety.limitations)
          || safety.limitations.some((id) => typeof id !== 'string' || !allowed.includes(id))))) {
      throw new Error('Précautions physiques invalides');
    }
  }
  if (migrated.profile.body !== undefined) {
    const body = migrated.profile.body;
    if (!isPlainObject(body)
        || !Number.isFinite(body.weight) || body.weight < 30 || body.weight > 250
        || !Number.isFinite(body.height) || body.height < 120 || body.height > 230
        || !Number.isFinite(body.age) || body.age < 14 || body.age > 90
        || !['m', 'f'].includes(body.sex)
        || ![1.4, 1.55, 1.7].includes(body.activity)) {
      throw new Error('Profil physique invalide');
    }
  }
  if (!Array.isArray(migrated.sessions) || migrated.sessions.length > MAX_IMPORT_SESSIONS) {
    throw new Error('Séances invalides');
  }
  for (const session of migrated.sessions) {
    if (!isPlainObject(session) || typeof session.date !== 'string' || !isIsoDate(session.date)) throw new Error('Séance invalide');
    if (session.duration !== undefined && (!Number.isFinite(session.duration) || session.duration < 0 || session.duration > 1440)) {
      throw new Error('Durée de séance invalide');
    }
    if (session.calories !== undefined && (!Number.isFinite(session.calories) || session.calories < 0 || session.calories > 10000)) {
      throw new Error('Calories de séance invalides');
    }
  }
  if (!Array.isArray(migrated.kegel) || migrated.kegel.length > MAX_IMPORT_KEGEL) throw new Error('Historique Kegel invalide');
  for (const entry of migrated.kegel) {
    if (!isPlainObject(entry) || typeof entry.date !== 'string' || !isIsoDate(entry.date)) throw new Error('Entrée Kegel invalide');
  }
  if (migrated.settings !== undefined) {
    if (!isPlainObject(migrated.settings)) throw new Error('Réglages invalides');
    if (migrated.settings.restSeconds !== undefined
        && (!Number.isFinite(migrated.settings.restSeconds) || migrated.settings.restSeconds < 30 || migrated.settings.restSeconds > 90)) {
      throw new Error('Durée de repos invalide');
    }
    if (migrated.settings.trainingDays !== undefined) {
      if (!Array.isArray(migrated.settings.trainingDays) || migrated.settings.trainingDays.length > 6
          || migrated.settings.trainingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new Error('Jours d’entraînement invalides');
      }
    }
  }
  if (!isPlainObject(migrated.adjustments)) throw new Error('Ajustements invalides');
  if (!isPlainObject(migrated.water)) throw new Error('Hydratation invalide');
  for (const [key, value] of Object.entries(migrated.water)) {
    if (!isIsoDate(key) || !Number.isFinite(value) || value < 0 || value > 100000) {
      throw new Error('Hydratation invalide');
    }
  }
  if (migrated.shopping.length > 1000 || migrated.shopping.some((item) => typeof item !== 'string')) {
    throw new Error('Liste de courses invalide');
  }
  if (migrated.recovery.length > MAX_IMPORT_SESSIONS) throw new Error('Historique de récupération invalide');
  if (migrated.challenges !== undefined && !isPlainObject(migrated.challenges)) throw new Error('Défis invalides');
  return migrated;
}

// ───────────── Import : fusion prudente des précautions (sous-lot 0b-1, décision F1) ─────────────
// Un import remplace le profil, mais jamais en effaçant silencieusement une précaution ni une information indépendante.
// La fusion opère sur les FACETTES du questionnaire (voir safety.js), pas sur le seul résumé `status` :
//  - `limitations` : union des deux côtés, aucune situation n'est retirée ;
//  - `declined`    : vrai si l'un des deux côtés a refusé de répondre (le refus reste identifiable, même avec des situations) ;
//  - `status`      : recalculé à partir des facettes (declared > declined > none > unanswered), donc jamais en contradiction ;
//    « aucune situation » est contredit par toute situation ou tout refus de l'autre côté : il s'efface alors (contradiction
//    résolue, pas une perte d'information) ; « unanswered » n'apporte aucune information ;
//  - sauvegarde SANS champ safety : les précautions actuelles sont conservées telles quelles (jamais lues comme « aucune situation ») ;
//  - contexte thoracique : le plus prudent des deux (new_or_unexplained > unspecified > evaluated).
const SAFETY_CHEST_CONTEXT_RANK = { evaluated: 1, unspecified: 2, new_or_unexplained: 3 };

function summarizeSafetyState(state) {
  return { status: state.status, limitations: state.limitations.slice(), declined: state.declined, chestContext: state.chestContext };
}

// Enregistrement à stocker : rien si le questionnaire est non renseigné et sans accusé de compréhension.
function safetyRecordOrUndefined(state) {
  const record = buildSafetyRecord(state);
  return record.status === 'unanswered' && !record.acknowledgedAt ? undefined : record;
}

function planSafetyImport(currentProfile, incomingProfile) {
  const current = deriveSafetyState(currentProfile);
  const incoming = deriveSafetyState(incomingProfile);

  if (!incoming.hasRecord) {
    return {
      incomingHasSafety: false,
      record: current.hasRecord ? safetyRecordOrUndefined(current) : undefined,
      current: summarizeSafetyState(current),
      incoming: summarizeSafetyState(incoming),
      result: summarizeSafetyState(current),
      added: [],
      kept: current.limitations.slice(),
      declinedKept: false,
    };
  }

  const limitations = SAFETY_LIMITATION_IDS.filter((id) => current.limitations.includes(id) || incoming.limitations.includes(id));
  const declined = current.declined || incoming.declined;
  const answeredNone = [current, incoming].some((s) => s.status === 'none');
  const status = limitations.length ? 'declared' : declined ? 'declined' : answeredNone ? 'none' : 'unanswered';
  const chestSides = [current, incoming].filter((s) => s.chestSymptoms);
  const chestContext = chestSides.length
    ? chestSides.map((s) => s.chestContext).sort((a, b) => SAFETY_CHEST_CONTEXT_RANK[b] - SAFETY_CHEST_CONTEXT_RANK[a])[0]
    : 'unspecified';
  const latest = (values) => values.filter(Boolean).sort().pop() || null;
  const merged = {
    status,
    limitations,
    declined,
    chestContext,
    returnAfterPause: current.returnAfterPause || incoming.returnAfterPause,
    answeredAt: status === 'unanswered' ? null : latest([current, incoming].filter((s) => s.status !== 'unanswered').map((s) => s.answeredAt)),
    // L'accusé de compréhension se rapporte au refus ou à l'absence de réponse : on garde le plus récent des deux côtés concernés.
    acknowledgedAt: latest([current, incoming].filter((s) => s.status === 'unanswered' || s.declined).map((s) => s.acknowledgedAt)),
  };
  return {
    incomingHasSafety: true,
    record: safetyRecordOrUndefined(merged),
    current: summarizeSafetyState(current),
    incoming: summarizeSafetyState(incoming),
    result: { status, limitations: limitations.slice(), declined, chestContext },
    added: limitations.filter((id) => !current.limitations.includes(id)),
    kept: limitations.filter((id) => current.limitations.includes(id) && !incoming.limitations.includes(id)),
    // Refus de répondre présent sur l'appareil mais absent de la sauvegarde (et conservé).
    declinedKept: current.declined && !incoming.declined,
  };
}

// Profil à enregistrer : le profil importé, avec les précautions issues de la fusion.
function applySafetyImportPlan(profile, plan) {
  const next = { ...profile };
  if (plan.record === undefined) delete next.safety;
  else next.safety = plan.record;
  return next;
}

// ───────────── Restauration de la copie locale : protection des précautions ─────────────
// Restaurer « exactement » la copie peut retirer une précaution déclarée depuis (ou un refus de répondre, ou rendre le
// contexte thoracique moins prudent). Ce plan détecte ces pertes AVANT toute écriture ; la restauration les exige confirmées.
function planSafetyRestore(currentProfile, backupProfile) {
  const current = deriveSafetyState(currentProfile);
  const backup = deriveSafetyState(backupProfile);
  const lostLimitations = current.limitations.filter((id) => !backup.limitations.includes(id));
  const gainedLimitations = backup.limitations.filter((id) => !current.limitations.includes(id));
  const lost = {
    limitations: lostLimitations,
    declined: current.declined && !backup.declined,
    chestContext: current.chestSymptoms && backup.chestSymptoms
      && SAFETY_CHEST_CONTEXT_RANK[current.chestContext] > SAFETY_CHEST_CONTEXT_RANK[backup.chestContext]
      ? { from: current.chestContext, to: backup.chestContext } : null,
    returnAfterPause: current.returnAfterPause && !backup.returnAfterPause,
  };
  const gained = { limitations: gainedLimitations, declined: backup.declined && !current.declined };
  const hasLoss = lost.limitations.length > 0 || lost.declined || lost.chestContext !== null || lost.returnAfterPause;
  const changed = hasLoss || gained.limitations.length > 0 || gained.declined || current.status !== backup.status;
  return {
    current: summarizeSafetyState(current),
    backup: summarizeSafetyState(backup),
    lost,
    gained,
    hasLoss,
    changed,
  };
}

// Prévisualisation de la restauration (aucune écriture). null s'il n'existe pas de copie locale.
function getLocalRestorePlan() {
  const record = getLocalBackup();
  if (!record) return null;
  const data = validateImportData(record.snapshot);
  return {
    savedAt: record.savedAt,
    source: record.source,
    name: data.profile.name,
    sessions: data.sessions.length,
    safety: planSafetyRestore(getProfile(), data.profile),
  };
}

function buildImportPreview(data) {
  if (typeof data === 'string') {
    if (byteLength(data) > MAX_IMPORT_BYTES) throw new Error('Sauvegarde trop volumineuse');
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error('JSON invalide');
    }
  }
  const validated = validateImportData(data);
  const otherCategories = [];
  if (validated.kegel.length) otherCategories.push(`${validated.kegel.length} séance${validated.kegel.length > 1 ? 's' : ''} Kegel`);
  if (Object.keys(validated.water).length) otherCategories.push('hydratation');
  if (validated.shopping.length) otherCategories.push('liste de courses');
  if (validated.recovery.length) otherCategories.push('récupération');
  if (validated.challenges && (Object.keys(validated.challenges.active || {}).length || (validated.challenges.history || []).length)) {
    otherCategories.push('défis');
  }
  const plan = planSafetyImport(getProfile(), validated.profile);
  return {
    name: validated.profile.name,
    startDate: validated.profile.startDate,
    sessions: validated.sessions.length,
    otherCategories,
    legacy: data.schemaVersion === undefined,
    safety: {
      incomingHasSafety: plan.incomingHasSafety,
      current: plan.current,
      incoming: plan.incoming,
      result: plan.result,
      added: plan.added,
      kept: plan.kept,
      declinedKept: plan.declinedKept,
    },
  };
}

function getLocalBackup() {
  const record = readJSON(LOCAL_BACKUP_KEY, null);
  if (!isPlainObject(record) || !isPlainObject(record.snapshot)) return null;
  return record;
}

function createLocalBackup(source = 'replacement') {
  const snapshot = collectExportData();
  const record = {
    app: 'HomeFit Coach',
    savedAt: new Date().toISOString(),
    source,
    snapshot,
  };
  if (!writeJSON(LOCAL_BACKUP_KEY, record)) throw new Error('Impossible de créer la copie de sécurité locale');
  const verified = getLocalBackup();
  if (!verified || verified.savedAt !== record.savedAt) throw new Error('Copie de sécurité locale non vérifiée');
  return record;
}

// Restaure la copie locale. Ne supprime JAMAIS une précaution en silence :
//  - { keepCurrentPrecautions: true } : restaure tout le reste, mais fusionne les précautions actuelles (même règle que l'import) ;
//  - { confirmedSafetyLoss: true }    : restauration exacte, après confirmation explicite de la suppression ;
//  - sans option et sans perte de précaution : comportement historique.
// L'état actuel est conservé dans la copie locale avant toute écriture : relancer la restauration l'annule.
function restoreLocalBackup(options = {}) {
  const record = getLocalBackup();
  if (!record) throw new Error('Aucune copie de sécurité disponible');
  const data = validateImportData(record.snapshot);
  let restored = data;
  if (options.keepCurrentPrecautions === true) {
    restored = { ...data, profile: applySafetyImportPlan(data.profile, planSafetyImport(getProfile(), data.profile)) };
  } else if (planSafetyRestore(getProfile(), data.profile).hasLoss && options.confirmedSafetyLoss !== true) {
    throw new Error('Cette restauration supprimerait des précautions : une confirmation explicite est nécessaire.');
  }
  createLocalBackup('restore');
  return applyImportData(restored);
}

function parseImportJson(jsonString) {
  if (typeof jsonString !== 'string') throw new Error('Fichier invalide');
  if (byteLength(jsonString) > MAX_IMPORT_BYTES) throw new Error('Sauvegarde trop volumineuse');
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('JSON invalide');
  }
  return validateImportData(data);
}

function applyImportData(data) {
  const keys = [
    STORAGE_KEYS.PROFILE,
    STORAGE_KEYS.SESSIONS,
    STORAGE_KEYS.KEGEL,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.ADJUST,
    STORAGE_KEYS.WATER,
    STORAGE_KEYS.SHOPPING,
    STORAGE_KEYS.RECOVERY,
    STORAGE_KEYS.CHALLENGES,
    STORAGE_KEYS.IN_PROGRESS,
  ];
  const previous = {};
  keys.forEach((key) => {
    previous[key] = localStorage.getItem(key);
  });

  const rollback = () => {
    keys.forEach((key) => {
      if (previous[key] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous[key]);
    });
  };

  try {
    if (!writeJSON(STORAGE_KEYS.PROFILE, data.profile)) throw new Error('Impossible d’enregistrer le profil');
    if (!writeJSON(STORAGE_KEYS.SESSIONS, data.sessions || [])) throw new Error('Impossible d’enregistrer les séances');
    if (!writeJSON(STORAGE_KEYS.KEGEL, data.kegel || [])) throw new Error('Impossible d’enregistrer l’historique Kegel');
    if (data.settings !== undefined && !writeJSON(STORAGE_KEYS.SETTINGS, data.settings)) throw new Error('Impossible d’enregistrer les réglages');
    if (!writeJSON(STORAGE_KEYS.ADJUST, data.adjustments || {})) throw new Error('Impossible d’enregistrer les ajustements');
    if (!writeJSON(STORAGE_KEYS.WATER, data.water || {})) throw new Error('Impossible d’enregistrer l’hydratation');
    if (!writeJSON(STORAGE_KEYS.SHOPPING, data.shopping || [])) throw new Error('Impossible d’enregistrer la liste de courses');
    if (!writeJSON(STORAGE_KEYS.RECOVERY, data.recovery || [])) throw new Error('Impossible d’enregistrer la récupération');
    if (data.challenges !== undefined) {
      if (!writeJSON(STORAGE_KEYS.CHALLENGES, data.challenges)) throw new Error('Impossible d’enregistrer les défis');
    } else {
      localStorage.removeItem(STORAGE_KEYS.CHALLENGES);
    }
    localStorage.removeItem(STORAGE_KEYS.IN_PROGRESS);
    return true;
  } catch (e) {
    rollback();
    throw e;
  }
}

function importData(jsonString) {
  const data = parseImportJson(jsonString);
  // Les précautions sont fusionnées avec celles de l'appareil (jamais effacées en silence) avant tout remplacement.
  const plan = planSafetyImport(getProfile(), data.profile);
  const merged = { ...data, profile: applySafetyImportPlan(data.profile, plan) };
  createLocalBackup('import');
  return applyImportData(merged);
}

// Efface les historiques et données de suivi sans toucher au profil ni aux préférences.
function resetProgression() {
  createLocalBackup('reset');
  const keys = [
    STORAGE_KEYS.SESSIONS,
    STORAGE_KEYS.KEGEL,
    STORAGE_KEYS.ADJUST,
    STORAGE_KEYS.WATER,
    STORAGE_KEYS.IN_PROGRESS,
    STORAGE_KEYS.RECOVERY,
    STORAGE_KEYS.CHALLENGES,
  ];
  const previous = {};
  keys.forEach((key) => {
    previous[key] = localStorage.getItem(key);
  });
  previous[STORAGE_KEYS.PROFILE] = localStorage.getItem(STORAGE_KEYS.PROFILE);
  previous[STORAGE_KEYS.SETTINGS] = localStorage.getItem(STORAGE_KEYS.SETTINGS);

  const rollback = () => {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
  };

  try {
  [
    ...keys,
  ].forEach((key) => localStorage.removeItem(key));

  const profile = getProfile();
  if (!profile) throw new Error('Profil introuvable');
  profile.startDate = todayISO();
  profile.streakStart = todayISO();
  profile.cycle = 1;
  profile.mode = 'standard';
  if (!saveProfile(profile)) throw new Error('Impossible d’enregistrer le nouveau profil');

  const settings = getSettings();
  settings.fasts = [];
  settings.lastBackupAt = null;
  settings.backupSnoozeUntil = null;
  if (!writeJSON(STORAGE_KEYS.SETTINGS, settings)) throw new Error('Impossible d’enregistrer les nouveaux réglages');
  } catch (e) {
    rollback();
    throw e;
  }
}

// Efface toutes les données de l'application (clés hfc_*) sur cet appareil.
function eraseAllData() {
  createLocalBackup('erase');
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
  if (text.length > MAX_IMPORT_BYTES * 2) throw new Error('Code trop volumineux');
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
  const json = new TextDecoder().decode(bytes);
  parseImportJson(json);
  return json;
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

// Agenda (.ics) d'un jeûne : un événement sur toute la durée (dates sans heure, fin exclusive).
function buildFastICS(fast, now = new Date()) {
  const compact = (iso) => iso.replace(/-/g, '');
  const utc = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HomeFit Coach//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:homefit-fast-${fast.start}@homefit-coach`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART;VALUE=DATE:${compact(fast.start)}`,
    `DTEND;VALUE=DATE:${compact(addDaysISO(fast.start, fast.days))}`,
    `SUMMARY:Jeûne communautaire (${fast.days} jour${fast.days > 1 ? 's' : ''})`,
    'DESCRIPTION:Récupération douce uniquement. Bois régulièrement et arrête-toi en cas de malaise.',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// Retourne false (sans rien créer) quand l'entraînement n'est pas autorisé : un agenda de séances n'est jamais proposé dans ce cas.
function downloadICS() {
  if (typeof evaluateSafetyPolicy !== 'function' || !evaluateSafetyPolicy(getProfile(), { action: 'view' }).canStartTraining) return false;
  downloadBlob(new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' }), 'homefit-coach-agenda.ics');
  return true;
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
    targetSessionsPerWeek: getWeekTarget(isoOf(startOfWeek)),
    totalMinutes,
    repsByExercise,
  };
}
