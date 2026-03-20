var CACHE_NAME = '64pad-v4.0.0';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=4.0.0',
  'pad-core/data.js?v=4.0.0',
  'pad-core/theory.js?v=4.0.0',
  'pad-core/render.js?v=4.0.0',
  'pad-core/circle.js?v=4.0.0',
  'data.js?v=4.0.0',
  'audio.js?v=4.0.0',
  'theory.js?v=4.0.0',
  'render.js?v=4.0.0',
  'builder.js?v=4.0.0',
  'plain.js?v=4.0.0',
  'perform.js?v=4.0.0',
  'i18n.js?v=4.0.0',
  'main.js?v=4.0.0',
  'tutorial-data.js?v=4.0.0',
  'tutorial.js?v=4.0.0',
  'lang-en.js?v=4.0.0',
  'lang-ja.js?v=4.0.0',
  'lang-zh.js?v=4.0.0',
  'lang-es.js?v=4.0.0',
  'lang-fr.js?v=4.0.0',
  'lang-pt.js?v=4.0.0',
  'lang-de.js?v=4.0.0',
  'lang-ko.js?v=4.0.0',
  'lang-it.js?v=4.0.0',
  'data/tasty-recipes.json?v=4.0.0',
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
