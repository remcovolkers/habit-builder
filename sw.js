// Service worker: houdt de app beschikbaar zonder internet.
//
// BUILD en PRECACHE worden bij het uitrollen ingevuld door tools/stage.mjs (zie tools/lib/pwa.mjs):
// één versie-id en de volledige lijst bestanden van déze versie. In ontwikkeling (npm run serve) blijven ze leeg:
// dan doet deze worker niets en gaat alles gewoon via het netwerk.
//
// Waarom zo: alle bestanden van één versie staan samen in één cache. Een update wordt pas actief als álles binnen is
// (installeren is atomair) en vervangt de hele set tegelijk, zodat je nooit een mix van oude en nieuwe bestanden krijgt.
const BUILD = 'dev';
const PRECACHE = [];

const CACHE_PREFIX = 'hb-shell-';
const CACHE = `${CACHE_PREFIX}${BUILD}`;

self.addEventListener('install', (event) => {
  if (PRECACHE.length === 0) return;
  // cache: 'reload' omzeilt de HTTP-cache van de host (GitHub Pages bewaart bestanden 10 minuten), zodat we nooit
  // een verouderd bestand in de nieuwe set stoppen.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim(); // de pagina die de worker installeerde werkt meteen ook offline
  })());
});

// De pagina vraagt om te activeren zodra de gebruiker op "Vernieuwen" tikt (nooit midden in een handeling).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (PRECACHE.length === 0) return; // ontwikkelmodus
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase en co: altijd rechtstreeks, de app regelt offline zelf
  event.respondWith(respond(request));
});

async function respond(request) {
  const cache = await caches.open(CACHE);
  // Elke navigatie (ook /?code=… na Google-login) krijgt de app-shell; de router regelt de rest met de #-route.
  if (request.mode === 'navigate') {
    return (await cache.match('./index.html')) ?? fetch(request);
  }
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}
