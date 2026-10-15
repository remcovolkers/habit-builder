// tools/generate-vapid.mjs levert sleutels die de Edge Function ook echt kan gebruiken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reminders } from './helpers.js';

const TOOL = fileURLToPath(new URL('../../tools/generate-vapid.mjs', import.meta.url));

test('generate-vapid: publieke sleutel is 65 bytes (0x04 ervoor), de privé is 32, en samen ondertekenen en verifiëren ze', async () => {
  const out = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  const keys = out.match(/^[A-Za-z0-9_-]{40,}$/gm);
  assert.equal(keys.length, 2, out);
  const [publicKey, privateKey] = keys;
  const rawPublic = Buffer.from(publicKey, 'base64url');
  assert.equal(rawPublic.length, 65);
  assert.equal(rawPublic[0], 4);
  assert.equal(Buffer.from(privateKey, 'base64url').length, 32);

  const header = await reminders.vapidAuthorization({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', subject: 'mailto:a@b.nl', publicKey, privateKey });
  const [, head, claims, signature] = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=/.exec(header);
  const verifyKey = await crypto.subtle.importKey('raw', rawPublic, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${claims}`)));
});

test('generate-vapid: elke keer andere sleutels, en de uitleg noemt dat de privésleutel geheim is', () => {
  const a = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  const b = execFileSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.notEqual(a.match(/^[A-Za-z0-9_-]{40,}$/gm)[1], b.match(/^[A-Za-z0-9_-]{40,}$/gm)[1]);
  assert.match(a, /GEHEIM/);
});
