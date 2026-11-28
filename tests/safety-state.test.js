// Sous-lot 0b-1 : états du questionnaire de sécurité (unanswered / declined / none / declared), migration des anciens profils,
// enregistrement, accusé de compréhension et fusion prudente des précautions à l'import.
// Ces tests préparent les DONNÉES : ils ne vérifient aucune décision de politique (sous-lot 0b-2).
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const IDS = ['knees', 'back', 'shoulders', 'balance', 'mobility', 'professional_advice', 'chest_symptoms'];

function app(safety, extra = {}) {
  const a = createApp({ now: NOW });
  a.profile({ ...extra, safety }); // `safety: undefined` = questionnaire jamais renseigné (le profil par défaut des tests est « none »)
  return a;
}
const derive = (safety) => app(safety).run('deriveSafetyState(getProfile())');
const status = (safety) => derive(safety).status;
const deepFreezeScript = `(function f(o){ Object.values(o).forEach((v)=>{ if (v && typeof v==='object') f(v); }); return Object.freeze(o); })`;

// ───────────── Les quatre états ─────────────

test('états : unanswered (jamais rempli), declined, none, declared', () => {
  assert.strictEqual(status(undefined), 'unanswered');
  assert.strictEqual(status({ status: 'declined', responded: true, preferNot: true, limitations: [] }), 'declined');
  assert.strictEqual(status({ status: 'none', responded: true, preferNot: false, limitations: [] }), 'none');
  assert.strictEqual(status({ status: 'declared', responded: true, limitations: ['knees'] }), 'declared');
  const states = ['unanswered', 'declined', 'none', 'declared'];
  assert.deepStrictEqual(app().run('SAFETY_STATUSES'), states);
});

test('états : les champs historiques sont des projections de status (aucune divergence possible)', () => {
  const samples = [undefined, { status: 'declined' }, { status: 'none' }, { status: 'declared', limitations: ['back'] },
    { responded: true }, { responded: true, preferNot: true }, { responded: true, limitations: ['chest_symptoms'] }, { responded: false }, 'x', 42, []];
  samples.forEach((safety) => {
    const s = derive(safety);
    assert.strictEqual(s.responded, s.status !== 'unanswered', JSON.stringify(safety));
    assert.strictEqual(s.preferNot, s.status === 'declined', JSON.stringify(safety));
    assert.strictEqual(s.professionalAdvice, s.limitations.includes('professional_advice'));
    assert.strictEqual(s.chestSymptoms, s.limitations.includes('chest_symptoms'));
    if (s.status === 'declared') assert.ok(s.limitations.length > 0);
    else assert.deepStrictEqual(s.limitations, []);
  });
});

test('états : « none » et « unanswered » sont distincts (sans quoi on confondrait « jamais demandé » et « aucune situation »)', () => {
  const none = derive({ status: 'none' });
  const unanswered = derive(undefined);
  assert.notStrictEqual(none.status, unanswered.status);
  assert.strictEqual(none.responded, true);
  assert.strictEqual(unanswered.responded, false);
});

// ───────────── Migration des anciens profils ─────────────

test('migration : tableau des anciens formats', () => {
  const table = [
    ['aucun objet safety', undefined, 'unanswered', []],
    ['safety null', null, 'unanswered', []],
    ['responded:false', { responded: false, preferNot: false, limitations: [] }, 'unanswered', []],
    ['preferNot:true', { responded: true, preferNot: true, limitations: [] }, 'declined', []],
    ['responded:true sans restriction', { responded: true, preferNot: false, limitations: [], returnAfterPause: false, professionalAdvice: false }, 'none', []],
    ['responded:true, sans champ limitations', { responded: true }, 'none', []],
    ['restrictions physiques', { responded: true, limitations: ['knees', 'back'] }, 'declared', ['knees', 'back']],
    ['symptômes thoraciques', { responded: true, limitations: ['chest_symptoms'] }, 'declared', ['chest_symptoms']],
    ['avis professionnel (liste)', { responded: true, limitations: ['professional_advice'] }, 'declared', ['professional_advice']],
    ['avis professionnel (ancien indicateur seul)', { responded: true, limitations: [], professionalAdvice: true }, 'declared', ['professional_advice']],
    ['symptômes thoraciques (indicateur seul)', { responded: true, chestSymptoms: true }, 'declared', ['chest_symptoms']],
    ['restrictions mais responded:false (incohérent)', { responded: false, limitations: ['knees'] }, 'declared', ['knees']],
    ['restrictions ET preferNot (incohérent)', { responded: true, preferNot: true, limitations: ['back'] }, 'declared', ['back']],
    ['doublons et ordre libre', { responded: true, limitations: ['back', 'knees', 'back'] }, 'declared', ['knees', 'back']],
  ];
  table.forEach(([label, safety, expectedStatus, expectedLimitations]) => {
    const s = derive(safety);
    assert.strictEqual(s.status, expectedStatus, label);
    assert.deepStrictEqual(s.limitations, expectedLimitations, label);
  });
});

