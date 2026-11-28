// Sous-lot 0b-1 (améliorations) :
//  1. fusion des précautions par FACETTES : aucune information indépendante n'est perdue (situations déclarées ET refus
//     de répondre peuvent coexister), sans contradiction entre les champs ;
//  2. restauration de la copie locale : les précautions actuelles ne sont jamais supprimées en silence.
// Données seulement : aucune décision de politique (sous-lot 0b-2) n'est testée ici.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const NOW = new Date(2026, 9, 15, 12, 0, 0);
const IDS = ['knees', 'back', 'shoulders', 'balance', 'mobility', 'professional_advice', 'chest_symptoms'];
const RANK = { evaluated: 1, unspecified: 2, new_or_unexplained: 3 };
const pure = createApp({ now: NOW }); // fonctions pures : une seule instance suffit

function app(safety, extra = {}) {
  const a = createApp({ now: NOW });
  a.profile({ ...extra, safety }); // `safety: undefined` = questionnaire jamais renseigné (le profil par défaut des tests est « none »)
  return a;
}
const profileOf = (safety, name = 'Alex') => ({ name, startDate: '2026-08-17', ...(safety === undefined ? {} : { safety }) });
const derive = (safety) => pure.run(`deriveSafetyState(${JSON.stringify({ safety })})`);
const deriveRecord = (record) => pure.run(`deriveSafetyState(${JSON.stringify({ safety: record })})`);
const plan = (cur, inc) => pure.run(`planSafetyImport(${JSON.stringify(profileOf(cur))}, ${JSON.stringify(profileOf(inc))})`);
const facets = (s) => ({ status: s.status, limitations: s.limitations, declined: s.declined, chestContext: s.chestContext });

// Aucune contradiction possible entre les champs d'un état dérivé.
function assertCoherent(s, label) {
  assert.strictEqual(s.status === 'declared', s.limitations.length > 0, `${label} : declared <=> situations`);
  assert.strictEqual(s.status === 'declined', s.declined && s.limitations.length === 0, `${label} : declined <=> refus sans situation`);
  if (s.status === 'none') assert.ok(!s.declined && s.limitations.length === 0, `${label} : none sans refus ni situation`);
  if (s.declined) assert.ok(s.status === 'declared' || s.status === 'declined', `${label} : un refus n'est jamais « none » ni « unanswered »`);
  assert.strictEqual(s.responded, s.status !== 'unanswered', `${label} : responded`);
  assert.strictEqual(s.preferNot, s.status === 'declined', `${label} : preferNot est la projection historique de status`);
  assert.strictEqual(s.chestSymptoms, s.limitations.includes('chest_symptoms'), `${label} : chestSymptoms`);
  assert.strictEqual(s.professionalAdvice, s.limitations.includes('professional_advice'), `${label} : professionalAdvice`);
  if (!s.chestSymptoms) assert.strictEqual(s.chestContext, 'unspecified', `${label} : contexte thoracique sans symptômes`);
}

// ───────────── 1. Modèle de données : facettes indépendantes ─────────────

test('facettes : situations déclarées et refus de répondre coexistent sans contradiction', () => {
  const s = derive({ status: 'declared', limitations: ['knees'], declined: true });
  assert.strictEqual(s.status, 'declared');
  assert.deepStrictEqual(s.limitations, ['knees']);
  assert.strictEqual(s.declined, true);
  assert.strictEqual(s.preferNot, false, 'preferNot (projection historique) reste faux : les situations restent appliquées');
  assertCoherent(s, 'coexistence');
});

test('facettes : un ancien enregistrement « refus + situations » conserve maintenant les deux informations', () => {
  const s = derive({ responded: true, preferNot: true, limitations: ['back'] });
  assert.strictEqual(s.status, 'declared');
  assert.deepStrictEqual(s.limitations, ['back']);
  assert.strictEqual(s.declined, true, 'avant : le refus était perdu');
  assertCoherent(s, 'ancien format');
});

