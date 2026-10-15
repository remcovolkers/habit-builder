import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { openDialog } from '../components/dialog.js';
import { entryState, habitCard } from '../components/habit-card.js';
import { poolCard } from '../components/pool-card.js';
import { ring } from '../components/ring.js';
import { icon } from '../svg.js';
import { mascot } from '../components/mascot.js';
import { emptyState } from '../components/empty-state.js';
import { fab } from '../components/fab.js';
import { account, dismissNudge, nudgeDismissed, nudgeElement } from '../account.js';
import { nl } from '../../content/nl.js';
import { buildDayView } from '../../app/day-view.js';
import { adjustCounter, clearCheckIn, logCheckIn, planHabit, RuleError, unplanHabit } from '../../app/actions.js';
import { counterDoneValue } from '../../domain/counter.js';
import { datesBetween, formatDateLong, greetingFor, localHour, relativeDayLabel } from '../../app/format.js';
import { addDays, diffDays, isValidDate } from '../../domain/dates.js';
import { BACKFILL_DAYS, PLAN_AHEAD_DAYS } from '../../domain/constants.js';

const dayHref = (date, today) => (date === today ? '#/today' : `#/today?date=${date}`);

function selectedDate(query, today) {
  const wanted = query.date;
  if (!isValidDate(wanted)) return today;
  const offset = diffDays(wanted, today);
  return offset >= -BACKFILL_DAYS && offset <= PLAN_AHEAD_DAYS ? wanted : today;
}

/**
 * Voert een handeling uit, ververst het scherm en biedt "ongedaan maken" aan.
 * Zonder message (bv. bij de teller) gebeurt het stil: het scherm zelf toont het resultaat.
 */