test('migration : aucune restriction existante n\'est jamais perdue (toutes les combinaisons valides)', () => {
  for (let mask = 1; mask < 1 << IDS.length; mask++) {
    const limitations = IDS.filter((_, i) => mask & (1 << i));
    [{ responded: true, limitations }, { responded: false, limitations }, { responded: true, preferNot: true, limitations },
      { status: 'none', limitations }, { status: 'unanswered', limitations }, { status: 'declined', limitations }].forEach((safety) => {
      const s = derive(safety);
      assert.strictEqual(s.status, 'declared', JSON.stringify(safety));
      assert.deepStrictEqual(s.limitations, limitations, JSON.stringify(safety));
    });
  }
});

test('migration : le contexte thoracique par défaut est « unspecified » (prudent)', () => {
  assert.strictEqual(derive({ responded: true, limitations: ['chest_symptoms'] }).chestContext, 'unspecified');
  assert.strictEqual(derive({ responded: true, limitations: ['chest_symptoms'], chestContext: 'evaluated' }).chestContext, 'evaluated');
  assert.strictEqual(derive({ responded: true, limitations: ['chest_symptoms'], chestContext: 'inconnu' }).chestContext, 'unspecified');
  assert.strictEqual(derive({ responded: true, limitations: ['knees'], chestContext: 'evaluated' }).chestContext, 'unspecified');
});

// ───────────── Données mal formées : prudence, jamais « none » ─────────────

test('données mal formées : jamais « none » par défaut', () => {
  const malformed = [
    'incorrect', 42, true, [], { status: 'inconnu' }, { status: 'none', responded: false },
    { responded: 'oui' }, { responded: true, preferNot: 'non' }, { responded: true, limitations: 'knees' },
    { responded: true, limitations: ['ancienne_limitation'] }, { responded: true, limitations: [42] },
    { responded: true, limitations: [null] }, { status: 'none', limitations: 'x' }, { status: 'none', professionalAdvice: 'oui' },
    { status: 'none', chestSymptoms: 1 }, { status: 'declared' }, { status: 'declared', limitations: [] },
    { responded: true, professionalAdvice: null }, { status: ['none'] }, { status: 'none', preferNot: 'x' },
  ];
  malformed.forEach((safety) => {
    const s = derive(safety);
    assert.notStrictEqual(s.status, 'none', `donnée ambiguë lue comme « aucune situation » : ${JSON.stringify(safety)}`);
    assert.strictEqual(s.responded, s.status !== 'unanswered');
  });
});

test('données mal formées : une situation valide reste déclarée même si le reste est invalide', () => {
  const s = derive({ responded: 'oui', status: 'bizarre', limitations: ['knees', 'inconnue', 42], chestContext: 'x', answeredAt: 'hier' });
  assert.strictEqual(s.status, 'declared');
  assert.deepStrictEqual(s.limitations, ['knees']);
  assert.strictEqual(s.ambiguous, true);
  assert.strictEqual(s.answeredAt, null);
});

test('données mal formées : profil absent ou non objet', () => {
  const a = app();
  ['null', 'undefined', '"texte"', '12', '[]'].forEach((p) => {
    assert.strictEqual(a.run(`deriveSafetyState(${p}).status`), 'unanswered', p);
  });
});

test('deriveSafetyState est pure : ne modifie pas l\'objet reçu et renvoie de nouvelles listes', () => {
  const a = createApp({ now: NOW });
  const result = a.run(`(function () {
    const profile = ${deepFreezeScript}({ name: 'x', safety: { responded: true, limitations: ['knees', 'back'], professionalAdvice: false } });
    const before = JSON.stringify(profile);
    const s1 = deriveSafetyState(profile);
    s1.limitations.push('mobility');
    const s2 = deriveSafetyState(profile);
    return { unchanged: JSON.stringify(profile) === before, limitations: s2.limitations };
  })()`);
  assert.strictEqual(result.unchanged, true);
  assert.deepStrictEqual(result.limitations, ['knees', 'back']);
});

