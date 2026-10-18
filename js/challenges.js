// Défis personnels : entièrement locaux. Un défi est relevé si au moins 80 % de ses jours d'effort sont validés
// (les jours manqués ne font pas échouer le défi, dans l'esprit d'un suivi souple).
const CHALLENGE_SUCCESS_RATIO = 0.8;

const CHALLENGES = {
  pompes30: {
    name: '30 jours de pompes',
    icon: '💪',
    days: 30,
    unit: 'pompes',
    restEvery: 7,
    target: (d) => Math.min(40, 5 + Math.floor((d - 1) * 1.1)),
    desc: 'Chaque jour, un nombre de pompes qui monte doucement. Un jour de repos tous les 7 jours.',
  },
  gainage30: {
    name: '30 jours de gainage',
    icon: '🪵',
    days: 30,
    unit: 's de planche',
    restEvery: 7,
    target: (d) => 20 + Math.floor((d - 1) * 2.5),
    desc: 'Tiens la planche un peu plus longtemps chaque jour. Un jour de repos tous les 7 jours.',
  },
  squats30: {
    name: '30 jours de squats',
    icon: '🦵',
    days: 30,
    unit: 'squats',
    restEvery: 7,
    target: (d) => 15 + Math.floor((d - 1) * 1.5),
    desc: 'Des squats chaque jour, de plus en plus nombreux. Un jour de repos tous les 7 jours.',
  },
  kegel21: {
    name: '21 jours de Kegel',
    icon: '🧘',
    days: 21,
    unit: 'routine',
    restEvery: 0,
    auto: 'kegel',
    target: () => 1,
    desc: 'Une routine Kegel par jour pendant 3 semaines. Suivi automatique : fais ta routine, c’est validé.',
  },
  eau14: {
    name: '14 jours d’hydratation',
    icon: '💧',
    days: 14,
    unit: 'ml',
    restEvery: 0,
    auto: 'water',
    target: () => getWaterGoalMl(),
    desc: 'Atteins ton objectif d’eau chaque jour. Suivi automatique depuis la page Nutrition.',
  },
};

function challengeDayIso(startIso, day) {
  const d = new Date(startIso + 'T00:00:00');
  d.setDate(d.getDate() + day - 1);
  return isoOf(d);
}

function isChallengeRestDay(def, day) {
  return def.restEvery > 0 && day % def.restEvery === 0;
}

// Valeur réalisée un jour donné (manuelle ou lue automatiquement dans les autres données).
function challengeValueOn(def, entry, iso) {
  if (def.auto === 'kegel') return getKegelLog().some((k) => k.date === iso) ? 1 : 0;
  if (def.auto === 'water') return getWaterOn(iso);
  return entry.log[iso] || 0;
}

// État jour par jour d'un défi actif : 'done' | 'missed' | 'rest' | 'today' | 'future'.
function getChallengeStatus(id, entry, todayIso = todayISO()) {
  const def = CHALLENGES[id];
  const days = [];
  let validated = 0;
  let required = 0;
  for (let day = 1; day <= def.days; day++) {
    const iso = challengeDayIso(entry.startDate, day);
    const target = def.target(day);
    const rest = isChallengeRestDay(def, day);
    const value = rest ? 0 : challengeValueOn(def, entry, iso);
    const done = !rest && value >= target;
    let status;
    if (rest) status = 'rest';
    else if (done) status = 'done';
    else if (iso === todayIso) status = 'today';
    else if (iso < todayIso) status = 'missed';
    else status = 'future';
    if (!rest) required++;
    if (done) validated++;
    days.push({ day, iso, target, rest, value, status });
  }
  const dayNumber = daysBetween(entry.startDate, todayIso) + 1;
  return { days, validated, required, dayNumber, finished: dayNumber > def.days };
}

// startIso : date de départ commune (défi synchronisé avec une cohorte). Futur accepté ; passé accepté
// jusqu'à CHALLENGE_MAX_LATE_DAYS jours de retard, au-delà le défi démarre aujourd'hui pour ne pas pénaliser.
const CHALLENGE_MAX_LATE_DAYS = 3;

function resolveChallengeStart(startIso, todayIso = todayISO()) {
  if (!isIsoDate(startIso)) return todayIso;
  if (startIso >= todayIso) return startIso;
  return daysBetween(startIso, todayIso) <= CHALLENGE_MAX_LATE_DAYS ? startIso : todayIso;
}

function startChallenge(id, startIso) {
  const data = getChallengeData();
  if (data.active[id]) return;
  data.active[id] = { startDate: resolveChallengeStart(startIso), log: {} };
  saveChallengeData(data);
}

function abandonChallenge(id) {
  const data = getChallengeData();
  delete data.active[id];
  saveChallengeData(data);
}

function logChallenge(id, value, iso = todayISO()) {
  const data = getChallengeData();
  if (!data.active[id]) return;
  data.active[id].log[iso] = Math.max(0, value);
  saveChallengeData(data);
}

// Termine les défis dont la dernière journée est passée : ils passent dans l'historique avec leur résultat.
function finalizeChallenges(todayIso = todayISO()) {
  const data = getChallengeData();
  let changed = false;
  Object.entries(data.active).forEach(([id, entry]) => {
    const status = getChallengeStatus(id, entry, todayIso);
    if (!status.finished) return;
    data.history.push({
      id,
      startDate: entry.startDate,
      validated: status.validated,
      required: status.required,
      success: status.required > 0 && status.validated / status.required >= CHALLENGE_SUCCESS_RATIO,
    });
    delete data.active[id];
    changed = true;
  });
  if (changed) saveChallengeData(data);
  return changed;
}
