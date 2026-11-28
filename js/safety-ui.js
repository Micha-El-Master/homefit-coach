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
