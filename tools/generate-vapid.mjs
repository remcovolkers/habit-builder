// Maakt een VAPID-sleutelpaar voor de ochtendherinnering (Web Push). Draai dit zelf, op je eigen computer:
//
//   node tools/generate-vapid.mjs
//
// De PRIVATE sleutel is een geheim: die komt alleen als secret in Supabase (Edge Functions → Secrets), nooit in de repo,
// nooit in een chat. De PUBLIEKE sleutel is bedoeld om gedeeld te worden: die komt in src/config.js.
// Dit script schrijft niets naar schijf; het toont de waarden één keer in je terminal.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const priv = privateKey.export({ format: 'jwk' });
const pub = publicKey.export({ format: 'jwk' });

const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
if (raw.length !== 65) throw new Error('onverwachte sleutellengte');

console.log(`
VAPID-sleutels gemaakt.

PUBLIEK (mag je delen, komt in src/config.js als vapidPublicKey):
${raw.toString('base64url')}

PRIVÉ (GEHEIM: alleen als Supabase-secret VAPID_PRIVATE_KEY, nergens anders plakken of sturen):
${priv.d}

Zie docs/M7-SETUP.md voor de volgende stappen.
`);
