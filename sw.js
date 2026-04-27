var CACHE_NAME = '64pad-v6.0.2';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=6.0.2',
  'pad-core/data.js?v=6.0.2',
  'pad-core/theory.js?v=6.0.2',
  'pad-core/render.js?v=6.0.2',
  'pad-core/circle.js?v=6.0.2',
  'pad-core/builder-ui.js?v=6.0.2',
  'pad-core/incremental.js?v=6.0.2',
  'data.js?v=6.0.2',
  'host-adapter.js?v=6.0.2',
  'audio-core/audio-master.js?v=6.0.2',
  'audio-core/audio-effects.js?v=6.0.2',
  'audio-core/audio-reverb.js?v=6.0.2',
  'audio-core/audio-sampler.js?v=6.0.2',
  'audio-core/audio-engines.js?v=6.0.2',
  'audio-core/audio-persistence.js?v=6.0.2',
  'audio-core/audio-overlay.js?v=6.0.2',
  'audio-core/audio-voice.js?v=6.0.2',
  'audio-core/audio.js?v=6.0.2',
  'audio-ui-binding.js?v=6.0.2',
  'theory.js?v=6.0.2',
  'tasty-stock.js?v=6.0.2',
  'staff.js?v=6.0.2',
  'instruments.js?v=6.0.2',
  'circle-ui.js?v=6.0.2',
  'parent-scales-ui.js?v=6.0.2',
  'play-controls.js?v=6.0.2',
  'render.js?v=6.0.2',
  'builder.js?v=6.0.2',
  'midi.js?v=6.0.2',
  'plain.js?v=6.0.2',
  'perform.js?v=6.0.2',
  'i18n.js?v=6.0.2',
  'main.js?v=6.0.2',
  'tutorial-data.js?v=6.0.2',
  'tutorial.js?v=6.0.2',
  'lang-en.js?v=6.0.2',
  'lang-ja.js?v=6.0.2',
  'lang-zh.js?v=6.0.2',
  'lang-es.js?v=6.0.2',
  'lang-fr.js?v=6.0.2',
  'lang-pt.js?v=6.0.2',
  'lang-de.js?v=6.0.2',
  'lang-ko.js?v=6.0.2',
  'lang-it.js?v=6.0.2',
  'audio-core/epiano-engine.js?v=6.0.2',
  'audio-core/epiano-worklet-engine.js?v=6.0.2',
  'audio-core/epiano-worklet-processor.js?v=6.0.2',
  'audio-core/spring-reverb-processor.js?v=6.0.2',
  'data/tasty-recipes.json?v=6.0.2',
  'favicon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'audio-core/assets/fdtd/attack_tables.bin',
  'audio-core/assets/fdtd/manifest.json',
  'audio-core/assets/twin-cab-ir.wav',
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
