// Carte « Statut WhatsApp » (image JPEG 1080 × 1920, 9:16, ~200 Ko) générée sur l'appareil : rien n'est envoyé nulle part.
// La mise en page garde le contenu entre y = 300 et y = 1740 : WhatsApp affiche le nom en haut et la barre de réponse en bas.
const STATUS_CARD_SIZE = { width: 1080, height: 1920 };
const STATUS_IMAGE = { type: 'image/jpeg', quality: 0.95, filename: 'homefit-coach-statut.jpg' };

const STATUS_THEMES = {
  feu: { label: 'Feu', bg: ['#d4361a', '#a8260c'], text: '#ffffff', muted: 'rgba(255,255,255,0.9)', panel: 'rgba(255,255,255,0.14)', accent: '#ffffff', onAccent: '#a8260c', track: 'rgba(255,255,255,0.25)' },
  nuit: { label: 'Nuit', bg: ['#121316', '#26272d'], text: '#f2f2f3', muted: '#c8c9cf', panel: 'rgba(255,255,255,0.08)', accent: '#ff6a45', onAccent: '#1a1a1a', track: 'rgba(255,255,255,0.14)' },
  clair: { label: 'Clair', bg: ['#fff7f3', '#ffe4db'], text: '#17181c', muted: '#5b6270', panel: 'rgba(212,54,26,0.09)', accent: '#d4361a', onAccent: '#ffffff', track: 'rgba(212,54,26,0.16)' },
};
const STATUS_PHOTO_THEME = { text: '#ffffff', muted: 'rgba(255,255,255,0.94)', panel: 'rgba(0,0,0,0.42)', accent: '#ff8a6b', onAccent: '#1a1a1a', track: 'rgba(255,255,255,0.3)' };

