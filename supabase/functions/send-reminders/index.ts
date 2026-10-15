// @ts-nocheck
// (gewone JavaScript zonder typeannotaties: Supabase hoeft hem niet te typechecken)
// Edge Function `send-reminders`: stuurt de ochtendherinnering als Web Push.
//
// Twee manieren om hem aan te roepen:
//   • cron   – pg_cron roept hem elke 5 minuten aan met de header `x-cron-secret`; hij stuurt aan elk apparaat
//              waarvan het tijdstip is aangebroken en dat vandaag nog geen melding kreeg.
//   • test   – de app roept hem aan met de inlogsessie van de gebruiker en { "test": true }; hij stuurt direct
//              een melding naar de apparaten van die gebruiker (knop "Stuur een testmelding" in Instellingen).
//
// Bewust één bestand, zonder imports: je kunt het in het Supabase-dashboard plakken, en de tests laden precies
// dit bestand (tests/push/*). De code is gewone JavaScript; de .ts-extensie is alleen wat Supabase verwacht.
//
// Geheimen (Edge Functions → Secrets), nooit in de repo:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), CRON_SECRET
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf in de omgeving van de functie.

// ============================================================================================
// Hulpjes
// ============================================================================================
const encoder = new TextEncoder();

export function b64uEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(text) {
  const padded = String(text).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(text).length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const hkdf = async (salt, ikm, info, bytes) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
};

/** Een P-256-sleutelpaar uit de ruwe base64url-waarden (privé = 32 bytes, publiek = 65 bytes, onbewerkt). */
export async function keyPairFromRaw(privateB64u, publicB64u, { sign = false } = {}) {
  const pub = b64uDecode(publicB64u);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('publieke sleutel heeft niet het juiste formaat');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)) };
  const algorithm = sign ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'ECDH', namedCurve: 'P-256' };
  const privateKey = await crypto.subtle.importKey('jwk', { ...jwk, d: privateB64u }, algorithm, false, [sign ? 'sign' : 'deriveBits']);
  const publicKey = await crypto.subtle.importKey('jwk', jwk, algorithm, true, sign ? ['verify'] : []);
  return { privateKey, publicKey };
}

// ============================================================================================
// Web Push-versleuteling: RFC 8291 (aes128gcm, RFC 8188)
// ============================================================================================
const RECORD_SIZE = 4096;

/**
 * Versleutelt `plaintext` voor een abonnement (p256dh = publieke sleutel van de browser, auth = geheim van de browser).
 * `salt` en `senderKeyPair` zijn alleen voor de test met het voorbeeld uit de RFC; anders worden ze vers gekozen.
 * Geeft de complete body voor de push-aanvraag.
 */
export async function encryptPayload({ plaintext, p256dh, auth, salt, senderKeyPair }) {
  const clientPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const data = typeof plaintext === 'string' ? encoder.encode(plaintext) : plaintext;
  if (data.length > RECORD_SIZE - 17 - 16) throw new Error('bericht is te groot voor één push-record');

  senderKeyPair ??= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  salt ??= crypto.getRandomValues(new Uint8Array(16));
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeyPair.publicKey));

  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, senderKeyPair.privateKey, 256));

  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublic, senderPublic);
  const prk = await hkdf(authSecret, shared, keyInfo, 32);
  const contentKey = await hkdf(salt, prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // laatste (enige) record: gegevens + scheidingsteken 0x02, daarna de GCM-tag
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(data, Uint8Array.of(2))));

  const header = new Uint8Array(21 + senderPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
  header[20] = senderPublic.length;
  header.set(senderPublic, 21);
  return concat(header, ciphertext);
}

