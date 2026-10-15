// De versleuteling en ondertekening van Web Push. Als dit niet klopt, accepteert een push-dienst (of de browser) het bericht niet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminders } from './helpers.js';

const { b64uDecode, b64uEncode, encryptPayload, keyPairFromRaw, vapidAuthorization, sendPush } = reminders;

// Het voorbeeld uit RFC 8291, bijlage A ("When I grow up, I want to be a watermelon").
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
const newReceiver = async () => {
  const pair = await crypto.subtle.generateKey(ecdh, true, ['deriveBits']);
  return { ...pair, uaPublic: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)), authSecret: crypto.getRandomValues(new Uint8Array(16)) };
};

test('base64url: rondreis, zonder opvulling', () => {
  for (const length of [0, 1, 2, 3, 16, 65]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
    const text = b64uEncode(bytes);
    assert.match(text, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual([...b64uDecode(text)], [...bytes]);
  }
});

test('RFC 8291 bijlage A: precies dezelfde bytes als het voorbeeld in de standaard', async () => {
  const senderKeyPair = await keyPairFromRaw(RFC.asPrivate, RFC.asPublic);
  const body = await encryptPayload({
    plaintext: RFC.plaintext, p256dh: RFC.uaPublic, auth: RFC.auth, salt: b64uDecode(RFC.salt), senderKeyPair,
  });
  assert.equal(b64uEncode(body), RFC.body);
});

/** De ontvangstkant (wat de browser doet), volgens de RFC: zo toetsen we ook een bericht met willekeurige sleutels. */
async function decrypt({ body, receiver }) {
  const enc = new TextEncoder();
  const salt = body.slice(0, 16);
  const idLength = body[20];
  const senderPublic = body.slice(21, 21 + idLength);
  const ciphertext = body.slice(21 + idLength);
  const peer = await crypto.subtle.importKey('raw', senderPublic, ecdh, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, receiver.privateKey, 256));
  const hkdf = async (saltBytes, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
  const join = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));
  const prk = await hkdf(receiver.authSecret, shared, join(enc.encode('WebPush: info\0'), receiver.uaPublic, senderPublic), 32);
  const contentKey = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ciphertext));
  assert.equal(plain.at(-1), 2, 'het laatste record eindigt op 0x02');
  return new TextDecoder().decode(plain.slice(0, -1));
}

const subscriptionFor = (receiver) => ({ p256dh: b64uEncode(receiver.uaPublic), auth: b64uEncode(receiver.authSecret) });

test('versleutelen met verse sleutels en weer ontsleutelen geeft de tekst terug (ook met accenten en emoji)', async () => {
  const receiver = await newReceiver();
  const text = JSON.stringify({ title: 'Goedemorgen, Zoë', body: 'Vandaag: 3 gewoontes 🌱' });
  const body = await encryptPayload({ plaintext: text, ...subscriptionFor(receiver) });
  assert.equal(await decrypt({ body, receiver }), text);
});

test('elke versleuteling is anders (verse salt en verse sleutel)', async () => {
  const subscription = subscriptionFor(await newReceiver());
  const a = await encryptPayload({ plaintext: 'zelfde', ...subscription });
  const b = await encryptPayload({ plaintext: 'zelfde', ...subscription });
  assert.notEqual(b64uEncode(a), b64uEncode(b));
});

test('een te groot bericht wordt geweigerd in plaats van afgekapt', async () => {
  const subscription = subscriptionFor(await newReceiver());
  await assert.rejects(encryptPayload({ plaintext: 'x'.repeat(5000), ...subscription }), /te groot/);
});

async function makeVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { privateKey: jwk.d, publicKey: b64uEncode(raw), verifyKey: pair.publicKey };
}

test('VAPID: een geldige ES256-JWT met aud, exp en sub, en een publieke sleutel die erbij hoort', async () => {
  const vapid = await makeVapid();
  const now = Date.UTC(2026, 9, 16, 6, 0, 0);
  const header = await vapidAuthorization({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', subject: 'mailto:test@example.nl', publicKey: vapid.publicKey, privateKey: vapid.privateKey, now,
  });
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(match, header);
  const [, head, claims, signature, key] = match;
  assert.equal(key, vapid.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const parsed = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(parsed.aud, 'https://fcm.googleapis.com');
  assert.equal(parsed.sub, 'mailto:test@example.nl');
  assert.ok(parsed.exp > now / 1000 && parsed.exp - now / 1000 <= 24 * 3600, 'geldigheid korter dan 24 uur');
  const sig = Buffer.from(signature, 'base64url');
  assert.equal(sig.length, 64, 'ruwe r||s, geen DER');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.verifyKey, sig, new TextEncoder().encode(`${head}.${claims}`));
  assert.ok(ok, 'de handtekening klopt met de publieke sleutel');
});

test('sendPush: juiste koppen, versleutelde body, en 404/410 betekent "abonnement weg"', async () => {
  const vapid = { subject: 'mailto:a@b.nl', ...(await makeVapid()) };
  const receiver = await newReceiver();
  const subscription = { endpoint: 'https://push.example.org/send/xyz', ...subscriptionFor(receiver) };
  const message = { title: 't', body: 'b', url: './#/today' };

  const seen = [];
  const respond = (status) => async (url, init) => { seen.push({ url, init }); return new Response(null, { status }); };

  const ok = await sendPush({ subscription, message, vapid, fetchImpl: respond(201) });
  assert.deepEqual({ ok: ok.ok, gone: ok.gone, status: ok.status }, { ok: true, gone: false, status: 201 });
  const { url, init } = seen[0];
  assert.equal(url, subscription.endpoint);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(init.headers.TTL, '43200');
  assert.match(init.headers.Authorization, /^vapid t=.+, k=.+$/);
  assert.equal(JSON.parse(await decrypt({ body: init.body, receiver })).body, 'b');

  for (const status of [404, 410]) {
    const gone = await sendPush({ subscription, message, vapid, fetchImpl: respond(status) });
    assert.deepEqual({ ok: gone.ok, gone: gone.gone }, { ok: false, gone: true });
  }
  const busy = await sendPush({ subscription, message, vapid, fetchImpl: respond(429) });
  assert.deepEqual({ ok: busy.ok, gone: busy.gone }, { ok: false, gone: false });
});
