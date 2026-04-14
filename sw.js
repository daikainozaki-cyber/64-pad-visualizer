var CACHE_NAME = '64pad-v5.0.20';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=5.0.20',
  'pad-core/data.js?v=5.0.20',
  'pad-core/theory.js?v=5.0.20',
  'pad-core/render.js?v=5.0.20',
  'pad-core/circle.js?v=5.0.20',
  'pad-core/builder-ui.js?v=5.0.20',
  'pad-core/incremental.js?v=5.0.20',
  'data.js?v=5.0.20',
  'audio-core/audio-master.js?v=5.0.20',
  'audio-core/audio-effects.js?v=5.0.20',
  'audio-core/audio-reverb.js?v=5.0.20',
  'audio-core/audio-sampler.js?v=5.0.20',
  'audio-core/audio-engines.js?v=5.0.20',
  'audio-core/audio-persistence.js?v=5.0.20',
  'audio-core/audio-overlay.js?v=5.0.20',
  'audio-core/audio-voice.js?v=5.0.20',
  'audio-core/audio.js?v=5.0.20',
  'audio-ui-binding.js?v=5.0.20',
  'theory.js?v=5.0.20',
  'tasty-stock.js?v=5.0.20',
  'staff.js?v=5.0.20',
  'instruments.js?v=5.0.20',
  'circle-ui.js?v=5.0.20',
  'parent-scales-ui.js?v=5.0.20',
  'play-controls.js?v=5.0.20',
  'render.js?v=5.0.20',
  'builder.js?v=5.0.20',
  'midi.js?v=5.0.20',
  'plain.js?v=5.0.20',
  'perform.js?v=5.0.20',
  'i18n.js?v=5.0.20',
  'main.js?v=5.0.20',
  'tutorial-data.js?v=5.0.20',
  'tutorial.js?v=5.0.20',
  'lang-en.js?v=5.0.20',
  'lang-ja.js?v=5.0.20',
  'lang-zh.js?v=5.0.20',
  'lang-es.js?v=5.0.20',
  'lang-fr.js?v=5.0.20',
  'lang-pt.js?v=5.0.20',
  'lang-de.js?v=5.0.20',
  'lang-ko.js?v=5.0.20',
  'lang-it.js?v=5.0.20',
  'audio-core/epiano-engine.js?v=5.0.20',
  'audio-core/epiano-worklet-engine.js?v=5.0.20',
  'audio-core/epiano-worklet-processor.js?v=5.0.20',
  'audio-core/spring-reverb-processor.js?v=5.0.20',
  'data/tasty-recipes.json?v=5.0.20',
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
