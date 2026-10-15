const CACHE_NAME = 'homefit-coach-v13';
const ASSETS = [
  'index.html',
  'dashboard.html',
  'workout.html',
  'exercise.html',
  'nutrition.html',
  'kegel.html',
  'progress.html',
  'css/style.css',
  'js/app.js',
  'js/storage.js',
  'js/workouts.js',
  'js/exercises.js',
  'js/timer.js',
  'js/badges.js',
  'js/illustrations.js',
  'coach.html',
  'settings.html',
  'library.html',
  'recap.html',
  'js/recap.js',
  'js/meals.js',
  'js/challenges.js',
  'challenges.html',
  'about.html',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'images/exercises/pompes-0.jpg',
  'images/exercises/pompes-1.jpg',
  'images/exercises/dips-chaise-0.jpg',
  'images/exercises/dips-chaise-1.jpg',
  'images/exercises/extension-triceps-0.jpg',
  'images/exercises/extension-triceps-1.jpg',
  'images/exercises/elevations-laterales-0.jpg',
  'images/exercises/elevations-laterales-1.jpg',
  'images/exercises/squat-0.jpg',
  'images/exercises/squat-1.jpg',
  'images/exercises/fentes-0.jpg',
  'images/exercises/fentes-1.jpg',
  'images/exercises/pont-fessier-0.jpg',
  'images/exercises/pont-fessier-1.jpg',
  'images/exercises/crunch-0.jpg',
  'images/exercises/crunch-1.jpg',
  'images/exercises/superman-0.jpg',
  'images/exercises/superman-1.jpg',
  'images/exercises/curl-biceps-0.jpg',
  'images/exercises/curl-biceps-1.jpg',
  'images/exercises/mountain-climbers-0.jpg',
  'images/exercises/mountain-climbers-1.jpg',
  'images/exercises/squat-jump-0.jpg',
  'images/exercises/squat-jump-1.jpg',
  'images/exercises/planche-0.jpg',
  'images/exercises/planche-1.jpg',
  'images/exercises/pike-pushup-0.jpg',
  'images/exercises/pike-pushup-1.jpg',
  'images/exercises/mollets-0.jpg',
  'images/exercises/mollets-1.jpg',
  'images/exercises/rowing-serviette-0.jpg',
  'images/exercises/rowing-serviette-1.jpg',
  'images/exercises/tirage-elastique-0.jpg',
  'images/exercises/tirage-elastique-1.jpg',
  'images/exercises/star-jump-0.jpg',
  'images/exercises/star-jump-1.jpg',
  'images/exercises/burpees-0.jpg',
  'images/exercises/burpees-1.jpg',
  'images/exercises/burpees-2.jpg',
  'images/exercises/burpees-3.jpg',
  'images/thumbs/burpees.jpg',
  'images/thumbs/crunch.jpg',
  'images/thumbs/curl-biceps.jpg',
  'images/thumbs/dips-chaise.jpg',
  'images/thumbs/elevations-laterales.jpg',
  'images/thumbs/extension-triceps.jpg',
  'images/thumbs/fentes.jpg',
  'images/thumbs/mollets.jpg',
  'images/thumbs/mountain-climbers.jpg',
  'images/thumbs/pike-pushup.jpg',
  'images/thumbs/planche.jpg',
  'images/thumbs/pompes.jpg',
  'images/thumbs/pont-fessier.jpg',
  'images/thumbs/rowing-serviette.jpg',
  'images/thumbs/squat-jump.jpg',
  'images/thumbs/squat.jpg',
  'images/thumbs/star-jump.jpg',
  'images/thumbs/superman.jpg',
  'images/thumbs/tirage-elastique.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      // Hors-ligne : les pages à paramètres (exercise.html?id=…, workout.html?s=…) retombent sur la page en cache.
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
