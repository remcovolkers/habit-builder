import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, parseVersion, pickUpdate } from '../src/app/app-update.js';

const apk = (name = 'habit-builder.apk', url = `https://github.com/remcovolkers/habit-builder/releases/download/v1.3.0/${name}`) => ({ name, browser_download_url: url });
const release = (extra = {}) => ({ tag_name: 'v1.3.0', draft: false, prerelease: false, html_url: 'https://github.com/remcovolkers/habit-builder/releases/tag/v1.3.0', assets: [apk()], ...extra });

test('parseVersion: twee of drie getallen, met of zonder v en achtervoegsel', () => {
  assert.deepEqual(parseVersion('1.3'), [1, 3, 0]);
  assert.deepEqual(parseVersion('v1.3.2'), [1, 3, 2]);
  assert.deepEqual(parseVersion('1.2.0-debug'), [1, 2, 0]);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(undefined), null);
  assert.equal(parseVersion('1.2.3.4'), null);
});

test('isNewer vergelijkt getal voor getal (1.10 is hoger dan 1.9) en kent geen onbekenden', () => {
  assert.equal(isNewer('1.10.0', '1.9.0'), true);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.3.1', '1.3.0'), true);
  assert.equal(isNewer('1.3.0', '1.3.0'), false);
  assert.equal(isNewer('1.2.0', '1.3.0'), false);
  assert.equal(isNewer('v1.3.0', '1.3.0-debug'), false, 'een debug-build van dezelfde versie is niet verouderd');
  assert.equal(isNewer('abc', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', null), false);
});

test('pickUpdate: een nieuwere release met een APK geeft versie, download en pagina', () => {
  assert.deepEqual(pickUpdate(release(), '1.2.0'), {
    version: '1.3.0',
    apkUrl: 'https://github.com/remcovolkers/habit-builder/releases/download/v1.3.0/habit-builder.apk',
    pageUrl: 'https://github.com/remcovolkers/habit-builder/releases/tag/v1.3.0',
  });
});

test('pickUpdate: niets als de release niet nieuwer is, een concept of een voorlopige versie is, of geen APK heeft', () => {
  assert.equal(pickUpdate(release(), '1.3.0'), null);
  assert.equal(pickUpdate(release(), '1.4.0'), null);
  assert.equal(pickUpdate(release({ draft: true }), '1.2.0'), null);
  assert.equal(pickUpdate(release({ prerelease: true }), '1.2.0'), null);
  assert.equal(pickUpdate(release({ assets: [] }), '1.2.0'), null);
  assert.equal(pickUpdate(release({ assets: [apk('notes.txt')] }), '1.2.0'), null);
  assert.equal(pickUpdate(null, '1.2.0'), null);
  assert.equal(pickUpdate({}, '1.2.0'), null);
});

test('pickUpdate: een download van een andere plek dan ons eigen archief wordt nooit geopend', () => {
  assert.equal(pickUpdate(release({ assets: [apk('x.apk', 'https://kwaad.example/x.apk')] }), '1.2.0'), null);
  assert.equal(pickUpdate(release({ assets: [apk('x.apk', 'https://github.com/ander/repo/releases/download/v1/x.apk')] }), '1.2.0'), null);
  const sneaky = pickUpdate(release({ html_url: 'https://kwaad.example/' }), '1.2.0');
  assert.equal(sneaky.pageUrl, 'https://github.com/remcovolkers/habit-builder/releases/latest', 'een vreemde pagina-url wordt vervangen');
});
