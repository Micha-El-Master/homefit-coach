# Politique de sécurité de HomeFit : paramètres provisoires à valider

**Statut : aucune règle de ce document n'est validée par un professionnel de santé ou du sport.**
Ce sont des garde-fous *provisoires de produit*, décidés par le fondateur pour éviter qu'une personne reçoive un entraînement
que la politique ne peut pas justifier. Ils ne constituent ni une recommandation médicale, ni un diagnostic, ni une garantie.

HomeFit ne diagnostique rien, ne déduit jamais qu'une personne est médicalement apte, n'invente aucun délai de reprise, aucune
limite de fréquence cardiaque ni de volume médicale, et n'affiche aucun numéro d'urgence (formulation : « services d'urgence
locaux »). Aucune IA ne prend de décision de sécurité.

Où vit la politique :

- `js/safety-policy.js` : les décisions (fonction pure `evaluateSafetyPolicy(profil, contexte)`), les paramètres provisoires
  (`SAFETY_POLICY_PARAMETERS`) et les messages (`SAFETY_POLICY_MESSAGES`) ;
- `js/safety-intensity.js` : la classification d'intensité des exercices (données seules) ;
- `js/safety.js` : le filtre d'exercices (`enforceSafeExercises`), dernier garde-fou au niveau des exercices ;
- `js/safety-ui.js` : l'affichage seul (messages, confirmation avant la première séance).

Chaque résultat de `evaluateSafetyPolicy` liste dans `pendingValidation` les paramètres provisoires qui ont influencé la décision.
Les tests (`tests/safety-policy.test.js`) échouent si un paramètre cité n'est pas déclaré, et si ce document n'est plus synchronisé
avec le code.

## 1. Règles appliquées (provisoires)

| Situation de l'utilisateur | Niveau | Effet |
|---|---|---|
| Questionnaire jamais renseigné, ou refus de répondre | `caution` | Confirmation de compréhension avant la première séance ; aucune augmentation (niveau, progression, phase 2, « trop facile », ressenti « facile », série ou finisher en plus, défis à charge croissante) |
| « Aucune de ces situations » | `clear` | Moteur sportif historique, inchangé |
| Situations physiques (genoux, dos, épaules, équilibre, mobilité) | `restricted` | Filtre d'exercices existant, restrictions cumulatives, aucune augmentation |
| Avis professionnel recommandé | `restricted` | Idem, et aucune haute intensité (plafond `moderate` ; tout exercice non classé compte comme haute intensité) |
| Symptômes thoraciques déclarés (quel que soit le contexte, y compris `evaluated`) | `blocked` | Aucun entraînement, aucune reprise, aucune récupération proposée, aucun défi d'effort, aucune adaptation |
| Plusieurs situations | le plus restrictif | Les restrictions s'additionnent ; aucune ne peut en annuler une autre |
| Signal urgent en séance | (action) | Arrêt immédiat, effacement immédiat de la séance en pause, aucune reprise, aucun détail médical conservé |

Une donnée absente, inconnue ou mal formée n'est jamais lue comme « aucune situation » et n'autorise jamais rien implicitement.

## 2. Paramètres à valider

Questions à soumettre au professionnel (repères M1 à M9 du dossier de validation) :

| Paramètre | Règle provisoire | Qui valide | Question |
|---|---|---|---|
| `caution-tier` | Questionnaire non renseigné ou refusé : niveau « caution », confirmation avant toute séance, aucune augmentation | produit + médical | M9 |
| `acknowledgement-content` | Texte et déclenchement de la confirmation « J'ai compris, continuer » | médical | M9 |
| `restricted-progression` | Situations physiques : aucune augmentation de charge, niveau plafonné à la séance de base | sport + médical | M6 |
| `volume-cap` | Plafond de volume = séance de base (facteur 1,0) dès que le niveau n'est pas « clear » | sport + médical | M6 |
| `professional-advice-limits` | Avis professionnel : aucune haute intensité ; les consignes exactes du professionnel ne sont pas connues | médical | M4 |
| `intensity-classification` | Classification d'intensité des exercices : aucune n'est validée | sport + médical | M5 |
| `chest-blocks-training` | Symptômes thoraciques déclarés : aucun entraînement, aucune reprise | médical | M1 |
| `chest-context-policy` | Contexte « evaluated » : n'est pas une autorisation de reprendre | médical | M1/M3 |
| `recovery-after-chest` | Aucune séance de récupération proposée en cas de symptômes thoraciques | médical | M2 |
| `urgent-signal-handling` | Signal urgent : arrêt immédiat, effacement, aucune reprise | médical | M7 |
| `messages-wording` | Formulation des messages affichés | médical | M7/M8 |
| `non-exercise-challenges` | Défis sans exercice (hydratation, Kegel) non restreints par la politique | médical | M2 |

## 3. Classification d'intensité (registre `js/safety-intensity.js`)

Toutes les classifications sont `provisional`. Elles ne sont attribuées que sur preuve existante dans le code ; sinon `unknown`,
traité comme haute intensité dès qu'une restriction s'applique.

- **`low`** (appartient aux routines douces existantes) : `respiration-profonde`, `chat-vache`, `rotations-hanches`,
  `rotations-bras`, `etirement-quadriceps`, `etirement-ischios`, `etirement-pectoraux`, `etirement-epaules`, `posture-enfant`.
- **`high`** (catégorie « Cardio » du catalogue) : `burpees`, `mountain-climbers`, `star-jump`, `squat-jump`, `jumping-jacks`.
- **`moderate`** : aucun exercice (aucune donnée existante ne l'atteste).
- **`unknown`** (à classer) : `genoux-hauts`, `pompes`, `pike-pushup`, `dips-chaise`, `extension-triceps`, `elevations-laterales`,
  `squat`, `fentes`, `pont-fessier`, `mollets`, `crunch`, `superman`, `rowing-serviette`, `curl-biceps`, `tirage-elastique`,
  `gainage-dorsal`, `planche`.

Conséquence à connaître : avec ces classifications, une personne ayant déclaré un avis professionnel ne reçoit que les mouvements
doux. Classer davantage d'exercices permettrait de proposer plus, mais seulement après validation.

## 4. Comment valider un paramètre

1. Le professionnel valide (ou corrige) la règle ; la décision est consignée par écrit.
2. Dans `js/safety-policy.js` (ou `js/safety-intensity.js`), passer `status` à `'validated'` et renseigner qui a validé et quand.
3. Adapter la règle si elle change, et les tests correspondants ; mettre à jour ce document.
4. Tant qu'un paramètre reste `provisional`, il reste listé dans `pendingValidation`.

Recommandation : bloquer toute mise en production grand public tant que des paramètres `provisional` subsistent.
