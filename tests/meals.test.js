const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const menu = (diet, day) => createApp().run(`getDayMenu('${diet}', ${day})`);
const allItems = (diet) => {
  const items = [];
  for (let d = 0; d < 7; d++) Object.values(menu(diet, d)).forEach((m) => items.push(...m));
  return items;
};

test('menus : 7 jours × 4 repas non vides pour chaque régime, chaque aliment commence par un emoji', () => {
  for (const diet of ['omnivore', 'vegetarien', 'sanslactose']) {
    for (let d = 0; d < 7; d++) {
      const m = menu(diet, d);
      assert.deepStrictEqual(Object.keys(m), ['breakfast', 'lunch', 'dinner', 'snack']);
      Object.values(m).forEach((items) => assert.ok(items.length >= 2, `${diet} jour ${d}`));
    }
    allItems(diet).forEach((i) => assert.match(i, /^\p{Extended_Pictographic}\uFE0F? \S/u, `${diet} : « ${i} » doit commencer par un emoji`));
  }
});

test('régime végétarien : aucune viande ni poisson', () => {
  const found = allItems('vegetarien').filter((i) => /poulet|dinde|steak|bœuf|thon|saumon|poisson|jambon|porc|agneau/i.test(i));
  assert.deepStrictEqual(found, []);
});

test('régime sans lactose : aucun produit laitier', () => {
  const found = allItems('sanslactose').filter((i) => /\blait\b|fromage|parmesan|yaourt grec|crème|beurre\b(?! de)/i.test(i.replace(/sans fromage/i, '')) && !/boisson|végétale|soja/i.test(i));
  assert.deepStrictEqual(found, []);
});

test('les menus varient d\'un jour à l\'autre', () => {
  for (const diet of ['omnivore', 'vegetarien', 'sanslactose']) {
    const lunches = new Set();
    for (let d = 0; d < 7; d++) lunches.add(menu(diet, d).lunch.join('|'));
    assert.strictEqual(lunches.size, 7, `${diet} : 7 déjeuners différents`);
  }
});

test('liste de courses : aliments uniques de la semaine, sans emoji', () => {
  const app = createApp();
  const list = app.run(`getWeekShoppingList('omnivore')`);
  assert.strictEqual(new Set(list).size, list.length);
  assert.ok(list.length > 30);
  assert.ok(list.every((n) => n && !/\p{Extended_Pictographic}/u.test(n)));
});

test('jour du menu : lundi = 0, dimanche = 6', () => {
  const app = createApp();
  assert.strictEqual(app.run('mealDayIndex(new Date(2026, 9, 12))'), 0);
  assert.strictEqual(app.run('mealDayIndex(new Date(2026, 9, 18))'), 6);
});

test('chaque objectif a une consigne de portions', () => {
  const app = createApp();
  for (const g of ['muscle', 'perte', 'forme', 'discipline']) assert.ok(app.run(`PORTION_NOTES['${g}']`));
});
