// "Plan je week": een blad met per flexibele taak (N× per week of maand) de komende dagen om aan te tikken, en een knop die de ontbrekende keren verdeelt.
// De keuzes zijn gewone dagplannen (dezelfde als "Neem mee vandaag"); wat je hier plant staat op die dag op Vandaag.
import { fill, h } from '../dom.js';
import { openDialog } from './dialog.js';
import { habitIcon } from './habit-icon.js';
import { showToast } from './toast.js';
import { notifyChanged, state } from '../state.js';
import { nl } from '../../content/nl.js';
import { buildWeekPlan, planningStart, suggestPlan } from '../../app/week-plan.js';
import { planHabit, RuleError, setPlanSkip, unplanHabit } from '../../app/actions.js';
import { diffDays, weekday } from '../../domain/dates.js';
import { icon } from '../svg.js';

const p = nl.planner;

const dayLabel = (date, today) => (date === today ? p.today : `${nl.weekdays.short[weekday(date)]} ${Number(date.slice(8))}`);

/** 'morgen' of de naam van de dag ("zaterdag"): wanneer een taak die later in het venster begint start. */
const startLabel = (date, today) => (diffDays(date, today) === 1 ? nl.days.tomorrow.toLowerCase() : nl.weekdays.long[weekday(date)]);

function summary(row, today) {
  const text = progress(row, today);
  return row.startsOn ? `${text} · ${p.starts(startLabel(row.startsOn, today))}` : text;
}

function progress(row, today) {
  const { count, target, span, start } = row.unit;
  const later = start > today; // een taak die pas in de volgende week of maand begint
  const period = span === 'week' ? (later ? p.nextWeek : p.thisWeek) : (later ? p.nextMonth : p.thisMonth);
  if (row.skipped && row.missing > 0) return p.skipped(count, target, period);
  if (count >= target) return p.complete(count, target, period);
  if (row.unreachable && row.free === 0) return p.unreachable(count, target, period);
  if (row.missing > 0 && row.free === 0) return p.noFreeDay(count, target, period); // wat nog moet kan in deze week niet meer: dat komt in een latere week
  return row.missing > 0 ? p.missing(count, target, period, row.missing) : p.covered(count, target, period);
}

/**
 * De knop die het blad opent. Een gewone knop met een kalender (geen "aan"-stand: hij opent een blad, hij zet geen stand aan).
 * `primary`: een rustige maar duidelijke knop in een melding; anders een stille knop (bijvoorbeeld in een kop).
 */
export function planWeekButton({ primary = false, date = null } = {}) {
  return h('button', {
    type: 'button',
    id: 'planWeek',
    class: `button ${primary ? 'button--secondary' : 'button--ghost'} button--small plan-week`,
    'aria-haspopup': 'dialog',
    onclick: () => openWeekPlanner({ date }),
  }, icon('calendar'), p.title);
}

/**
 * Wat er te doen is, in woorden: "Nog 2 taken om in te plannen" met de knop Plan je week ernaast. Is alles ingepland of gedaan, dan zegt hij dat
 * en blijft de knop stil staan. `toPlan` = aantal taken dat nog dagen nodig heeft (zie countToPlan).
 */
export function planWeekPrompt({ toPlan = 0, skipped = 0, date = null } = {}) {
  const needed = toPlan > 0;
  return h('div', { class: `plan-prompt${needed ? ' plan-prompt--needed' : ''}`, role: 'group', 'aria-label': p.title },
    h('p', { class: 'plan-prompt__text' },
      h('strong', null, needed ? p.needs(toPlan) : skipped > 0 ? p.allPlannedSkipped(skipped) : p.allPlanned),
      needed ? h('span', { class: 'plan-prompt__hint' }, p.needsHint) : null),
    planWeekButton({ primary: needed, date }));
}

/** Hoeveel flexibele taken hebben nog dagen nodig, en ook nog vrije dagen om ze op te plannen? (Een gepauzeerde taak staat er niet bij.) */
export const countToPlan = (snapshot, today, date = today) => buildWeekPlan({ snapshot, today, date }).filter((row) => row.missing > 0 && row.free > 0 && !row.skipped).length;

/** Bij hoeveel taken die nog dagen nodig hebben koos de gebruiker "Niet in deze week"? (Voor de zin als er verder niets te plannen is.) */
export const countPlanSkipped = (snapshot, today, date = today) => buildWeekPlan({ snapshot, today, date }).filter((row) => row.missing > 0 && row.free > 0 && row.skipped).length;