test('facettes : exhaustif (3 840 enregistrements) — aucune contradiction, aucune information perdue, aller-retour stable', () => {
  const statuses = [undefined, 'none', 'declined', 'declared', 'unanswered'];
  const flags = [undefined, true, false];
  let count = 0;
  for (let mask = 0; mask < 1 << IDS.length; mask++) {
    const limitations = IDS.filter((_, i) => mask & (1 << i));
    for (const declined of [true, false]) {
      for (const status of statuses) {
        for (const responded of flags) {
          const record = { limitations, declined, ...(status === undefined ? {} : { status }), ...(responded === undefined ? {} : { responded }) };
          const label = JSON.stringify(record);
          const s = derive(record);
          assertCoherent(s, label);
          limitations.forEach((id) => assert.ok(s.limitations.includes(id), `${label} : « ${id} » perdue`));
          if (declined) assert.ok(s.declined, `${label} : refus perdu`);
          // Aller-retour : l'enregistrement reconstruit donne le même état, et reste stable.
          const built = pure.run(`buildSafetyRecord(${JSON.stringify(record)})`);
          assert.deepStrictEqual(facets(deriveRecord(built)), facets(s), `${label} : aller-retour`);
          assert.deepStrictEqual(pure.run(`buildSafetyRecord(${JSON.stringify(built)})`), built, `${label} : idempotence`);
          count++;
        }
      }
    }
  }
  assert.strictEqual(count, 3840);
});

test('facettes : le moteur d\'exercices n\'est pas modifié par la facette « refus » (situations toujours appliquées)', () => {
  const declaredOnly = app({ status: 'declared', limitations: ['knees', 'chest_symptoms'] });
  const withRefusal = app({ status: 'declared', limitations: ['knees', 'chest_symptoms'], declined: true });
  assert.strictEqual(withRefusal.run('normalizeSafetyProfile(getProfile()).preferNot'), false);
  assert.strictEqual(withRefusal.run(`evaluateExerciseCompatibility('squat-jump', getProfile()).status`), 'blocked');
  assert.deepStrictEqual(withRefusal.run('getSafetyWarnings(getProfile())'), declaredOnly.run('getSafetyWarnings(getProfile())'));
  const strip = (w) => { const { safetyStatus, policy, ...rest } = w; return rest; }; // la politique diffère (refus de répondre), pas le contenu
  ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio', 'Récupération'].forEach((title) => {
    const q = `getTodayWorkout(getProfile(), ${JSON.stringify(title)})`;
    assert.deepStrictEqual(strip(withRefusal.run(q)), strip(declaredOnly.run(q)), title);
  });
});

test('facettes : validation d\'import de la facette declined', () => {
  const a = app();
  const json = (safety) => JSON.stringify({ app: 'HomeFit Coach', schemaVersion: 1, profile: profileOf(safety), sessions: [] });
  assert.doesNotThrow(() => a.run(`buildImportPreview(${JSON.stringify(json({ status: 'declared', limitations: ['knees'], declined: true }))})`));
  assert.throws(() => a.run(`buildImportPreview(${JSON.stringify(json({ declined: 'oui' }))})`), /Précautions physiques invalides/);
});

// ───────────── 2. Fusion : l'exemple demandé et l'algèbre complète ─────────────

test('fusion : genoux déclarés + refus de répondre = genoux conservés ET refus identifiable (dans les deux sens)', () => {
  const declaredKnees = { status: 'declared', responded: true, limitations: ['knees'] };
  const declined = { status: 'declined', responded: true, preferNot: true, limitations: [] };
  [[declaredKnees, declined], [declined, declaredKnees]].forEach(([current, incoming]) => {
    const a = app(current);
    const json = JSON.stringify({ app: 'HomeFit Coach', schemaVersion: 1, profile: profileOf(incoming, 'Bob'), sessions: [] });
    const preview = a.run(`buildImportPreview(${JSON.stringify(json)})`).safety;
    a.run(`importData(${JSON.stringify(json)})`);
    const s = a.run('deriveSafetyState(getProfile())');
    assert.deepStrictEqual(s.limitations, ['knees']);
    assert.strictEqual(s.declined, true);
    assert.strictEqual(s.status, 'declared');
    assert.strictEqual(preview.result.declined, true);
    assertCoherent(s, 'résultat');
    const stored = JSON.parse(a.store.hfc_profile).safety;
    assert.strictEqual(stored.declined, true);
    assert.deepStrictEqual(stored.limitations, ['knees']);
    assert.strictEqual(stored.preferNot, false);
  });
});

