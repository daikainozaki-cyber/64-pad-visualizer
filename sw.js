var CACHE_NAME = '64pad-v4.8.27';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.8.27',
  'pad-core/data.js?v=4.8.27',
  'pad-core/theory.js?v=4.8.27',
  'pad-core/render.js?v=4.8.27',
  'pad-core/circle.js?v=4.8.27',
  'data.js?v=4.8.27',
  'audio.js?v=4.8.27',
  'theory.js?v=4.8.27',
  'tasty-stock.js?v=4.8.27',
  'staff.js?v=4.8.27',
  'instruments.js?v=4.8.27',
  'circle-ui.js?v=4.8.27',
  'parent-scales-ui.js?v=4.8.27',
  'play-controls.js?v=4.8.27',
  'render.js?v=4.8.27',
  'builder.js?v=4.8.27',
  'midi.js?v=4.8.27',
  'plain.js?v=4.8.27',
  'perform.js?v=4.8.27',
  'i18n.js?v=4.8.27',
  'main.js?v=4.8.27',
  'tutorial-data.js?v=4.8.27',
  'tutorial.js?v=4.8.27',
  'lang-en.js?v=4.8.27',
  'lang-ja.js?v=4.8.27',
  'lang-zh.js?v=4.8.27',
  'lang-es.js?v=4.8.27',
  'lang-fr.js?v=4.8.27',
  'lang-pt.js?v=4.8.27',
  'lang-de.js?v=4.8.27',
  'lang-ko.js?v=4.8.27',
  'lang-it.js?v=4.8.27',
  'epiano-engine.js?v=4.8.27',
  'spring-reverb-processor.js?v=4.8.27',
  'data/tasty-recipes.json?v=4.8.27',
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
