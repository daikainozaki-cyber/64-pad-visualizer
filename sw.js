var CACHE_NAME = '64pad-v4.9.53';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.9.53',
  'pad-core/data.js?v=4.9.53',
  'pad-core/theory.js?v=4.9.53',
  'pad-core/render.js?v=4.9.53',
  'pad-core/circle.js?v=4.9.53',
  'data.js?v=4.9.53',
  'audio.js?v=4.9.53',
  'theory.js?v=4.9.53',
  'tasty-stock.js?v=4.9.53',
  'staff.js?v=4.9.53',
  'instruments.js?v=4.9.53',
  'circle-ui.js?v=4.9.53',
  'parent-scales-ui.js?v=4.9.53',
  'play-controls.js?v=4.9.53',
  'render.js?v=4.9.53',
  'builder.js?v=4.9.53',
  'midi.js?v=4.9.53',
  'plain.js?v=4.9.53',
  'perform.js?v=4.9.53',
  'i18n.js?v=4.9.53',
  'main.js?v=4.9.53',
  'tutorial-data.js?v=4.9.53',
  'tutorial.js?v=4.9.53',
  'lang-en.js?v=4.9.53',
  'lang-ja.js?v=4.9.53',
  'lang-zh.js?v=4.9.53',
  'lang-es.js?v=4.9.53',
  'lang-fr.js?v=4.9.53',
  'lang-pt.js?v=4.9.53',
  'lang-de.js?v=4.9.53',
  'lang-ko.js?v=4.9.53',
  'lang-it.js?v=4.9.53',
  'epiano-engine.js?v=4.9.53',
  'spring-reverb-processor.js?v=4.9.53',
  'data/tasty-recipes.json?v=4.9.53',
  'favicon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'data/fdtd/attack_tables.bin',
  'data/fdtd/manifest.json',
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