/** `date`: de dag die Vandaag toont; kijk je naar een dag in de volgende week, dan plan je die week (zie planningStart). */
export function openWeekPlanner({ date = null } = {}) {
  const body = h('div', { class: 'planner' });
  // de dag waarvan de week "Niet in deze week" krijgt: vandaag, of de maandag van de volgende week
  const planFrom = () => planningStart({ today: state.today, date: date ?? state.today });
  let confirming = null; // de taak waarbij we vragen of overslaan echt de bedoeling is (de laatste kans van de maand)

  async function draw(focusKey = null) {
    const snapshot = await state.repo.snapshot();
    const rows = buildWeekPlan({ snapshot, today: state.today, date: date ?? state.today });
    fill(body,
      rows.length === 0
        ? h('p', { class: 'planner__empty' }, p.empty)
        : h('ul', { class: 'planner__list' }, ...rows.map((row) => rowElement(row))));
    if (focusKey) body.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
    return rows;
  }

  function rowElement(row) {
    const { habit } = row;
    return h('li', { class: 'planner__row', dataset: { color: habit.color, urgent: row.urgent ? 'true' : null, lastChance: row.lastChance ? 'true' : null, skipped: row.skipped && row.missing > 0 ? 'true' : null, needs: row.missing > 0 && row.free > 0 && !row.skipped ? 'true' : null } },
      h('div', { class: 'planner__head' },
        h('span', { class: 'planner__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
        h('div', { class: 'planner__title' },
          h('span', { class: 'planner__name' }, habit.name),
          h('span', { class: `planner__summary${row.missing > 0 ? ' is-missing' : ''}` }, summary(row, state.today)),
          row.skipped && row.lastChance ? h('span', { class: 'planner__warning' }, p.skippedLast) : null,
          row.unreachable ? h('span', { class: 'badge badge--risk' }, p.unreachableTitle) : row.urgent ? h('span', { class: 'badge badge--risk' }, nl.today.pool.urgentTitle) : null)),
      h('div', { class: 'planner__days', role: 'group', 'aria-label': p.daysFor(habit.name) },
        ...row.days.map((day) => {
          const key = `plan:${habit.id}:${day.date}`;
          const past = day.date < state.today;
          const blocked = past || day.state === 'blocked' || day.state === 'done';
          return h('button', {
            type: 'button',
            class: 'planner__day',
            dataset: { state: day.state, past: past ? 'true' : null, nextPeriod: day.inUnit ? null : 'true', focusKey: key },
            'aria-pressed': day.state === 'planned' ? 'true' : 'false',
            'aria-label': `${habit.name}, ${dayLabel(day.date, state.today)}: ${p.states[day.state]}`,
            disabled: blocked,
            onclick: () => toggle(row, day, key),
          },
          h('span', { class: 'planner__weekday' }, dayLabel(day.date, state.today)),
          h('span', { class: 'planner__mark', 'aria-hidden': 'true' }, day.state === 'done' ? '✓' : day.state === 'planned' ? '●' : day.state === 'blocked' ? '–' : ''));
        })),
      // "Niet in deze week": alleen als er iets te plannen is (of het al zo staat, zodat je het kunt terugdraaien)
      confirming === habit.id && row.lastChance && !row.skipped
        ? h('div', { class: 'planner__confirm', role: 'alert' },
          h('p', { class: 'planner__confirm-text' }, p.lastChance(row.daysAfter, row.unit.target - row.unit.count)),
          h('div', { class: 'planner__confirm-actions' },
            h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `skipback:${habit.id}` }, onclick: () => { confirming = null; draw(`skip:${habit.id}`); } }, p.keepPlanning),
            h('button', { type: 'button', class: 'button button--ghost button--small planner__skip-anyway', onclick: () => applySkip(row) }, p.skipAnyway)))
        : row.missing > 0 && (row.free > 0 || row.skipped)
          ? h('div', { class: 'planner__foot' },
            h('button', {
              type: 'button',
              class: 'button button--ghost button--small planner__skip',
              'aria-pressed': row.skipped ? 'true' : 'false',
              dataset: { focusKey: `skip:${habit.id}` },
              onclick: () => toggleSkip(row),
            }, row.skipped ? p.unskipWeek : p.skipWeek))
          : null);
  }

  async function applySkip(row) {
    confirming = null;
    await setPlanSkip(state.repo, { habitId: row.habit.id, skipped: !row.skipped }, planFrom());
    notifyChanged();
    await draw(`skip:${row.habit.id}`);
  }

  // Overslaan haalt de taak uit de herinnering, maar niet uit je doel. Is deze week de laatste kans (een taak per maand die zo niet meer te halen is),
  // dan zegt de rij dat eerst en vraagt om een bevestiging; anders gaat het meteen. Terugzetten ("Toch inplannen") vraagt nooit iets.
  async function toggleSkip(row) {
    if (!row.skipped && row.lastChance) {
      confirming = row.habit.id;
      await draw(`skipback:${row.habit.id}`);
      return;
    }
    await applySkip(row);
  }

  async function toggle(row, day, key) {
    const { habit } = row;
    try {
      if (day.state === 'planned') await unplanHabit(state.repo, { habitId: habit.id, date: day.date });
      else {
        await planHabit(state.repo, { habitId: habit.id, date: day.date }, state.today);
        if (row.skipped) await setPlanSkip(state.repo, { habitId: habit.id, skipped: false }, planFrom()); // een dag kiezen betekent: wel deze week
      }
      notifyChanged();
      await draw(key);
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      showToast({ message: nl.today.toasts.planWindow });
    }
  }

  async function distribute() {
    const rows = await draw();
    const picks = suggestPlan(rows);
    for (const { habitId, date } of picks) await planHabit(state.repo, { habitId, date }, state.today);
    notifyChanged();
    await draw('plan:suggest');
    showToast({ message: picks.length === 0 ? p.nothingToSuggest : p.suggested(picks.length) });
  }

  // wat nog ingepland moet worden is gemarkeerd (zie "Nog n taken om in te plannen"); bij het openen scrolt de eerste in beeld
  draw().then(() => body.querySelector('.planner__row[data-needs="true"]')?.scrollIntoView({ block: 'nearest' }));
  openDialog({
    title: p.title,
    description: p.description,
    className: 'dialog--planner',
    content: body,
    actions: [
      { label: p.suggest, variant: 'secondary', onClick: async () => { await distribute(); return false; } },
      { label: p.done, variant: 'primary' },
    ],
    cancelLabel: null,
  });
}
