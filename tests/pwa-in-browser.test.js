// In een gewone browser (geen app, niet als app geïnstalleerd) blijft de installatie-uitleg gelden (src/pwa.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {} };
globalThis.Capacitor = undefined;

const { pwa } = await import('../src/pwa.js');

test('in de browser: nog niet geïnstalleerd', () => {
  assert.equal(pwa.installed, false);
});
