import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { openDialog } from '../components/dialog.js';
import { entryState, habitCard } from '../components/habit-card.js';
import { poolCard } from '../components/pool-card.js';
import { nl } from '../../content/nl.js';
import { buildDayView } from '../../app/day-view.js';
import { clearCheckIn, logCheckIn, planHabit, RuleError, unplanHabit } from '../../app/actions.js';
import { datesBetween, formatDateLong, relativeDayLabel } from '../../app/format.js';
import { addDays, diffDays, isValidDate } from '../../domain/dates.js';
import { BACKFILL_DAYS, PLAN_AHEAD_DAYS } from '../../domain/constants.js';

const dayHref = (date, today) => (date === today ? '#/today' : `#/today?date=${date}`);

function selectedDate(query, today) {
  const wanted = query.date;
  if (!isValidDate(wanted)) return today;
  const offset = diffDays(wanted, today);
  return offset >= -BACKFILL_DAYS && offset <= PLAN_AHEAD_DAYS ? wanted : today;
}

/** Voert een handeling uit, ververst het scherm en biedt "ongedaan maken" aan. */
async function perform(action, message) {
  try {
    const { undo } = await action();
    notifyChanged();
    showToast({
      message,
      actionLabel: nl.app.undo,
      onAction: async () => {
        await undo();
        notifyChanged();
      },
    });
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    showToast({ message: error.code === 'plan_window' ? nl.today.toasts.planWindow : nl.today.toasts.backfillWindow });
  }
}

export function todayView({ query }) {
  const date = selectedDate(query, state.today);

  return liveView({
    className: 'today',
    load: async () => buildDayView({ snapshot: await state.repo.snapshot(), date, today: state.today }),
    render: (view) => renderDay(view),
  });
}

function renderDay(view) {
  const { today } = state;
  const { repo } = state;
  const { date } = view;
  const log = (habitId, status, note = null) => logCheckIn(repo, { habitId, date, status, note }, today);

  function toggle(entry) {
    const name = entry.habit.name;
    return entryState(entry) === 'open'
      ? perform(() => log(entry.habitId, 'done'), nl.today.toasts.done(name))
      : perform(() => clearCheckIn(repo, { habitId: entry.habitId, date }, today), nl.today.toasts.cleared(name));
  }

  function more(entry) {
    const { habit } = entry;
    const reason = h('input', { type: 'text', class: 'input', maxlength: 120, 'aria-label': nl.today.actions.skipReason, placeholder: nl.today.actions.skipReason });
    const logged = entryState(entry) !== 'open';
    const actions = [];
    if (view.canLog) {
      actions.push({ label: nl.today.actions.done, variant: 'primary', onClick: () => perform(() => log(habit.id, 'done'), nl.today.toasts.done(habit.name)) });
      if (habit.minimalVersion) {
        actions.push({ label: nl.today.actions.minimal(habit.minimalVersion), onClick: () => perform(() => log(habit.id, 'minimal'), nl.today.toasts.minimal(habit.name)) });
      }
      actions.push({
        label: nl.today.actions.skip,
        onClick: () => perform(() => log(habit.id, 'skipped', reason.value.trim() || null), nl.today.toasts.skipped(habit.name)),
      });
      if (logged) actions.push({ label: nl.today.actions.clear, onClick: () => perform(() => clearCheckIn(repo, { habitId: habit.id, date }, today), nl.today.toasts.cleared(habit.name)) });
    }
    if (view.canPlan && entry.plannedToday && !logged) {
      actions.push({ label: nl.today.actions.unplan, onClick: () => perform(() => unplanHabit(repo, { habitId: habit.id, date }), nl.today.toasts.unplanned(habit.name)) });
    }
    openDialog({ title: nl.today.actions.title(habit.name), content: view.canLog ? reason : null, actions });
  }

  function planOnDay(entry, planDate) {
    return perform(() => planHabit(repo, { habitId: entry.habitId, date: planDate }, today), nl.today.toasts.planned(entry.habit.name));
  }

  function planOther(entry) {
    const last = [entry.unit.end, addDays(today, PLAN_AHEAD_DAYS)].sort()[0];
    const choices = datesBetween(today, last).map((d) =>
      h('button', {
        type: 'button',
        class: 'button button--secondary',
        onclick: (event) => {
          event.target.closest('dialog').close();
          planOnDay(entry, d);
        },
      }, `${relativeDayLabel(d, today)} · ${formatDateLong(d)}`));
    openDialog({
      title: nl.today.pool.chooseDay,
      description: nl.today.pool.pickDay(entry.habit.name),
      content: h('div', { class: 'stack' }, ...choices),
    });
  }

  const cardOptions = { canLog: view.canLog, onToggle: toggle, onMore: more };

  return h('div', { class: 'today__inner' },
    header(view),
    banner(view),
    view.groups.length === 0 && view.pool.length === 0 ? emptyState(view) : null,
    view.progress.total > 0 && view.progress.done === view.progress.total
      ? h('p', { class: 'banner banner--success', role: 'status' }, nl.today.allDone) : null,
    ...view.groups.map((group) =>
      h('section', { class: 'section', 'aria-labelledby': `dp-${group.daypart}` },
        h('h2', { id: `dp-${group.daypart}`, class: 'section__title' }, nl.dayparts[group.daypart]),
        h('ul', { class: 'card-list' }, ...group.entries.map((entry) => habitCard(entry, cardOptions))))),
    view.pool.length > 0
      ? h('section', { class: 'section section--pool', 'aria-labelledby': 'pool-title' },
        h('h2', { id: 'pool-title', class: 'section__title' }, nl.today.pool.title),
        h('p', { class: 'section__hint' }, nl.today.pool.hint),
        h('ul', { class: 'card-list' }, ...view.pool.map((entry) =>
          poolCard(entry, {
            date, today, canLog: view.canLog, canPlan: view.canPlan,
            onPlan: (e) => planOnDay(e, date),
            onPlanOther: planOther,
            onDoneNow: (e) => perform(() => log(e.habitId, 'done'), nl.today.toasts.done(e.habit.name)),
          }))))
      : null);
}

