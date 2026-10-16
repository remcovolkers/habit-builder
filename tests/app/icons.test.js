// De iconen van habits: de catalogus, zoeken, de koppeling met de thema-sets en de gereedschappen om een set van Moda in te lezen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ICON_GROUPS, ICONS } from '../../src/content/icons.js';
import { THEME_ICON_KEYS } from '../../src/content/theme-icons.js';
import { iconForEmoji, iconForKey, iconKeyFor, searchIcons, themeIconHref } from '../../src/app/icons.js';
import { THEME_IDS } from '../../src/app/themes.js';
import { TEMPLATES } from '../../src/content/templates.js';
import { buildSprite, extractIcons, MAX_ICON_BYTES, normalizeIconSvg, themeIconsModule, validateIconSvg } from '../../tools/lib/icons.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const plain = (emoji) => emoji.replace(/️/g, '');

// de 24 emoji die de app had vóór de catalogus: bestaande habits moeten hun icoon houden
const LEGACY = ['💧', '📖', '🏃', '🧘', '🥗', '😴', '💪', '🎸', '🧹', '📞', '✍️', '🚴', '🧠', '🌱', '☀️', '🦷', '💊', '🚭', '📝', '🎨', '🐕', '🧺', '💻', '🛌'];

test('de catalogus: 60 iconen, elke sleutel en elke emoji precies één keer, sleutels in kebab-case', () => {
  assert.equal(ICONS.length, 60);
  assert.equal(new Set(ICONS.map((i) => i.key)).size, ICONS.length, 'dubbele sleutel');
  assert.equal(new Set(ICONS.map((i) => plain(i.emoji))).size, ICONS.length, 'dubbele emoji: de sleutel volgt uit de emoji, dus die moet uniek zijn');
  for (const icon of ICONS) {
    assert.match(icon.key, /^[a-z0-9]+(-[a-z0-9]+)*$/, icon.key);
    assert.ok(icon.name.length > 0 && icon.emoji.length > 0, icon.key);
  }
  for (const group of ICON_GROUPS) assert.ok(group.icons.length > 0 && group.label.length > 0, group.id);
});

test('elk icoon dat er voor de catalogus was, staat erin (bestaande habits behouden hun icoon)', () => {
  for (const emoji of LEGACY) assert.ok(iconForEmoji(emoji), `${emoji} ontbreekt`);
});

test('de sjablonen gebruiken iconen uit de catalogus', () => {
  for (const [key, template] of Object.entries(TEMPLATES)) assert.ok(iconForEmoji(template.icon), `${key}: ${template.icon}`);
});

test('een emoji wordt gevonden met en zonder variatiekenmerk; een eigen emoji is onbekend', () => {
  assert.equal(iconKeyFor('☀️'), 'sun');
  assert.equal(iconKeyFor('☀'), 'sun');
  assert.equal(iconKeyFor('✍️'), 'write');
  assert.equal(iconKeyFor('🦄'), null);
  assert.equal(iconKeyFor(undefined), null);
  assert.equal(iconForKey('water').emoji, '💧');
  assert.equal(iconForKey('nope'), null);
});

test('docs/MODA-ICONS.md noemt precies de sleutels van de catalogus (de lijst voor Moda loopt niet uit de pas)', () => {
  const doc = read('docs/MODA-ICONS.md');
  const table = doc.slice(doc.indexOf('## De 60 sleutels'), doc.indexOf('## Prompt 1'));
  const keys = [...table.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), ICONS.map((i) => i.key).sort());
  for (const icon of ICONS) assert.ok(table.includes(`| \`${icon.key}\` |`) && table.includes(icon.emoji), `${icon.key}: emoji komt niet overeen`);
});

