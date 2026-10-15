/* Rootling service worker — offline app shell.
 * Strategy: precache the shell files that ship with the app. Shell
 * files and page loads are NETWORK-FIRST (a connected visit always
 * gets the current shell; the cache is the offline fallback) — a
 * cache-first shell once let a phone keep an out-of-date copy whose
 * settings saved but never applied. Other same-origin GETs stay
 * cache-first with runtime caching (e.g. the plant + creature SVG
 * sets). Bump CACHE_VERSION on every release that changes shell files.
 */
var CACHE_VERSION = 'rootling-v12';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './accounts.js',
  './companions.js',
  './traits.js',
  './burnoutEngine.js',
  './companion-ux.js',
  './config.js',
  './research.js',
  './fitness.js',
  './assistant.js',
  './app.js',
  './notifications.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './assets/sprout-placeholder.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

var SHELL_PATHS = {};
APP_SHELL.forEach(function (p) {
  try { SHELL_PATHS[new URL(p, self.location.href).pathname] = true; } catch (e) { /* ignore */ }
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* app has no cross-origin deps */

  function fetchAndCache() {
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    });
  }

  /* Network-first for page loads and shell files: fresh code wins
   * whenever the network is there; the cache keeps the app working
   * offline. */
  if (req.mode === 'navigate' || SHELL_PATHS[url.pathname]) {
    event.respondWith(
      fetchAndCache().catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetchAndCache().catch(function () { return Response.error(); });
    })
  );
});

/* Phase 3 Tier 2 — Web Push. Inert until the push backend (PHASE3-DESIGN
 * §2.3) sends pushes: payloads are { title, body, tag } JSON rendered with
 * the same silent defaults as local reminders. */
self.addEventListener('push', function (event) {
  var data = { title: 'Rootling', body: 'A gentle reminder from your companion.', tag: 'rootling-push', level: 1 };
  try { if (event.data) { var j = event.data.json(); if (j) { if (j.title) data.title = j.title; if (j.body) data.body = j.body; if (j.tag) data.tag = j.tag; if (j.level) data.level = j.level; } } } catch (e) { /* fall back to defaults */ }
  var loud = data.level === 3; /* only for items the user designated critical */
  var opts = {
    body: data.body,
    silent: !loud,
    tag: data.tag,
    renotify: false,
    icon: 'icon.svg'
  };
  if (loud) opts.vibrate = [200, 100, 200, 100, 400];
  event.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
