var CACHE_NAME = '64pad-v4.9.52';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.9.52',
  'pad-core/data.js?v=4.9.52',
  'pad-core/theory.js?v=4.9.52',
  'pad-core/render.js?v=4.9.52',
  'pad-core/circle.js?v=4.9.52',
  'data.js?v=4.9.52',
  'audio.js?v=4.9.52',
  'theory.js?v=4.9.52',
  'tasty-stock.js?v=4.9.52',
  'staff.js?v=4.9.52',
  'instruments.js?v=4.9.52',
  'circle-ui.js?v=4.9.52',
  'parent-scales-ui.js?v=4.9.52',
  'play-controls.js?v=4.9.52',
  'render.js?v=4.9.52',
  'builder.js?v=4.9.52',
  'midi.js?v=4.9.52',
  'plain.js?v=4.9.52',
  'perform.js?v=4.9.52',
  'i18n.js?v=4.9.52',
  'main.js?v=4.9.52',
  'tutorial-data.js?v=4.9.52',
  'tutorial.js?v=4.9.52',
  'lang-en.js?v=4.9.52',
  'lang-ja.js?v=4.9.52',
  'lang-zh.js?v=4.9.52',
  'lang-es.js?v=4.9.52',
  'lang-fr.js?v=4.9.52',
  'lang-pt.js?v=4.9.52',
  'lang-de.js?v=4.9.52',
  'lang-ko.js?v=4.9.52',
  'lang-it.js?v=4.9.52',
  'epiano-engine.js?v=4.9.52',
  'spring-reverb-processor.js?v=4.9.52',
  'data/tasty-recipes.json?v=4.9.52',
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