const R = {
  unanswered: undefined,
  unansweredAck: { status: 'unanswered', acknowledgedAt: '2026-10-01' },
  none: { status: 'none', answeredAt: '2026-10-02' },
  declined: { status: 'declined', acknowledgedAt: '2026-10-03', answeredAt: '2026-10-03' },
  knees: { status: 'declared', limitations: ['knees'], answeredAt: '2026-10-04' },
  chestEvaluated: { status: 'declared', limitations: ['chest_symptoms'], chestContext: 'evaluated' },
  chestNew: { status: 'declared', limitations: ['chest_symptoms'], chestContext: 'new_or_unexplained' },
  backDeclined: { status: 'declared', limitations: ['back'], declined: true, acknowledgedAt: '2026-10-05', answeredAt: '2026-10-05' },
  multi: { status: 'declared', limitations: ['knees', 'shoulders', 'professional_advice'], declined: true },
};
const keys = Object.keys(R);

test('fusion : pour toutes les paires, aucune information indépendante n\'est perdue et l\'état est cohérent', () => {
  let pairs = 0;
  keys.forEach((ck) => keys.concat('(sans safety)').forEach((ik) => {
    const incoming = ik === '(sans safety)' ? undefined : R[ik];
    const hasRecord = ik !== '(sans safety)' && ik !== 'unanswered';
    const label = `${ck} + ${ik}`;
    const cur = derive(R[ck]);
    const p = plan(R[ck], hasRecord ? incoming : undefined);
    const result = p.record === undefined ? derive(undefined) : deriveRecord(p.record);
    assertCoherent(result, label);
    if (!hasRecord) {
      // Sauvegarde sans enregistrement exploitable : les précautions actuelles sont conservées telles quelles.
      assert.deepStrictEqual(facets(result), facets(cur), label);
      return;
    }
    const inc = derive(incoming);
    pairs++;
    IDS.forEach((id) => {
      if (cur.limitations.includes(id) || inc.limitations.includes(id)) assert.ok(result.limitations.includes(id), `${label} : « ${id} » perdue`);
    });
    assert.strictEqual(result.declined, cur.declined || inc.declined, `${label} : refus`);
    assert.deepStrictEqual(result.limitations, IDS.filter((id) => cur.limitations.includes(id) || inc.limitations.includes(id)), `${label} : union`);
    const expectedStatus = result.limitations.length ? 'declared' : result.declined ? 'declined' : [cur, inc].some((s) => s.status === 'none') ? 'none' : 'unanswered';
    assert.strictEqual(result.status, expectedStatus, label);
    const chest = [cur, inc].filter((s) => s.chestSymptoms).map((s) => RANK[s.chestContext]);
    if (chest.length) assert.strictEqual(RANK[result.chestContext], Math.max(...chest), `${label} : contexte thoracique`);
  }));
  assert.ok(pairs >= 70);
});

test('fusion : commutative, idempotente et associative sur les facettes', () => {
  const merged = (a, b) => plan(a, b).record;
  const f = (record) => facets(deriveRecord(record));
  const withRecord = keys.filter((k) => k !== 'unanswered');
  withRecord.forEach((ak) => withRecord.forEach((bk) => {
    assert.deepStrictEqual(f(merged(R[ak], R[bk])), f(merged(R[bk], R[ak])), `commutativité ${ak}/${bk}`);
  }));
  withRecord.forEach((k) => assert.deepStrictEqual(f(merged(R[k], R[k])), facets(derive(R[k])), `idempotence ${k}`));
  let triples = 0;
  withRecord.forEach((ak) => withRecord.forEach((bk) => withRecord.forEach((ck) => {
    const left = f(merged(merged(R[ak], R[bk]) || undefined, R[ck]));
    const right = f(merged(R[ak], merged(R[bk], R[ck]) || undefined));
    assert.deepStrictEqual(left, right, `associativité ${ak}/${bk}/${ck}`);
    triples++;
  })));
  assert.strictEqual(triples, 512);
});

