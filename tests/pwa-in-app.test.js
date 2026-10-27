// In de Android-app geldt de app als geïnstalleerd: dan verschijnen de installatiestap en -kaart niet (src/pwa.js).
// Eén proces per bestand: pwa.js leest de toestand bij het laden, dus de webvariant staat in een eigen bestand (tests/pwa-in-browser.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {} };
globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };

const { pwa } = await import('../src/pwa.js');

test('in de app: geïnstalleerd, dus geen installatiestap en geen iOS-uitleg', () => {
  assert.equal(pwa.installed, true);
  assert.equal(pwa.ios, false);
});
