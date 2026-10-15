# HomeFit Coach

Application web (HTML / CSS / JavaScript, sans serveur) pour suivre un programme de remise en forme de 12 semaines à la maison : séances guidées avec minuteur, fiches d'exercices, suivi de progression, série hebdomadaire, nutrition et routine Kegel. Installable comme application mobile (PWA). Les données restent dans le navigateur (LocalStorage).

## Fonctionnalités

- Programme de 12 semaines avec progression (semaines allégées), variantes selon l'objectif et le matériel disponible ; à la fin : phase 2, mode entretien ou nouveau cycle
- Jours d'entraînement au choix, rattrapage automatique des séances manquées, série hebdomadaire
- Séance guidée : minuteurs, répétitions réelles, échauffement et étirements, coach vocal, reprise après pause
- Séance de récupération (jours de repos), défis personnels (pompes, gainage, squats, Kegel, hydratation)
- Bibliothèque d'exercices avec photos, bilan de la semaine, coach à règles (10 situations, conseil selon tes données)
- Nutrition : besoins, menus sur 7 jours (classique, végétarien, sans lactose), eau, liste de courses ; routine Kegel
- Rappels via un fichier agenda (.ics), transfert des données entre appareils (code ou fichier), rappel de sauvegarde
- Hors-ligne (PWA), thème automatique, taille de texte réglable, animations réductibles, page À propos

## Lancer en local

```bash
node serve.js   # puis ouvrir http://localhost:4173
```

## Crédits

- Photos d'exercices : [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (licence Unlicense, domaine public).
- Photos des burpees : Taco Fleur, [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Burpee), licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr), redimensionnées.

## Tests

```bash
npm test   # logique métier : plan de semaine, série, progression, matériel, transfert, agenda
```

Les tests tournent aussi à chaque `push` via GitHub Actions.
