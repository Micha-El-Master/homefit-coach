// Cartes « Statut WhatsApp » : ce que chaque carte affiche (fonctions pures, testables) et la légende associée.
// Le dessin est dans sharecard.js. Aucune donnée sensible : ni poids, ni détail de santé ; le prénom et la photo sont facultatifs.

const STATUS_TYPES = { week: 'Semaine', session: 'Séance', achievement: 'Succès', progress: 'Progression' };

function statusLink(profile, cfg) {
  return profile && profile.cohort ? cohortLink(cfg, profile.cohort) : cfg.appUrl;
}

// Éléments communs à toutes les cartes (pied de carte, prénom en option).
function statusCommon(profile, cfg, opts) {
  return {
    name: opts && opts.includeName && profile && profile.name ? profile.name : '',
    cohort: profile && profile.cohort ? cohortLabel(profile.cohort) : '',
    url: cfg.appUrl.replace(/^https:\/\//, ''),
  };
}

function statusCaption(core, profile, cfg) {
  const join = profile && profile.cohort ? 'Rejoins-nous' : 'Essaie avec moi';
  return `${core}\nHomeFit Coach : 12 semaines, à la maison, gratuit. ${join} : ${statusLink(profile, cfg)}`;
}

function plural(n, one, many) {
  return n > 1 ? many : one;
}

function programWeekOf(profile, isoDate) {
  if (!profile) return null;
  const w = Math.floor(daysBetween(profile.startDate, isoDate) / 7) + 1;
  return w >= 1 && w <= TOTAL_WEEKS ? w : null;
}

// ---- Bilan de la semaine
function buildWeekSpec(recap, streak, profile, cfg, opts = {}) {
  const reached = recap.count >= recap.target;
  const week = programWeekOf(profile, recap.from);
  const period = `${formatDateFr(recap.from, false)} – ${formatDateFr(recap.to, false)}`;
  const parts = [`${recap.count}/${recap.target} séance${plural(recap.target, '', 's')}`, `${recap.minutes} min`];
  if (recap.totalReps) parts.push(`${recap.totalReps} répétitions`);
  const core = `${reached ? '💪' : '🏃'} ${week ? `Semaine ${week}` : 'Ma semaine'} : ${parts.join(', ')}.${streak > 0 ? ` 🔥 ${streak} semaine${plural(streak, '', 's')} de suite !` : ''}`;
  return {
    type: 'week',
    title: week ? `Semaine ${week}` : 'Ma semaine',
    subtitle: period,
    hero: { kind: 'ring', value: `${recap.count}/${recap.target}`, label: 'séances cette semaine', fraction: Math.min(1, recap.target ? recap.count / recap.target : 0) },
    banner: reached ? '✅ Objectif atteint' : '⏳ En cours',
    stats: [
      { value: String(recap.minutes), label: 'minutes' },
      { value: String(recap.totalReps), label: 'répétitions' },
      streak > 0 ? { value: String(streak), label: plural(streak, 'semaine de suite', 'semaines de suite') } : { value: String(recap.target), label: 'séances visées' },
    ],
    ...statusCommon(profile, cfg, opts),
    caption: statusCaption(core, profile, cfg),
  };
}

// ---- Séance terminée
function sessionTotals(session) {
  let reps = 0;
  let seconds = 0;
  (session.exercises || []).forEach((ex) => {
    const isHold = typeof EXERCISES !== 'undefined' && EXERCISES[ex.id] && EXERCISES[ex.id].type === 'hold';
    if (isHold) seconds += ex.totalReps || 0;
    else reps += ex.totalReps || 0;
  });
  return { reps, seconds, exercises: (session.exercises || []).length };
}

function buildSessionSpec(session, sessionNumber, profile, cfg, opts = {}) {
  const t = sessionTotals(session);
  const candidates = [];
  if (t.reps > 0) candidates.push({ value: String(t.reps), label: 'répétitions' });
  if (t.seconds > 0) candidates.push({ value: String(t.seconds), label: 's de gainage' });
  if (t.exercises > 0) candidates.push({ value: String(t.exercises), label: plural(t.exercises, 'exercice', 'exercices') });
  if (session.calories > 0) candidates.push({ value: String(session.calories), label: 'kcal estimées' });
  candidates.push({ value: String(sessionNumber), label: plural(sessionNumber, 'séance au total', 'séances au total') });
  const stats = candidates.slice(0, 2).concat(candidates[candidates.length - 1]);
  const dedup = stats.filter((s, i) => stats.findIndex((x) => x.label === s.label) === i).slice(0, 3);

  const bits = [`${session.title}`, `${session.duration} min`];
  if (t.reps) bits.push(`${t.reps} répétitions`);
  return {
    type: 'session',
    title: `Séance ${session.title}`,
    subtitle: formatDateFr(session.date),
    hero: { kind: 'ring', value: String(session.duration), label: "minutes d'effort", fraction: 1 },
    banner: '✅ Séance terminée',
    stats: dedup,
    ...statusCommon(profile, cfg, opts),
    caption: statusCaption(`✅ Séance terminée : ${bits.join(', ')}. Une de plus dans la poche ! 💪`, profile, cfg),
  };
}

// ---- Succès : badge débloqué ou défi relevé
function buildBadgeSpec(badge, totals, profile, cfg, opts = {}) {
  const stats = [{ value: String(totals.sessions), label: plural(totals.sessions, 'séance', 'séances') }];
  if (totals.streak > 0) stats.push({ value: String(totals.streak), label: plural(totals.streak, 'semaine de suite', 'semaines de suite') });
  if (totals.minutes > 0) stats.push({ value: String(totals.minutes), label: 'minutes' });
  return {
    type: 'achievement',
    title: 'Nouveau badge',
    subtitle: '',
    hero: { kind: 'emoji', emoji: badge.icon, title: badge.label, desc: badge.description },
    banner: '🏅 Badge débloqué',
    stats: stats.slice(0, 3),
    ...statusCommon(profile, cfg, opts),
    caption: statusCaption(`🏅 Nouveau badge débloqué : ${badge.label} ! La régularité, ça paie.`, profile, cfg),
  };
}

function buildChallengeSpec(entry, profile, cfg, opts = {}) {
  const def = CHALLENGES[entry.id];
  const rate = entry.required ? Math.round((entry.validated / entry.required) * 100) : 0;
  return {
    type: 'achievement',
    title: 'Défi relevé',
    subtitle: `Départ le ${formatDateFr(entry.startDate, false)}`,
    hero: { kind: 'emoji', emoji: def.icon, title: def.name, desc: `${entry.validated}/${entry.required} jours validés` },
    banner: '🎯 Défi relevé',
    stats: [
      { value: String(entry.validated), label: plural(entry.validated, 'jour validé', 'jours validés') },
      { value: `${rate}%`, label: 'de réussite' },
      { value: String(def.days), label: 'jours de défi' },
    ],
    ...statusCommon(profile, cfg, opts),
    caption: statusCaption(`🎯 Défi relevé : ${def.name} (${entry.validated}/${entry.required} jours validés) ! Fier de moi 💪`, profile, cfg),
  };
}

// Succès disponibles : badges débloqués + défis réussis. id : « badge:<id> » ou « challenge:<index> ».
function getAchievements() {
  const out = getBadgeStates()
    .filter((b) => b.unlocked)
    .map((b) => ({ id: `badge:${b.id}`, kind: 'badge', icon: b.icon, title: b.label, badge: b }));
  getChallengeData().history.forEach((h, i) => {
    if (h.success && CHALLENGES[h.id]) out.push({ id: `challenge:${i}`, kind: 'challenge', icon: CHALLENGES[h.id].icon, title: `${CHALLENGES[h.id].name} relevé`, entry: h });
  });
  return out;
}

function buildAchievementSpec(achievementId, profile, cfg, opts = {}) {
  const a = getAchievements().find((x) => x.id === achievementId);
  if (!a) return null;
  if (a.kind === 'challenge') return buildChallengeSpec(a.entry, profile, cfg, opts);
  const sessions = getSessionLog();
  return buildBadgeSpec(a.badge, { sessions: sessions.length, streak: getStreak(), minutes: sessions.reduce((s, x) => s + (x.duration || 0), 0) }, profile, cfg, opts);
}

// ---- Progression d'un exercice : première valeur positive -> dernière
function exerciseSeries(sessions, exerciseId) {
  return sessions
    .map((s) => ({ date: s.date, total: (s.exercises || []).filter((e) => e.id === exerciseId).reduce((sum, e) => sum + (e.totalReps || 0), 0) }))
    .filter((p) => p.total > 0);
}

// Exercices ayant au moins 2 points et une amélioration (pour ne proposer que des cartes valorisantes).
function listProgressCandidates(sessions) {
  const ids = [...new Set(sessions.flatMap((s) => (s.exercises || []).map((e) => e.id)))];
  return ids
    .map((id) => ({ id, series: exerciseSeries(sessions, id) }))
    .filter(({ id, series }) => EXERCISES[id] && series.length >= 2 && series[series.length - 1].total > series[0].total)
    .map(({ id, series }) => ({
      id,
      name: EXERCISES[id].name,
      from: series[0].total,
      to: series[series.length - 1].total,
      gain: series[series.length - 1].total - series[0].total,
    }))
    .sort((a, b) => b.gain / b.from - a.gain / a.from);
}

function buildProgressSpec(exerciseId, sessions, profile, cfg, opts = {}) {
  const series = exerciseSeries(sessions, exerciseId);
  if (series.length < 2) return null;
  const from = series[0];
  const to = series[series.length - 1];
  const isHold = EXERCISES[exerciseId].type === 'hold';
  const unit = isHold ? 'secondes' : 'répétitions';
  const gain = to.total - from.total;
  const percent = Math.round((gain / from.total) * 100);
  const weeks = Math.max(1, Math.round(daysBetween(from.date, to.date) / 7));
  return {
    type: 'progress',
    title: EXERCISES[exerciseId].name,
    subtitle: `depuis le ${formatDateFr(from.date, false)}`,
    hero: { kind: 'delta', from: String(from.total), to: String(to.total), unit, percent },
    banner: '📈 Je progresse',
    stats: [
      { value: `${gain >= 0 ? '+' : ''}${gain}`, label: unit },
      { value: String(series.length), label: 'séances' },
      { value: String(weeks), label: plural(weeks, 'semaine', 'semaines') },
    ],
    ...statusCommon(profile, cfg, opts),
    caption: statusCaption(`📈 ${EXERCISES[exerciseId].name} : ${from.total} → ${to.total} ${unit} depuis ma première séance${percent > 0 ? ` (+${percent} %)` : ''}. Ça se construit petit à petit 💪`, profile, cfg),
  };
}

// Texte alternatif de l'aperçu (lecteurs d'écran) : le contenu de la carte en phrase.
function describeSpec(spec) {
  const hero =
    spec.hero.kind === 'ring' ? `${spec.hero.value} ${spec.hero.label}` : spec.hero.kind === 'emoji' ? `${spec.hero.title}, ${spec.hero.desc}` : `${spec.hero.from} puis ${spec.hero.to} ${spec.hero.unit}`;
  return [spec.title, spec.subtitle, hero, spec.banner, spec.stats.map((s) => `${s.value} ${s.label}`).join(', ')].filter(Boolean).join(' · ');
}