test('zoeken: op naam, zoekwoord en sleutel, zonder letterkast en accenten; alle woorden moeten passen', () => {
  const keysOf = (query) => searchIcons(query).flatMap((g) => g.icons.map((i) => i.key));
  assert.ok(keysOf('water').includes('water'));
  assert.ok(keysOf('WATER').includes('water'));
  assert.ok(keysOf('drinken').includes('tea') && keysOf('drinken').includes('water'));
  assert.deepEqual(keysOf('gitaar'), ['guitar']);
  assert.ok(keysOf('no-sugar').includes('no-sugar') && keysOf('no sugar').includes('no-sugar'));
  assert.deepEqual(keysOf('gitaar muziek'), ['guitar']); // beide woorden: alleen de gitaar
  assert.ok(keysOf('mediteren').includes('meditate'));
  assert.deepEqual(keysOf('zzzzzz'), []);
  assert.deepEqual(searchIcons('zzzzzz'), []);
});

test('zoeken: zonder zoekopdracht alles in dezelfde groepen; groepen zonder treffer vallen weg', () => {
  assert.equal(searchIcons('').flatMap((g) => g.icons).length, 60);
  assert.equal(searchIcons('  ').length, ICON_GROUPS.length);
  const groups = searchIcons('hond');
  assert.deepEqual(groups.map((g) => g.id), ['social']);
});

test('thema-iconen: de href wijst alleen naar een sleutel die het thema echt levert', () => {
  const keys = { mel: ['water'], v0lky1: [] };
  assert.equal(themeIconHref('mel', '💧', keys), 'themes/mel/icons.svg#water');
  assert.equal(themeIconHref('mel', '📖', keys), null, 'het thema heeft deze sleutel niet: emoji');
  assert.equal(themeIconHref('v0lky1', '💧', keys), null);
  assert.equal(themeIconHref('mel', '🦄', keys), null, 'eigen emoji');
  assert.equal(themeIconHref('onbekend', '💧', keys), null);
  assert.equal(themeIconHref('mel', '💧', undefined), null);
});

test('theme-icons.js: elk thema staat erin, met bestaande sleutels en een sprite waarin ze allemaal zitten', () => {
  assert.deepEqual(Object.keys(THEME_ICON_KEYS).sort(), [...THEME_IDS].sort());
  for (const [id, keys] of Object.entries(THEME_ICON_KEYS)) {
    assert.equal(new Set(keys).size, keys.length, `${id}: dubbele sleutel`);
    for (const key of keys) assert.ok(iconForKey(key), `${id}: onbekende sleutel ${key}`);
    if (keys.length === 0) continue;
    const file = `themes/${id}/icons.svg`;
    assert.ok(existsSync(new URL(`../../${file}`, import.meta.url)), `${file} ontbreekt`);
    const sprite = read(file);
    for (const key of keys) assert.ok(sprite.includes(`<symbol id="${key}"`), `${id}: ${key} staat niet in de sprite`);
    assert.deepEqual(validateIconSvg('water', `<svg viewBox="0 0 24 24">${sprite.match(/<symbol[\s\S]*?<\/symbol>/)[0]}</svg>`).filter((p) => /script|href/.test(p)), []);
  }
});

// ---- het gereedschap om een set van Moda in te lezen ---------------------------------------------------------------------------------------

const GOOD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z"/><circle cx="12" cy="14" r="1.5" fill="var(--icon-accent, currentColor)"/></svg>';

test('validateIconSvg: een nette set-SVG is goed', () => {
  assert.deepEqual(validateIconSvg('water', GOOD), []);
  assert.deepEqual(validateIconSvg('water', `<?xml version="1.0"?>\n<!-- Moda -->\n${GOOD}\n`), []);
});

test('validateIconSvg: keurt af wat niet in de set hoort', () => {
  const bad = (svg, pattern, key = 'water') => assert.ok(validateIconSvg(key, svg).some((p) => pattern.test(p)), `${svg} -> ${validateIconSvg(key, svg)}`);
  bad(GOOD, /onbekende sleutel/, 'unicorn');
  bad(GOOD.replace('0 0 24 24', '0 0 32 32'), /viewBox/);
  bad(GOOD.replace('viewBox=', 'width="24" viewBox='), /width of height/);
  bad(GOOD.replace('<path', '<script>alert(1)</script><path'), /<script>/);
  bad(GOOD.replace('<path', '<style>.a{}</style><path'), /<style>/);
  bad(GOOD.replace('<path', '<path style="fill:red"'), /style-kenmerk/);
  bad(GOOD.replace('currentColor"', '#29ffb9"'), /vaste kleur/);
  bad(GOOD.replace('stroke="currentColor"', 'stroke="rgb(1,2,3)"'), /vaste kleur/);
  bad(GOOD.replace('<path', '<path onclick="x()"'), /gebeurtenis/);
  bad(GOOD.replace('<path', '<image href="a.png"/><path'), /<image>|href/);
  bad(GOOD.replace('<path', '<text>x</text><path'), /<text>/);
  bad(GOOD.replace('<path', '<linearGradient id="a"/><path'), /kleurverloop/);
  bad('geen svg', /geen enkele/);
  bad(GOOD.replace('<path', `<path d="${'M0 0'.repeat(MAX_ICON_BYTES)}"/><path`), /te groot/);
});

