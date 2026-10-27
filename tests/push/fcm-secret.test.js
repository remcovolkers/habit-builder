// tools/fcm-secret.mjs maakt van de Firebase-JSON een waarde die de Edge Function ook echt kan gebruiken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toEnvLine, toSecret } from '../../tools/fcm-secret.mjs';
import { reminders } from './helpers.js';

const TOOL = fileURLToPath(new URL('../../tools/fcm-secret.mjs', import.meta.url));

/** Zoals Firebase hem downloadt: ingesprongen, over meerdere regels, met \n in de privésleutel. */
const firebaseFile = () => JSON.stringify({
  type: 'service_account', project_id: 'habit-proj', private_key_id: 'abc',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@habit-proj.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token',
}, null, 2);

test('toSecret: één regel, en de Edge Function leest hem weer als service-account', () => {
  const secret = toSecret(firebaseFile());
  assert.ok(!secret.includes('\n'), 'één regel');
  const account = reminders.parseServiceAccount(secret);
  assert.equal(account.projectId, 'habit-proj');
  assert.match(account.privateKey, /^-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n/, 'de regeleinden in de sleutel blijven bestaan');
});

test('toEnvLine: tussen enkele aanhalingstekens, zodat de \\n in de sleutel letterlijk blijft', () => {
  const line = toEnvLine(toSecret(firebaseFile()));
  assert.match(line, /^FCM_SERVICE_ACCOUNT='\{.*\}'$/);
  assert.ok(line.includes('\\n'), 'de twee tekens backslash en n, geen regeleinde');
  assert.ok(!line.includes('\n'), 'geen echt regeleinde');
});

test('toSecret: onbruikbare invoer geeft een duidelijke fout', () => {
  assert.throws(() => toSecret('geen json'), /geen JSON/);
  assert.throws(() => toSecret('{}'), /project_id/);
  assert.throws(() => toSecret(JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'geheim' })), /PKCS#8/);
});

test('het script: leest een bestand, schrijft de waarde naar stdout, en meldt een ontbrekend bestand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-fcm-'));
  try {
    const file = join(dir, 'sleutel.json');
    writeFileSync(file, firebaseFile());
    const out = execFileSync(process.execPath, [TOOL, file], { encoding: 'utf8' });
    assert.equal(out, toSecret(firebaseFile()));
    assert.match(execFileSync(process.execPath, [TOOL, file, '--env'], { encoding: 'utf8' }), /^FCM_SERVICE_ACCOUNT='/);
    const missing = spawnSync(process.execPath, [TOOL, join(dir, 'bestaat-niet.json')], { encoding: 'utf8' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /niet gevonden/);
    assert.equal(spawnSync(process.execPath, [TOOL], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
