// Communauté WhatsApp : configuration publique (communaute.json), liens d'invitation, textes de partage, cohortes.
// Rien n'est envoyé automatiquement : WhatsApp ne s'ouvre que sur une action de l'utilisateur.

const COMMUNITY_DEFAULTS = {
  appUrl: 'https://micha-el-master.github.io/homefit-coach/',
  links: { channel: '', community: '' },
  nextCohort: null, // { start: 'YYYY-MM-DD', label: 'Cohorte 1', seats: 50 }
  announcement: null, // { id, title, text, until, linkLabel, linkUrl }
  weeklyChallenge: null, // { from, title, text, challengeId }
};

const WHATSAPP_HOSTS = ['chat.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com', 'wa.me'];

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function isWhatsAppUrl(value) {
  return isHttpsUrl(value) && WHATSAPP_HOSTS.includes(new URL(value).hostname);
}

const clip = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Le fichier est modifiable à la main : on ne garde que des valeurs de forme attendue (pas d'URL javascript:, textes bornés).
function sanitizeCommunityConfig(raw) {
  const cfg = JSON.parse(JSON.stringify(COMMUNITY_DEFAULTS));
  if (!raw || typeof raw !== 'object') return cfg;

  if (isHttpsUrl(raw.appUrl)) cfg.appUrl = raw.appUrl.endsWith('/') ? raw.appUrl : raw.appUrl + '/';

  if (raw.links && typeof raw.links === 'object') {
    ['channel', 'community'].forEach((k) => {
      if (isWhatsAppUrl(raw.links[k])) cfg.links[k] = raw.links[k];
    });
  }

  const c = raw.nextCohort;
  if (c && isIsoDate(c.start)) {
    cfg.nextCohort = { start: c.start, label: clip(c.label, 40) || 'Prochaine cohorte', seats: Number.isInteger(c.seats) && c.seats > 0 ? c.seats : null };
  }

  const a = raw.announcement;
  if (a && clip(a.id, 40) && clip(a.title, 80)) {
    cfg.announcement = {
      id: clip(a.id, 40),
      title: clip(a.title, 80),
      text: clip(a.text, 400),
      until: isIsoDate(a.until) ? a.until : null,
      linkLabel: isHttpsUrl(a.linkUrl) ? clip(a.linkLabel, 40) || 'En savoir plus' : '',
      linkUrl: isHttpsUrl(a.linkUrl) ? a.linkUrl : '',
    };
  }

  const w = raw.weeklyChallenge;
  if (w && isIsoDate(w.from) && clip(w.title, 80)) {
    cfg.weeklyChallenge = {
      from: w.from,
      title: clip(w.title, 80),
      text: clip(w.text, 300),
      challengeId: typeof w.challengeId === 'string' ? w.challengeId : '',
    };
  }
  return cfg;
}

async function loadCommunityConfig() {
  try {
    const res = await fetch('communaute.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return sanitizeCommunityConfig(await res.json());
  } catch (e) {
    return sanitizeCommunityConfig(null);
  }
}

// Annonce visible : pas expirée, pas fermée par l'utilisateur.
function visibleAnnouncement(cfg, dismissedIds = [], todayIso = todayISO()) {
  const a = cfg.announcement;
  if (!a || dismissedIds.includes(a.id)) return null;
  if (a.until && a.until < todayIso) return null;
  return a;
}

// Défi de la semaine : le plus récent dont la date de début est passée.
function currentWeeklyChallenge(cfg, todayIso = todayISO()) {
  const w = cfg.weeklyChallenge;
  return w && w.from <= todayIso ? w : null;
}

// Lien de cohorte : ?cohorte=YYYY-MM-DD. Date acceptée entre 60 jours dans le passé et 1 an dans le futur.
function parseCohortParam(value, todayIso = todayISO()) {
  if (!isIsoDate(value)) return null;
  const diff = daysBetween(todayIso, value);
  if (diff < -60 || diff > 365) return null;
  return { date: value, future: diff > 0, daysUntil: Math.max(0, diff) };
}

function cohortLink(cfg, dateIso) {
  return `${cfg.appUrl}index.html?cohorte=${dateIso}`;
}

function cohortLabel(dateIso) {
  return `Cohorte du ${formatDateFr(dateIso, false)}`;
}

function whatsappShareLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function buildInviteText(cfg, profile) {
  const cohort = profile && profile.cohort ? profile.cohort : cfg.nextCohort && cfg.nextCohort.start;
  const url = cohort ? cohortLink(cfg, cohort) : cfg.appUrl;
  return [
    'Je suis un programme de 12 semaines à la maison avec HomeFit Coach (gratuit, sans compte, mes données restent sur mon téléphone). 🏋️',
    cohort ? `Rejoins la cohorte qui démarre le ${formatDateFr(cohort)} et avançons ensemble :` : 'Viens essayer avec moi :',
    url,
  ].join('\n');
}

// Bilan de semaine : uniquement des totaux choisis par l'utilisateur (ni poids, ni photo, ni détail des séances).
function buildRecapShareText(recap, streak, cfg, profile) {
  const lines = [
    `🏋️ Mon bilan HomeFit Coach — semaine du ${formatDateFr(recap.from, false)} au ${formatDateFr(recap.to, false)}`,
    `✅ ${recap.count}/${recap.target} séance${recap.target > 1 ? 's' : ''} · ⏱️ ${recap.minutes} min` + (recap.totalReps ? ` · 💪 ${recap.totalReps} répétitions` : ''),
  ];
  if (streak > 0) lines.push(`🔥 Série : ${streak} semaine${streak > 1 ? 's' : ''} de suite`);
  if (profile && profile.cohort) lines.push(`👥 ${cohortLabel(profile.cohort)}`);
  lines.push(profile && profile.cohort ? `Rejoins-nous : ${cohortLink(cfg, profile.cohort)}` : `Essaie avec moi : ${cfg.appUrl}`);
  return lines.join('\n');
}