// ============================================================================================
// VAPID: RFC 8292 (ES256-JWT in de Authorization-header)
// ============================================================================================
export async function vapidAuthorization({ endpoint, subject, publicKey, privateKey, now = Date.now() }) {
  const { privateKey: signingKey } = await keyPairFromRaw(privateKey, publicKey, { sign: true });
  const header = b64uEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60, // de limiet is 24 uur; een nieuwe token per aanroep
    sub: subject,
  })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64uEncode(signature)}, k=${publicKey}`;
}

/** Eén push versturen. Geeft { status, gone }: gone = het abonnement bestaat niet meer (404/410) en kan weg. */
export async function sendPush({ subscription, message, vapid, fetchImpl = fetch, now = Date.now() }) {
  const body = await encryptPayload({ plaintext: JSON.stringify(message), p256dh: subscription.p256dh, auth: subscription.auth });
  const authorization = await vapidAuthorization({ endpoint: subscription.endpoint, ...vapid, now });
  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200', // 12 uur: staat de telefoon uit, dan is een ochtendmelding 's avonds niet meer nuttig
      Urgency: 'high', // een melding op een vast tijdstip: bij 'normal' mag Android hem in de slaapstand uren uitstellen
      Topic: 'morning-reminder', // een nieuwe melding vervangt een nog niet afgeleverde
    },
    body,
  });
  return { status: response.status, ok: response.status >= 200 && response.status < 300, gone: response.status === 404 || response.status === 410 };
}

// ============================================================================================
// Wanneer en wat: puur, dus testbaar
// ============================================================================================
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Een melding blijft nog zo lang "van vandaag" nadat het tijdstip is aangebroken (voor als de cron even stil lag). */
export const GRACE_MINUTES = 180;

/** De lokale datum ('2026-10-16') en minuut van de dag in een tijdzone. */
export function localMoment(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), hour: Number(parts.hour) };
}

/** Is dit abonnement nu aan de beurt? */
export function isDue(subscription, now) {
  const match = TIME_RE.exec(subscription.remind_time ?? '');
  if (!match) return false;
  let moment;
  try {
    moment = localMoment(now, subscription.timezone);
  } catch {
    return false; // onbekende tijdzone: liever niets sturen dan op een verkeerd moment
  }
  const target = Number(match[1]) * 60 + Number(match[2]);
  const late = moment.minutes - target;
  return late >= 0 && late < GRACE_MINUTES && subscription.last_notified_date !== moment.date;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * De tekst van de melding. null = er is niets te doen vandaag, dus ook geen melding.
 * Is er voor vandaag geen samenvatting (de app is al een tijd niet geopend), dan een algemene tekst.
 */
export function composeMessage(subscription, now) {
  const { date, hour } = localMoment(now, subscription.timezone);
  const summary = subscription.summary ?? {};
  const name = typeof summary.name === 'string' ? summary.name.trim().slice(0, 30) : '';
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  const title = name ? `${greeting}, ${name}` : greeting;
  const url = './#/today';
  const entry = summary.days?.[date];

  if (!Array.isArray(entry)) return { title, body: 'Bekijk wat er vandaag op je lijst staat.', url };
  const due = Math.max(0, Number(entry[0]) || 0);
  const pool = Math.max(0, Number(entry[1]) || 0);
  if (due === 0 && pool === 0) return null;
  if (due > 0 && pool > 0) return { title, body: `Vandaag: ${plural(due, 'gewoonte', 'gewoontes')}, en ${pool} in je stapel om uit te kiezen.`, url };
  if (due > 0) return { title, body: `Vandaag staat ${plural(due, 'gewoonte', 'gewoontes')} op je lijst.`, url };
  return { title, body: `Er ${pool === 1 ? 'ligt' : 'liggen'} ${plural(pool, 'taak', 'taken')} in je stapel. Pak er vandaag één mee.`, url };
}

// ============================================================================================
// Database (PostgREST via fetch; de service key staat alleen hier, op de server)
// ============================================================================================
function createDb({ url, key, fetchImpl }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (path, init = {}) => {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
    if (!response.ok) throw new Error(`database ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.status === 204 ? null : response.json();
  };
  const columns = 'id,user_id,endpoint,p256dh,auth,remind_time,timezone,summary,last_notified_date';
  return {
    all: () => call(`push_subscriptions?select=${columns}&limit=1000`),
    forUser: (userId) => call(`push_subscriptions?select=${columns}&user_id=eq.${encodeURIComponent(userId)}`),
    /** Claimt "vandaag gemeld" alleen als dat nog niet zo stond: twee gelijktijdige runs sturen dus niet dubbel. */
    claim: async (id, date) => {
      const rows = await call(`push_subscriptions?id=eq.${encodeURIComponent(id)}&or=(last_notified_date.is.null,last_notified_date.neq.${date})`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ last_notified_date: date }),
      });
      return rows.length > 0;
    },
    release: (id, previous) => call(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ last_notified_date: previous }) }),
    remove: (id) => call(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}

