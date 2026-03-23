var CACHE_NAME = '64pad-v4.8.22';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.22',
  'pad-core/data.js?v=4.8.22',
  'pad-core/theory.js?v=4.8.22',
  'pad-core/render.js?v=4.8.22',
  'pad-core/circle.js?v=4.8.22',
  'data.js?v=4.8.22',
  'audio.js?v=4.8.22',
  'theory.js?v=4.8.22',
  'tasty-stock.js?v=4.8.22',
  'staff.js?v=4.8.22',
  'instruments.js?v=4.8.22',
  'circle-ui.js?v=4.8.22',
  'parent-scales-ui.js?v=4.8.22',
  'play-controls.js?v=4.8.22',
  'render.js?v=4.8.22',
  'builder.js?v=4.8.22',
  'midi.js?v=4.8.22',
  'plain.js?v=4.8.22',
  'perform.js?v=4.8.22',
  'i18n.js?v=4.8.22',
  'main.js?v=4.8.22',
  'tutorial-data.js?v=4.8.22',
  'tutorial.js?v=4.8.22',
  'lang-en.js?v=4.8.22',
  'lang-ja.js?v=4.8.22',
  'lang-zh.js?v=4.8.22',
  'lang-es.js?v=4.8.22',
  'lang-fr.js?v=4.8.22',
  'lang-pt.js?v=4.8.22',
  'lang-de.js?v=4.8.22',
  'lang-ko.js?v=4.8.22',
  'lang-it.js?v=4.8.22',
  'epiano-engine.js?v=4.8.22',
  'spring-reverb-processor.js?v=4.8.22',
  'data/tasty-recipes.json?v=4.8.22',
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
