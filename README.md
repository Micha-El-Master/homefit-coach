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
- Communauté WhatsApp : lien de cohorte (`?cohorte=AAAA-MM-JJ`), annonces via `communaute.json`, défis synchronisés, cartes « Statut WhatsApp » (image 9:16 : bilan, séance, succès, progression ; 3 thèmes, prénom et photo de fond en option)
- Jeûne communautaire (3 jours par mois, en général mer.-ven.) : calendrier du mois, jeûnes annoncés via `communaute.json` (`fasts`) ou ajoutés à la main, séances remplacées par de la récupération douce, reprise à 60 % puis 70 %, séances dispensées sans pénaliser la série
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
npm test              # alias complet des tests unitaires actuels
npm run test:unit     # logique métier : plan de semaine, série, progression, matériel, transfert, agenda
npm run test:browser  # parcours navigateur sur les résolutions 320, 375, 390 et 430 px
npm run test:baseline # tests unitaires puis tests navigateur
```

Les tests tournent aussi à chaque `push` via GitHub Actions.

## Tests navigateur reproductibles

Les tests Playwright utilisent le serveur local intégré et vérifient :

- le parcours sans profil ;
- la création d’un profil ;
- les pages essentielles avec profil ;
- l’absence d’erreurs JavaScript ;
- la largeur des écrans mobiles.

Première installation :

```bash
npm install
npx playwright install chromium
npm run test:browser
```

La matrice couvre les largeurs suivantes :

- 320 px — petit téléphone
- 375 px — téléphone courant
- 390 px — téléphone moderne
- 430 px — grand téléphone
