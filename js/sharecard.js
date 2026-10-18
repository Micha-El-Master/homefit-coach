// Carte de progression à partager (image PNG générée sur l'appareil, rien n'est envoyé nulle part).
const SHARE_CARD_SIZE = { width: 1080, height: 1350 };

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
    g.font = `${weight} ${s}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    s -= 2;
  } while (g.measureText(text).width > maxWidth && s > 18);
}

function drawShareCard(canvas, d) {
  const { width: W, height: H } = SHARE_CARD_SIZE;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#d4361a');
  bg.addColorStop(1, '#a8260c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';

  fitFont(g, '🏋️ HomeFit Coach', W - 160, 66, 800);
  g.fillText('🏋️ HomeFit Coach', W / 2, 150);
  fitFont(g, d.period, W - 160, 40, 500);
  g.fillText(d.period, W / 2, 215);

  g.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(g, 90, 290, W - 180, 470, 48);
  g.fill();

  g.fillStyle = '#ffffff';
  fitFont(g, d.sessions, W - 300, 250, 800);
  g.fillText(d.sessions, W / 2, 530);
  fitFont(g, 'séances cette semaine', W - 300, 48, 600);
  g.fillText('séances cette semaine', W / 2, 610);
  const status = d.reached ? '✅ Objectif atteint' : '⏳ En cours';
  fitFont(g, status, W - 300, 52, 700);
  g.fillText(status, W / 2, 700);

  const boxW = (W - 180 - 40) / 3;
  d.stats.forEach((s, i) => {
    const x = 90 + i * (boxW + 20);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(g, x, 810, boxW, 250, 36);
    g.fill();
    g.fillStyle = '#ffffff';
    fitFont(g, s.value, boxW - 40, 96, 800);
    g.fillText(s.value, x + boxW / 2, 925);
    fitFont(g, s.label, boxW - 30, 34, 600);
    g.fillText(s.label, x + boxW / 2, 995);
  });

  g.fillStyle = '#ffffff';
  if (d.cohort) {
    fitFont(g, `👥 ${d.cohort}`, W - 160, 50, 700);
    g.fillText(`👥 ${d.cohort}`, W / 2, 1160);
  }
  fitFont(g, '12 semaines · à la maison · gratuit', W - 160, 38, 500);
  g.fillText('12 semaines · à la maison · gratuit', W / 2, 1230);
  fitFont(g, d.url, W - 160, 44, 700);
  g.fillText(d.url, W / 2, 1295);
  return canvas;
}

function renderShareCardBlob(d) {
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, d);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Partage natif de l'image si possible (mobile), sinon téléchargement.
async function shareCardImage(d, text) {
  const blob = await renderShareCardBlob(d);
  const file = new File([blob], 'homefit-coach-bilan.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return 'shared';
  }
  downloadBlob(blob, 'homefit-coach-bilan.png');
  return 'downloaded';
}
