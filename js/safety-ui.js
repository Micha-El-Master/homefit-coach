// Interface de sécurité (sous-lot 0b-2) : seule partie qui touche au DOM.
// Elle AFFICHE les décisions de safety-policy.js (messages, confirmation avant la première séance) ; elle n'en prend aucune.
// La confirmation n'est ni une autorisation médicale, ni une dispense de responsabilité, ni une garantie de sécurité,
// et elle ne contourne jamais un état « blocked » (la politique refuse avant toute demande de confirmation).

// Affiche les messages de la politique dans un conteneur (texte brut, jamais de HTML). Les messages de gravité
// « warning » sont mis en évidence. Retourne le nombre de messages affichés.
function renderSafetyMessages(container, messages, options = {}) {
  if (!container) return 0;
  const skip = Array.isArray(options.skip) ? options.skip : [];
  container.textContent = '';
  let shown = 0;
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    if (!message || typeof message.text !== 'string' || skip.includes(message.id)) return;
    const p = document.createElement('p');
    p.dataset.safetyMessage = message.id;
    p.className = message.severity === 'warning' ? 'safety-alert' : '';
    p.style.cssText = 'font-size:13px; line-height:1.5; margin:0 0 8px;';
    p.textContent = `🛡️ ${message.text}`;
    container.appendChild(p);
    shown++;
  });
  container.style.display = shown ? 'block' : 'none';
  return shown;
}

// Fenêtre de confirmation avant la première séance (questionnaire non renseigné ou refusé).
// Résout true si l'utilisateur confirme ET que la confirmation est enregistrée ; false sinon (retour, Échap, échec d'enregistrement).
function requestSafetyAcknowledgement() {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'safety-overlay';
    overlay.id = 'ack-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ack-title');
    overlay.setAttribute('aria-describedby', 'ack-text');

    const panel = document.createElement('div');
    panel.className = 'safety-panel';
    const title = document.createElement('h2');
    title.id = 'ack-title';
    title.textContent = 'Avant de commencer';
    const text = document.createElement('p');
    text.id = 'ack-text';
    text.textContent = SAFETY_ACK_TEXT;
    const error = document.createElement('p');
    error.id = 'ack-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    error.style.color = 'var(--danger)';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.id = 'ack-confirm';
    confirm.className = 'btn btn-primary';
    confirm.textContent = SAFETY_ACK_BUTTON_LABEL;
    const settings = document.createElement('a');
    settings.id = 'ack-settings';
    settings.className = 'btn btn-secondary';
    settings.href = 'settings.html#securite';
    settings.style.marginTop = '10px';
    settings.textContent = 'Compléter mon questionnaire';
    panel.append(title, text, error, confirm, settings);
    overlay.appendChild(panel);

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      resolve(result);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Tab') {
        // Piège de focus : la fenêtre est modale.
        const focusable = [confirm, settings];
        const index = focusable.indexOf(document.activeElement);
        event.preventDefault();
        focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
      }
    }
    confirm.addEventListener('click', () => {
      if (acknowledgeSafetyNotice()) {
        close(true);
      } else {
        error.textContent = 'Impossible d’enregistrer ta confirmation sur cet appareil.';
        error.hidden = false;
      }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    confirm.focus();
  });
}

// Fenêtre du signal « Douleur ou malaise » : UNE SEULE implémentation, partagée par la séance et par toute activité physique
// (séance, Kegel…). Les signaux et la décision viennent de safety.js (SAFETY_SIGNALS, computeSafetyStop) ; rien n'est enregistré,
// aucun détail médical n'est conservé.
//   options.intro      : texte d'introduction de l'étape de choix
//   options.stopLabel  : libellé du bouton d'arrêt
//   options.laterLabel : libellé de « mettre de côté » (null/absent : aucune mise de côté n'est proposée)
//   options.onUrgent() : appelé IMMÉDIATEMENT à la sélection d'un signal urgent (effacer la séance en cours, avant tout clic)
//   options.onStop()   : arrêt définitif confirmé par la personne
//   options.onLater()  : mise de côté (jamais proposée après un signal urgent)
//   options.onResume() : « Tout va bien » ou signal sans arrêt (jamais appelé après un arrêt)
// Retourne { close } ; la fenêtre est modale (Échap = « reprendre » tant qu'aucun arrêt n'a été décidé).
function openSafetySignalDialog(options = {}) {
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'safety-overlay';
  overlay.id = 'safety-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'safety-title');
  const panel = document.createElement('div');
  panel.className = 'safety-panel';
  const title = document.createElement('h2');
  title.id = 'safety-title';
  title.textContent = 'Qu’est-ce qui se passe ?';

  const choose = document.createElement('div');
  choose.id = 'safety-step-choose';
  const intro = document.createElement('p');
  intro.textContent = options.intro || 'Ton activité est en pause. Choisis ce que tu ressens.';
  const group = document.createElement('div');
  group.className = 'safety-group';
  group.id = 'safety-signals';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.id = 'safety-cancel';
  cancel.className = 'btn btn-secondary';
  cancel.textContent = 'Tout va bien, reprendre';
  choose.append(intro, group, cancel);

  const result = document.createElement('div');
  result.id = 'safety-step-result';
  result.hidden = true;
  const message = document.createElement('p');
  message.className = 'safety-alert';
  message.id = 'safety-message';
  message.setAttribute('role', 'alert');
  const emergency = document.createElement('p');
  emergency.id = 'safety-emergency';
  emergency.hidden = true;
  emergency.textContent = 'Contacte les services d\'urgence locaux.';
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.id = 'safety-stop';
  stop.className = 'btn btn-primary';
  stop.textContent = options.stopLabel || 'Arrêter';
  const later = document.createElement('button');
  later.type = 'button';
  later.id = 'safety-later';
  later.className = 'btn btn-secondary';
  later.style.marginTop = '10px';
  later.textContent = options.laterLabel || '';
  result.append(message, emergency, stop, later);

  [false, true].forEach((urgent) => {
    const label = document.createElement('p');
    label.className = 'safety-group-label';
    label.textContent = urgent ? 'Signes d’alerte' : 'Je ressens';
    group.appendChild(label);
    SAFETY_SIGNALS.filter((s) => s.urgent === urgent).forEach((signal) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary safety-signal' + (urgent ? ' urgent' : '');
      btn.textContent = signal.label;
      btn.addEventListener('click', () => choose_(signal.id));
      group.appendChild(btn);
    });
  });
  panel.append(title, choose, result);
  overlay.appendChild(panel);

  let stopped = false; // un arrêt a été décidé : plus aucune reprise possible
  const call = (fn) => { if (typeof fn === 'function') fn(); };
  function close(resume) {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (resume && !stopped) call(options.onResume);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  function choose_(signalId) {
    const decision = computeSafetyStop(signalId);
    if (!decision.stop) { close(true); return; }
    stopped = true;
    if (decision.urgent) call(options.onUrgent); // effacement immédiat, avant tout clic
    title.textContent = decision.urgent ? 'Arrête tout de suite' : 'Arrête l’activité';
    message.textContent = decision.message;
    message.classList.toggle('urgent', decision.urgent);
    emergency.hidden = !decision.urgent;
    later.hidden = decision.urgent || !options.laterLabel;
    choose.hidden = true;
    result.hidden = false;
    stop.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape' && !choose.hidden) { event.preventDefault(); close(true); }
  }
  cancel.addEventListener('click', () => close(true));
  stop.addEventListener('click', () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); call(options.onStop); });
  later.addEventListener('click', () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); call(options.onLater); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  group.querySelector('button').focus();
  return { close: () => close(false) };
}