// ───────────── API historique (normalizeSafetyProfile) ─────────────

test('compatibilité : normalizeSafetyProfile garde les champs historiques et ajoute les nouveaux', () => {
  const s = app({ responded: true, limitations: ['shoulders'], returnAfterPause: true }).run('normalizeSafetyProfile(getProfile())');
  ['responded', 'preferNot', 'limitations', 'returnAfterPause', 'professionalAdvice'].forEach((k) => assert.ok(k in s, k));
  ['status', 'chestSymptoms', 'chestContext', 'answeredAt', 'acknowledgedAt'].forEach((k) => assert.ok(k in s, k));
  assert.strictEqual(s.responded, true);
  assert.strictEqual(s.returnAfterPause, true);
  assert.ok(!('hasRecord' in s) && !('issues' in s), 'les champs internes ne sont pas exposés');
});

// ───────────── Enregistrement (buildSafetyRecord / depuis le formulaire) ─────────────

test('enregistrement : buildSafetyRecord est idempotent et cohérent', () => {
  const a = app();
  const inputs = [
    { status: 'none' }, { status: 'declined' }, { status: 'declared', limitations: ['chest_symptoms', 'knees'], chestContext: 'new_or_unexplained' },
    { responded: true, limitations: ['back'] }, { status: 'unanswered', acknowledgedAt: '2026-10-14' },
  ];
  inputs.forEach((input) => {
    const once = a.run(`buildSafetyRecord(${JSON.stringify(input)})`);
    const twice = a.run(`buildSafetyRecord(${JSON.stringify(once)})`);
    assert.deepStrictEqual(twice, once, JSON.stringify(input));
    assert.strictEqual(once.responded, once.status !== 'unanswered');
    assert.strictEqual(once.preferNot, once.status === 'declined');
    assert.ok(!('chestSymptoms' in once), 'chestSymptoms est dérivé de limitations, jamais dupliqué');
  });
});

test('enregistrement : l\'accusé de compréhension n\'a de sens que pour unanswered et declined', () => {
  const a = app();
  const rec = (input) => a.run(`buildSafetyRecord(${JSON.stringify(input)})`);
  assert.strictEqual(rec({ status: 'unanswered', acknowledgedAt: '2026-10-14' }).acknowledgedAt, '2026-10-14');
  assert.strictEqual(rec({ status: 'declined', acknowledgedAt: '2026-10-14' }).acknowledgedAt, '2026-10-14');
  assert.strictEqual(rec({ status: 'none', acknowledgedAt: '2026-10-14' }).acknowledgedAt, null);
  assert.strictEqual(rec({ status: 'declared', limitations: ['knees'], acknowledgedAt: '2026-10-14' }).acknowledgedAt, null);
  assert.strictEqual(rec({ status: 'unanswered', answeredAt: '2026-10-14' }).answeredAt, null);
});

test('formulaire : les quatre réponses donnent les quatre états', () => {
  const a = app();
  const build = (answers, previous = null) => a.run(`buildSafetyRecordFromAnswers(${JSON.stringify(answers)}, ${JSON.stringify(previous)}, '2026-10-15')`);
  assert.strictEqual(build({ limitations: [], none: false, preferNot: false }), null, 'rien de coché : aucun enregistrement');
  const none = build({ limitations: [], none: true, preferNot: false });
  assert.strictEqual(none.status, 'none');
  assert.strictEqual(none.answeredAt, '2026-10-15');
  assert.strictEqual(build({ limitations: [], none: false, preferNot: true }).status, 'declined');
  const declared = build({ limitations: ['knees', 'chest_symptoms'], none: false, preferNot: false });
  assert.strictEqual(declared.status, 'declared');
  assert.deepStrictEqual(declared.limitations, ['knees', 'chest_symptoms']);
  assert.strictEqual(declared.chestContext, 'unspecified');
});

