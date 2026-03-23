var CACHE_NAME = '64pad-v4.8.20';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.20',
  'pad-core/data.js?v=4.8.20',
  'pad-core/theory.js?v=4.8.20',
  'pad-core/render.js?v=4.8.20',
  'pad-core/circle.js?v=4.8.20',
  'data.js?v=4.8.20',
  'audio.js?v=4.8.20',
  'theory.js?v=4.8.20',
  'tasty-stock.js?v=4.8.20',
  'staff.js?v=4.8.20',
  'instruments.js?v=4.8.20',
  'circle-ui.js?v=4.8.20',
  'parent-scales-ui.js?v=4.8.20',
  'play-controls.js?v=4.8.20',
  'render.js?v=4.8.20',
  'builder.js?v=4.8.20',
  'midi.js?v=4.8.20',
  'plain.js?v=4.8.20',
  'perform.js?v=4.8.20',
  'i18n.js?v=4.8.20',
  'main.js?v=4.8.20',
  'tutorial-data.js?v=4.8.20',
  'tutorial.js?v=4.8.20',
  'lang-en.js?v=4.8.20',
  'lang-ja.js?v=4.8.20',
  'lang-zh.js?v=4.8.20',
  'lang-es.js?v=4.8.20',
  'lang-fr.js?v=4.8.20',
  'lang-pt.js?v=4.8.20',
  'lang-de.js?v=4.8.20',
  'lang-ko.js?v=4.8.20',
  'lang-it.js?v=4.8.20',
  'epiano-engine.js?v=4.8.20',
  'spring-reverb-processor.js?v=4.8.20',
  'data/tasty-recipes.json?v=4.8.20',
  'favicon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(ASSETS.map(function(url) {
        return fetch(url, { cache: 'reload' }).then(function(res) {
          return cache.put(url, res);
        });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Network first for navigation, cache first for assets
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match('index.html');
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
