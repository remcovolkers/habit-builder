import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderSummary, validateReminderTime, REMINDER_DAYS, DEFAULT_REMINDER_TIME } from '../../src/app/reminder.js';
import { validHabit, TODAY } from './helpers.js';

const daily = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] };
const habit = (id, schedule, over = {}) => validHabit({ id, name: id, schedules: [{ effectiveFrom: '2026-10-01', schedule }], ...over });
const snapshot = (over = {}) => ({ habits: [], checkIns: [], pauses: [], dayPlans: [], ...over });
const settings = { displayName: '  Remco ', timezone: 'Europe/Amsterdam', dayStartHour: 4 };
const planned = (entry) => entry.slice(0, 2); // [gepland, stapel]; daarna volgen aandacht en review

test('tijdstip: HH:MM, en niet vóór het begin van je dag', () => {
  assert.equal(DEFAULT_REMINDER_TIME, '08:00');
  assert.equal(validateReminderTime('08:00', 4), null);
  assert.equal(validateReminderTime('04:00', 4), null);
  assert.equal(validateReminderTime('03:59', 4), 'before_day_start');
  assert.equal(validateReminderTime('00:30', 0), null);
  for (const bad of ['8:00', '24:00', '08:60', '', null, undefined, '08:00:00', 'ochtend']) assert.equal(validateReminderTime(bad, 4), 'invalid', String(bad));
});

test('samenvatting: een paar getallen per dag, voor vandaag en de week erna, met de voornaam', () => {
  const summary = buildReminderSummary({ snapshot: snapshot({ habits: [habit('A', daily), habit('B', daily)] }), today: TODAY, settings });
  assert.equal(summary.name, 'Remco');
  assert.equal(Object.keys(summary.days).length, REMINDER_DAYS);
  assert.deepEqual(Object.keys(summary.days)[0], TODAY);
  assert.deepEqual(planned(summary.days[TODAY]), [2, 0]);
  assert.deepEqual(planned(summary.days['2026-10-21']), [2, 0]);
});

test('samenvatting: gedaan telt nog mee als gepland; een gewoonte die op vaste weekdagen valt telt alleen die dagen', () => {
  const weekdaysOnly = { type: 'weekdays', weekdays: [0, 1, 2, 3, 4] }; // ma-vr; TODAY is donderdag, 17 okt is zaterdag... (zie hieronder)
  const view = buildReminderSummary({
    snapshot: snapshot({
      habits: [habit('Werk', weekdaysOnly)],
      checkIns: [{ habitId: 'Werk', date: TODAY, status: 'done' }],
    }),
    today: TODAY, settings,
  });
  assert.deepEqual(planned(view.days[TODAY]), [1, 0], 'vandaag gedaan, maar het stond wel gepland');
  assert.deepEqual(planned(view.days['2026-10-16']), [1, 0], 'vrijdag');
  assert.deepEqual(planned(view.days['2026-10-17']), [0, 0], 'zaterdag');
  assert.deepEqual(planned(view.days['2026-10-18']), [0, 0], 'zondag');
  assert.deepEqual(planned(view.days['2026-10-19']), [1, 0], 'maandag');
});

test('samenvatting: de stapel telt alleen taken waar nog iets aan moet gebeuren', () => {
  const twice = { type: 'times_per_period', period: 'week', count: 2 };
  const once = { type: 'times_per_period', period: 'week', count: 1 };
  const summary = buildReminderSummary({
    snapshot: snapshot({
      habits: [habit('Hardlopen', twice), habit('Gitaar', once)],
      checkIns: [{ habitId: 'Gitaar', date: '2026-10-13', status: 'done' }], // dinsdag: weekdoel van Gitaar gehaald
    }),
    today: TODAY, settings,
  });
  assert.deepEqual(planned(summary.days[TODAY]), [0, 1], 'alleen Hardlopen ligt nog in de stapel');
});

test('samenvatting: een gepauzeerde gewoonte telt niet mee', () => {
  const summary = buildReminderSummary({
    snapshot: snapshot({
      habits: [habit('Water', daily)],
      pauses: [{ id: 'p1', habitId: 'Water', from: '2026-10-10', to: null }],
    }),
    today: TODAY, settings,
  });
  assert.deepEqual(planned(summary.days[TODAY]), [0, 0]);
});

