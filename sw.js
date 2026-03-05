var CACHE_NAME = '64pad-v3.9.5';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=3.9.5',
  'data.js?v=3.9.5',
  'audio.js?v=3.9.5',
  'theory.js?v=3.9.5',
  'render.js?v=3.9.5',
  'builder.js?v=3.9.5',
  'plain.js?v=3.9.5',
  'perform.js?v=3.9.5',
  'i18n.js?v=3.9.5',
  'main.js?v=3.9.5',
  'lang-en.js?v=3.9.5',
  'lang-ja.js?v=3.9.5',
  'lang-zh.js?v=3.9.5',
  'lang-es.js?v=3.9.5',
  'lang-fr.js?v=3.9.5',
  'lang-pt.js?v=3.9.5',
  'lang-de.js?v=3.9.5',
  'lang-ko.js?v=3.9.5',
  'lang-it.js?v=3.9.5',
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