test('formulaire : une situation déclarée l\'emporte sur « aucune situation » ; le refus reste une information indépendante', () => {
  const a = app();
  const build = (answers) => a.run(`buildSafetyRecordFromAnswers(${JSON.stringify(answers)}, null, '2026-10-15')`);
  const both = build({ limitations: ['back'], none: true, preferNot: true });
  assert.strictEqual(both.status, 'declared');
  assert.strictEqual(both.declined, true, 'le refus n\'est pas effacé par les situations');
  assert.deepStrictEqual(both.limitations, ['back']);
  assert.strictEqual(both.preferNot, false, 'projection historique : les anciens lecteurs appliquent les situations');
  const noRefusal = build({ limitations: ['back'], none: true });
  assert.strictEqual(noRefusal.declined, false);
  assert.deepStrictEqual(noRefusal.limitations, ['back']);
  assert.strictEqual(build({ none: true, preferNot: true }).status, 'declined', 'refus + « aucune » se contredisent : le refus l\'emporte');
  assert.deepStrictEqual(build({ limitations: ['inconnue'], none: false, preferNot: false }), null);
});

test('formulaire : modifier son choix conserve returnAfterPause, le contexte thoracique et l\'accusé quand ils restent pertinents', () => {
  const a = app();
  const previous = { safety: { status: 'declared', limitations: ['chest_symptoms'], chestContext: 'evaluated', returnAfterPause: true } };
  const keep = a.run(`buildSafetyRecordFromAnswers({ limitations: ['chest_symptoms', 'knees'] }, ${JSON.stringify(previous)}, '2026-10-16')`);
  assert.strictEqual(keep.chestContext, 'evaluated');
  assert.strictEqual(keep.returnAfterPause, true);
  const drop = a.run(`buildSafetyRecordFromAnswers({ limitations: ['knees'] }, ${JSON.stringify(previous)}, '2026-10-16')`);
  assert.ok(!('chestContext' in drop));
  const acked = { safety: { status: 'declined', acknowledgedAt: '2026-10-10' } };
  assert.strictEqual(a.run(`buildSafetyRecordFromAnswers({ preferNot: true }, ${JSON.stringify(acked)}, '2026-10-16')`).acknowledgedAt, '2026-10-10');
  assert.strictEqual(a.run(`buildSafetyRecordFromAnswers({ none: true }, ${JSON.stringify(acked)}, '2026-10-16')`).acknowledgedAt, null);
  const unansweredButAcked = a.run(`buildSafetyRecordFromAnswers({}, ${JSON.stringify(acked)}, '2026-10-16')`);
  assert.strictEqual(unansweredButAcked.status, 'unanswered');
  assert.strictEqual(unansweredButAcked.acknowledgedAt, '2026-10-10');
});

test('enregistrement : saveSafetyProfile (API historique) écrit un enregistrement valide', () => {
  const a = app();
  a.run(`saveSafetyProfile(getProfile(), { responded: true, limitations: ['balance'] })`);
  const stored = JSON.parse(a.store.hfc_profile).safety;
  assert.strictEqual(stored.status, 'declared');
  assert.deepStrictEqual(stored.limitations, ['balance']);
});

// ───────────── Accusé de compréhension (données et textes, non branchés) ─────────────

test('accusé : textes exacts, jamais présentés comme une autorisation médicale', () => {
  const a = app();
  assert.strictEqual(a.run('SAFETY_ACK_TEXT'), 'HomeFit adapte ses séances à partir des informations que tu choisis de communiquer. Si tu ne renseignes pas tes précautions, l’application ne peut pas vérifier que les exercices te conviennent. Tu peux compléter ton questionnaire dans les réglages à tout moment.');
  assert.strictEqual(a.run('SAFETY_ACK_BUTTON_LABEL'), 'J’ai compris, continuer');
  assert.ok(!/autoris|garantie|dispens|responsabilit/i.test(a.run('SAFETY_ACK_TEXT')));
});

test('accusé : requis pour unanswered et declined, jamais pour none et declared', () => {
  assert.strictEqual(app(undefined).run('needsSafetyAcknowledgement()'), true);
  assert.strictEqual(app({ status: 'declined' }).run('needsSafetyAcknowledgement()'), true);
  assert.strictEqual(app({ status: 'none' }).run('needsSafetyAcknowledgement()'), false);
  assert.strictEqual(app({ status: 'declared', limitations: ['knees'] }).run('needsSafetyAcknowledgement()'), false);
  assert.strictEqual(app({ status: 'unanswered', acknowledgedAt: '2026-10-14' }).run('needsSafetyAcknowledgement()'), false);
  // Facette « refus » : des situations déclarées + un refus de répondre (questionnaire incomplet) demandent aussi l'accusé.
  assert.strictEqual(app({ status: 'declared', limitations: ['knees'], declined: true }).run('needsSafetyAcknowledgement()'), true);
  assert.strictEqual(app({ status: 'declared', limitations: ['knees'], declined: true, acknowledgedAt: '2026-10-14' }).run('needsSafetyAcknowledgement()'), false);
});

