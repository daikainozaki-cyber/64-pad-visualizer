var CACHE_NAME = '64pad-v5.0.12';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=5.0.12',
  'pad-core/data.js?v=5.0.12',
  'pad-core/theory.js?v=5.0.12',
  'pad-core/render.js?v=5.0.12',
  'pad-core/circle.js?v=5.0.12',
  'pad-core/builder-ui.js?v=5.0.12',
  'pad-core/incremental.js?v=5.0.12',
  'data.js?v=5.0.12',
  'audio-master.js?v=5.0.12',
  'audio-effects.js?v=5.0.12',
  'audio-reverb.js?v=5.0.12',
  'audio-sampler.js?v=5.0.12',
  'audio.js?v=5.0.12',
  'theory.js?v=5.0.12',
  'tasty-stock.js?v=5.0.12',
  'staff.js?v=5.0.12',
  'instruments.js?v=5.0.12',
  'circle-ui.js?v=5.0.12',
  'parent-scales-ui.js?v=5.0.12',
  'play-controls.js?v=5.0.12',
  'render.js?v=5.0.12',
  'builder.js?v=5.0.12',
  'midi.js?v=5.0.12',
  'plain.js?v=5.0.12',
  'perform.js?v=5.0.12',
  'i18n.js?v=5.0.12',
  'main.js?v=5.0.12',
  'tutorial-data.js?v=5.0.12',
  'tutorial.js?v=5.0.12',
  'lang-en.js?v=5.0.12',
  'lang-ja.js?v=5.0.12',
  'lang-zh.js?v=5.0.12',
  'lang-es.js?v=5.0.12',
  'lang-fr.js?v=5.0.12',
  'lang-pt.js?v=5.0.12',
  'lang-de.js?v=5.0.12',
  'lang-ko.js?v=5.0.12',
  'lang-it.js?v=5.0.12',
  'epiano-engine.js?v=5.0.12',
  'epiano-worklet-engine.js?v=5.0.12',
  'epiano-worklet-processor.js?v=5.0.12',
  'spring-reverb-processor.js?v=5.0.12',
  'data/tasty-recipes.json?v=5.0.12',
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