test('fusion : « aucune situation » contredit un refus ou une situation (le refus ou la situation prévalent)', () => {
  assert.strictEqual(deriveRecord(plan(R.none, R.declined).record).status, 'declined');
  assert.strictEqual(deriveRecord(plan(R.declined, R.none).record).status, 'declined');
  assert.strictEqual(deriveRecord(plan(R.none, R.knees).record).status, 'declared');
  assert.strictEqual(deriveRecord(plan(R.none, R.none).record).status, 'none');
});

test('fusion : l\'accusé de compréhension suit le refus ou l\'absence de réponse', () => {
  const ack = (a, b) => deriveRecord(plan(a, b).record).acknowledgedAt;
  assert.strictEqual(ack(R.backDeclined, R.knees), '2026-10-05', 'refus conservé -> accusé conservé');
  assert.strictEqual(ack(R.declined, R.backDeclined), '2026-10-05', 'le plus récent des deux côtés concernés');
  assert.strictEqual(ack(R.knees, R.chestNew), null, 'ni refus ni absence de réponse : aucun accusé');
});

test('fusion : l\'aperçu signale le refus conservé et reste cohérent avec le résultat appliqué', () => {
  const a = app(R.backDeclined);
  const json = JSON.stringify({ app: 'HomeFit Coach', schemaVersion: 1, profile: profileOf(R.knees, 'Bob'), sessions: [] });
  const preview = a.run(`buildImportPreview(${JSON.stringify(json)})`).safety;
  assert.strictEqual(preview.declinedKept, true);
  assert.strictEqual(preview.result.declined, true);
  assert.deepStrictEqual(preview.result.limitations, ['knees', 'back']);
  const before = JSON.stringify(a.store);
  a.run(`buildImportPreview(${JSON.stringify(json)})`);
  assert.strictEqual(JSON.stringify(a.store), before, 'l\'aperçu n\'écrit rien');
});

// ───────────── 3. Restauration de la copie locale ─────────────

function withBackup(currentSafety, backupSafety) {
  const a = app(currentSafety, { name: 'Courant' });
  const source = app(backupSafety, { name: 'Copie' });
  a.set('hfc_backup_snapshot', { app: 'HomeFit Coach', savedAt: '2026-10-01T10:00:00.000Z', source: 'import', snapshot: source.run('collectExportData()') });
  return a;
}
const storeSnapshot = (a) => JSON.stringify(Object.keys(a.store).sort().map((k) => [k, a.store[k]]));

test('restauration : le plan détecte exactement les précautions qui seraient supprimées (toutes les paires)', () => {
  let losses = 0;
  keys.forEach((ck) => keys.forEach((bk) => {
    const label = `courant ${ck} / copie ${bk}`;
    const p = withBackup(R[ck], R[bk]).run('getLocalRestorePlan()').safety;
    const cs = derive(R[ck]);
    const bs = derive(R[bk]);
    const lostLimitations = cs.limitations.filter((id) => !bs.limitations.includes(id));
    const chestDowngrade = cs.chestSymptoms && bs.chestSymptoms && RANK[cs.chestContext] > RANK[bs.chestContext];
    assert.deepStrictEqual(p.lost.limitations, lostLimitations, label);
    assert.strictEqual(p.lost.declined, cs.declined && !bs.declined, `${label} : refus`);
    assert.strictEqual(p.lost.chestContext !== null, chestDowngrade, `${label} : contexte thoracique`);
    assert.deepStrictEqual(p.gained.limitations, bs.limitations.filter((id) => !cs.limitations.includes(id)), label);
    const expectLoss = lostLimitations.length > 0 || (cs.declined && !bs.declined) || chestDowngrade;
    assert.strictEqual(p.hasLoss, expectLoss, label);
    if (expectLoss) losses++;
  }));
  assert.ok(losses > 20);
});

