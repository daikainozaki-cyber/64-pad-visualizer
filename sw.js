var CACHE_NAME = '64pad-v3.36.31';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=3.36.31',
  'pad-core/data.js?v=3.36.31',
  'pad-core/theory.js?v=3.36.31',
  'pad-core/render.js?v=3.36.31',
  'pad-core/circle.js?v=3.36.31',
  'data.js?v=3.36.31',
  'audio.js?v=3.36.31',
  'theory.js?v=3.36.31',
  'render.js?v=3.36.31',
  'builder.js?v=3.36.31',
  'plain.js?v=3.36.31',
  'perform.js?v=3.36.31',
  'i18n.js?v=3.36.31',
  'main.js?v=3.36.31',
  'tutorial-data.js?v=3.36.31',
  'tutorial.js?v=3.36.31',
  'lang-en.js?v=3.36.31',
  'lang-ja.js?v=3.36.31',
  'lang-zh.js?v=3.36.31',
  'lang-es.js?v=3.36.31',
  'lang-fr.js?v=3.36.31',
  'lang-pt.js?v=3.36.31',
  'lang-de.js?v=3.36.31',
  'lang-ko.js?v=3.36.31',
  'lang-it.js?v=3.36.31',
  'data/tasty-recipes.json?v=3.36.31',
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