test('accusé : acknowledgeSafetyNotice enregistre la date sans changer l\'état ni créer de « none »', () => {
  const a = app(undefined);
  assert.strictEqual(a.run(`acknowledgeSafetyNotice('2026-10-15')`), true);
  const s = a.run('deriveSafetyState(getProfile())');
  assert.strictEqual(s.status, 'unanswered');
  assert.strictEqual(s.acknowledgedAt, '2026-10-15');
  assert.strictEqual(a.run('needsSafetyAcknowledgement()'), false);
  const d = app({ status: 'declined' });
  d.run(`acknowledgeSafetyNotice('2026-10-15')`);
  assert.strictEqual(d.run('deriveSafetyState(getProfile())').status, 'declined');
  const declared = app({ status: 'declared', limitations: ['knees'] });
  const before = declared.store.hfc_profile;
  assert.strictEqual(declared.run(`acknowledgeSafetyNotice('2026-10-15')`), true);
  assert.strictEqual(declared.store.hfc_profile, before, 'aucun effet pour un état déclaré');
  assert.strictEqual(createApp().run(`acknowledgeSafetyNotice('2026-10-15')`), false, 'sans profil');
});

// ───────────── Validation des sauvegardes ─────────────

function backupJson(safety, name = 'Alex') {
  return JSON.stringify({ app: 'HomeFit Coach', schemaVersion: 1, profile: { name, startDate: '2026-08-17', ...(safety === undefined ? {} : { safety }) }, sessions: [] });
}

test('import : les nouveaux champs sont acceptés, les valeurs invalides refusées', () => {
  const a = app();
  const ok = [
    { status: 'none', responded: true, limitations: [], answeredAt: '2026-10-15', acknowledgedAt: null },
    { status: 'declared', responded: true, limitations: ['chest_symptoms'], chestContext: 'new_or_unexplained', chestSymptoms: true },
    { responded: true, limitations: ['knees'] },
  ];
  ok.forEach((safety) => assert.doesNotThrow(() => a.run(`buildImportPreview(${JSON.stringify(backupJson(safety))})`), JSON.stringify(safety)));
  const bad = [{ status: 'autre' }, { chestContext: 'x' }, { answeredAt: 'hier' }, { acknowledgedAt: 12 }, { chestSymptoms: 'oui' }, { limitations: ['inconnue'] }];
  bad.forEach((safety) => assert.throws(() => a.run(`buildImportPreview(${JSON.stringify(backupJson(safety))})`), /Précautions physiques invalides/, JSON.stringify(safety)));
});

// ───────────── Import : fusion prudente ─────────────

function importInto(currentSafety, incomingSafety) {
  const a = app(currentSafety);
  const json = backupJson(incomingSafety);
  const preview = a.run(`buildImportPreview(${JSON.stringify(json)})`).safety;
  a.run(`importData(${JSON.stringify(json)})`);
  const state = a.run('deriveSafetyState(getProfile())');
  return { a, preview, state, stored: JSON.parse(a.store.hfc_profile).safety };
}

test('import : sauvegarde sans précautions + précautions actuelles = précautions conservées', () => {
  const r = importInto({ responded: true, limitations: ['knees', 'chest_symptoms'] }, undefined);
  assert.strictEqual(r.state.status, 'declared');
  assert.deepStrictEqual(r.state.limitations, ['knees', 'chest_symptoms']);
  assert.strictEqual(r.preview.incomingHasSafety, false);
  assert.deepStrictEqual(r.preview.kept, ['knees', 'chest_symptoms']);
});

test('import : sauvegarde sans précautions n\'est JAMAIS lue comme « aucune situation »', () => {
  [undefined, { status: 'declined' }, { status: 'none' }, { status: 'unanswered' }].forEach((current) => {
    const before = app(current).run('deriveSafetyState(getProfile())').status;
    const r = importInto(current, undefined);
    assert.strictEqual(r.state.status, before, `état actuel ${before}`);
  });
  const fresh = importInto(undefined, undefined);
  assert.strictEqual(fresh.state.status, 'unanswered');
  assert.strictEqual(fresh.stored, undefined, 'aucun enregistrement inventé');
  const emptyDevice = createApp({ now: NOW });
  emptyDevice.run(`importData(${JSON.stringify(backupJson(undefined))})`);
  assert.strictEqual(emptyDevice.run('deriveSafetyState(getProfile()).status'), 'unanswered');
});