test('restauration : sans perte de précaution, comportement historique inchangé', () => {
  const a = withBackup(R.knees, R.multi); // la copie contient toutes les précautions actuelles et davantage
  assert.strictEqual(a.run('getLocalRestorePlan().safety.hasLoss'), false);
  a.run('restoreLocalBackup()');
  assert.strictEqual(a.run('getProfile().name'), 'Copie');
  assert.deepStrictEqual(a.run('deriveSafetyState(getProfile()).limitations'), ['knees', 'shoulders', 'professional_advice']);
});

test('restauration : jamais de suppression silencieuse — toutes les paires, trois modes', () => {
  keys.forEach((ck) => keys.forEach((bk) => {
    const label = `courant ${ck} / copie ${bk}`;
    const cs = derive(R[ck]);
    const bs = derive(R[bk]);

    // 1. Sans option : s'il y a une perte, l'appel est refusé et RIEN n'est écrit ; sinon, restauration exacte.
    const plain = withBackup(R[ck], R[bk]);
    const hasLoss = plain.run('getLocalRestorePlan().safety.hasLoss');
    const before = storeSnapshot(plain);
    if (hasLoss) {
      assert.throws(() => plain.run('restoreLocalBackup()'), /confirmation explicite/, label);
      assert.strictEqual(storeSnapshot(plain), before, `${label} : écriture malgré le refus`);
    } else {
      plain.run('restoreLocalBackup()');
      assert.deepStrictEqual(facets(plain.run('deriveSafetyState(getProfile())')), facets(bs), label);
    }

    // 2. Conserver mes précautions : rien n'est retiré (situations, refus, contexte thoracique), le reste vient de la copie.
    const keep = withBackup(R[ck], R[bk]);
    keep.run('restoreLocalBackup({ keepCurrentPrecautions: true })');
    const k = keep.run('deriveSafetyState(getProfile())');
    assert.strictEqual(keep.run('getProfile().name'), 'Copie', label);
    cs.limitations.forEach((id) => assert.ok(k.limitations.includes(id), `${label} : « ${id} » supprimée`));
    if (cs.declined) assert.ok(k.declined, `${label} : refus supprimé`);
    if (cs.chestSymptoms) assert.ok(RANK[k.chestContext] >= RANK[cs.chestContext], `${label} : contexte thoracique assoupli`);
    assertCoherent(k, label);

    // 3. Restauration exacte confirmée : état identique à la copie ; l'état précédent reste récupérable.
    const exact = withBackup(R[ck], R[bk]);
    const previous = JSON.parse(exact.store.hfc_profile);
    exact.run('restoreLocalBackup({ confirmedSafetyLoss: true })');
    assert.deepStrictEqual(facets(exact.run('deriveSafetyState(getProfile())')), facets(bs), label);
    assert.deepStrictEqual(exact.run('getLocalBackup().snapshot.profile'), previous, `${label} : état précédent non conservé`);
    assert.strictEqual(exact.run('getLocalBackup().source'), 'restore');
  }));
});

test('restauration : le refus de répondre ne peut pas être supprimé sans confirmation', () => {
  const a = withBackup({ status: 'declared', limitations: ['knees'], declined: true }, { status: 'declared', limitations: ['knees'] });
  const p = a.run('getLocalRestorePlan().safety');
  assert.strictEqual(p.hasLoss, true);
  assert.strictEqual(p.lost.declined, true);
  assert.deepStrictEqual(p.lost.limitations, []);
  assert.throws(() => a.run('restoreLocalBackup()'), /confirmation explicite/);
});