const FONT_STACK = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Réduit la taille de police jusqu'à ce que le texte tienne dans maxWidth.
function fitFont(g, text, maxWidth, size, weight) {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${FONT_STACK}`;
    s -= 2;
  } while (g.measureText(text).width > maxWidth && s > 18);
}

// Coupe un texte en lignes qui tiennent dans maxWidth (au plus maxLines ; la dernière est tronquée avec …).
function wrapLines(g, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    return kept;
  }
  return lines;
}

function drawText(g, text, x, y, { size, weight = 600, color, maxWidth = 900, alpha = 1 }) {
  fitFont(g, text, maxWidth, size, weight);
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.globalAlpha = 1;
}

// Photo de la galerie recadrée « cover » en 1080 × 1920, une seule fois (économise la mémoire).
async function loadPhotoCover(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Photo trop lourde (30 Mo maximum).');
  let source;
  if (typeof createImageBitmap === 'function') {
    try {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      source = null;
    }
  }
  if (!source) {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => reject(new Error('Image illisible.'));
      img.src = url;
    });
  }
  const { width: W, height: H } = STATUS_CARD_SIZE;
  const cover = document.createElement('canvas');
  cover.width = W;
  cover.height = H;
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  cover.getContext('2d').drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  if (source.close) source.close();
  return cover;
}

function drawRingHero(g, t, hero) {
  const cx = 540;
  const cy = 890;
  const R = 250;
  g.lineWidth = 46;
  g.lineCap = 'round';
  g.strokeStyle = t.track;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  if (hero.fraction > 0) {
    g.strokeStyle = t.accent;
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.min(1, hero.fraction) * Math.PI * 2);
    g.stroke();
  }
  drawText(g, hero.value, cx, cy + 62, { size: 210, weight: 800, color: t.text, maxWidth: 400 });
  drawText(g, hero.label, cx, cy + 142, { size: 42, weight: 600, color: t.muted, maxWidth: 380 });
}

function drawEmojiHero(g, t, hero) {
  g.fillStyle = t.panel;
  g.beginPath();
  g.arc(540, 770, 175, 0, Math.PI * 2);
  g.fill();
  g.font = `200px ${FONT_STACK}`;
  g.fillStyle = t.text;
  g.fillText(hero.emoji, 540, 840);
  g.font = `800 64px ${FONT_STACK}`;
  const lines = wrapLines(g, hero.title, 900, 2);
  lines.forEach((l, i) => drawText(g, l, 540, 1030 + i * 70, { size: 64, weight: 800, color: t.text, maxWidth: 900 }));
  drawText(g, hero.desc, 540, 1030 + lines.length * 70 + 20, { size: 38, weight: 500, color: t.muted, maxWidth: 900 });
}

function drawDeltaHero(g, t, hero) {
  drawText(g, hero.from, 285, 905, { size: 160, weight: 700, color: t.text, alpha: 0.7, maxWidth: 330 });
  drawText(g, '→', 540, 880, { size: 120, weight: 700, color: t.accent, maxWidth: 140 });
  drawText(g, hero.to, 800, 935, { size: 250, weight: 800, color: t.text, maxWidth: 400 });
  drawText(g, hero.unit, 540, 1035, { size: 46, weight: 600, color: t.muted, maxWidth: 800 });
  if (hero.percent > 0) {
    const label = `+${hero.percent} %`;
    fitFont(g, label, 300, 58, 800);
    const w = Math.max(280, g.measureText(label).width + 80);
    g.fillStyle = t.accent;
    roundRect(g, 540 - w / 2, 1075, w, 96, 48);
    g.fill();
    g.fillStyle = t.onAccent;
    g.fillText(label, 540, 1143);
  }
}

// opts : { theme: 'feu' | 'nuit' | 'clair', photo: canvas recadré (loadPhotoCover) ou null }
function drawStatusCard(canvas, spec, opts = {}) {
  const { width: W, height: H } = STATUS_CARD_SIZE;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const photo = opts.photo || null;
  const t = photo ? STATUS_PHOTO_THEME : STATUS_THEMES[opts.theme] || STATUS_THEMES.feu;

  if (photo) {
    g.drawImage(photo, 0, 0, W, H);
    const shade = g.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(0,0,0,0.55)');
    shade.addColorStop(0.45, 'rgba(0,0,0,0.38)');
    shade.addColorStop(1, 'rgba(0,0,0,0.78)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, H);
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 14;
  } else {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, t.bg[0]);
    bg.addColorStop(1, t.bg[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = t.panel;
    g.beginPath();
    g.arc(W + 40, 160, 360, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(-60, H - 160, 300, 0, Math.PI * 2);
    g.fill();
  }

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  // En-tête
  drawText(g, '🏋️ HomeFit Coach', 540, 335, { size: 58, weight: 800, color: t.text, maxWidth: 900 });
  drawText(g, spec.title, 540, 430, { size: 70, weight: 800, color: t.text, maxWidth: 940 });
  if (spec.subtitle) drawText(g, spec.subtitle, 540, 492, { size: 38, weight: 500, color: t.muted, maxWidth: 900 });
  if (spec.name) {
    const label = `👤 ${spec.name}`;
    fitFont(g, label, 600, 44, 700);
    const w = g.measureText(label).width + 64;
    g.fillStyle = t.panel;
    roundRect(g, 540 - w / 2, 520, w, 76, 38);
    g.fill();
    g.fillStyle = t.text;
    g.fillText(label, 540, 574);
  }

  // Cœur de la carte
  if (spec.hero.kind === 'ring') drawRingHero(g, t, spec.hero);
  else if (spec.hero.kind === 'emoji') drawEmojiHero(g, t, spec.hero);
  else drawDeltaHero(g, t, spec.hero);

  drawText(g, spec.banner, 540, 1262, { size: 54, weight: 800, color: t.text, maxWidth: 900 });

  // Statistiques
  const n = spec.stats.length;
  if (n) {
    const gap = 24;
    const boxW = (W - 180 - (n - 1) * gap) / n;
    spec.stats.forEach((s, i) => {
      const x = 90 + i * (boxW + gap);
      g.fillStyle = t.panel;
      roundRect(g, x, 1310, boxW, 200, 36);
      g.fill();
      drawText(g, s.value, x + boxW / 2, 1414, { size: 88, weight: 800, color: t.text, maxWidth: boxW - 40 });
      drawText(g, s.label, x + boxW / 2, 1471, { size: 32, weight: 600, color: t.muted, maxWidth: boxW - 32 });
    });
  }

  // Pied de carte
  if (spec.cohort) drawText(g, `👥 ${spec.cohort}`, 540, 1590, { size: 46, weight: 800, color: t.text, maxWidth: 900 });
  drawText(g, '12 semaines · à la maison · gratuit', 540, 1650, { size: 36, weight: 500, color: t.muted, maxWidth: 900 });
  drawText(g, spec.url, 540, 1712, { size: 40, weight: 800, color: t.text, maxWidth: 900 });
  g.shadowBlur = 0;
  return canvas;
}

function renderStatusBlob(spec, opts) {
  const canvas = document.createElement('canvas');
  drawStatusCard(canvas, spec, opts);
  return new Promise((resolve) => canvas.toBlob(resolve, STATUS_IMAGE.type, STATUS_IMAGE.quality));
}

// Poste en Statut : copie d'abord la légende (WhatsApp peut ignorer un texte joint à une image), puis partage l'IMAGE SEULE.
// Sans partage natif (ordinateur), l'image est téléchargée. Retourne { method: 'share' | 'download', copied }.
async function postToStatus(blob, caption) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(caption);
    copied = true;
  } catch (e) {
    copied = false;
  }
  const file = new File([blob], STATUS_IMAGE.filename, { type: STATUS_IMAGE.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return { method: 'share', copied };
  }
  downloadBlob(blob, STATUS_IMAGE.filename);
  return { method: 'download', copied };
}