test('import : sauvegarde avec précautions physiques sur un profil non renseigné', () => {
  const r = importInto(undefined, { responded: true, limitations: ['knees', 'back'] });
  assert.strictEqual(r.state.status, 'declared');
  assert.deepStrictEqual(r.state.limitations, ['knees', 'back']);
  assert.deepStrictEqual(r.preview.added, ['knees', 'back']);
});

test('import : sauvegarde avec symptômes thoraciques sur un profil non renseigné ou « aucune situation »', () => {
  [undefined, { status: 'none' }, { status: 'declined' }].forEach((current) => {
    const r = importInto(current, { responded: true, limitations: ['chest_symptoms'] });
    assert.strictEqual(r.state.status, 'declared');
    assert.deepStrictEqual(r.state.limitations, ['chest_symptoms']);
    assert.strictEqual(r.state.chestContext, 'unspecified');
  });
});

test('import : sauvegarde avec avis professionnel (liste ou ancien indicateur)', () => {
  const list = importInto(undefined, { responded: true, limitations: ['professional_advice'] });
  assert.deepStrictEqual(list.state.limitations, ['professional_advice']);
  const legacy = importInto({ status: 'none' }, { responded: true, limitations: [], professionalAdvice: true });
  assert.deepStrictEqual(legacy.state.limitations, ['professional_advice']);
  assert.strictEqual(legacy.state.status, 'declared');
});

test('import : restrictions différentes = union, aucune n\'est supprimée', () => {
  const r = importInto({ responded: true, limitations: ['knees', 'chest_symptoms'] }, { responded: true, limitations: ['back', 'chest_symptoms', 'shoulders'] });
  assert.deepStrictEqual(r.state.limitations, ['knees', 'back', 'shoulders', 'chest_symptoms']);
  assert.deepStrictEqual(r.preview.added, ['back', 'shoulders']);
  assert.deepStrictEqual(r.preview.kept, ['knees']);
});

test('import : une sauvegarde qui tente de supprimer des restrictions ne le peut pas', () => {
  const attempts = [
    { status: 'none', responded: true, limitations: [] },
    { status: 'declined', responded: true, preferNot: true, limitations: [] },
    { status: 'unanswered', responded: false, limitations: [] },
    { responded: true, limitations: ['mobility'] },
  ];
  attempts.forEach((incoming) => {
    const r = importInto({ responded: true, limitations: ['knees', 'chest_symptoms'] }, incoming);
    assert.ok(r.state.limitations.includes('knees') && r.state.limitations.includes('chest_symptoms'), JSON.stringify(incoming));
    assert.strictEqual(r.state.status, 'declared');
  });
});

test('import : sans situation déclarée, la déclaration la plus prudente l\'emporte (declined > none) ; unanswered est neutre', () => {
  const claim = (cur, inc) => importInto(cur, inc).state.status;
  assert.strictEqual(claim({ status: 'none' }, { status: 'declined' }), 'declined');
  assert.strictEqual(claim({ status: 'declined' }, { status: 'none' }), 'declined');
  assert.strictEqual(claim({ status: 'none' }, { status: 'none' }), 'none');
  assert.strictEqual(claim(undefined, { status: 'none' }), 'none');
  assert.strictEqual(claim({ status: 'none' }, { status: 'unanswered' }), 'none');
  assert.strictEqual(claim(undefined, { status: 'unanswered' }), 'unanswered');
});

test('import : un état ambigu dans la sauvegarde ne devient jamais « none »', () => {
  // status « declared » sans aucune situation : impossible à confirmer -> lu comme unanswered (neutre), l'état actuel prévaut.
  const r = importInto({ status: 'declined' }, { status: 'declared', limitations: [] });
  assert.strictEqual(r.state.status, 'declined');
  assert.notStrictEqual(importInto(undefined, { status: 'declared', limitations: [] }).state.status, 'none');
  assert.notStrictEqual(importInto(undefined, { status: 'none', responded: false }).state.status, 'none');
});