test('restauration : une copie ancienne sans précautions ne vaut jamais « aucune situation »', () => {
  const a = withBackup({ status: 'declared', limitations: ['chest_symptoms', 'back'] }, undefined);
  const p = a.run('getLocalRestorePlan().safety');
  assert.strictEqual(p.backup.status, 'unanswered');
  assert.deepStrictEqual(p.lost.limitations, ['back', 'chest_symptoms']);
  assert.throws(() => a.run('restoreLocalBackup()'), /confirmation explicite/);
  a.run('restoreLocalBackup({ keepCurrentPrecautions: true })');
  assert.deepStrictEqual(a.run('deriveSafetyState(getProfile()).limitations'), ['back', 'chest_symptoms']);
});

test('restauration : annulation possible — relancer la restauration rétablit l\'état précédent', () => {
  const a = withBackup({ status: 'declared', limitations: ['knees', 'back'], declined: true }, { status: 'declared', limitations: ['knees'] });
  const before = JSON.parse(a.store.hfc_profile);
  a.run('restoreLocalBackup({ confirmedSafetyLoss: true })');
  assert.deepStrictEqual(a.run('deriveSafetyState(getProfile()).limitations'), ['knees']);
  assert.strictEqual(a.run('deriveSafetyState(getProfile()).declined'), false);
  // L'état précédent est dans la copie locale : sa restauration n'enlève rien (elle ajoute), donc sans confirmation requise.
  assert.strictEqual(a.run('getLocalRestorePlan().safety.hasLoss'), false);
  a.run('restoreLocalBackup()');
  assert.deepStrictEqual(JSON.parse(a.store.hfc_profile), before);
});

test('restauration : le plan et l\'aperçu n\'écrivent rien ; sans copie locale, null', () => {
  const a = withBackup(R.multi, R.none);
  const before = storeSnapshot(a);
  const plan1 = a.run('getLocalRestorePlan()');
  assert.strictEqual(storeSnapshot(a), before);
  assert.strictEqual(plan1.name, 'Copie');
  assert.strictEqual(plan1.sessions, 0);
  assert.strictEqual(plan1.source, 'import');
  assert.strictEqual(app(R.knees).run('getLocalRestorePlan()'), null);
  assert.throws(() => app(R.knees).run('restoreLocalBackup()'), /Aucune copie/);
});

test('restauration : un échec d\'écriture ne modifie rien, précautions comprises', () => {
  ['{}', '{ confirmedSafetyLoss: true }', '{ keepCurrentPrecautions: true }'].forEach((options) => {
    const a = withBackup(R.multi, R.none);
    const before = storeSnapshot(a);
    a.store.__failWrites = true;
    assert.throws(() => a.run(`restoreLocalBackup(${options})`));
    delete a.store.__failWrites;
    assert.strictEqual(storeSnapshot(a), before, options);
  });
});

test('restauration : une copie invalide est refusée sans rien écrire', () => {
  const a = app(R.knees);
  a.set('hfc_backup_snapshot', { app: 'HomeFit Coach', savedAt: '2026-10-01T10:00:00.000Z', source: 'import', snapshot: { app: 'HomeFit Coach', profile: { name: '' } } });
  const before = storeSnapshot(a);
  assert.throws(() => a.run('getLocalRestorePlan()'));
  assert.throws(() => a.run('restoreLocalBackup({ confirmedSafetyLoss: true })'));
  assert.strictEqual(storeSnapshot(a), before);
});

test('restauration : l\'import et la restauration restent indépendants (l\'import fusionne, la restauration exacte exige une confirmation)', () => {
  const a = app({ status: 'declared', limitations: ['knees'], declined: true });
  const json = JSON.stringify({ app: 'HomeFit Coach', schemaVersion: 1, profile: profileOf({ status: 'none' }, 'Bob'), sessions: [] });
  a.run(`importData(${JSON.stringify(json)})`);
  const s = a.run('deriveSafetyState(getProfile())');
  assert.deepStrictEqual(s.limitations, ['knees']);
  assert.strictEqual(s.declined, true);
  assert.strictEqual(a.run('getLocalRestorePlan().safety.hasLoss'), false, 'la copie locale est l\'état d\'avant import : rien à perdre');
});
