// Service worker: app shell cached for fast loads and offline browsing of the last-seen pages.
// API calls always go to the network (benefit data must be fresh); public API GETs fall back to cache offline.
const VERSION = 'yr-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app/main.js', 'app/api.js', 'app/ui.js', 'app/legal.js', 'app/admin.js', 'img/logo.jpg', 'img/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/auth/')) return;
  if (url.pathname.startsWith('/api/public')) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // Shell: network first so updates show up, cache when offline.
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
