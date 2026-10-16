// Het tempo van een habit en wat "ingeburgerd" daarom aan keren vraagt (PLAN §4.5). Puur.
import {
  DAYS_PER_MONTH,
  DEFAULT_GRADUATION_DAYS,
  MIN_REPETITIONS,
  PHASE_STARTING_UNTIL_DAY,
  REPETITIONS_SHARE,
  SPARSE_BELOW_PER_WEEK,
} from './constants.js';
import { scheduleAt } from './schedule.js';

/** Hoe vaak per week hoort deze taak voor te komen? null bij een onbekend schema. */
export function timesPerWeek(schedule) {
  switch (schedule?.type) {
    case 'weekdays': return schedule.weekdays.length;
    case 'times_per_period': return schedule.period === 'week' ? schedule.count : (schedule.count * 7) / DAYS_PER_MONTH;
    case 'day_of_month': return 7 / DAYS_PER_MONTH;
    default: return null;
  }
}

/** Het ritme dat op `date` voor de habit geldt (valt het ervoor, dan het eerste schema); null zonder schema. */
export function scheduleOn(habit, date) {
  return scheduleAt(habit.schedules ?? [], date) ?? habit.schedules?.[0]?.schedule ?? null;
}

/** `graduationPace` voor het ritme van een habit op `date`. */
export function paceOn(habit, date) {
  return graduationPace({ schedule: scheduleOn(habit, date), graduationDays: habit.graduationDays ?? DEFAULT_GRADUATION_DAYS });
}

/**
 * Wat ingeburgerd aan keren vraagt voor dit ritme.
 *   timesPerWeek         verwacht tempo (null: onbekend, dan telt alleen de tijd)
 *   sparse               minder dan SPARSE_BELOW_PER_WEEK keer per week
 *   requiredRepetitions  aantal keren dat gedaan moet zijn (null als het tempo onbekend is)
 *   startingRepetitions  tot hoeveel keren de fase "Opstarten" duurt, als de voortgang in keren wordt geteld
 */
export function graduationPace({ schedule, graduationDays = DEFAULT_GRADUATION_DAYS }) {
  const perWeek = timesPerWeek(schedule);
  if (perWeek === null) return { timesPerWeek: null, sparse: false, requiredRepetitions: null, startingRepetitions: null };

  const expected = (perWeek / 7) * graduationDays * REPETITIONS_SHARE;
  // de kleine aftrek voorkomt dat een rekenafwijking (52,0000000001) een keer extra vraagt
  const requiredRepetitions = Math.min(graduationDays, Math.max(MIN_REPETITIONS, Math.ceil(expected - 1e-9)));
  // "Opbouw" houdt minstens één keer over, ook bij een korte ingeburgerd-grens
  const startingRepetitions = Math.min(
    requiredRepetitions - 1,
    Math.max(1, Math.round((requiredRepetitions * PHASE_STARTING_UNTIL_DAY) / graduationDays)),
  );
  return { timesPerWeek: perWeek, sparse: perWeek < SPARSE_BELOW_PER_WEEK, requiredRepetitions, startingRepetitions };
}