test('import : contexte thoracique le plus prudent, accusé et dates cohérents', () => {
  const ctx = (a, b) => importInto(
    { status: 'declared', limitations: ['chest_symptoms'], chestContext: a },
    { status: 'declared', limitations: ['chest_symptoms'], chestContext: b }
  ).state.chestContext;
  assert.strictEqual(ctx('evaluated', 'new_or_unexplained'), 'new_or_unexplained');
  assert.strictEqual(ctx('evaluated', 'unspecified'), 'unspecified');
  assert.strictEqual(ctx('evaluated', 'evaluated'), 'evaluated');
  const ack = importInto({ status: 'declined', acknowledgedAt: '2026-10-10' }, { status: 'declined', acknowledgedAt: '2026-10-12' });
  assert.strictEqual(ack.state.acknowledgedAt, '2026-10-12');
  // Le refus de répondre reste identifiable même avec des situations déclarées : l'accusé qui s'y rapporte l'est aussi.
  const kept = importInto({ status: 'declined', acknowledgedAt: '2026-10-10' }, { status: 'declared', limitations: ['knees'] });
  assert.strictEqual(kept.state.status, 'declared');
  assert.strictEqual(kept.state.declined, true);
  assert.strictEqual(kept.state.acknowledgedAt, '2026-10-10');
  // Sans refus des deux côtés, aucun accusé ne subsiste une fois des situations déclarées.
  const none = importInto({ status: 'unanswered', acknowledgedAt: '2026-10-10' }, { status: 'declared', limitations: ['knees'] });
  assert.strictEqual(none.state.declined, false);
  assert.strictEqual(none.state.acknowledgedAt, null);
});

test('import : l\'aperçu annonce exactement ce qui sera appliqué', () => {
  const currents = [undefined, { status: 'none' }, { status: 'declined' }, { responded: true, limitations: ['knees'] }, { responded: true, limitations: ['chest_symptoms', 'back'] }];
  const incomings = [undefined, { status: 'none' }, { status: 'declined' }, { responded: true, limitations: ['shoulders'] }, { responded: true, limitations: ['knees', 'professional_advice'] }];
  currents.forEach((current) => incomings.forEach((incoming) => {
    const r = importInto(current, incoming);
    assert.strictEqual(r.preview.result.status, r.state.status, `${JSON.stringify(current)} + ${JSON.stringify(incoming)}`);
    assert.deepStrictEqual(r.preview.result.limitations, r.state.limitations);
    // Monotonie : aucune situation de l'appareil ni de la sauvegarde ne disparaît.
    const had = (s) => (s ? app(s).run('deriveSafetyState(getProfile()).limitations') : []);
    [...had(current), ...had(incoming)].forEach((id) => assert.ok(r.state.limitations.includes(id), `${id} perdu`));
  }));
});

test('import : l\'aperçu n\'écrit rien et l\'annulation laisse les données intactes', () => {
  const a = app({ responded: true, limitations: ['knees'] });
  const before = JSON.stringify(a.store);
  a.run(`buildImportPreview(${JSON.stringify(backupJson({ status: 'none' }, 'Autre'))})`);
  assert.strictEqual(JSON.stringify(a.store), before);
});

test('import : copie de sécurité locale créée avant le remplacement ; la restauration protège les précautions ajoutées depuis', () => {
  const a = app({ responded: true, limitations: ['knees'] });
  const beforeProfile = JSON.parse(a.store.hfc_profile);
  a.run(`importData(${JSON.stringify(backupJson({ responded: true, limitations: ['back'] }, 'Bob'))})`);
  assert.strictEqual(a.run('getProfile().name'), 'Bob');
  assert.deepStrictEqual(a.run('deriveSafetyState(getProfile()).limitations'), ['knees', 'back']);
  assert.deepStrictEqual(a.run('getLocalBackup().snapshot.profile'), beforeProfile);
  // Une restauration exacte retirerait « back » (ajouté par l'import) : elle exige désormais une confirmation explicite.
  const before = JSON.stringify(a.store);
  assert.throws(() => a.run('restoreLocalBackup()'), /confirmation explicite/);
  assert.strictEqual(JSON.stringify(a.store), before, 'rien n\'a été écrit');
  a.run('restoreLocalBackup({ confirmedSafetyLoss: true })');
  assert.deepStrictEqual(JSON.parse(a.store.hfc_profile), beforeProfile, 'la restauration confirmée rétablit exactement l\'état enregistré');
});

test('import : un échec d\'enregistrement ne modifie rien (précautions comprises)', () => {
  const a = app({ responded: true, limitations: ['knees'] });
  const before = a.store.hfc_profile;
  a.store.__failWrites = true;
  assert.throws(() => a.run(`importData(${JSON.stringify(backupJson({ status: 'none' }, 'Bob'))})`));
  assert.strictEqual(a.store.hfc_profile, before);
});

