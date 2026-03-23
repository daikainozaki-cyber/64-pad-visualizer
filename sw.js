var CACHE_NAME = '64pad-v4.8.23';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.23',
  'pad-core/data.js?v=4.8.23',
  'pad-core/theory.js?v=4.8.23',
  'pad-core/render.js?v=4.8.23',
  'pad-core/circle.js?v=4.8.23',
  'data.js?v=4.8.23',
  'audio.js?v=4.8.23',
  'theory.js?v=4.8.23',
  'tasty-stock.js?v=4.8.23',
  'staff.js?v=4.8.23',
  'instruments.js?v=4.8.23',
  'circle-ui.js?v=4.8.23',
  'parent-scales-ui.js?v=4.8.23',
  'play-controls.js?v=4.8.23',
  'render.js?v=4.8.23',
  'builder.js?v=4.8.23',
  'midi.js?v=4.8.23',
  'plain.js?v=4.8.23',
  'perform.js?v=4.8.23',
  'i18n.js?v=4.8.23',
  'main.js?v=4.8.23',
  'tutorial-data.js?v=4.8.23',
  'tutorial.js?v=4.8.23',
  'lang-en.js?v=4.8.23',
  'lang-ja.js?v=4.8.23',
  'lang-zh.js?v=4.8.23',
  'lang-es.js?v=4.8.23',
  'lang-fr.js?v=4.8.23',
  'lang-pt.js?v=4.8.23',
  'lang-de.js?v=4.8.23',
  'lang-ko.js?v=4.8.23',
  'lang-it.js?v=4.8.23',
  'epiano-engine.js?v=4.8.23',
  'spring-reverb-processor.js?v=4.8.23',
  'data/tasty-recipes.json?v=4.8.23',
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
