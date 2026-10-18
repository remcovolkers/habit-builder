// "Plan je week": een blad met per flexibele taak (N× per week of maand) de komende dagen om aan te tikken, en een knop die de ontbrekende keren verdeelt.
// De keuzes zijn gewone dagplannen (dezelfde als "Neem mee vandaag"); wat je hier plant staat op die dag op Vandaag.
import { fill, h } from '../dom.js';
import { openDialog } from './dialog.js';
import { habitIcon } from './habit-icon.js';
import { showToast } from './toast.js';
import { notifyChanged, state } from '../state.js';
import { nl } from '../../content/nl.js';
import { buildWeekPlan, suggestPlan } from '../../app/week-plan.js';
import { planHabit, RuleError, setPlanSkip, unplanHabit } from '../../app/actions.js';
import { weekday } from '../../domain/dates.js';
import { icon } from '../svg.js';

const p = nl.planner;

const dayLabel = (date, today) => (date === today ? p.today : `${nl.weekdays.short[weekday(date)]} ${Number(date.slice(8))}`);

function summary(row) {
  const { count, target, span } = row.unit;
  const period = span === 'week' ? p.thisWeek : p.thisMonth;
  if (row.skipped && row.missing > 0) return p.skipped(count, target, period);
  if (count >= target) return p.complete(count, target, period);
  return row.missing > 0 ? p.missing(count, target, period, row.missing) : p.covered(count, target, period);
}

/**
 * De knop die het blad opent. Een gewone knop met een kalender (geen "aan"-stand: hij opent een blad, hij zet geen stand aan).
 * `primary`: een rustige maar duidelijke knop in een melding; anders een stille knop (bijvoorbeeld in een kop).
 */
export function planWeekButton({ primary = false } = {}) {
  return h('button', {
    type: 'button',
    id: 'planWeek',
    class: `button ${primary ? 'button--secondary' : 'button--ghost'} button--small plan-week`,
    'aria-haspopup': 'dialog',
    onclick: () => openWeekPlanner(),
  }, icon('calendar'), p.title);
}

/**
 * Wat er te doen is, in woorden: "Nog 2 taken om in te plannen" met de knop Plan je week ernaast. Is alles ingepland of gedaan, dan zegt hij dat
 * en blijft de knop stil staan. `toPlan` = aantal taken dat nog dagen nodig heeft (zie countToPlan).
 */
export function planWeekPrompt({ toPlan = 0, skipped = 0 } = {}) {
  const needed = toPlan > 0;
  return h('div', { class: `plan-prompt${needed ? ' plan-prompt--needed' : ''}`, role: 'group', 'aria-label': p.title },
    h('p', { class: 'plan-prompt__text' },
      h('strong', null, needed ? p.needs(toPlan) : skipped > 0 ? p.allPlannedSkipped(skipped) : p.allPlanned),
      needed ? h('span', { class: 'plan-prompt__hint' }, p.needsHint) : null),
    planWeekButton({ primary: needed }));
}

/** Hoeveel flexibele taken hebben nog dagen nodig, en ook nog vrije dagen om ze op te plannen? (Een gepauzeerde taak staat er niet bij.) */
export const countToPlan = (snapshot, today) => buildWeekPlan({ snapshot, today }).filter((row) => row.missing > 0 && row.free > 0 && !row.skipped).length;

/** Bij hoeveel taken die nog dagen nodig hebben koos de gebruiker "Niet in deze week"? (Voor de zin als er verder niets te plannen is.) */
export const countPlanSkipped = (snapshot, today) => buildWeekPlan({ snapshot, today }).filter((row) => row.missing > 0 && row.free > 0 && row.skipped).length;

export function openWeekPlanner() {
  const body = h('div', { class: 'planner' });

  async function draw(focusKey = null) {
    const snapshot = await state.repo.snapshot();
    const rows = buildWeekPlan({ snapshot, today: state.today });
    fill(body,
      rows.length === 0
        ? h('p', { class: 'planner__empty' }, p.empty)
        : h('ul', { class: 'planner__list' }, ...rows.map((row) => rowElement(row))));
    if (focusKey) body.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
    return rows;
  }

  function rowElement(row) {
    const { habit } = row;
    return h('li', { class: 'planner__row', dataset: { color: habit.color, urgent: row.urgent ? 'true' : null, skipped: row.skipped && row.missing > 0 ? 'true' : null } },
      h('div', { class: 'planner__head' },
        h('span', { class: 'planner__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
        h('div', { class: 'planner__title' },
          h('span', { class: 'planner__name' }, habit.name),
          h('span', { class: `planner__summary${row.missing > 0 ? ' is-missing' : ''}` }, summary(row)),
          row.urgent ? h('span', { class: 'badge badge--risk' }, nl.today.pool.urgentTitle) : null)),
      h('div', { class: 'planner__days', role: 'group', 'aria-label': p.daysFor(habit.name) },
        ...row.days.map((day) => {
          const key = `plan:${habit.id}:${day.date}`;
          const blocked = day.state === 'blocked' || day.state === 'done';
          return h('button', {
            type: 'button',
            class: 'planner__day',
            dataset: { state: day.state, nextPeriod: day.inUnit ? null : 'true', focusKey: key },
            'aria-pressed': day.state === 'planned' ? 'true' : 'false',
            'aria-label': `${habit.name}, ${dayLabel(day.date, state.today)}: ${p.states[day.state]}`,
            disabled: blocked,
            onclick: () => toggle(row, day, key),
          },
          h('span', { class: 'planner__weekday' }, dayLabel(day.date, state.today)),
          h('span', { class: 'planner__mark', 'aria-hidden': 'true' }, day.state === 'done' ? '✓' : day.state === 'planned' ? '●' : day.state === 'blocked' ? '–' : ''));
        })),
      // "Niet in deze week": alleen als er iets te plannen is (of het al zo staat, zodat je het kunt terugdraaien)
      row.missing > 0 && (row.free > 0 || row.skipped)
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

  async function toggleSkip(row) {
    await setPlanSkip(state.repo, { habitId: row.habit.id, skipped: !row.skipped }, state.today);
    notifyChanged();
    await draw(`skip:${row.habit.id}`);
  }

  async function toggle(row, day, key) {
    const { habit } = row;
    try {
      if (day.state === 'planned') await unplanHabit(state.repo, { habitId: habit.id, date: day.date });
      else {
        await planHabit(state.repo, { habitId: habit.id, date: day.date }, state.today);
        if (row.skipped) await setPlanSkip(state.repo, { habitId: habit.id, skipped: false }, state.today); // een dag kiezen betekent: wel deze week
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

  draw();
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
