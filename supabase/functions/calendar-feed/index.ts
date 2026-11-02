// @ts-nocheck
// (gewone JavaScript zonder typeannotaties: Supabase hoeft hem niet te typechecken)
// Edge Function `calendar-feed`: haalt de agenda-feed (iCal) van een gebruiker op en geeft de tekst door aan de app (docs/AGENDA.md).
//
// Waarom een functie: Google staat het ophalen van een agenda-feed vanuit een webpagina niet toe (geen CORS-header), dus de app kan het zelf niet.
// De app stuurt het geheime adres mee, deze functie haalt het op en geeft de tekst terug. Het lezen en uitrekenen (herhalingen, tijdzones) gebeurt in
// de app (src/domain/ical.js); deze functie is daardoor klein en doet verder niets met de inhoud.
//
// Wat hij NIET doet: het adres of de agenda bewaren, loggen of bijhouden. Het adres is een geheim (wie het heeft, leest je hele agenda), dus het staat nergens
// in de logs of in een foutmelding. Hij kijkt alleen of er een agenda terugkomt.
//
// Een open doorgeefluik zou misbruikt kunnen worden om andere servers te bevragen. Daarom: alleen met een geldige inlogsessie, alleen https, alleen de
// hosts in FEED_HOSTS (dezelfde lijst staat in src/domain/agenda.js; een test bewaakt dat ze gelijk blijven), geen doorverwijzing naar andere hosts,
// een tijdslimiet en een grootte-limiet.
//
// Bewust één bestand, zonder imports: je kunt het in het Supabase-dashboard plakken, en de tests laden precies dit bestand (tests/calendar/*).
// Zet in het dashboard "Verify JWT" uit: de functie controleert de sessie zelf (zoals send-reminders).
// SUPABASE_URL en SUPABASE_ANON_KEY zet Supabase zelf in de omgeving van de functie.

export const FEED_HOSTS = ['calendar.google.com'];
export const FEED_PATH = /^\/calendar\/ical\/[^/]+\/(?:private-[^/]+|public)\/basic\.ics$/;
/** Een agenda met jaren aan afspraken is een paar megabyte; veel meer is geen agenda. */
export const MAX_BYTES = 8 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 2;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Het adres als tekst als het een geheim iCal-adres van een toegestane host is, anders null. webcal:// is hetzelfde als https://. */
export function checkFeedUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (!FEED_HOSTS.includes(url.hostname) || !FEED_PATH.test(url.pathname)) return null;
  return `${url.origin}${url.pathname}`;
}

async function userFromToken({ url, key, token, fetchImpl }) {
  const response = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

/** Leest het antwoord tot `max` bytes. Geeft de tekst, of null als het meer was (dan stoppen we meteen met lezen). */
export async function readLimited(response, max = MAX_BYTES) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    return text.length > max ? null : text;
  }
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Haalt de feed op. Geeft { ok: true, ics } of { ok: false, reason }:
 * 'not_found' (het adres bestaat niet meer: opnieuw gemaakt of ingetrokken), 'unavailable' (Google geeft iets anders), 'too_large',
 * 'not_calendar' (er kwam geen agenda terug) of 'timeout'.
 */
export async function fetchFeed(address, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = address;
    for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
      const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/calendar, text/plain;q=0.5', 'User-Agent': 'HabitBuilder-agenda' } });
      if (response.status >= 300 && response.status < 400) {
        // een doorverwijzing volgen we alleen naar een andere pagina van dezelfde toegestane host (anders is het adres waarschijnlijk ingetrokken en stuurt Google je naar inloggen)
        let next = null;
        try {
          const target = new URL(response.headers.get('location') ?? '', current);
          next = target.protocol === 'https:' && FEED_HOSTS.includes(target.hostname) && FEED_PATH.test(target.pathname) ? `${target.origin}${target.pathname}` : null;
        } catch { /* een kapotte Location: dan is er geen volgende */ }
        await response.body?.cancel?.().catch(() => {});
        if (!next) return { ok: false, reason: 'not_found' };
        current = next;
        continue;
      }
      if (response.status === 404 || response.status === 403 || response.status === 401 || response.status === 410) {
        await response.body?.cancel?.().catch(() => {});
        return { ok: false, reason: 'not_found' };
      }
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        return { ok: false, reason: 'unavailable' };
      }
      const ics = await readLimited(response);
      if (ics === null) return { ok: false, reason: 'too_large' };
      if (!/^\s*BEGIN:VCALENDAR/i.test(ics)) return { ok: false, reason: 'not_calendar' };
      return { ok: true, ics };
    }
    return { ok: false, reason: 'unavailable' }; // te veel doorverwijzingen
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleRequest(request, { env, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'alleen POST' });

  const need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = need.filter((name) => !env(name));
  if (missing.length > 0) return json(500, { error: 'niet ingesteld', missing });

  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const userId = token ? await userFromToken({ url: env('SUPABASE_URL'), key: env('SUPABASE_ANON_KEY'), token, fetchImpl }).catch(() => null) : null;
  if (!userId) return json(401, { error: 'geen toegang' });

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* geen body: dan ontbreekt het adres */
  }
  const address = checkFeedUrl(body?.url);
  if (!address) return json(400, { error: 'ongeldig adres' });

  // `fetchImpl` is voor de tests; de aanroep naar Supabase hierboven en die naar Google hieronder zijn dezelfde functie
  const result = await fetchFeed(address, { fetchImpl, timeoutMs });
  return json(200, result);
}

// Supabase start de functie met Deno.serve; in de tests (Node) bestaat Deno niet en gebeurt er niets.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((request) => handleRequest(request, { env: (name) => Deno.env.get(name) }).catch((error) => {
    console.error('onverwachte fout', error?.name); // nooit de inhoud van de fout: die kan het adres bevatten
    return json(500, { error: 'onverwachte fout' });
  }));
}
