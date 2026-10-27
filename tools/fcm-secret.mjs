// Zet de service-account-sleutel van Firebase (de JSON die je downloadt) op één regel, klaar voor het Supabase-secret FCM_SERVICE_ACCOUNT.
// Draai dit zelf, op je eigen computer; het schrijft niets naar schijf en toont niets behalve de waarde zelf.
//
//   node tools/fcm-secret.mjs pad/naar/sleutel.json            de waarde voor Supabase → Edge Functions → Secrets
//   node tools/fcm-secret.mjs pad/naar/sleutel.json | clip     direct naar het klembord (Windows)
//   node tools/fcm-secret.mjs pad/naar/sleutel.json --env      als regel voor supabase/functions/.env (lokaal testen)
//
// De sleutel is een GEHEIM: alleen in Supabase (en lokaal in supabase/functions/.env, dat niet in git komt), nooit in de repo of een chat.
// Waarom een script: in de JSON staat de privésleutel met \n-tekens; een los kopiëren van de regels of een .env-bestand dat ze omzet
// naar echte regeleinden maakt hem onbruikbaar. Hier blijft het één regel.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** De JSON op één regel, na controle dat het een service-account met de velden is die de Edge Function nodig heeft. */
export function toSecret(text) {
  let account;
  try {
    account = JSON.parse(text);
  } catch {
    throw new Error('Dit is geen JSON. Gebruik het bestand dat Firebase downloadt (Projectinstellingen → Service accounts → Nieuwe privésleutel genereren).');
  }
  for (const field of ['project_id', 'client_email', 'private_key']) {
    if (typeof account?.[field] !== 'string' || account[field] === '') throw new Error(`In de JSON ontbreekt "${field}": is dit wel een service-account-sleutel?`);
  }
  if (!account.private_key.includes('BEGIN PRIVATE KEY')) throw new Error('De private_key heeft niet het verwachte formaat (PKCS#8, "BEGIN PRIVATE KEY").');
  return JSON.stringify(account);
}

/** Als regel voor een .env-bestand: tussen enkele aanhalingstekens, zodat \n in de sleutel letterlijk blijft. */
export const toEnvLine = (secret) => `FCM_SERVICE_ACCOUNT='${secret}'`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [path, flag] = process.argv.slice(2);
  if (!path) {
    console.error('Gebruik: node tools/fcm-secret.mjs pad/naar/sleutel.json [--env]');
    process.exit(2);
  }
  try {
    const secret = toSecret(readFileSync(path, 'utf8'));
    process.stdout.write(flag === '--env' ? `${toEnvLine(secret)}\n` : secret);
  } catch (error) {
    console.error(error.code === 'ENOENT' ? `Bestand niet gevonden: ${path}` : error.message);
    process.exit(1);
  }
}
