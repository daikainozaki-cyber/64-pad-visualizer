var CACHE_NAME = '64pad-v3.18.12';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=3.18.12',
  'pad-core/data.js?v=3.18.12',
  'pad-core/theory.js?v=3.18.12',
  'pad-core/render.js?v=3.18.12',
  'data.js?v=3.18.12',
  'audio.js?v=3.18.12',
  'theory.js?v=3.18.12',
  'render.js?v=3.18.12',
  'builder.js?v=3.18.12',
  'plain.js?v=3.18.12',
  'perform.js?v=3.18.12',
  'i18n.js?v=3.18.12',
  'main.js?v=3.18.12',
  'lang-en.js?v=3.18.12',
  'lang-ja.js?v=3.18.12',
  'lang-zh.js?v=3.18.12',
  'lang-es.js?v=3.18.12',
  'lang-fr.js?v=3.18.12',
  'lang-pt.js?v=3.18.12',
  'lang-de.js?v=3.18.12',
  'lang-ko.js?v=3.18.12',
  'lang-it.js?v=3.18.12',
  'favicon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
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
