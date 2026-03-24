var CACHE_NAME = '64pad-v4.8.28';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.28',
  'pad-core/data.js?v=4.8.28',
  'pad-core/theory.js?v=4.8.28',
  'pad-core/render.js?v=4.8.28',
  'pad-core/circle.js?v=4.8.28',
  'data.js?v=4.8.28',
  'audio.js?v=4.8.28',
  'theory.js?v=4.8.28',
  'tasty-stock.js?v=4.8.28',
  'staff.js?v=4.8.28',
  'instruments.js?v=4.8.28',
  'circle-ui.js?v=4.8.28',
  'parent-scales-ui.js?v=4.8.28',
  'play-controls.js?v=4.8.28',
  'render.js?v=4.8.28',
  'builder.js?v=4.8.28',
  'midi.js?v=4.8.28',
  'plain.js?v=4.8.28',
  'perform.js?v=4.8.28',
  'i18n.js?v=4.8.28',
  'main.js?v=4.8.28',
  'tutorial-data.js?v=4.8.28',
  'tutorial.js?v=4.8.28',
  'lang-en.js?v=4.8.28',
  'lang-ja.js?v=4.8.28',
  'lang-zh.js?v=4.8.28',
  'lang-es.js?v=4.8.28',
  'lang-fr.js?v=4.8.28',
  'lang-pt.js?v=4.8.28',
  'lang-de.js?v=4.8.28',
  'lang-ko.js?v=4.8.28',
  'lang-it.js?v=4.8.28',
  'epiano-engine.js?v=4.8.28',
  'spring-reverb-processor.js?v=4.8.28',
  'data/tasty-recipes.json?v=4.8.28',
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
