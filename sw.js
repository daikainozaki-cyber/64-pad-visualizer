var CACHE_NAME = '64pad-v4.8.29';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.29',
  'pad-core/data.js?v=4.8.29',
  'pad-core/theory.js?v=4.8.29',
  'pad-core/render.js?v=4.8.29',
  'pad-core/circle.js?v=4.8.29',
  'data.js?v=4.8.29',
  'audio.js?v=4.8.29',
  'theory.js?v=4.8.29',
  'tasty-stock.js?v=4.8.29',
  'staff.js?v=4.8.29',
  'instruments.js?v=4.8.29',
  'circle-ui.js?v=4.8.29',
  'parent-scales-ui.js?v=4.8.29',
  'play-controls.js?v=4.8.29',
  'render.js?v=4.8.29',
  'builder.js?v=4.8.29',
  'midi.js?v=4.8.29',
  'plain.js?v=4.8.29',
  'perform.js?v=4.8.29',
  'i18n.js?v=4.8.29',
  'main.js?v=4.8.29',
  'tutorial-data.js?v=4.8.29',
  'tutorial.js?v=4.8.29',
  'lang-en.js?v=4.8.29',
  'lang-ja.js?v=4.8.29',
  'lang-zh.js?v=4.8.29',
  'lang-es.js?v=4.8.29',
  'lang-fr.js?v=4.8.29',
  'lang-pt.js?v=4.8.29',
  'lang-de.js?v=4.8.29',
  'lang-ko.js?v=4.8.29',
  'lang-it.js?v=4.8.29',
  'epiano-engine.js?v=4.8.29',
  'spring-reverb-processor.js?v=4.8.29',
  'data/tasty-recipes.json?v=4.8.29',
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
