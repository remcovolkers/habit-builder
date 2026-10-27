import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { isDarkColor, isNativeApp, nativePlugin, startNative } from '../src/native.js';

const original = { Capacitor: globalThis.Capacitor, MutationObserver: globalThis.MutationObserver };
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

/** Een minimale pagina: een themakleur, een klassenlijst, en een waarnemer die je met de hand kunt laten afgaan. */
function fakeDocument(themeColor) {
  const classes = new Set();
  const doc = {
    themeColor,
    classes,
    documentElement: { classList: { add: (name) => classes.add(name) } },
    querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? { getAttribute: () => doc.themeColor } : null),
  };
  return doc;
}

function fakeNative(styles) {
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { SystemBars: { setStyle: async ({ style }) => { styles.push(style); } } },
  };
}

test('in de gewone browser doet startNative niets', () => {
  delete globalThis.Capacitor;
  const doc = fakeDocument('#090c0c');
  assert.equal(isNativeApp(), false);
  assert.equal(startNative(doc), false);
  assert.equal(doc.classes.size, 0);
});

test('Capacitor in de browser (isNativePlatform is false) telt niet als de app', () => {
  globalThis.Capacitor = { isNativePlatform: () => false, Plugins: {} };
  assert.equal(isNativeApp(), false);
  assert.equal(startNative(fakeDocument('#090c0c')), false);
});

test('nativePlugin geeft null als de plugin ontbreekt', () => {
  delete globalThis.Capacitor;
  assert.equal(nativePlugin('App'), null);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: { id: 1 } } };
  assert.deepEqual(nativePlugin('App'), { id: 1 });
  assert.equal(nativePlugin('Onbekend'), null);
});

test('isDarkColor: donkere en lichte themakleuren, en een onleesbare waarde telt als donker', () => {
  assert.equal(isDarkColor('#090c0c'), true);
  assert.equal(isDarkColor('#ffffff'), false);
  assert.equal(isDarkColor('#F5EFE6'), false);
  assert.equal(isDarkColor('rgb(0,0,0)'), true);
  assert.equal(isDarkColor(null), true);
});

test('in de app: klasse is-native en de statusbalk volgt de themakleur, ook na een themawissel', () => {
  const styles = [];
  fakeNative(styles);
  let observed = null;
  globalThis.MutationObserver = class { constructor(callback) { observed = callback; } observe() {} };
  const doc = fakeDocument('#090c0c');

  assert.equal(startNative(doc), true);
  assert.ok(doc.classes.has('is-native'));
  assert.deepEqual(styles, ['DARK']);

  doc.themeColor = '#f5efe6'; // een licht thema
  observed();
  assert.deepEqual(styles, ['DARK', 'LIGHT']);
});

test('in de app zonder SystemBars-plugin gaat er niets stuk', () => {
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  delete globalThis.MutationObserver;
  assert.equal(startNative(fakeDocument('#090c0c')), true);
});
