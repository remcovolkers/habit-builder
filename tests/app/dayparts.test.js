// Een habit met meerdere dagdelen ("tandenpoetsen 's ochtends en 's avonds"): regels, afvinken per dagdeel, het dagoverzicht en wat er verder mee gebeurt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHabitForm, clearCheckIn, logCheckIn, RuleError, togglePart } from '../../src/app/actions.js';
import { buildDayView } from '../../src/app/day-view.js';
import { parseImport } from '../../src/app/backup.js';
import { evaluateAchievements } from '../../src/domain/achievements.js';
import { donePartsOf, habitDayparts, hasMultipleDayparts, partsStatus } from '../../src/domain/dayparts.js';
import { sortDayparts, validParts, validateHabit } from '../../src/domain/habit.js';
import { computeUnits } from '../../src/domain/units.js';
import { ValidationError } from '../../src/data/repository.js';
import { entryState } from '../../src/ui/components/habit-card.js';
import { testRepo, TODAY, validHabit } from './helpers.js';

const teeth = (over = {}) => validHabit({ id: 't', name: 'Tandenpoetsen', daypart: 'morning', dayparts: ['morning', 'evening'], ...over });
const codes = (errors) => errors.map((e) => `${e.field}.${e.code}`);

// --- domein ---------------------------------------------------------------------------------------

test('habitDayparts: een gewone habit heeft één dagdeel, een habit met meerdere heeft ze allemaal', () => {
  assert.deepEqual(habitDayparts(validHabit()), ['morning']);
  assert.equal(hasMultipleDayparts(validHabit()), false);
  assert.deepEqual(habitDayparts(teeth()), ['morning', 'evening']);
  assert.equal(hasMultipleDayparts(teeth()), true);
  assert.deepEqual(habitDayparts(validHabit({ dayparts: ['morning'] })), ['morning'], 'één in de lijst is geen "meerdere"');
});

test('validParts en sortDayparts: unieke dagdelen in de volgorde van de dag, zonder "overdag"', () => {
  assert.equal(validParts(['morning', 'evening'], 2), true);
  assert.equal(validParts(['morning', 'afternoon', 'evening'], 2), true);
  assert.equal(validParts(['evening', 'morning'], 2), false, 'niet op volgorde');
  assert.equal(validParts(['morning', 'morning'], 2), false);
  assert.equal(validParts(['morning', 'anytime'], 2), false, 'overdag combineer je niet');
  assert.equal(validParts(['morning'], 2), false);
  assert.equal(validParts('morning'), false);
  assert.deepEqual(sortDayparts(['evening', 'morning', 'afternoon']), ['morning', 'afternoon', 'evening']);
});

test('validateHabit: meerdere dagdelen vragen een geldige lijst waarvan het eerste de daypart is', () => {
  assert.deepEqual(validateHabit(teeth()), []);
  assert.deepEqual(validateHabit(teeth({ dayparts: null })), []);
  assert.deepEqual(codes(validateHabit(teeth({ dayparts: ['evening', 'morning'] }))), ['dayparts.invalid']);
  assert.deepEqual(codes(validateHabit(teeth({ daypart: 'evening' }))), ['dayparts.invalid'], 'daypart moet het eerste zijn (oudere appversies kennen alleen dat)');
  assert.deepEqual(codes(validateHabit(teeth({ dayparts: ['morning', 'anytime'] }))), ['dayparts.invalid']);
});

test('validateHabit: meerdere dagdelen kan niet met een teller, en alleen bij vaste weekdagen', () => {
  assert.deepEqual(codes(validateHabit(teeth({ counter: { unit: 'x', target: 2 } }))), ['dayparts.no_counter']);
  const weekly = [{ effectiveFrom: '2026-10-01', schedule: { type: 'times_per_period', period: 'week', count: 2 } }];
  assert.deepEqual(codes(validateHabit(teeth({ schedules: weekly }))), ['dayparts.needs_weekdays']);
});

test('donePartsOf: een volledige of minimale dag telt voor alle dagdelen (ook van vóór de wijziging), overslaan voor geen', () => {
  const habit = teeth();
  assert.deepEqual(donePartsOf(habit, null), []);
  assert.deepEqual(donePartsOf(habit, { status: 'done' }), ['morning', 'evening'], 'gelogd vóór de habit meerdere dagdelen kreeg');
  assert.deepEqual(donePartsOf(habit, { status: 'minimal' }), ['morning', 'evening']);
  assert.deepEqual(donePartsOf(habit, { status: 'skipped' }), []);
  assert.deepEqual(donePartsOf(habit, { status: 'partial', parts: ['evening'] }), ['evening']);
  assert.deepEqual(donePartsOf(habit, { status: 'partial', parts: ['morning', 'afternoon'] }), ['morning'], 'een dagdeel dat de habit niet (meer) heeft telt niet');
});

test('partsStatus: gedaan als alle dagdelen gedaan zijn, daaronder deels', () => {
  assert.equal(partsStatus(0, 2), null);
  assert.equal(partsStatus(1, 2), 'partial');
  assert.equal(partsStatus(2, 2), 'done');
  assert.equal(partsStatus(2, 3), 'partial');
});