// ============================================================================================
// De aanroep
// ============================================================================================
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Gelijke strings vergelijken zonder dat de duur verraadt hoeveel tekens klopten. */
function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function userFromToken({ url, key, token, fetchImpl }) {
  const response = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

/** Stuurt naar de gegeven abonnementen en ruimt verlopen op. `claim`: alleen versturen als "vandaag" nog vrij is (cron). */
async function deliver({ subscriptions, db, vapid, fetchImpl, now, claim, forceText }) {
  // decisions: per apparaat wat er gebeurde en waarom. Staat in het antwoord (zie net._http_response) zodat je kunt zien waarom er geen melding kwam.
  const result = { sent: 0, skipped: 0, removed: 0, failed: 0, decisions: [] };
  const decide = (subscription, outcome) => result.decisions.push({ id: shortId(subscription.id), outcome });
  for (const subscription of subscriptions) {
    const { date } = localMoment(now, subscription.timezone);
    const message = forceText ?? composeMessage(subscription, now);
    if (claim) {
      const mine = await db.claim(subscription.id, date);
      if (!mine) {
        result.skipped++;
        decide(subscription, 'al_gemeld_vandaag');
        continue;
      }
      if (!message) { // niets te doen vandaag: wel als "gemeld" laten staan, zodat we het niet elke 5 minuten opnieuw bekijken
        result.skipped++;
        decide(subscription, 'niets_gepland_vandaag');
        continue;
      }
    } else if (!message) {
      result.skipped++;
      decide(subscription, 'niets_gepland_vandaag');
      continue;
    }
    try {
      const outcome = await sendPush({ subscription, message, vapid, fetchImpl, now: now.getTime() });
      if (outcome.ok) {
        result.sent++;
        decide(subscription, 'verstuurd');
      } else if (outcome.gone) {
        await db.remove(subscription.id);
        result.removed++;
        decide(subscription, `abonnement_verlopen_${outcome.status}`);
      } else {
        result.failed++;
        decide(subscription, `push_dienst_weigerde_${outcome.status}`);
        if (claim) await db.release(subscription.id, subscription.last_notified_date ?? null); // volgende ronde opnieuw proberen
      }
    } catch (error) {
      console.error('versturen mislukt', shortId(subscription.id), error?.message);
      result.failed++;
      decide(subscription, 'fout_bij_versturen');
      if (claim) await db.release(subscription.id, subscription.last_notified_date ?? null).catch(() => {});
    }
  }
  return result;
}

const shortId = (id) => String(id).slice(0, 8);

/** Per apparaat de gegevens waarop "aan de beurt" gebaseerd is, zonder gevoelige velden. Voor het zoeken naar een reden. */
export function inspect(subscription, now) {
  let local = null;
  try {
    local = localMoment(now, subscription.timezone);
  } catch {
    /* onbekende tijdzone: dat is de reden */
  }
  const entry = local ? subscription.summary?.days?.[local.date] : undefined;
  return {
    id: shortId(subscription.id),
    remind_time: subscription.remind_time,
    timezone: subscription.timezone,
    local_time: local ? `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}` : null,
    local_date: local?.date ?? null,
    last_notified_date: subscription.last_notified_date ?? null,
    due: isDue(subscription, now),
    planned_today: Array.isArray(entry) ? entry : null,
  };
}

export async function handleRequest(request, { env, fetchImpl = fetch, now = new Date() }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'alleen POST' });

  const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET'];
  const missing = need.filter((name) => !env(name));
  if (missing.length > 0) return json(500, { error: 'niet ingesteld', missing });

  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapid = { subject: env('VAPID_SUBJECT'), publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY') };
  const db = createDb({ url, key, fetchImpl });

  // wie belt er?
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader !== null) {
    if (!safeEqual(cronHeader, env('CRON_SECRET'))) return json(401, { error: 'geen toegang' });
    const all = await db.all();
    const due = all.filter((subscription) => isDue(subscription, now));
    const outcome = await deliver({ subscriptions: due, db, vapid, fetchImpl, now, claim: true });
    const body = { mode: 'cron', at: now.toISOString(), checked: all.length, due: due.length, ...outcome, inspect: all.map((subscription) => inspect(subscription, now)) };
    if (due.length > 0) console.log('cron', JSON.stringify({ due: due.length, sent: outcome.sent, skipped: outcome.skipped, removed: outcome.removed, failed: outcome.failed, decisions: outcome.decisions }));
    return json(200, body);
  }

  const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const userId = token ? await userFromToken({ url, key, token, fetchImpl }) : null;
  if (!userId) return json(401, { error: 'geen toegang' });

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* geen body: dan is het een lege aanvraag */
  }
  if (body?.test !== true) return json(400, { error: 'onbekende aanvraag' });

  let subscriptions = await db.forUser(userId);
  if (typeof body.endpoint === 'string') subscriptions = subscriptions.filter((subscription) => subscription.endpoint === body.endpoint);
  if (subscriptions.length === 0) return json(404, { error: 'geen apparaat gevonden' });
  const test = (subscription) => ({
    title: 'Testmelding',
    body: composeMessage(subscription, now)?.body ?? 'Het werkt. Vandaag is er niets in te plannen.',
    url: './#/today',
  });
  const results = { sent: 0, skipped: 0, removed: 0, failed: 0 };
  for (const subscription of subscriptions) {
    const one = await deliver({ subscriptions: [subscription], db, vapid, fetchImpl, now, claim: false, forceText: test(subscription) });
    for (const field of Object.keys(results)) results[field] += one[field];
  }
  return json(200, { mode: 'test', ...results });
}

// Supabase start de functie met Deno.serve; in de tests (Node) bestaat Deno niet en gebeurt er niets.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((request) => handleRequest(request, { env: (name) => Deno.env.get(name) }).catch((error) => {
    console.error('onverwachte fout', error);
    return json(500, { error: 'onverwachte fout' });
  }));
}
