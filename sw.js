'use strict';

/* JSON Opener – Service Worker
 * - Offline-Cache für alle App-Dateien
 * - Empfang von "Share Target" POSTs (Datei von Android teilen)
 * - Fallback-Link-Handler, falls der Share nicht als POST ankommt
 */

const CACHE_NAME = 'json-opener-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './core.js',
  './sample.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Letzte per Share empfangene Daten – die App holt sie nach dem Laden ab */
let lastShare = null;

self.addEventListener('message', (event) => {
  const client = event.source;
  if (!client || !client.postMessage) return;
  if (event.data && event.data.type === 'QUERY_SHARE') {
    client.postMessage({ type: 'SHARE_TARGET', data: lastShare });
  }
});

/* ---------------------------------------------------------------
 * Share Target: Android teilt eine Datei mit dieser App.
 * Der Browser schickt einen POST (multipart/form-data) hierher.
 * Der Worker merkt sich die Daten und leitet zur App weiter;
 * die App holt sie sich per QUERY_SHARE-Nachricht.
 * ------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/')) {
    event.respondWith(
      (async () => {
        const form = await event.request.formData();
        const entry = { title: '', text: '', url: '', files: [] };
        for (const [key, value] of form.entries()) {
          if (key === 'files') {
            if (Array.isArray(value)) {
              for (const f of value) entry.files.push(f);
            } else {
              entry.files.push(value);
            }
          } else if (key in entry) {
            entry[key] = String(value);
          }
        }
        lastShare = entry;
        /* Weiterleitung zur App; die Daten holt sich die Seite per QUERY_SHARE */
        const dest = new URL('./?shared=1', event.request.url);
        return Response.redirect(dest.href, 303);
      })()
    );
    return;
  }

  /* Fallback: Wenn eine App die Datei als GET-Link teilt (z. B. ?json=...),
   * fangen wir das hier ab und leiten zur App mit dem Link weiter. */
  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    if (url.searchParams.has('json') || url.searchParams.has('share')) {
      event.respondWith(
        fetch('./index.html?file=' + encodeURIComponent(url.href)).catch(() =>
          caches.match('./index.html')
        )
      );
      return;
    }
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic' && event.request.method === 'GET') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
