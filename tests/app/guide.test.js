// Zo werkt het en de introductie: de uitleg loopt niet achter op de app. Elk ritme uit het formulier staat erin, met een voorbeeld,
// en de sjablonen laten alle ritmes zien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_COUNTER, GUIDE_SECTIONS, GUIDE_TYPES } from '../../src/content/guide.js';
import { TEMPLATES } from '../../src/content/templates.js';
import { nl } from '../../src/content/nl.js';
import { starterKind } from '../../src/app/starter-kind.js';

/** Het soort ritme van een schema, zoals het formulier het noemt. */
function kindOf(schedule) {
  if (schedule.type === 'weekdays') return schedule.weekdays.length === 7 ? 'daily' : 'weekdays';
  if (schedule.type === 'times_per_period') return schedule.period === 'week' ? 'per_week' : 'per_month';
  return 'day_of_month';
}

test('elk ritme uit het formulier heeft uitleg en een voorbeeld, en er staat er geen te veel', () => {
  assert.deepEqual(GUIDE_TYPES.map((t) => t.key).sort(), Object.keys(nl.form.scheduleTypes).sort());
  for (const type of GUIDE_TYPES) {
    assert.ok(type.text.length > 10, type.key);
    assert.ok(type.example.length > 5, type.key);
    assert.ok(nl.guide.example(type.example).startsWith('Bijvoorbeeld: '), type.key);
  }
  assert.ok(GUIDE_COUNTER.text.length > 10 && GUIDE_COUNTER.example.length > 5);
});

test('een voorbeeld begint met een kleine letter na "Bijvoorbeeld:" en eindigt op één punt', () => {
  assert.equal(nl.guide.example('Hardlopen, 3 keer per week.'), 'Bijvoorbeeld: hardlopen, 3 keer per week.');
  assert.equal(nl.guide.example('Water drinken'), 'Bijvoorbeeld: water drinken.');
});

test('de sjablonen laten alle vijf de ritmes zien, zodat een nieuwe gebruiker ze kan kiezen in plaats van te raden', () => {
  const kinds = new Set(Object.values(TEMPLATES).map((t) => kindOf(t.schedule)));
  for (const { key } of GUIDE_TYPES) assert.ok(kinds.has(key), `geen sjabloon voor "${key}"`);
});

test('een sjabloon met een teller zegt dat, en laat het ritme zien', () => {
  assert.equal(starterKind(TEMPLATES.water), 'Elke dag · met teller');
  assert.equal(starterKind(TEMPLATES.running), '3× per week');
  assert.equal(starterKind(TEMPLATES.cleaning), '2× per maand');
  assert.equal(starterKind(TEMPLATES.budget), 'Dag 25 van de maand');
});

test('de onderdelen van Zo werkt het hebben een eigen sleutel en een titel en tekst', () => {
  const ids = GUIDE_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('types'), 'de soorten habits staan erin');
  for (const section of GUIDE_SECTIONS) {
    assert.ok(section.title.length > 2, section.id);
    assert.ok(section.paragraphs.length > 0, section.id);
  }
});

test('de introductie heeft voor elke stap een titel en tekst', () => {
  for (const n of [1, 2, 3]) {
    assert.ok(nl.welcome[`title${n}`].length > 3, `title${n}`);
    assert.ok(nl.welcome[`text${n}`].length > 10, `text${n}`);
  }
  assert.equal(nl.welcome.points1.length, 2);
  assert.equal(nl.welcome.points2.length, 2);
});
