// De voorbeeldgegevens van het filmpje: "Sam", met één habit voor elke toestand die in het filmpje voorkomt. Alles is relatief aan `today`,
// dus het blijft kloppen op elke dag. Zelfde aanpak als tools/lib/stub-data.mjs (de echte repository), maar kleiner en zonder "stub" in de namen.
import { ICONS } from '/src/content/icons.js';
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } from '/src/domain/dates.js';
import { dueDateInMonth } from '/src/domain/schedule.js';
import { checkAchievements } from '/src/app/achievement-runner.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAYS = [0, 1, 2, 3, 4];
const icon = (key) => ICONS.find((entry) => entry.key === key).emoji;

export async function fillDemo(repo, today, { theme, variant = 'full' } = {}) {
  const full = variant === 'full'; // 'daily': zonder taken die stilliggen of te laat zijn, voor een rustige Vandaag
  const ago = (n) => addDays(today, -n);
  let order = 0;
  const habit = (fields, schedule, startDate) => repo.saveHabit({
    status: 'active', daypart: 'anytime', endDate: null, graduationDays: 66, maintenance: false, counter: null, cue: null, why: null, minimalVersion: null,
    sortOrder: order++, ...fields, startDate, schedules: [{ effectiveFrom: startDate, schedule }],
  });
  const mark = async (saved, dates, status = 'done', extra = {}) => { for (const date of dates) await repo.setCheckIn({ habitId: saved.id, date, status, ...extra }); };
  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const weekdayOf = (date) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

  await repo.saveSettings({ displayName: 'Sam', nameAsked: true, ...(theme ? { theme } : {}) });

  // water: dagelijks, sterk, klaar om ingeburgerd te verklaren; vandaag nog niets
  const water = await habit({ name: 'Water drinken', icon: icon('water'), color: 'c2', daypart: 'morning', counter: { unit: 'glazen', target: 8 }, cue: 'Bij het ontbijt', why: 'Meer energie overdag' },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(80));
  await mark(water, range(ago(79), ago(1)).filter((d) => ![ago(30), ago(31), ago(55)].includes(d) && d !== ago(10)), 'done', { value: 8 });
  await mark(water, [ago(10)], 'partial', { value: 5 });

  // tandenpoetsen: twee dagdelen
  const teeth = await habit({ name: 'Tandenpoetsen', icon: icon('tooth'), color: 'c2', daypart: 'morning', dayparts: ['morning', 'evening'], minimalVersion: 'Even spoelen' }, { type: 'weekdays', weekdays: ALL_DAYS }, ago(20));
  await mark(teeth, range(ago(19), ago(2)), 'done', { value: 2, parts: ['morning', 'evening'] });
  await mark(teeth, [ago(1)], 'done', { value: 2, parts: ['morning', 'evening'] });

  // hardlopen: 3× per week, opbouw
  const run = await habit({ name: 'Hardlopen', icon: icon('run'), color: 'c3', daypart: 'afternoon', minimalVersion: 'Schoenen aan en 1 minuut lopen', why: 'Fit blijven en mijn hoofd leegmaken' },
    { type: 'times_per_period', period: 'week', count: 3 }, ago(40));
  await mark(run, [1, 3, 5, 8, 10, 12, 15, 19, 22, 24, 26, 29, 31, 33, 36, 38].map(ago).filter((d) => d !== ago(1)));

  // lezen: net begonnen, met cue, waarom en minimale versie
  const read = await habit({ name: 'Lezen', icon: icon('book'), color: 'c1', daypart: 'evening', cue: 'Na het eten', why: 'Meer rust in mijn hoofd', minimalVersion: 'Eén pagina' },
    { type: 'weekdays', weekdays: ALL_DAYS }, ago(12));
  await mark(read, range(ago(11), ago(1)).filter((d) => d !== ago(6) && d !== ago(3)));
  await mark(read, [ago(3)], 'minimal');

  // meditatie: werkdagen met een gemiste dag vorige week (komt in de weekreview)
  const lastWeekWednesday = addDays(startOfWeek(today), -7 + 2);
  const meditate = await habit({ name: 'Meditatie', icon: icon('meditate'), color: 'c5', daypart: 'morning' }, { type: 'weekdays', weekdays: WORKDAYS }, ago(30));
  await mark(meditate, range(ago(29), ago(1)).filter((d) => weekdayOf(d) < 5 && d !== lastWeekWednesday));

  // gitaar: 1× per week
  const guitar = await habit({ name: 'Gitaar spelen', icon: icon('guitar'), color: 'c7', daypart: 'evening' }, { type: 'times_per_period', period: 'week', count: 1 }, ago(25));
  await mark(guitar, [ago(20), ago(13), ago(6)]);

  // bed opmaken: zeldzaam en stil ("Even kijken")
  if (full) {
  const bed = await habit({ name: 'Bed verschonen', icon: icon('bed'), color: 'c4' }, { type: 'times_per_period', period: 'month', count: 2 }, ago(75));
  await mark(bed, [ago(70), ago(55), ago(48), ago(41)]);
  await repo.setRating({ habitId: bed.id, weekStart: startOfWeek(ago(41)), score: 3 });
  }

  // een vaste dag in de maand die gisteren was: "te laat"
  const dueDay = Number(today.slice(8)) - 1;
  if (full) {
  const bill = await habit({ name: 'Rekeningen betalen', icon: icon('budget'), color: 'c6' }, { type: 'day_of_month', day: dueDay >= 1 ? dueDay : 25 }, ago(70));
  for (const monthStart of [addMonths(startOfMonth(today), -2), addMonths(startOfMonth(today), -1)]) {
    const due = dueDateInMonth(bill.schedules[0].schedule.day, monthStart);
    if (due >= bill.startDate && due < today && due <= endOfMonth(monthStart)) await mark(bill, [due]);
  }
  }

  // dagboek: ingeburgerd, in onderhoud
  const journal = await habit({ name: 'Dagboek', icon: icon('journal'), color: 'c8', daypart: 'evening', status: 'graduated', graduatedAt: ago(10), maintenance: true }, { type: 'weekdays', weekdays: ALL_DAYS }, ago(120));
  await mark(journal, range(ago(20), ago(1)));

  // yoga: gepauzeerd
  const yoga = await habit({ name: 'Yoga', icon: icon('yoga'), color: 'c3' }, { type: 'times_per_period', period: 'week', count: 2 }, ago(50));
  await mark(yoga, [ago(45), ago(40), ago(33), ago(30), ago(24), ago(20), ago(12), ago(8)]);
  await repo.addPause({ habitId: yoga.id, from: ago(5), to: null });

  // tuin: klaar voor een proef zonder app (de laatste twee automatisme-cijfers zijn 3 en 4, met wat hielp)
  const garden = await habit({ name: 'Tuin', icon: icon('garden'), color: 'c3' }, { type: 'times_per_period', period: 'week', count: 2 }, ago(60));
  await mark(garden, [ago(55), ago(50), ago(43), ago(36), ago(29), ago(22), ago(16), ago(9), ago(3), ...(full ? [] : [ago(5)])]);
  await repo.setRating({ habitId: garden.id, weekStart: startOfWeek(ago(14)), score: 3, cues: ['reminder', 'app_plan'] });
  await repo.setRating({ habitId: garden.id, weekStart: startOfWeek(ago(7)), score: 4, cues: ['routine'] });

  await repo.saveReview({ weekStart: startOfWeek(ago(7)), wentWell: 'Elke dag water gehaald', wentBad: 'Twee avonden te laat naar bed' });
  await repo.saveReview({ weekStart: startOfWeek(ago(14)), wentWell: 'Drie keer hardgelopen', wentBad: 'Boek bleef in de tas zitten' });

  // de prestaties die Sam al heeft: stil ontgrendelen, anders begint elke opname met een viering
  await checkAchievements(repo, today);
}
