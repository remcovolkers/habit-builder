// De pure regels rond vrienden en ranglijst: gebruikersnamen, uitnodigingslinks en het omzetten van serverrijen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardEntries, buildInviteLink, groupFriends, parseInviteHash, shownName, suggestUsername, summarySignature, summaryToArgs, validateUsername, withOwnSummary,
} from '../../src/app/social.js';

const CODE = 'ab'.repeat(32);

test('een gebruikersnaam wordt kleine letters zonder spaties aan de rand', () => {
  assert.deepEqual(validateUsername('  Remco.V_2 '), { ok: true, value: 'remco.v_2' });
});

test('te korte, te lange, lege en ongeldige gebruikersnamen hebben elk een eigen reden', () => {
  assert.equal(validateUsername('').reason, 'empty');
  assert.equal(validateUsername('   ').reason, 'empty');
  assert.equal(validateUsername(null).reason, 'empty');
  assert.equal(validateUsername('ab').reason, 'too_short');
  assert.equal(validateUsername('a'.repeat(21)).reason, 'too_long');
  for (const bad of ['a b c', 'naam!', 'ä-ö-ü', 'a-b', 'naam@x', 'na/me']) assert.equal(validateUsername(bad).reason, 'invalid_chars', bad);
  assert.equal(validateUsername('abc').ok, true);
  assert.equal(validateUsername('a'.repeat(20)).ok, true);
});

test('een voorstel voor een gebruikersnaam: kleine letters, geen accenten, spaties worden punten', () => {
  assert.equal(suggestUsername('Remco'), 'remco');
  assert.equal(suggestUsername('Zoë van Dijk'), 'zoe.van.dijk');
  assert.equal(suggestUsername('  Jean-Luc  '), 'jean.luc');
  assert.equal(suggestUsername('Ünal & Co.'), 'unal.co');
});

test('een voorstel is nooit te kort of te lang en altijd geldig, of leeg', () => {
  assert.equal(suggestUsername('Jo'), '');
  assert.equal(suggestUsername('!!!'), '');
  assert.equal(suggestUsername(''), '');
  assert.equal(suggestUsername(undefined), '');
  const long = suggestUsername('Een Heel Erg Lange Naam Die Niet Past');
  assert.ok(long.length <= 20);
  assert.ok(!long.endsWith('.'));
  assert.equal(validateUsername(long).ok, true);
  for (const name of ['Remco', 'Zoë van Dijk', 'Anna-Maria', 'Mel 2']) {
    const suggestion = suggestUsername(name);
    assert.equal(validateUsername(suggestion).ok, true, `${name} → ${suggestion}`);
  }
});

test('de getoonde naam is de weergavenaam, anders de gebruikersnaam', () => {
  assert.equal(shownName({ display_name: 'Anna', username: 'anna1' }), 'Anna');
  assert.equal(shownName({ display_name: '  ', username: 'anna1' }), 'anna1');
  assert.equal(shownName({ display_name: null, username: 'anna1' }), 'anna1');
  assert.equal(shownName({ displayName: 'Bram', username: 'b' }), 'Bram');
});

test('een uitnodigingslink bevat de code achter #/vrienden/uitnodiging/ en laat een eventuele hash weg', () => {
  assert.equal(buildInviteLink('https://remcovolkers.github.io/habit-builder/', CODE), `https://remcovolkers.github.io/habit-builder/#/vrienden/uitnodiging/${CODE}`);
  assert.equal(buildInviteLink('http://localhost:5173/#/today', CODE), `http://localhost:5173/#/vrienden/uitnodiging/${CODE}`);
});

test('de code uit een uitnodigingslink: alleen een goede code van 64 tekens telt', () => {
  assert.equal(parseInviteHash(`#/vrienden/uitnodiging/${CODE}`), CODE);
  assert.equal(parseInviteHash(`#/vrienden/uitnodiging/${CODE.toUpperCase()}`), CODE, 'hoofdletters worden kleine letters');
  assert.equal(parseInviteHash(`#/vrienden/uitnodiging/${CODE}/`), CODE);
  for (const bad of ['', null, undefined, '#/vrienden', '#/vrienden/uitnodiging/', '#/vrienden/uitnodiging/abc', `#/vrienden/uitnodiging/${CODE}x`,
    `#/vrienden/uitnodiging/${'g'.repeat(64)}`, `#/today/${CODE}`, `#/vrienden/uitnodiging/${CODE}?x=1`]) {
    assert.equal(parseInviteHash(bad), null, String(bad));
  }
});

test('de samenvatting wordt de argumenten van publish_summary, en de handtekening verandert met elk getal', () => {
  const summary = { asOf: '2026-10-15', points: 230, done: 23, streak: 9, activeHabits: 5, lastActive: '2026-10-15', breakdown: { tasks: 230, bonus: 0, start: 0, penalty: 0 } };
  assert.deepEqual(summaryToArgs(summary), { p_as_of: '2026-10-15', p_points: 230, p_done: 23, p_streak: 9, p_active_habits: 5, p_last_active: '2026-10-15' });
  assert.ok(!('breakdown' in summaryToArgs(summary)), 'de uitsplitsing blijft op je eigen apparaat');
  const base = summarySignature(summary);
  for (const patch of [{ points: 231 }, { done: 24 }, { streak: 10 }, { activeHabits: 6 }, { lastActive: '2026-10-14' }, { asOf: '2026-10-16' }]) {
    assert.notEqual(summarySignature({ ...summary, ...patch }), base, JSON.stringify(patch));
  }
  assert.equal(summarySignature({ ...summary, breakdown: { tasks: 1 } }), base, 'de uitsplitsing telt niet mee voor "is er iets veranderd"');
  assert.deepEqual(summaryToArgs({ ...summary, lastActive: null }).p_last_active, null);
});

