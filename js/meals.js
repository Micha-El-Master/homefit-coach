// Menus sur 7 jours (lundi = 0 … dimanche = 6) pour trois régimes. Indicatif : vérifie les ingrédients en cas d'allergie.
const DIETS = {
  omnivore: 'Classique',
  vegetarien: 'Végétarien',
  sanslactose: 'Sans lactose',
};

const MEAL_LABELS = { breakfast: '🌅 Petit déjeuner', lunch: '☀️ Déjeuner', dinner: '🌙 Dîner', snack: '🍎 Collation' };

const BREAKFASTS = [
  ['🥚 3 œufs brouillés', '🍞 2 tranches de pain complet', '🍊 Orange'],
  ['🥣 Flocons d’avoine au lait', '🍌 Banane', '🥜 Beurre de cacahuète'],
  ['🥛 Yaourt grec', '🍓 Fruits rouges', '🌾 Muesli sans sucre ajouté'],
  ['🥚 Omelette de 2 œufs aux champignons', '🍞 Pain complet', '🍎 Pomme'],
  ['🥣 Porridge à la cannelle', '🍐 Poire', '🌰 Noix'],
  ['🥞 Pancakes avoine-banane', '🍯 Filet de miel', '🥛 Lait'],
  ['🍳 Œufs au plat', '🥑 Avocat', '🍞 Pain complet grillé'],
];

const SNACKS = [
  ['🥜 Poignée d’amandes', '🥛 Yaourt grec'],
  ['🍌 Banane', '🥜 Beurre de cacahuète'],
  ['🥕 Bâtonnets de légumes', '🧀 Fromage blanc'],
  ['🍎 Pomme', '🌰 Noix'],
  ['🥛 Verre de lait', '🍪 Biscuit complet'],
  ['🍇 Raisin', '🧀 Morceau de fromage'],
  ['🍫 Deux carrés de chocolat noir', '🍊 Clémentines'],
];

const MEALS = {
  omnivore: {
    breakfast: BREAKFASTS,
    snack: SNACKS,
    lunch: [
      ['🍗 Poulet grillé', '🍚 Riz complet', '🥦 Brocolis'],
      ['🐟 Thon', '🍝 Pâtes complètes', '🍅 Tomates'],
      ['🥩 Steak haché 5 %', '🥔 Pommes de terre vapeur', '🥗 Haricots verts'],
      ['🍗 Dinde sautée', '🍚 Quinoa', '🥕 Carottes'],
      ['🐟 Saumon', '🍚 Riz blanc', '🥬 Épinards'],
      ['🥗 Salade composée œufs-thon', '🍞 Pain complet', '🫒 Huile d’olive'],
      ['🍗 Poulet rôti', '🥔 Patate douce', '🥗 Salade verte'],
    ],
    dinner: [
      ['🐟 Poisson blanc', '🥔 Patate douce', '🥦 Brocolis'],
      ['🥚 Omelette aux légumes', '🍞 Pain complet', '🥗 Salade verte'],
      ['🍗 Poulet au curry léger', '🍚 Riz basmati', '🥬 Courgettes'],
      ['🥩 Bœuf sauté aux légumes', '🍜 Nouilles de riz'],
      ['🐟 Saumon', '🥔 Pommes de terre', '🥗 Haricots verts'],
      ['🍕 Pizza maison pâte fine', '🥗 Salade verte'],
      ['🍲 Soupe de légumes', '🥚 2 œufs durs', '🍞 Pain complet'],
    ],
  },
  vegetarien: {
    breakfast: BREAKFASTS,
    snack: SNACKS,
    lunch: [
      ['🫘 Lentilles', '🍚 Riz complet', '🥦 Brocolis'],
      ['🥚 Œufs durs', '🍝 Pâtes complètes', '🍅 Sauce tomate'],
      ['🧆 Falafels', '🥙 Pain pita', '🥒 Salade de concombre'],
      ['🧈 Tofu sauté', '🍚 Quinoa', '🥕 Carottes'],
      ['🫘 Pois chiches rôtis', '🍚 Riz blanc', '🥬 Épinards'],
      ['🥗 Salade composée œufs-fromage', '🍞 Pain complet', '🫒 Huile d’olive'],
      ['🫘 Chili sin carne', '🥔 Patate douce'],
    ],
    dinner: [
      ['🫘 Dahl de lentilles', '🍚 Riz basmati'],
      ['🥚 Omelette aux légumes', '🍞 Pain complet', '🥗 Salade verte'],
      ['🧈 Tofu au curry', '🍚 Riz blanc', '🥬 Courgettes'],
      ['🍝 Pâtes aux légumes grillés', '🧀 Parmesan'],
      ['🥔 Gratin de légumes léger', '🥚 Œuf poché'],
      ['🍕 Pizza maison aux légumes', '🥗 Salade verte'],
      ['🍲 Soupe de légumes', '🧀 Fromage', '🍞 Pain complet'],
    ],
  },
  sanslactose: {
    breakfast: [
      BREAKFASTS[0],
      ['🥣 Flocons d’avoine à la boisson d’avoine', '🍌 Banane', '🥜 Beurre de cacahuète'],
      ['🥛 Yaourt de soja', '🍓 Fruits rouges', '🌾 Muesli sans sucre ajouté'],
      BREAKFASTS[3],
      ['🥣 Porridge à la boisson d’avoine', '🍐 Poire', '🌰 Noix'],
      ['🥞 Pancakes avoine-banane (boisson végétale)', '🍯 Filet de miel'],
      BREAKFASTS[6],
    ],
    snack: [
      ['🥜 Poignée d’amandes', '🥛 Yaourt de soja'],
      SNACKS[1],
      ['🥕 Bâtonnets de légumes', '🥑 Houmous'],
      SNACKS[3],
      ['🥛 Boisson d’avoine', '🍘 Galettes de riz'],
      ['🍇 Raisin', '🌰 Noix de cajou'],
      SNACKS[6],
    ],
    lunch: null, // identique au régime classique (aucun produit laitier)
    dinner: null,
  },
};
MEALS.sanslactose.lunch = MEALS.omnivore.lunch;
MEALS.sanslactose.dinner = MEALS.omnivore.dinner.map((m, i) => (i === 5 ? ['🍕 Pizza maison sans fromage (légumes, jambon)', '🥗 Salade verte'] : m));

const PORTION_NOTES = {
  muscle: 'Ajoute une portion de féculents à chaque repas principal et une collation riche en protéines.',
  perte: 'Réduis les féculents d’environ un tiers, double les légumes et garde les protéines.',
  forme: 'Portions standard : bois de l’eau aux repas et prends le temps de manger.',
  discipline: 'Pas besoin de peser : une assiette = ½ légumes, ¼ protéines, ¼ féculents.',
};

// Jour de la semaine 0 = lundi … 6 = dimanche
function mealDayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

function getDayMenu(diet, dayIndex) {
  const pool = MEALS[diet] || MEALS.omnivore;
  return {
    breakfast: pool.breakfast[dayIndex],
    lunch: pool.lunch[dayIndex],
    dinner: pool.dinner[dayIndex],
    snack: pool.snack[dayIndex],
  };
}

function foodName(item) {
  return item.split(' ').slice(1).join(' ');
}

// Noms d'aliments uniques sur les 7 jours, dans l'ordre d'apparition.
function getWeekShoppingList(diet) {
  const names = [];
  for (let d = 0; d < 7; d++) {
    Object.values(getDayMenu(diet, d)).forEach((items) => items.forEach((i) => names.push(foodName(i))));
  }
  return [...new Set(names)];
}
