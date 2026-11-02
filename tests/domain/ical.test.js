// iCalendar lezen: een agenda-feed zoals Google die geeft, naar items per dag (docs/AGENDA.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandIcal, instantOf, parseDateValue, parseEvents, wallOf } from '../../src/domain/ical.js';

const ZONE = 'Europe/Amsterdam';
const calendar = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'X-WR-CALNAME:Remco', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const event = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const expand = (text, from = '2026-11-02', to = '2026-11-08') => expandIcal(text, { from, to, zone: ZONE });
const summary = (items) => items.map((i) => `${i.date} ${i.start ?? (i.allDay ? 'hele dag' : '-')}${i.end ? `-${i.end}` : ''} ${i.title}`);

test('tijdzones: een muurtijd naar een moment en terug, ook over de zomertijdwissel', () => {
  // 2026-10-25 om 03:00 gaat de klok in Nederland terug: 09:00 blijft 09:00, maar het UTC-verschil verandert
  assert.equal(new Date(instantOf('2026-10-24', '09:00:00', ZONE)).toISOString(), '2026-10-24T07:00:00.000Z');
  assert.equal(new Date(instantOf('2026-10-26', '09:00:00', ZONE)).toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(wallOf(Date.UTC(2026, 10, 2, 13, 30), ZONE).minutes, 14 * 60 + 30);
  assert.equal(wallOf(Date.UTC(2026, 10, 2, 23, 30), ZONE).date, '2026-11-03');
});

test('datumwaarden: hele dag, UTC, tijdzone en zwevend; een onbekende tijdzone telt als zwevend', () => {
  assert.deepEqual(parseDateValue('20261102', { VALUE: 'DATE' }), { date: '2026-11-02', time: null, tz: null });
  assert.deepEqual(parseDateValue('20261102T130000Z'), { date: '2026-11-02', time: '13:00:00', tz: 'UTC' });
  assert.deepEqual(parseDateValue('20261102T140000', { TZID: ZONE }), { date: '2026-11-02', time: '14:00:00', tz: ZONE });
  assert.deepEqual(parseDateValue('20261102T1400', {}), { date: '2026-11-02', time: '14:00:00', tz: null });
  assert.equal(parseDateValue('20261102T140000', { TZID: 'W. Europe Standard Time' }).tz, null);
  assert.equal(parseDateValue('20261302'), null);
  assert.equal(parseDateValue('morgen'), null);
});

test('een gewone afspraak met een tijdzone en een eindtijd', () => {
  const text = calendar(event('UID:a1', 'SUMMARY:Tandarts', 'DTSTART;TZID=Europe/Amsterdam:20261104T143000', 'DTEND;TZID=Europe/Amsterdam:20261104T153000'));
  assert.deepEqual(expand(text), [{ id: 'a1|t:' + instantOf('2026-11-04', '14:30:00', ZONE) + '|2026-11-04', title: 'Tandarts', date: '2026-11-04', start: '14:30', end: '15:30', allDay: false }]);
});

test('een afspraak in UTC komt op de lokale tijd, ook als de dag verspringt', () => {
  const text = calendar(event('UID:u1', 'SUMMARY:Laat', 'DTSTART:20261103T233000Z', 'DTEND:20261104T003000Z'));
  assert.deepEqual(summary(expand(text)), ['2026-11-04 00:30-01:30 Laat']);
});

test('een afspraak in een andere tijdzone komt op jouw tijd', () => {
  const text = calendar(event('UID:n1', 'SUMMARY:Call New York', 'DTSTART;TZID=America/New_York:20261104T090000', 'DTEND;TZID=America/New_York:20261104T100000'));
  assert.deepEqual(summary(expand(text)), ['2026-11-04 15:00-16:00 Call New York']); // New York is in november al op wintertijd, 6 uur achter
});

test('hele dagen: het einde is exclusief, en meer dagen geven een item per dag', () => {
  const text = calendar(
    event('UID:v1', 'SUMMARY:Verjaardag Anna', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261106'),
    event('UID:v2', 'SUMMARY:Vakantie', 'DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261109'),
  );
  assert.deepEqual(summary(expand(text)), ['2026-11-05 hele dag Verjaardag Anna', '2026-11-06 hele dag Vakantie', '2026-11-07 hele dag Vakantie', '2026-11-08 hele dag Vakantie']);
  assert.deepEqual(summary(expand(text, '2026-11-07', '2026-11-07')), ['2026-11-07 hele dag Vakantie'], 'ook een dag midden in een lange afspraak');
});

test('een afspraak over middernacht heen: de begintijd op de eerste dag, daarna hele dag', () => {
  const text = calendar(event('UID:m1', 'SUMMARY:Nachtdienst', 'DTSTART;TZID=Europe/Amsterdam:20261103T220000', 'DTEND;TZID=Europe/Amsterdam:20261104T060000'));
  assert.deepEqual(summary(expand(text)), ['2026-11-03 22:00 Nachtdienst', '2026-11-04 hele dag Nachtdienst']);
});

test('een afspraak die precies om middernacht eindigt, hoort niet op de volgende dag', () => {
  const text = calendar(event('UID:m2', 'SUMMARY:Feest', 'DTSTART;TZID=Europe/Amsterdam:20261103T200000', 'DTEND;TZID=Europe/Amsterdam:20261104T000000'));
  assert.deepEqual(summary(expand(text)), ['2026-11-03 20:00 Feest']);
});

test('geen eindtijd of een DURATION: de duur volgt daaruit', () => {
  const text = calendar(
    event('UID:d1', 'SUMMARY:Zonder einde', 'DTSTART;TZID=Europe/Amsterdam:20261103T100000'),
    event('UID:d2', 'SUMMARY:Met duur', 'DTSTART;TZID=Europe/Amsterdam:20261103T110000', 'DURATION:PT1H30M'),
  );
  assert.deepEqual(summary(expand(text)), ['2026-11-03 10:00 Zonder einde', '2026-11-03 11:00-12:30 Met duur']);
});

test('tekst: regelvouwing, schrapjes en een alarm binnen de afspraak', () => {
  const text = calendar(event(
    'UID:t1',
    'SUMMARY:Bellen met Anna\\, over het\\n',
    '  verhuizen',
    'DTSTART;VALUE=DATE:20261103',
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'SUMMARY:Alarm niet gebruiken', 'END:VALARM',
  ));
  assert.deepEqual(summary(expand(text)), ['2026-11-03 hele dag Bellen met Anna, over het verhuizen']);
});

test('geannuleerde afspraken en afspraken zonder begin vallen weg', () => {
  const text = calendar(
    event('UID:c1', 'SUMMARY:Geannuleerd', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261103'),
    event('UID:c2', 'SUMMARY:Kapot', 'DTSTART:geenidee'),
  );
  assert.deepEqual(expand(text), []);
  assert.equal(parseEvents(text).length, 1);
});

test('wekelijks op maandag en woensdag, met een uitzondering', () => {
  const text = calendar(event(
    'UID:w1', 'SUMMARY:Sporten', 'DTSTART;TZID=Europe/Amsterdam:20261012T190000', 'DTEND;TZID=Europe/Amsterdam:20261012T200000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Europe/Amsterdam:20261104T190000',
  ));
  assert.deepEqual(summary(expand(text)), ['2026-11-02 19:00-20:00 Sporten'], 'woensdag 4 november is uitgezonderd');
  assert.deepEqual(summary(expand(text, '2026-11-02', '2026-11-11')), ['2026-11-02 19:00-20:00 Sporten', '2026-11-09 19:00-20:00 Sporten', '2026-11-11 19:00-20:00 Sporten']);
});

test('een herhaling houdt zijn lokale tijd na de zomertijdwissel', () => {
  const text = calendar(event('UID:z1', 'SUMMARY:Stand-up', 'DTSTART;TZID=Europe/Amsterdam:20261019T090000', 'DTEND;TZID=Europe/Amsterdam:20261019T091500', 'RRULE:FREQ=WEEKLY'));
  assert.deepEqual(summary(expand(text, '2026-10-19', '2026-11-02')), ['2026-10-19 09:00-09:15 Stand-up', '2026-10-26 09:00-09:15 Stand-up', '2026-11-02 09:00-09:15 Stand-up']);
});

test('COUNT en UNTIL begrenzen de herhaling', () => {
  const counted = calendar(event('UID:k1', 'SUMMARY:Drie keer', 'DTSTART;VALUE=DATE:20261030', 'RRULE:FREQ=DAILY;COUNT=5'));
  assert.deepEqual(summary(expand(counted, '2026-10-28', '2026-11-10')), ['2026-10-30 hele dag Drie keer', '2026-10-31 hele dag Drie keer', '2026-11-01 hele dag Drie keer', '2026-11-02 hele dag Drie keer', '2026-11-03 hele dag Drie keer']);
  const until = calendar(event('UID:k2', 'SUMMARY:Tot en met', 'DTSTART;TZID=Europe/Amsterdam:20261102T100000', 'DTEND;TZID=Europe/Amsterdam:20261102T110000', 'RRULE:FREQ=DAILY;UNTIL=20261104T090000Z'));
  assert.deepEqual(summary(expand(until)), ['2026-11-02 10:00-11:00 Tot en met', '2026-11-03 10:00-11:00 Tot en met', '2026-11-04 10:00-11:00 Tot en met']);
});

test('COUNT telt vanaf het begin, ook voor keren vóór het venster', () => {
  const text = calendar(event('UID:k3', 'SUMMARY:Acht keer', 'DTSTART;VALUE=DATE:20261020', 'RRULE:FREQ=WEEKLY;COUNT=2'));
  assert.deepEqual(expand(text, '2026-10-28', '2026-11-10'), []); // 20 en 27 oktober, daarna niets meer
  assert.deepEqual(summary(expand(text, '2026-10-26', '2026-10-28')), ['2026-10-27 hele dag Acht keer']);
});

test('om de week, met een startdag in de week en een eigen begin van de week', () => {
  const text = calendar(event('UID:i1', 'SUMMARY:Tweewekelijks', 'DTSTART;TZID=Europe/Amsterdam:20261027T080000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'));
  assert.deepEqual(summary(expand(text, '2026-10-26', '2026-11-20')), ['2026-10-27 08:00 Tweewekelijks', '2026-11-10 08:00 Tweewekelijks']);
});

test('maandelijks: de tweede dinsdag, de laatste werkdag en de vijftiende', () => {
  const text = calendar(
    event('UID:p1', 'SUMMARY:Tweede dinsdag', 'DTSTART;TZID=Europe/Amsterdam:20260908T190000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'),
    event('UID:p2', 'SUMMARY:Laatste werkdag', 'DTSTART;VALUE=DATE:20260930', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'),
    event('UID:p3', 'SUMMARY:De vijftiende', 'DTSTART;VALUE=DATE:20261015', 'RRULE:FREQ=MONTHLY'),
  );
  assert.deepEqual(summary(expand(text, '2026-11-01', '2026-11-30')), ['2026-11-10 19:00 Tweede dinsdag', '2026-11-15 hele dag De vijftiende', '2026-11-30 hele dag Laatste werkdag']);
});

test('maandelijks op de 31e slaat korte maanden over', () => {
  const text = calendar(event('UID:p4', 'SUMMARY:Einde', 'DTSTART;VALUE=DATE:20261031', 'RRULE:FREQ=MONTHLY'));
  assert.deepEqual(summary(expand(text, '2026-11-01', '2027-01-31')), ['2026-12-31 hele dag Einde', '2027-01-31 hele dag Einde']);
});

test('jaarlijks: een verjaardag en de laatste donderdag van november', () => {
  const text = calendar(
    event('UID:y1', 'SUMMARY:Verjaardag', 'DTSTART;VALUE=DATE:19900306', 'RRULE:FREQ=YEARLY'),
    event('UID:y2', 'SUMMARY:Thanksgiving', 'DTSTART;VALUE=DATE:20151126', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'),
  );
  assert.deepEqual(summary(expand(text, '2026-03-01', '2026-03-10')), ['2026-03-06 hele dag Verjaardag']);
  assert.deepEqual(summary(expand(text, '2026-11-20', '2026-11-30')), ['2026-11-26 hele dag Thanksgiving']);
});

test('een los gewijzigde keer vervangt die keer in de reeks, een geannuleerde keer verdwijnt', () => {
  const text = calendar(
    event('UID:r1', 'SUMMARY:Overleg', 'DTSTART;TZID=Europe/Amsterdam:20261026T100000', 'DTEND;TZID=Europe/Amsterdam:20261026T110000', 'RRULE:FREQ=WEEKLY'),
    event('UID:r1', 'RECURRENCE-ID;TZID=Europe/Amsterdam:20261102T100000', 'SUMMARY:Overleg (verzet)', 'DTSTART;TZID=Europe/Amsterdam:20261103T150000', 'DTEND;TZID=Europe/Amsterdam:20261103T160000'),
    event('UID:r1', 'RECURRENCE-ID;TZID=Europe/Amsterdam:20261109T100000', 'STATUS:CANCELLED', 'SUMMARY:Overleg', 'DTSTART;TZID=Europe/Amsterdam:20261109T100000'),
  );
  assert.deepEqual(summary(expand(text, '2026-10-26', '2026-11-16')), ['2026-10-26 10:00-11:00 Overleg', '2026-11-03 15:00-16:00 Overleg (verzet)', '2026-11-16 10:00-11:00 Overleg']);
});

test('een regel die we niet kennen telt alleen de eerste keer, in plaats van fout te raden', () => {
  const text = calendar(event('UID:x1', 'SUMMARY:Rare regel', 'DTSTART;VALUE=DATE:20261103', 'RRULE:FREQ=YEARLY;BYYEARDAY=100'));
  assert.deepEqual(summary(expand(text, '2026-11-01', '2027-12-31')), ['2026-11-03 hele dag Rare regel']);
});

test('een heel oude herhaling is snel, ook zonder einde', () => {
  const text = calendar(event('UID:o1', 'SUMMARY:Sinds 2010', 'DTSTART;TZID=Europe/Amsterdam:20100104T090000', 'DTEND;TZID=Europe/Amsterdam:20100104T100000', 'RRULE:FREQ=DAILY'));
  const before = Date.now();
  assert.deepEqual(summary(expand(text)).length, 7);
  assert.ok(Date.now() - before < 500);
});

test('veel afspraken ver buiten het venster kosten niets', () => {
  const events = Array.from({ length: 3000 }, (_, i) => event(`UID:e${i}`, `SUMMARY:Oud ${i}`, 'DTSTART;TZID=Europe/Amsterdam:20180301T100000', 'DTEND;TZID=Europe/Amsterdam:20180301T110000'));
  const before = Date.now();
  assert.deepEqual(expand(calendar(...events)), []);
  assert.ok(Date.now() - before < 500);
});

test('geen agenda of rommel: geen items, geen fout', () => {
  assert.deepEqual(expand(''), []);
  assert.deepEqual(expand('<html>Log in</html>'), []);
});
