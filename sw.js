var CACHE_NAME = '64pad-v2.51.0';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=2.51.0',
  'data.js?v=2.51.0',
  'theory.js?v=2.51.0',
  'audio.js?v=2.51.0',
  'render.js?v=2.51.0',
  'builder.js?v=2.51.0',
  'plain.js?v=2.51.0',
  'perform.js?v=2.51.0',
  'i18n.js?v=2.51.0',
  'main.js?v=2.51.0',
  'lang-en.js?v=2.51.0',
  'lang-ja.js?v=2.51.0',
  'lang-zh.js?v=2.51.0',
  'lang-es.js?v=2.51.0',
  'lang-fr.js?v=2.51.0',
  'lang-pt.js?v=2.51.0',
  'lang-de.js?v=2.51.0',
  'lang-ko.js?v=2.51.0',
  'lang-it.js?v=2.51.0',
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
