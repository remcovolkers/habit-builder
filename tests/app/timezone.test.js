import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timezoneLabel, timezoneToOffer } from '../../src/app/timezone.js';

test('een toestel op een andere tijdzone dan de app: die wordt voorgesteld', () => {
  assert.equal(timezoneToOffer({ device: 'America/New_York', saved: 'Europe/Amsterdam' }), 'America/New_York');
});

test('dezelfde tijdzone, of een die al eens is afgewezen: niets te vragen', () => {
  assert.equal(timezoneToOffer({ device: 'Europe/Amsterdam', saved: 'Europe/Amsterdam' }), null);
  assert.equal(timezoneToOffer({ device: 'America/New_York', saved: 'Europe/Amsterdam', declined: 'America/New_York' }), null);
});

test('na "zo laten" voor één tijdzone wordt een volgende, andere tijdzone wel weer voorgesteld', () => {
  assert.equal(timezoneToOffer({ device: 'Asia/Tokyo', saved: 'Europe/Amsterdam', declined: 'America/New_York' }), 'Asia/Tokyo');
});

test('een ongeldige of ontbrekende tijdzone van het toestel wordt nooit voorgesteld', () => {
  for (const device of ['', null, undefined, 'Mars/Olympus', 42]) {
    assert.equal(timezoneToOffer({ device, saved: 'Europe/Amsterdam' }), null, String(device));
  }
});

test('timezoneLabel: de plaatsnaam, zonder streepjes of werelddeel', () => {
  assert.equal(timezoneLabel('Europe/Amsterdam'), 'Amsterdam');
  assert.equal(timezoneLabel('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(timezoneLabel('UTC'), 'UTC');
  assert.equal(timezoneLabel(''), '');
  assert.equal(timezoneLabel(undefined), '');
});
