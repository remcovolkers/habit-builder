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

// ---- Ochtendherinnering (Web Push) -------------------------------------------------------------------------------
// De server stuurt een versleuteld bericht { title, body, url }. Elke push móét een zichtbare melding opleveren
// (userVisibleOnly): ook als het bericht onleesbaar is, tonen we de algemene tekst.
const REMINDER_TAG = 'morning-reminder';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const text = (value, fallback) => (typeof value === 'string' && value.trim() !== '' ? value.slice(0, 200) : fallback);
  event.waitUntil(self.registration.showNotification(text(data.title, 'Habit Builder'), {
    body: text(data.body, 'Bekijk wat er vandaag op je lijst staat.'),
    icon: 'icons/icon-192.png',
    tag: REMINDER_TAG, // een nieuwe melding vervangt de vorige in plaats van te stapelen
    // Zonder renotify vervangt Android een melding met dezelfde tag STILLETJES: geen geluid, geen trilling, scherm blijft uit.
    // Dan sta je pas bij het ontgrendelen bij de melding stil. renotify laat elke nieuwe melding opnieuw aankondigen.
    renotify: true,
    vibrate: [200, 100, 200],
    lang: 'nl',
    data: { url: typeof data.url === 'string' ? data.url : './#/today' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // alleen adressen binnen de app: een bericht mag nooit naar een andere site sturen
  const target = new URL(event.notification.data?.url ?? './#/today', self.registration.scope);
  const inApp = target.origin === self.location.origin ? target.href : new URL('./#/today', self.registration.scope).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = open.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(inApp).catch(() => {});
      return;
    }
    await self.clients.openWindow(inApp);
  })());
});