async function perform(action, message = null) {
  try {
    const { undo } = await action();
    notifyChanged();
    if (message) {
      showToast({
        message,
        actionLabel: nl.app.undo,
        onAction: async () => {
          await undo();
          notifyChanged();
        },
      });
    }
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
  const log = (habitId, status, note = null, value = null) => logCheckIn(repo, { habitId, date, status, note, value }, today);

  // Tikken op +/− achter elkaar mogen elkaar niet inhalen: eerst klaar, dan de volgende.
  let queue = Promise.resolve();
  const adjust = (entry, delta) => {
    queue = queue.then(() => perform(() => adjustCounter(repo, { habit: entry.habit, date, delta }, today)));
    return queue;
  };

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
      const doneValue = habit.counter ? counterDoneValue(habit.counter, entry.valueToday ?? 0) : null;
      actions.push({
        label: habit.counter ? nl.today.actions.goalReached : nl.today.actions.done,
        variant: 'primary',
        onClick: () => perform(() => log(habit.id, 'done', null, doneValue), nl.today.toasts.done(habit.name)),
      });
      if (habit.minimalVersion && !habit.counter) {
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

  const cardOptions = { canLog: view.canLog, onToggle: toggle, onMore: more, onAdjust: adjust };

  const tally = (entries) => {
    const counted = entries.filter((e) => e.loggedToday !== 'skipped');
    return { done: counted.filter((e) => e.doneToday).length, total: counted.length };
  };
  const allDone = view.progress.total > 0 && view.progress.done === view.progress.total;
  const poolPeriod = view.pool.every((e) => e.span === 'week') ? nl.today.pool.thisWeek : nl.today.pool.thisPeriod;

  const groupSections = view.groups.map((group) => {
    const { done, total } = tally(group.entries);
    return h('section', { class: 'section', 'aria-labelledby': `dp-${group.daypart}` },
      h('div', { class: 'section-head' },
        h('h2', { id: `dp-${group.daypart}`, class: 'section__title' }, nl.dayparts[group.daypart]),
        h('span', { class: 'xs muted' }, nl.today.sectionCount(done, total))),
      h('ul', { class: 'card-list' }, ...group.entries.map((entry) => habitCard(entry, cardOptions))));
  });

  const poolSection = view.pool.length > 0
    ? h('section', { class: 'section', 'aria-labelledby': 'pool-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'pool-title', class: 'section__title' }, nl.today.pool.title),
        h('span', { class: 'kicker' }, poolPeriod)),
      h('p', { class: 'section__hint' }, nl.today.pool.hint),
      h('ul', { class: 'card-list' }, ...view.pool.map((entry) =>
        poolCard(entry, {
          date, today, canLog: view.canLog, canPlan: view.canPlan,
          onPlan: (e) => planOnDay(e, date),
          onPlanOther: planOther,
          onDoneNow: (e) => perform(() => log(e.habitId, 'done'), nl.today.toasts.done(e.habit.name)),
        }))))
    : null;

  const nudge = account.status === 'anonymous' && view.hasHabits && view.mode === 'today' && !nudgeDismissed()
    ? nudgeElement((event) => { dismissNudge(); event.target.closest('.nudge').remove(); })
    : null;

  const celebrate = allDone
    ? h('section', { class: 'section celebrate', role: 'status' },
      mascot('celebrate') ?? h('div', { class: 'celebrate__emoji', 'aria-hidden': 'true' }, '🌿'),
      h('h2', { class: 'celebrate__title' }, nl.today.celebrateTitle),
      h('p', { class: 'celebrate__text' }, nl.today.celebrateText))
    : null;

  // Op mobiel onder elkaar; op desktop de dag links en de stapel (met zetje en feest) rechts.
  const side = [poolSection, nudge, celebrate].filter(Boolean);
  return h('div', { class: 'today__inner' },
    header(view),
    banner(view),
    view.groups.length === 0 && view.pool.length === 0 ? todayEmpty(view) : null,
    h('div', { class: 'today__columns' },
      h('div', { class: 'today__main' }, ...groupSections),
      side.length > 0 ? h('div', { class: 'today__side' }, ...side) : null),
    fab({ href: '#/habits/new', label: view.hasHabits ? nl.habits.new : nl.today.createFirst, extended: !view.hasHabits }));
}

function dayLink(date, label, symbol, enabled) {
  return enabled
    ? h('a', { class: 'icon-button', href: dayHref(date, state.today), 'aria-label': label }, icon(symbol))
    : h('span', { class: 'icon-button is-disabled', 'aria-hidden': 'true' }, icon(symbol));
}

function header(view) {
  const { today, settings } = state;
  const { date, progress } = view;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const name = String(settings.displayName ?? '').trim();
  const title = date === today
    ? [name ? `${greetingFor(localHour(new Date(), settings.timezone))},` : greetingFor(localHour(new Date(), settings.timezone)), name ? h('br') : null, name || null]
    : [relativeDayLabel(date, today)];

  return h('header', { class: 'today__header' },
    h('div', { class: 'daynav' },
      dayLink(prev, nl.today.previousDay, 'back', diffDays(prev, today) >= -BACKFILL_DAYS),
      h('p', { class: 'kicker' }, formatDateLong(date)),
      dayLink(next, nl.today.nextDay, 'next', diffDays(next, today) <= PLAN_AHEAD_DAYS)),
    h('div', { class: 'today__hero' },
      h('h1', { class: 'page-title today__title' }, ...title),
      progress.total > 0 ? ring(progress.done, progress.total) : null),
    date !== today ? h('a', { class: 'today__back', href: '#/today' }, nl.today.backToToday) : null);
}

function banner(view) {
  if (view.mode === 'past') return h('p', { class: 'banner', role: 'status' }, view.canLog ? nl.today.pastBanner : nl.today.lockedBanner);
  if (view.mode === 'future') return h('p', { class: 'banner', role: 'status' }, nl.today.futureBanner);
  return null;
}

function todayEmpty(view) {
  if (!view.hasHabits) {
    return emptyState({
      art: 'sprout', title: nl.today.noHabitsTitle, text: nl.today.noHabits, starters: true,
      cta: { href: '#/habits/new', label: nl.today.createFirst, desktopOnly: true },
    });
  }
  return emptyState({
    art: 'moon', title: view.mode === 'today' ? nl.today.restTitle : nl.today.nothingTitle, text: nl.today.empty,
    secondary: { href: '#/habits', label: nl.today.seeHabits },
  });
}
