var CACHE_NAME = '64pad-v4.8.44';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.44',
  'pad-core/data.js?v=4.8.44',
  'pad-core/theory.js?v=4.8.44',
  'pad-core/render.js?v=4.8.44',
  'pad-core/circle.js?v=4.8.44',
  'data.js?v=4.8.44',
  'audio.js?v=4.8.44',
  'theory.js?v=4.8.44',
  'tasty-stock.js?v=4.8.44',
  'staff.js?v=4.8.44',
  'instruments.js?v=4.8.44',
  'circle-ui.js?v=4.8.44',
  'parent-scales-ui.js?v=4.8.44',
  'play-controls.js?v=4.8.44',
  'render.js?v=4.8.44',
  'builder.js?v=4.8.44',
  'midi.js?v=4.8.44',
  'plain.js?v=4.8.44',
  'perform.js?v=4.8.44',
  'i18n.js?v=4.8.44',
  'main.js?v=4.8.44',
  'tutorial-data.js?v=4.8.44',
  'tutorial.js?v=4.8.44',
  'lang-en.js?v=4.8.44',
  'lang-ja.js?v=4.8.44',
  'lang-zh.js?v=4.8.44',
  'lang-es.js?v=4.8.44',
  'lang-fr.js?v=4.8.44',
  'lang-pt.js?v=4.8.44',
  'lang-de.js?v=4.8.44',
  'lang-ko.js?v=4.8.44',
  'lang-it.js?v=4.8.44',
  'epiano-engine.js?v=4.8.44',
  'spring-reverb-processor.js?v=4.8.44',
  'data/tasty-recipes.json?v=4.8.44',
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
