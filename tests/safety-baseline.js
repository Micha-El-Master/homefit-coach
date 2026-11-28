// Instantané du comportement historique des séances pour les profils SANS restriction exploitable
// (profil non renseigné, « je préfère ne pas répondre », réponse sans aucune limitation).
// Utilisé par tests/safety-enforce.test.js pour prouver que le garde-fou central ne change rien pour ces profils.
//
// Régénérer (uniquement si le comportement historique change volontairement) :
//   node tests/safety-baseline.js --write
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createApp } = require('./helpers');

const FIXTURE = path.join(__dirname, 'fixtures', 'safety-baseline-hashes.json');
const NOW = new Date(2026, 9, 15, 12, 0, 0);
const SAFETY_PROFILES = {
  'non-renseigne': undefined,
  'prefere-ne-pas-dire': { responded: true, preferNot: true, limitations: [] },
  'repondu-sans-limitation': { responded: true, limitations: [] },
};
const START_DATES = { semaine1: '2026-10-10', semaine5: '2026-09-14', semaine9: '2026-08-17' };
const GOALS = ['forme', 'muscle', 'perte', 'discipline'];
const TITLES = ['Haut du corps', 'Jambes + Abdos', 'Dos + Biceps', 'Full Body + Cardio', 'Récupération'];
const EQUIPMENTS = { aucun: [], chaise: ['chaise'], complet: ['chaise', 'charges', 'elastique'], defaut: ['chaise', 'charges'] };
const FASTS = { sans: [], reprise: [{ start: '2026-10-12', days: 3 }] };

// Champs ajoutés par le sous-lot 0 : exclus de la comparaison (le contenu historique reste identique).
const NEW_FIELDS = ['safetyStatus', 'policy'];

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

// `only` : noms de profils à calculer (par défaut tous). Depuis le sous-lot 0b-2, seul « repondu-sans-limitation » (état « none »)
// doit rester identique à l'historique : « non-renseigne » et « prefere-ne-pas-dire » relèvent désormais du niveau « caution ».
function computeSnapshot(only = Object.keys(SAFETY_PROFILES)) {
  const out = {};
  for (const [safetyName, safety] of Object.entries(SAFETY_PROFILES)) {
    if (!only.includes(safetyName)) continue;
    for (const [startName, startDate] of Object.entries(START_DATES)) {
      for (const [equipName, equipment] of Object.entries(EQUIPMENTS)) {
        for (const [fastName, fasts] of Object.entries(FASTS)) {
          const app = createApp({ now: NOW });
          app.profile({ startDate, goal: 'forme', safety });
          app.settings({ equipment, fasts });
          for (const goal of GOALS) {
            app.profile({ startDate, goal, safety });
            for (const title of TITLES) {
              if (title === 'Récupération' && goal !== 'forme') continue; // la récupération ne dépend pas de l'objectif
              const w = app.run(`getTodayWorkout(getProfile(), ${JSON.stringify(title)})`);
              NEW_FIELDS.forEach((f) => delete w[f]);
              out[[safetyName, startName, equipName, fastName, goal, title].join('|')] = hash(w);
            }
          }
        }
      }
    }
  }
  return out;
}

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

if (require.main === module && process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const snapshot = computeSnapshot();
  fs.writeFileSync(FIXTURE, JSON.stringify(snapshot, null, 0) + '\n');
  console.log(`Instantané écrit : ${Object.keys(snapshot).length} cas -> ${FIXTURE}`);
}

module.exports = { computeSnapshot, loadFixture, FIXTURE };