test('extractIcons haalt <svg id="icon-sleutel"> uit de pagina van Moda', () => {
  const html = `<html><body><div><svg id="icon-water" viewBox="0 0 24 24"><path d="M1 1"/></svg><span>water</span></div>
    <svg class="x" viewBox="0 0 24 24"><path d="M2 2"/></svg><svg id="icon-no-sugar" viewBox="0 0 24 24"><path d="M3 3"/></svg></body></html>`;
  const found = extractIcons(html);
  assert.deepEqual([...found.keys()], ['water', 'no-sugar']);
  assert.match(found.get('water'), /M1 1/);
});

test('buildSprite: een symbol per icoon in de volgorde van de catalogus, met de tekenkenmerken van de svg', () => {
  const icons = new Map([['book', GOOD], ['water', GOOD.replace('stroke-width="1.75"', 'stroke-width="2"')]]);
  const sprite = buildSprite(icons);
  assert.ok(sprite.indexOf('id="water"') < sprite.indexOf('id="book"'), 'water staat vóór book in de catalogus');
  assert.match(sprite, /<symbol id="water" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">/);
  assert.match(sprite, /<circle cx="12" cy="14" r="1.5" fill="var\(--icon-accent, currentColor\)"\/>/);
  assert.equal((sprite.match(/<symbol /g) ?? []).length, 2);
  assert.ok(!/width="24"|<script/.test(sprite));
});

test('themeIconsModule schrijft een geldige module die weer gelezen kan worden', async () => {
  const text = themeIconsModule({ v0lky1: [], mel: ['water', 'book'] });
  const url = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  const { THEME_ICON_KEYS: parsed } = await import(url);
  assert.deepEqual({ ...parsed, v0lky1: [...parsed.v0lky1], mel: [...parsed.mel] }, { v0lky1: [], mel: ['water', 'book'] });
  assert.ok(Object.isFrozen(parsed));
});

test('normalizeIconSvg: een style met tekenkenmerken wordt kenmerken (zoals Moda het accent levert); andere stijlen blijven en worden afgekeurd', () => {
  const moda = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 1" fill-opacity="0.3" style="stroke:var(--icon-accent, currentColor);fill:var(--icon-accent, currentColor)"/></svg>';
  assert.ok(validateIconSvg('water', moda).some((p) => /style/.test(p)), 'zonder normaliseren afgekeurd');
  const fixed = normalizeIconSvg(moda);
  assert.deepEqual(validateIconSvg('water', fixed), []);
  assert.match(fixed, /fill="var\(--icon-accent, currentColor\)"/);
  assert.match(fixed, /stroke="var\(--icon-accent, currentColor\)"/);
  assert.match(fixed, /fill-opacity="0.3"/);
  assert.ok(!/style=/.test(fixed));
  // een bestaand kenmerk van hetzelfde type wordt vervangen, niet dubbel gezet
  assert.equal((normalizeIconSvg('<svg viewBox="0 0 24 24"><path fill="none" style="fill:currentColor"/></svg>').match(/fill=/g) ?? []).length, 1);
  // andere eigenschappen (bijvoorbeeld filter of animation) laten we staan
  const odd = '<svg viewBox="0 0 24 24"><path style="filter:blur(2px)"/></svg>';
  assert.equal(normalizeIconSvg(odd), odd);
  assert.ok(validateIconSvg('water', odd).some((p) => /style/.test(p)));
});
