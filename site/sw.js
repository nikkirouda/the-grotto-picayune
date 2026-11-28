// Caches the shell only; news data is always fetched fresh.
const SHELL = 'picayune-shell-v23';
const FILES = ['./', './index.html', './style.css', './app.js', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/data/')) return;
  // revalidate with GitHub every time (no-cache), so a reload never runs yesterday's code from the HTTP cache
  const live = e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request.url, { cache: 'no-cache' });
  e.respondWith(live.then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