// ───────────── Non-régression ─────────────

test('non-régression : DATA_SCHEMA_VERSION inchangé et export global au même format', () => {
  const a = app({ status: 'none' });
  assert.strictEqual(a.run('DATA_SCHEMA_VERSION'), 1);
  const data = a.run('collectExportData()');
  assert.strictEqual(data.schemaVersion, 1);
  assert.deepStrictEqual(Object.keys(data).sort(), ['adjustments', 'app', 'challenges', 'exportedAt', 'kegel', 'profile', 'recovery', 'schemaVersion', 'sessions', 'settings', 'shopping', 'water']);
});

test('non-régression : export puis import de chaque état restitue le même état', () => {
  const inputs = [undefined, { status: 'declined' }, { status: 'none' }, { status: 'declared', limitations: ['knees', 'chest_symptoms'], chestContext: 'evaluated' }];
  inputs.forEach((safety) => {
    const source = app(safety);
    const json = JSON.stringify(source.run('collectExportData()'));
    const target = createApp({ now: NOW });
    target.run(`importData(${JSON.stringify(json)})`);
    const a = source.run('deriveSafetyState(getProfile())');
    const b = target.run('deriveSafetyState(getProfile())');
    ['status', 'limitations', 'chestContext'].forEach((k) => assert.deepStrictEqual(b[k], a[k], `${JSON.stringify(safety)} / ${k}`));
  });
});

test('non-régression : un export de l\'ancienne version (sans status) s\'importe et reste prudent', () => {
  const legacy = { responded: true, preferNot: false, limitations: ['back'], returnAfterPause: false, professionalAdvice: false };
  const target = createApp({ now: NOW });
  target.run(`importData(${JSON.stringify(backupJson(legacy))})`);
  assert.strictEqual(target.run('deriveSafetyState(getProfile()).status'), 'declared');
  assert.deepStrictEqual(target.run('deriveSafetyState(getProfile()).limitations'), ['back']);
});

test('non-régression : le profil « aucune situation » explicite se comporte comme l\'ancien « responded:true sans limitation »', () => {
  const legacy = app({ responded: true, preferNot: false, limitations: [] });
  const none = app({ status: 'none', responded: true, limitations: [], answeredAt: '2026-10-15' });
  const titles = ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio', 'Récupération'];
  titles.forEach((title) => {
    const q = `getTodayWorkout(getProfile(), ${JSON.stringify(title)})`;
    const strip = (w) => { const { safetyStatus, ...rest } = w; return rest; };
    assert.deepStrictEqual(strip(none.run(q)), strip(legacy.run(q)), title);
  });
  assert.deepStrictEqual(none.run('getSafetyWarnings(getProfile())'), legacy.run('getSafetyWarnings(getProfile())'));
});

test('non-régression : les profils cohérents donnent les mêmes avertissements et compatibilités qu\'avant', () => {
  const cases = [
    [undefined, ['Écoute ton corps : arrête en cas de douleur ou malaise inhabituel.']],
    [{ responded: true, preferNot: true, limitations: [] }, ['Sans réponse détaillée, progresse avec prudence et évite toute accélération rapide.']],
    [{ responded: true, limitations: [] }, ['Respecte tes limites et progresse progressivement.']],
  ];
  cases.forEach(([safety, expected]) => assert.deepStrictEqual(app(safety).run('getSafetyWarnings(getProfile())'), expected));
  const knees = app({ responded: true, limitations: ['knees'] });
  assert.strictEqual(knees.run(`evaluateExerciseCompatibility('squat-jump', getProfile()).status`), 'blocked');
  assert.strictEqual(knees.run(`evaluateExerciseCompatibility('curl-biceps', getProfile()).compatible`), true);
});

test('contenu des séances : indépendant de acknowledgedAt et de answeredAt (la confirmation ne change que la décision de démarrer)', () => {
  const base = app({ status: 'declined', responded: true, preferNot: true });
  const acked = app({ status: 'declined', responded: true, preferNot: true, acknowledgedAt: '2026-10-14', answeredAt: '2026-10-14' });
  ['Haut du corps', 'Full Body + Cardio', 'Récupération'].forEach((title) => {
    const q = `getTodayWorkout(getProfile(), ${JSON.stringify(title)})`;
    const strip = (w) => { const { policy, ...rest } = w; return rest; }; // seule la décision de confirmation (policy) diffère
    assert.deepStrictEqual(strip(acked.run(q)), strip(base.run(q)), title);
  });
});