test('een dag met één van twee dagdelen is niet gedaan: verleden = gemist, vandaag = open (zoals een teller)', () => {
  const habit = teeth({ startDate: '2026-10-13' });
  const units = computeUnits({
    habit,
    checkIns: [
      { date: '2026-10-13', status: 'partial', parts: ['morning'] },
      { date: '2026-10-14', status: 'done', parts: ['morning', 'evening'] },
      { date: TODAY, status: 'partial', parts: ['morning'] },
    ],
    today: TODAY,
  });
  assert.deepEqual(units.map((u) => u.status), ['missed', 'done', 'open']);
});

// --- opslag en acties -------------------------------------------------------------------------------

test('repository: parts worden bewaard en gevalideerd, en ontbreken in het record van een gewone dag', async () => {
  const { repo } = testRepo();
  await repo.setCheckIn({ habitId: 't', date: TODAY, status: 'partial', value: 1, parts: ['morning'] });
  assert.deepEqual((await repo.getCheckIn('t', TODAY)).parts, ['morning']);
  await repo.setCheckIn({ habitId: 'w', date: TODAY, status: 'done' });
  assert.equal('parts' in (await repo.getCheckIn('w', TODAY)), false);
  await assert.rejects(repo.setCheckIn({ habitId: 't', date: '2026-10-14', status: 'partial', parts: ['anytime'] }), ValidationError);
  await assert.rejects(repo.setCheckIn({ habitId: 't', date: '2026-10-14', status: 'partial', parts: ['evening', 'morning'] }), ValidationError);
});

test('togglePart: ochtend, dan avond; de dag is gedaan als beide gedaan zijn; weer wissen kan per dagdeel', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(teeth({ id: undefined }));
  const read = async () => repo.getCheckIn(habit.id, TODAY);

  const first = await togglePart(repo, { habit, date: TODAY, part: 'morning' }, TODAY);
  assert.deepEqual([first.status, first.parts], ['partial', ['morning']]);
  assert.deepEqual([(await read()).status, (await read()).value], ['partial', 1]);

  const both = await togglePart(repo, { habit, date: TODAY, part: 'evening' }, TODAY);
  assert.deepEqual([both.status, both.parts], ['done', ['morning', 'evening']]);
  assert.equal((await read()).value, 2);

  const back = await togglePart(repo, { habit, date: TODAY, part: 'morning' }, TODAY);
  assert.deepEqual([back.status, back.parts], ['partial', ['evening']]);

  const none = await togglePart(repo, { habit, date: TODAY, part: 'evening' }, TODAY);
  assert.equal(none.status, null);
  assert.equal(await read(), null, 'niets meer gedaan: terug bij "niets gelogd"');
});

test('togglePart: ongedaan maken herstelt de vorige stand, de notitie blijft, en regels worden bewaakt', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(teeth({ id: undefined }));
  await repo.setCheckIn({ habitId: habit.id, date: TODAY, status: 'partial', value: 1, parts: ['morning'], note: 'ging goed' });
  const { undo } = await togglePart(repo, { habit, date: TODAY, part: 'evening' }, TODAY);
  assert.equal((await repo.getCheckIn(habit.id, TODAY)).note, 'ging goed');
  await undo();
  const restored = await repo.getCheckIn(habit.id, TODAY);
  assert.deepEqual([restored.status, restored.parts], ['partial', ['morning']]);

  await assert.rejects(togglePart(repo, { habit, date: TODAY, part: 'afternoon' }, TODAY), RuleError);
  await assert.rejects(togglePart(repo, { habit: validHabit(), date: TODAY, part: 'morning' }, TODAY), RuleError);
  await assert.rejects(togglePart(repo, { habit, date: '2026-09-01', part: 'morning' }, TODAY), RuleError);
});

test('een minimale dag telt voor alle dagdelen; een dagdeel afvinken ná "overslaan" begint opnieuw', async () => {
  const { repo } = testRepo();
  const habit = await repo.saveHabit(teeth({ id: undefined }));
  await logCheckIn(repo, { habitId: habit.id, date: TODAY, status: 'skipped' }, TODAY);
  const afterSkip = await togglePart(repo, { habit, date: TODAY, part: 'evening' }, TODAY);
  assert.deepEqual([afterSkip.status, afterSkip.parts], ['partial', ['evening']]);
  await clearCheckIn(repo, { habitId: habit.id, date: TODAY }, TODAY);
  await logCheckIn(repo, { habitId: habit.id, date: TODAY, status: 'minimal' }, TODAY);
  assert.deepEqual(donePartsOf(habit, await repo.getCheckIn(habit.id, TODAY)), ['morning', 'evening']);
});