function header(view) {
  const { today } = state;
  const { date, progress } = view;
  const offset = diffDays(date, today);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const hasPrev = diffDays(prev, today) >= -BACKFILL_DAYS;
  const hasNext = diffDays(next, today) <= PLAN_AHEAD_DAYS;

  return h('header', { class: 'today__header' },
    h('div', { class: 'daynav' },
      hasPrev ? h('a', { class: 'daynav__link', href: dayHref(prev, today), 'aria-label': nl.today.previousDay }, '‹') : h('span', { class: 'daynav__link is-disabled', 'aria-hidden': 'true' }, '‹'),
      h('div', { class: 'daynav__title' },
        h('p', { class: 'kicker' }, relativeDayLabel(date, today)),
        h('h1', { class: 'today__date' }, formatDateLong(date))),
      hasNext ? h('a', { class: 'daynav__link', href: dayHref(next, today), 'aria-label': nl.today.nextDay }, '›') : h('span', { class: 'daynav__link is-disabled', 'aria-hidden': 'true' }, '›')),
    offset !== 0 ? h('a', { class: 'today__back', href: '#/today' }, nl.today.backToToday) : null,
    progress.total > 0
      ? h('div', { class: 'progress' },
        h('progress', { class: 'progress__bar', max: progress.total, value: progress.done, 'aria-label': nl.today.progress(progress.done, progress.total) }),
        h('p', { class: 'progress__label' }, nl.today.progress(progress.done, progress.total)))
      : null);
}

function banner(view) {
  if (view.mode === 'past') return h('p', { class: 'banner', role: 'status' }, view.canLog ? nl.today.pastBanner : nl.today.lockedBanner);
  if (view.mode === 'future') return h('p', { class: 'banner', role: 'status' }, nl.today.futureBanner);
  return null;
}

function emptyState(view) {
  return h('div', { class: 'empty' },
    h('p', null, view.hasHabits ? nl.today.empty : nl.today.noHabits),
    view.hasHabits ? null : h('a', { class: 'button button--primary', href: '#/habits/new' }, nl.today.createFirst));
}