test('vriendenlijst: drie lijsten, op naam gesorteerd, met de gebruikersnaam als terugval', () => {
  const rows = [
    { user_id: 'c', username: 'cor', display_name: '', state: 'friend', since: '2026-10-01' },
    { user_id: 'a', username: 'anna', display_name: 'Anna', state: 'friend', since: '2026-10-02' },
    { user_id: 'z', username: 'zoe', display_name: 'Zoë', state: 'incoming', since: '2026-10-03' },
    { user_id: 'b', username: 'bram', display_name: 'Bram', state: 'outgoing', since: '2026-10-04' },
    { user_id: 'e', username: 'eef', display_name: 'émile', state: 'friend', since: '2026-10-05' },
  ];
  const lists = groupFriends(rows);
  assert.deepEqual(lists.friends.map((p) => p.name), ['Anna', 'cor', 'émile']);
  assert.deepEqual(lists.incoming.map((p) => p.userId), ['z']);
  assert.deepEqual(lists.outgoing.map((p) => p.userId), ['b']);
  assert.deepEqual(groupFriends(null), { friends: [], incoming: [], outgoing: [] });
});

test('ranglijstrijen worden invoer voor de ranglijst', () => {
  const entries = boardEntries([{ user_id: 'a', username: 'anna', display_name: '', points: 120, done: 12, streak: 3, active_habits: 4, last_active: '2026-10-15', as_of: '2026-10-15' }]);
  assert.deepEqual(entries, [{ userId: 'a', username: 'anna', name: 'anna', points: 120, done: 12, streak: 3, activeHabits: 4, lastActive: '2026-10-15', asOf: '2026-10-15' }]);
  assert.deepEqual(boardEntries(undefined), []);
});

test('je eigen lokale cijfers vervangen wat de server van jou heeft, en je staat er altijd maar één keer in', () => {
  const entries = [
    { userId: 'me', username: 'remco', name: 'Remco', points: 50, done: 5, streak: 1, activeHabits: 2, lastActive: '2026-10-14', asOf: '2026-10-14' },
    { userId: 'a', username: 'anna', name: 'Anna', points: 120, done: 12, streak: 3, activeHabits: 4, lastActive: '2026-10-15', asOf: '2026-10-15' },
  ];
  const summary = { asOf: '2026-10-15', points: 200, done: 20, streak: 6, activeHabits: 3, lastActive: '2026-10-15' };
  const merged = withOwnSummary({ entries, userId: 'me', username: 'remco', name: 'Remco V.', summary });
  assert.equal(merged.filter((e) => e.userId === 'me').length, 1);
  assert.deepEqual(merged.find((e) => e.userId === 'me'), { userId: 'me', username: 'remco', name: 'Remco V.', points: 200, done: 20, streak: 6, activeHabits: 3, lastActive: '2026-10-15', asOf: '2026-10-15' });
  assert.equal(merged.find((e) => e.userId === 'a').points, 120);
  assert.equal(entries[0].points, 50, 'de invoer wordt niet gewijzigd');
});

test('je eigen rij komt er ook in als de server nog niets van jou heeft, en zonder samenvatting blijft de lijst zoals hij was', () => {
  const summary = { asOf: '2026-10-15', points: 10, done: 1, streak: 1, activeHabits: 1, lastActive: '2026-10-15' };
  assert.equal(withOwnSummary({ entries: [], userId: 'me', username: 'remco', name: '', summary })[0].name, 'remco', 'zonder naam: de gebruikersnaam');
  const entries = [{ userId: 'a' }];
  assert.equal(withOwnSummary({ entries, userId: 'me', username: 'remco', name: 'x', summary: null }), entries);
});

// ---- voor de schermen ----------------------------------------------------------------------------------------------------------

import { describeBreakdown, myPosition } from '../../src/app/social.js';

test('de uitsplitsing van je punten: taken altijd, bonus/start/aftrek alleen als ze er zijn, de aftrek met een min', () => {
  assert.deepEqual(describeBreakdown({ tasks: 210, bonus: 42, start: 30, penalty: 10 }), [
    { key: 'tasks', points: 210 }, { key: 'bonus', points: 42 }, { key: 'start', points: 30 }, { key: 'penalty', points: -10 },
  ]);
  assert.deepEqual(describeBreakdown({ tasks: 70, bonus: 0, start: 0, penalty: 0 }), [{ key: 'tasks', points: 70 }]);
  assert.deepEqual(describeBreakdown({ tasks: 0, bonus: 0, start: 0, penalty: 15 }), [{ key: 'tasks', points: 0 }, { key: 'penalty', points: -15 }]);
});

test('zonder uitsplitsing is er alleen een lege regel voor de taken', () => {
  assert.deepEqual(describeBreakdown(undefined), [{ key: 'tasks', points: 0 }]);
  assert.deepEqual(describeBreakdown(null), [{ key: 'tasks', points: 0 }]);
});

test('jouw plek op de ranglijst: rang, aantal mensen en punten; geen plek als je er niet op staat', () => {
  const board = [{ isMe: false, rank: 1, points: 300 }, { isMe: true, rank: 2, points: 200 }, { isMe: false, rank: 3, points: 90 }];
  assert.deepEqual(myPosition(board), { rank: 2, total: 3, points: 200 });
  assert.equal(myPosition([{ isMe: false, rank: 1, points: 5 }]), null);
  assert.equal(myPosition([]), null);
  assert.equal(myPosition(undefined), null);
});
