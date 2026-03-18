var CACHE_NAME = '64pad-v3.36.36';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=3.36.36',
  'pad-core/data.js?v=3.36.36',
  'pad-core/theory.js?v=3.36.36',
  'pad-core/render.js?v=3.36.36',
  'pad-core/circle.js?v=3.36.36',
  'data.js?v=3.36.36',
  'audio.js?v=3.36.36',
  'theory.js?v=3.36.36',
  'render.js?v=3.36.36',
  'builder.js?v=3.36.36',
  'plain.js?v=3.36.36',
  'perform.js?v=3.36.36',
  'i18n.js?v=3.36.36',
  'main.js?v=3.36.36',
  'tutorial-data.js?v=3.36.36',
  'tutorial.js?v=3.36.36',
  'lang-en.js?v=3.36.36',
  'lang-ja.js?v=3.36.36',
  'lang-zh.js?v=3.36.36',
  'lang-es.js?v=3.36.36',
  'lang-fr.js?v=3.36.36',
  'lang-pt.js?v=3.36.36',
  'lang-de.js?v=3.36.36',
  'lang-ko.js?v=3.36.36',
  'lang-it.js?v=3.36.36',
  'data/tasty-recipes.json?v=3.36.36',
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