test('applyHabitForm: meerdere dagdelen komen op volgorde in het record, het eerste is ook daypart; één dagdeel laat de lijst weg', () => {
  const base = { name: 'Tandenpoetsen', icon: '🦷', color: 'c2', startDate: '2026-10-01', cue: '', why: '', minimalVersion: '', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } };
  const multi = applyHabitForm({ values: { ...base, daypart: 'evening', dayparts: ['evening', 'morning'] }, today: TODAY });
  assert.deepEqual([multi.daypart, multi.dayparts], ['morning', ['morning', 'evening']]);
  assert.deepEqual(validateHabit(multi), []);
  const single = applyHabitForm({ values: { ...base, daypart: 'evening', dayparts: ['evening'] }, today: TODAY });
  assert.equal('dayparts' in single, false);
  assert.equal(single.daypart, 'evening');
  // een bestaande habit weer terug naar één dagdeel: de lijst verdwijnt (anders blijft hij hangen door de samenvoeging)
  const edited = applyHabitForm({ existing: { ...multi, id: 'x' }, values: { ...base, daypart: 'morning', dayparts: ['morning'] }, today: TODAY });
  assert.equal('dayparts' in edited, false);
});

// --- dagoverzicht ---------------------------------------------------------------------------------------

function view(checkIn) {
  const habit = teeth();
  const snapshot = { habits: [habit], checkIns: checkIn ? [{ habitId: 't', date: TODAY, ...checkIn }] : [], pauses: [], dayPlans: [] };
  return buildDayView({ snapshot, date: TODAY, today: TODAY });
}
const cards = (v) => v.groups.map((g) => ({ part: g.daypart, entries: g.entries }));

test('dagoverzicht: de habit staat in elk dagdeel, met zijn eigen stand per dagdeel', () => {
  const open = view(null);
  assert.deepEqual(open.groups.map((g) => g.daypart), ['morning', 'evening']);
  assert.deepEqual(cards(open).map((c) => [c.part, c.entries[0].part, entryState(c.entries[0])]), [['morning', 'morning', 'open'], ['evening', 'evening', 'open']]);

  const half = view({ status: 'partial', value: 1, parts: ['morning'] });
  assert.deepEqual(cards(half).map((c) => [c.part, entryState(c.entries[0]), c.entries[0].partsDone, c.entries[0].partsTotal]), [['morning', 'done', 1, 2], ['evening', 'open', 1, 2]]);
  assert.deepEqual(half.progress, { done: 0, total: 1 }, 'de dag telt één keer, en is nog niet gedaan');

  const full = view({ status: 'done', value: 2, parts: ['morning', 'evening'] });
  assert.deepEqual(cards(full).map((c) => entryState(c.entries[0])), ['done', 'done']);
  assert.deepEqual(full.progress, { done: 1, total: 1 });
});

test('dagoverzicht: een minimale of overgeslagen dag staat in beide dagdelen zo', () => {
  assert.deepEqual(cards(view({ status: 'minimal' })).map((c) => entryState(c.entries[0])), ['minimal', 'minimal']);
  assert.deepEqual(cards(view({ status: 'skipped' })).map((c) => entryState(c.entries[0])), ['skipped', 'skipped']);
});

test('dagoverzicht: een gewone habit blijft in één dagdeel, zonder extra velden', () => {
  const snapshot = { habits: [validHabit({ id: 'g' })], checkIns: [], pauses: [], dayPlans: [] };
  const v = buildDayView({ snapshot, date: TODAY, today: TODAY });
  assert.deepEqual(v.groups.map((g) => g.daypart), ['morning']);
  assert.equal('part' in v.groups[0].entries[0], false);
});

// --- prestaties en back-up ------------------------------------------------------------------------------

test('prestatie "Hele dag": dagdelen van één habit tellen mee voor ochtend, middag en avond', () => {
  const stats = [{ habitId: 't', habitStatus: 'active', totalDone: 0, activeDays: 0, consistency: { rate: null }, units: [] }];
  const input = (habits) => ({ today: TODAY, stats, habits, unlocked: [] });
  const keys = (habits) => evaluateAchievements(input(habits)).map((a) => a.key);
  assert.equal(keys([teeth({ dayparts: ['morning', 'afternoon', 'evening'] })]).includes('all_dayparts'), true);
  assert.equal(keys([teeth()]).includes('all_dayparts'), false, 'twee dagdelen zijn nog niet de hele dag');
});

test('back-up: parts komen er identiek uit, en ongeldige dagdelen worden geweigerd', () => {
  const habit = { ...teeth(), id: 't' };
  const good = { app: 'habit-builder', version: 1, exportedAt: '2026-10-15T08:00:00.000Z', data: { habits: [habit], checkIns: [{ id: 't|2026-10-15', habitId: 't', date: '2026-10-15', status: 'partial', value: 1, parts: ['morning'] }] } };
  const parsed = parseImport(JSON.stringify(good));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.deepEqual(parsed.data.checkIns[0].parts, ['morning']);
  good.data.checkIns[0].parts = ['anytime'];
  const bad = parseImport(JSON.stringify(good));
  assert.deepEqual(bad.data.checkIns, [], 'een check-in met ongeldige dagdelen wordt weggelaten, de rest van de import blijft');
  assert.ok(bad.warnings.some((w) => w.includes('ongeldige dagdelen')), JSON.stringify(bad.warnings));
});