test('samenvatting: zonder gewoontes of naam geeft nullen en een lege naam, zonder fouten', () => {
  const summary = buildReminderSummary({ snapshot: snapshot(), today: TODAY, settings: {} });
  assert.equal(summary.name, '');
  assert.ok(Object.values(summary.days).every((pair) => pair[0] === 0 && pair[1] === 0));
});

test('samenvatting: blijft klein genoeg voor de database (4000 tekens)', () => {
  const habits = Array.from({ length: 40 }, (_, i) => habit(`h${i}`, daily));
  const summary = buildReminderSummary({ snapshot: snapshot({ habits }), today: TODAY, settings: { displayName: 'x'.repeat(100) } });
  assert.ok(JSON.stringify(summary).length < 600);
  assert.equal(summary.name.length, 30);
});

test('base64UrlToBytes: zet een VAPID-sleutel om naar 65 bytes die met 0x04 beginnen', async () => {
  const { base64UrlToBytes } = await import('../../src/app/reminder.js');
  const key = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const bytes = base64UrlToBytes(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
  assert.equal(Buffer.from(bytes).toString('base64url'), key);
});

// --- een nieuw tijdstip geldt vanaf de eerstvolgende keer (rearmDate) -------------------------------

test('rearmDate: een tijdstip dat nog komt vandaag = opnieuw scherp (null), zodat de melding vandaag nog komt', async () => {
  const { rearmDate } = await import('../../src/app/reminder.js');
  const now = new Date(Date.UTC(2026, 9, 15, 15, 31)); // 17:31 in Amsterdam (CEST)
  assert.equal(rearmDate({ time: '17:35', now, timeZone: 'Europe/Amsterdam' }), null);
  assert.equal(rearmDate({ time: '23:59', now, timeZone: 'Europe/Amsterdam' }), null);
});

test('rearmDate: een tijdstip dat vandaag al voorbij is = vandaag als gemeld, de eerste melding is morgen', async () => {
  const { rearmDate } = await import('../../src/app/reminder.js');
  const now = new Date(Date.UTC(2026, 9, 15, 15, 31));
  assert.equal(rearmDate({ time: '08:00', now, timeZone: 'Europe/Amsterdam' }), '2026-10-15');
  assert.equal(rearmDate({ time: '17:31', now, timeZone: 'Europe/Amsterdam' }), '2026-10-15', 'precies nu telt als voorbij');
});

test('rearmDate: rekent in de tijdzone van de gebruiker, ook als de datum daar anders is dan in UTC', async () => {
  const { rearmDate } = await import('../../src/app/reminder.js');
  const now = new Date(Date.UTC(2026, 9, 15, 22, 30)); // 00:30 op 16 okt in Amsterdam, 18:30 op 15 okt in New York
  assert.equal(rearmDate({ time: '08:00', now, timeZone: 'Europe/Amsterdam' }), null, '08:00 komt nog (het is net na middernacht)');
  assert.equal(rearmDate({ time: '08:00', now, timeZone: 'America/New_York' }), '2026-10-15');
  assert.equal(rearmDate({ time: '00:10', now, timeZone: 'Europe/Amsterdam' }), '2026-10-16');
});

test('isAndroid: alleen Android krijgt de uitleg over batterij-instellingen', async () => {
  const { isAndroid } = await import('../../src/app/reminder.js');
  assert.equal(isAndroid('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), true);
  assert.equal(isAndroid('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'), false);
  assert.equal(isAndroid('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'), false);
  assert.equal(isAndroid(undefined), false);
  assert.equal(isAndroid(''), false);
});

test('samenvatting: aandacht (weekelijks, zonder reactie) en de review op zondag', () => {
  const bed = habit('Bed', { type: 'times_per_period', period: 'month', count: 2 }, { startDate: '2026-08-01' });
  const checkIns = [{ habitId: 'Bed', date: '2026-08-20', status: 'done' }];
  // laatst gedaan 20 augustus: het probleem begon 11 september, dus 9 en 16 oktober zijn meldmomenten (TODAY is donderdag 15 oktober)
  const summary = buildReminderSummary({ snapshot: snapshot({ habits: [bed], checkIns }), today: TODAY, settings });
  assert.deepEqual(Object.values(summary.days).map((entry) => entry[2]), [0, 1, 0, 0, 0, 0, 0]);
  assert.equal(summary.days['2026-10-16'][2], 1);

  const answered = buildReminderSummary({ snapshot: snapshot({ habits: [bed], checkIns, reasons: [{ habitId: 'Bed', date: TODAY, reason: 'forgot', note: null }] }), today: TODAY, settings });
  assert.deepEqual(Object.values(answered.days).map((entry) => entry[2]), [0, 0, 0, 0, 0, 0, 0]);

  // zondag 18 oktober: de weekreview staat klaar zolang hij niet is opgeslagen
  assert.deepEqual(Object.entries(summary.days).filter(([, entry]) => entry[3] === 1).map(([date]) => date), ['2026-10-18']);
  const reviewed = buildReminderSummary({ snapshot: snapshot({ reviews: [{ weekStart: '2026-10-12', wentWell: 'goed', wentBad: '' }] }), today: TODAY, settings });
  assert.deepEqual(Object.values(reviewed.days).map((entry) => entry[3]), [0, 0, 0, 0, 0, 0, 0]);
  // een review zonder inhoud (bijvoorbeeld een oude met alleen "wat pas ik aan") telt niet als ingevuld
  const legacy = buildReminderSummary({ snapshot: snapshot({ reviews: [{ weekStart: '2026-10-12', wentWell: '', adjust: 'x' }] }), today: TODAY, settings });
  assert.equal(legacy.days['2026-10-18'][3], 1);
});

test('samenvatting: de maandreview staat klaar op de laatste dag van de maand zolang hij niet is ingevuld', () => {
  const days = (today, reviews) => buildReminderSummary({ snapshot: snapshot({ reviews }), today, settings }).days;
  assert.deepEqual(Object.entries(days('2026-10-28', [])).filter(([, entry]) => entry[4] === 1).map(([date]) => date), ['2026-10-31']);
  const filled = [{ id: 'month:2026-10', period: 'month', monthStart: '2026-10-01', adjust: 'vroeger opstaan', appliedAt: null }];
  assert.equal(days('2026-10-28', filled)['2026-10-31'][4], 0);
  assert.equal(days('2026-10-28', [])['2026-10-30'][4], 0, 'alleen op de laatste dag');
  // een maandrecord telt niet als weekreview voor de zondag
  assert.equal(days('2026-10-15', filled)['2026-10-18'][3], 1);
});

test('samenvatting: een taak met "Niet in deze week" telt die week niet mee in de stapel van de herinnering', () => {
  const flex = (name, over = {}) => ({ ...habit(name, { type: 'times_per_period', period: 'week', count: 2 }, { startDate: '2026-10-01' }), ...over });
  const two = buildReminderSummary({ snapshot: snapshot({ habits: [flex('A'), flex('B')] }), today: TODAY, settings });
  const skipped = buildReminderSummary({ snapshot: snapshot({ habits: [flex('A'), flex('B', { noPlanWeek: '2026-10-12' })] }), today: TODAY, settings });
  assert.equal(two.days[TODAY][1], 2);
  assert.equal(skipped.days[TODAY][1], 1, 'deze week niet');
  assert.equal(skipped.days['2026-10-19'][1], 2, 'maandag: weer aan de beurt');
});

test('samenvatting: een taak die al op een andere dag is ingepland telt niet mee in "in je stapel"', () => {
  const flex = (name) => habit(name, { type: 'times_per_period', period: 'week', count: 1 }, { startDate: '2026-10-01' });
  const open = buildReminderSummary({ snapshot: snapshot({ habits: [flex('A'), flex('B')] }), today: TODAY, settings });
  const planned = buildReminderSummary({ snapshot: snapshot({ habits: [flex('A'), flex('B')], dayPlans: [{ habitId: 'B', date: '2026-10-17' }] }), today: TODAY, settings });
  assert.equal(open.days[TODAY][1], 2);
  assert.equal(planned.days[TODAY][1], 1, 'B staat al op zaterdag');
});
