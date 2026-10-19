// De gegevens van het gevulde testaccount (stub@example.com): één habit voor elke toestand die de app kent, relatief aan "vandaag",
// zodat het nooit verouderd raakt (draai `npm run dev:seed` opnieuw voor verse datums). Gebruikt de echte repository, dus de records
// zien er precies uit als die van de app. Zie docs/DEV-OMGEVING.md.
import { ICONS } from '../../src/content/icons.js';
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from '../../src/domain/dates.js';
import { dueDateInMonth } from '../../src/domain/schedule.js';

export const STUB_EMAIL = 'stub@example.com';
export const EMPTY_EMAIL = 'leeg@example.com';
export const ADMIN_EMAIL = 'beheer@example.com';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAYS = [0, 1, 2, 3, 4];
const icon = (key) => ICONS.find((entry) => entry.key === key).emoji;

/**
 * Vult de repository (leeg verwacht) en geeft een lijst van wat er is gemaakt, voor de uitleg na het seeden.
 * today: 'YYYY-MM-DD' (de lokale vandaag).
 */
export async function fillStubAccount(repo, today) {
  const ago = (n) => addDays(today, -n);
  const created = [];
  let order = 0;

  const habit = async (fields, schedule, startDate, expect) => {
    const saved = await repo.saveHabit({
      status: 'active', daypart: 'anytime', endDate: null, graduationDays: 66, maintenance: false, counter: null, cue: null, why: null, minimalVersion: null,
      sortOrder: order++, ...fields, startDate, schedules: [{ effectiveFrom: startDate, schedule }],
    });
    created.push({ name: saved.name, expect });
    return saved;
  };
  const mark = async (saved, dates, status = 'done', extra = {}) => {
    for (const date of dates) await repo.setCheckIn({ habitId: saved.id, date, status, ...extra });
  };
  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const weekdayOf = (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

  await repo.saveSettings({ displayName: 'Remco (stub)', nameAsked: true });

  // 1. dagelijks, sterk, klaar om ingeburgerd te verklaren; met een teller en een halve dag
  const water = await habit({ name: 'Water drinken', icon: icon('water'), color: 'c2', daypart: 'morning', counter: { unit: 'glazen', target: 8 } },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(80), 'Ingeburgerd? kan bevestigd worden (80 dagen, hoge consistentie); teller 8 glazen');
  await mark(water, range(ago(79), ago(1)).filter((d) => ![ago(30), ago(31), ago(55)].includes(d) && d !== ago(10)), 'done', { value: 8 });
  await mark(water, [ago(10)], 'partial', { value: 5 });

  // 2. 3× per week, in de opbouw, met een slechte week
  const run = await habit({ name: 'Hardlopen', icon: icon('run'), color: 'c3', daypart: 'afternoon' }, { type: 'times_per_period', period: 'week', count: 3 }, ago(40),
    'Opbouwfase; deze week nog niet gehaald (in de stapel), een oudere week mislukt');
  await mark(run, [1, 3, 5, 8, 10, 12, 15, 19, 22, 24, 26, 29, 31, 33, 36, 38].map(ago).filter((d) => d !== ago(1)));

  // 3. net begonnen: opstartfase, minimale versie, cue en reden
  const read = await habit({ name: 'Lezen', icon: icon('book'), color: 'c1', daypart: 'evening', cue: 'Na het eten', why: 'Meer rust in mijn hoofd', minimalVersion: 'Eén pagina' },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(12), 'Opstartfase (dag 12); één dag minimaal, één dag gemist');
  await mark(read, range(ago(11), ago(1)).filter((d) => d !== ago(6) && d !== ago(3)));
  await mark(read, [ago(3)], 'minimal');

  // 4. werkdagen met een gemiste dag vorige week: "mislukt" bij vaste dagen (verschijnt in de weekreview)
  const lastWeekWednesday = addDays(startOfWeek(today), -7 + 2);
  const meditate = await habit({ name: 'Meditatie', icon: icon('meditate'), color: 'c5', daypart: 'morning' }, { type: 'weekdays', weekdays: WORKDAYS }, ago(30),
    `Een gemiste werkdag vorige week (${lastWeekWednesday}): komt in de weekreview`);
  await mark(meditate, range(ago(29), ago(1)).filter((d) => weekdayOf(d) < 5 && d !== lastWeekWednesday));

  // 5. zeldzaam en STIL: 2× per maand, laatst 41 dagen geleden. Nog geen reactie: staat in "Even kijken". Heeft een automatisme-cijfer.
  const bed = await habit({ name: 'Bed opmaken', icon: icon('bed'), color: 'c4' }, { type: 'times_per_period', period: 'month', count: 2 }, ago(75),
    'Zeldzaam en stil (41 dagen): "Even kijken" op Vandaag, 4 van 8 keer, automatisme verplicht');
  await mark(bed, [ago(70), ago(55), ago(48), ago(41)]);
  await repo.setRating({ habitId: bed.id, weekStart: startOfWeek(ago(41)), score: 3 });

  // 6. vaste dag in de maand die gisteren was: "te laat" (alleen als gisteren in dezelfde maand valt)
  const dueDay = Number(today.slice(8)) - 1;
  const bill = await habit({ name: 'Rekening betalen', icon: icon('budget'), color: 'c6' }, { type: 'day_of_month', day: dueDay >= 1 ? dueDay : 25 }, ago(70),
    dueDay >= 1 ? `Te laat: stond op de ${dueDay}e op de lijst` : 'Vaste dag 25 (vandaag is de 1e, dus nu niet te laat)');
  for (const monthStart of [addMonths(startOfMonth(today), -2), addMonths(startOfMonth(today), -1)]) {
    const due = dueDateInMonth(bill.schedules[0].schedule.day, monthStart);
    if (due >= bill.startDate && due < today && due <= endOfMonth(monthStart)) await mark(bill, [due]);
  }

  // 7. 1× per week: in de stapel
  const guitar = await habit({ name: 'Gitaar spelen', icon: icon('guitar'), color: 'c7', daypart: 'evening' }, { type: 'times_per_period', period: 'week', count: 1 }, ago(25),
    '1× per week, drie keer gedaan');
  await mark(guitar, [ago(20), ago(13), ago(6)]);

  // 8. ingeburgerd, in onderhoud
  const journal = await habit({ name: 'Dagboek', icon: icon('journal'), color: 'c8', daypart: 'evening', status: 'graduated', graduatedAt: ago(10), maintenance: true },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(120), 'Ingeburgerd, in onderhoud');
  await mark(journal, range(ago(20), ago(1)));

  // 9. gepauzeerd
  const yoga = await habit({ name: 'Yoga', icon: icon('yoga'), color: 'c3' }, { type: 'times_per_period', period: 'week', count: 2 }, ago(50), 'Gepauzeerd sinds 5 dagen');
  await mark(yoga, [ago(45), ago(40), ago(33), ago(30), ago(24), ago(20), ago(12), ago(8)]);
  await repo.addPause({ habitId: yoga.id, from: ago(5), to: null });

  // 10. gearchiveerd
  const spanish = await habit({ name: 'Spaans leren', icon: icon('language'), color: 'c2', status: 'archived', endDate: ago(20) },
    { type: 'weekdays', weekdays: WORKDAYS }, ago(90), 'Gearchiveerd');
  await mark(spanish, range(ago(89), ago(21)).filter((d) => weekdayOf(d) < 5 && weekdayOf(d) !== 3));

  // 11. gepland: begint over tien dagen
  await habit({ name: 'Zwemmen', icon: icon('swim'), color: 'c1', status: 'planned' }, { type: 'times_per_period', period: 'week', count: 2 }, addDays(today, 10),
    'Gepland (start over 10 dagen)');

  // 12. zeldzaam, stil én al beantwoord: staat in de weekreview met "Reden: Vergeten"
  const curtains = await habit({ name: 'Gordijnen wassen', icon: icon('laundry'), color: 'c5' }, { type: 'times_per_period', period: 'month', count: 1 }, ago(100),
    'Zeldzaam en stil, al beantwoord ("Vergeten"): staat in de weekreview als beantwoord');
  await mark(curtains, [ago(90), ago(60)]);
  await repo.setReason({ habitId: curtains.id, date: ago(2), reason: 'forgot', note: 'Stond niet in mijn agenda' });

  // 13. meerdere dagdelen: 's ochtends en 's avonds. Vandaag is alleen de ochtend gedaan (de avond staat nog open), gisteren allebei, eergisteren alleen de ochtend
  const teeth = await habit({ name: 'Tandenpoetsen', icon: icon('tooth'), color: 'c2', daypart: 'morning', dayparts: ['morning', 'evening'] },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(20), "Twee dagdelen: vandaag alleen de ochtend gedaan, gisteren beide, eergisteren alleen de ochtend (telt als gemist)");
  await mark(teeth, range(ago(19), ago(3)), 'done', { value: 2, parts: ['morning', 'evening'] });
  await mark(teeth, [ago(2)], 'partial', { value: 1, parts: ['morning'] });
  await mark(teeth, [ago(1)], 'done', { value: 2, parts: ['morning', 'evening'] });
  await mark(teeth, [today], 'partial', { value: 1, parts: ['morning'] });

  // 14. klaar voor een proef zonder app: 2× per week, de laatste twee cijfers 3 en 4 (met "wat hielp"). Op de habit staat de kaart "Zonder app proberen".
  const garden = await habit({ name: 'Tuin', icon: icon('garden'), color: 'c3' }, { type: 'times_per_period', period: 'week', count: 2 }, ago(60),
    'Klaar voor een proef zonder app: de laatste twee cijfers zijn 3 en 4 (kaart "Zonder app proberen" op de habit)');
  await mark(garden, [ago(55), ago(50), ago(43), ago(36), ago(29), ago(22), ago(16), ago(9), ago(3)]);
  await repo.setRating({ habitId: garden.id, weekStart: startOfWeek(ago(14)), score: 3, cues: ['reminder', 'app_plan'] });
  await repo.setRating({ habitId: garden.id, weekStart: startOfWeek(ago(7)), score: 4, cues: ['routine'] });

  // twee eerdere weekreviews
  await repo.saveReview({ weekStart: startOfWeek(ago(7)), wentWell: 'Elke dag water gehaald', wentBad: 'Twee avonden te laat naar bed' });
  await repo.saveReview({ weekStart: startOfWeek(ago(14)), wentWell: 'Drie keer hardgelopen', wentBad: 'Boek bleef in de tas zitten' });

  return created;
}
