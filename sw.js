var CACHE_NAME = '64pad-v3.35.6';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=3.35.6',
  'pad-core/data.js?v=3.35.6',
  'pad-core/theory.js?v=3.35.6',
  'pad-core/render.js?v=3.35.6',
  'pad-core/circle.js?v=3.35.6',
  'data.js?v=3.35.6',
  'audio.js?v=3.35.6',
  'theory.js?v=3.35.6',
  'render.js?v=3.35.6',
  'builder.js?v=3.35.6',
  'plain.js?v=3.35.6',
  'perform.js?v=3.35.6',
  'i18n.js?v=3.35.6',
  'main.js?v=3.35.6',
  'tutorial-data.js?v=3.35.6',
  'tutorial.js?v=3.35.6',
  'lang-en.js?v=3.35.6',
  'lang-ja.js?v=3.35.6',
  'lang-zh.js?v=3.35.6',
  'lang-es.js?v=3.35.6',
  'lang-fr.js?v=3.35.6',
  'lang-pt.js?v=3.35.6',
  'lang-de.js?v=3.35.6',
  'lang-ko.js?v=3.35.6',
  'lang-it.js?v=3.35.6',
  'data/tasty-recipes.json?v=3.35.6',
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
