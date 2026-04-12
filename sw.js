var CACHE_NAME = '64pad-v4.9.114';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.9.91',
  'pad-core/data.js?v=4.9.91',
  'pad-core/theory.js?v=4.9.91',
  'pad-core/render.js?v=4.9.91',
  'pad-core/circle.js?v=4.9.91',
  'data.js?v=4.9.91',
  'audio.js?v=4.9.91',
  'theory.js?v=4.9.91',
  'tasty-stock.js?v=4.9.91',
  'staff.js?v=4.9.91',
  'instruments.js?v=4.9.91',
  'circle-ui.js?v=4.9.91',
  'parent-scales-ui.js?v=4.9.91',
  'play-controls.js?v=4.9.91',
  'render.js?v=4.9.91',
  'builder.js?v=4.9.91',
  'midi.js?v=4.9.91',
  'plain.js?v=4.9.91',
  'perform.js?v=4.9.91',
  'i18n.js?v=4.9.91',
  'main.js?v=4.9.91',
  'tutorial-data.js?v=4.9.91',
  'tutorial.js?v=4.9.91',
  'lang-en.js?v=4.9.91',
  'lang-ja.js?v=4.9.91',
  'lang-zh.js?v=4.9.91',
  'lang-es.js?v=4.9.91',
  'lang-fr.js?v=4.9.91',
  'lang-pt.js?v=4.9.91',
  'lang-de.js?v=4.9.91',
  'lang-ko.js?v=4.9.91',
  'lang-it.js?v=4.9.91',
  'epiano-engine.js?v=4.9.91',
  'spring-reverb-processor.js?v=4.9.91',
  'data/tasty-recipes.json?v=4.9.91',
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
  // localhost = dev mode: always fetch from network (no stale cache)
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    e.respondWith(fetch(e.request));
    return;
  }
  // Production: network first for navigation, cache first for assets
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
