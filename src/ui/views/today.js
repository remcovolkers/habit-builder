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
import { weekStrip } from '../components/week-strip.js';
import { buildWeekStrip } from '../../app/overview.js';
import { uiIcon } from '../components/habit-icon.js';
import { account, dismissNudge, nudgeDismissed, nudgeElement } from '../account.js';
import { clearFirstTip, firstTipPending } from '../intro.js';
import { nl } from '../../content/nl.js';
import { buildDayView } from '../../app/day-view.js';
import { adjustCounter, clearCheckIn, logCheckIn, planHabit, rateAutomaticity, recordReason, RuleError, togglePart, unplanHabit } from '../../app/actions.js';
import { buildAttention, forToday } from '../../app/attention.js';
import { attentionCard, openReasonSheet, reasonLabel } from '../components/attention.js';
import { counterDoneValue } from '../../domain/counter.js';
import { habitDayparts, hasMultipleDayparts } from '../../domain/dayparts.js';
import { charCounter } from '../components/char-counter.js';
import { datesBetween, formatDateLong, greetingFor, localHour, relativeDayLabel } from '../../app/format.js';
import { addDays, diffDays, isValidDate } from '../../domain/dates.js';
import { BACKFILL_DAYS, NOTE_MAX_LENGTH, PLAN_AHEAD_DAYS } from '../../domain/constants.js';

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
    className: 'today page',
    load: async () => {
      const snapshot = await state.repo.snapshot();
      return {
        view: buildDayView({ snapshot, date, today: state.today }),
        week: buildWeekStrip({ snapshot, date, today: state.today }),
        attention: date === state.today ? forToday(buildAttention({ snapshot, today: state.today })) : [],
      };
    },
    render: ({ view, week, attention }) => renderDay(view, week, attention),
  });
}

function renderDay(view, week, attention) {
  const { today } = state;
  const { repo } = state;
  const { date } = view;
  const log = (habitId, status, note = null, value = null, parts = null) => logCheckIn(repo, { habitId, date, status, note, value, parts }, today);

  // Tikken op +/− achter elkaar mogen elkaar niet inhalen: eerst klaar, dan de volgende.
  let queue = Promise.resolve();
  const adjust = (entry, delta) => {
    queue = queue.then(() => perform(() => adjustCounter(repo, { habit: entry.habit, date, delta }, today)));
    return queue;
  };

  function toggle(entry) {
    const name = entry.habit.name;
    if (entry.part) {
      const open = entryState(entry) === 'open';
      // een minimale of overgeslagen dag staat voor alle dagdelen: tik je er een aan, dan wordt de hele dag weer leeg en begin je opnieuw
      const resets = entry.loggedToday === 'minimal' || entry.loggedToday === 'skipped';
      return perform(
        () => (resets ? clearCheckIn(repo, { habitId: entry.habitId, date }, today) : togglePart(repo, { habit: entry.habit, date, part: entry.part }, today)),
        open ? nl.today.toasts.done(name) : nl.today.toasts.cleared(name),
      );
    }
    return entryState(entry) === 'open'
      ? perform(() => log(entry.habitId, 'done'), nl.today.toasts.done(name))
      : perform(() => clearCheckIn(repo, { habitId: entry.habitId, date }, today), nl.today.toasts.cleared(name));
  }

  function more(entry) {
    const { habit } = entry;
    const noteInput = h('input', { id: 'noteInput', type: 'text', class: 'input', value: entry.noteToday ?? '', placeholder: nl.today.actions.notePlaceholder });
    const note = () => noteInput.value.trim() || null;
    const logged = entry.loggedToday !== null && entry.loggedToday !== undefined;
    const multi = hasMultipleDayparts(habit);
    const actions = [];
    if (view.canLog) {
      const doneValue = habit.counter ? counterDoneValue(habit.counter, entry.valueToday ?? 0) : (multi ? habitDayparts(habit).length : null);
      actions.push({
        label: habit.counter ? nl.today.actions.goalReached : (multi ? nl.today.actions.allParts : nl.today.actions.done),
        variant: 'primary',
        onClick: () => perform(() => log(habit.id, 'done', note(), doneValue, multi ? habitDayparts(habit) : null), nl.today.toasts.done(habit.name)),
      });
      if (habit.minimalVersion && !habit.counter) {
        actions.push({ label: nl.today.actions.minimal(habit.minimalVersion), onClick: () => perform(() => log(habit.id, 'minimal', note()), nl.today.toasts.minimal(habit.name)) });
      }
      actions.push({
        label: nl.today.actions.skip,
        onClick: () => perform(() => log(habit.id, 'skipped', note()), nl.today.toasts.skipped(habit.name)),
      });
      if (logged) {
        actions.push({
          label: nl.today.actions.saveNote,
          onClick: () => perform(() => log(habit.id, entry.loggedToday, note(), entry.valueToday, entry.partsToday), nl.today.actions.noteSaved(habit.name)),
        });
      }
      if (logged) actions.push({ label: nl.today.actions.clear, onClick: () => perform(() => clearCheckIn(repo, { habitId: habit.id, date }, today), nl.today.toasts.cleared(habit.name)) });
    }
    if (view.canPlan && entry.plannedToday && !logged) {
      actions.push({ label: nl.today.actions.unplan, onClick: () => perform(() => unplanHabit(repo, { habitId: habit.id, date }), nl.today.toasts.unplanned(habit.name)) });
    }
    openDialog({
      title: nl.today.actions.title(habit.name),
      content: view.canLog ? h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'noteInput' }, nl.today.actions.note), noteInput, charCounter(noteInput, NOTE_MAX_LENGTH)) : null,
      actions,
    });
  }

  // het cijfer hoort bij de week van de gekozen dag, ook bij terugwerkend invullen
  async function rate(entry, score) {
    await rateAutomaticity(repo, { habitId: entry.habitId, score }, date);
    notifyChanged();
    showToast({ message: nl.today.automaticity.saved(score) });
  }

  // een reden vastleggen; de reactie hoort bij de echte vandaag (zie domain/attention.js)
  async function saveReason(habitId, reason, note) {
    await recordReason(repo, { habitId, reason, note }, today);
    notifyChanged();
    showToast({ message: nl.attention.sheet.saved(reasonLabel(reason)) });
  }

  function why(item) {
    openReasonSheet({ habit: item.habit, current: item.reason, onSave: ({ reason, note }) => saveReason(item.habit.id, reason, note) });
  }

  // een taak met een vaste dag in de maand die te laat is: reden kiezen, en eventueel meteen alsnog afvinken of overslaan
  function late(entry) {
    const { habit } = entry;
    const then = (status, message) => async ({ reason, note }) => {
      if (reason !== null) await recordReason(repo, { habitId: habit.id, reason, note }, today);
      return perform(() => log(habit.id, status, note), message);
    };
    openReasonSheet({
      habit,
      onSave: ({ reason, note }) => saveReason(habit.id, reason, note),
      extras: [
        { label: nl.today.late.doneNow, run: then('done', nl.today.toasts.done(habit.name)) },
        { label: nl.today.late.skip, run: then('skipped', nl.today.toasts.skipped(habit.name)) },
      ],
    });
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

  const cardOptions = { canLog: view.canLog, onToggle: toggle, onMore: more, onAdjust: adjust, onRate: rate, onLate: late };

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

  const attentionSection = attention.length > 0
    ? h('section', { class: 'section', 'aria-labelledby': 'attention-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'attention-title', class: 'section__title' }, nl.attention.title)),
      h('p', { class: 'section__hint' }, nl.attention.hint),
      h('ul', { class: 'card-list' }, ...attention.map((item) => attentionCard(item, {
        today,
        onWhy: why,
        onTick: view.canLog ? (i) => perform(() => log(i.habit.id, 'done'), nl.today.toasts.done(i.habit.name)) : null,
      }))))
    : null;

  const nudge = account.status === 'anonymous' && view.hasHabits && view.mode === 'today' && !nudgeDismissed()
    ? nudgeElement((event) => { dismissNudge(); event.target.closest('.nudge').remove(); })
    : null;

  // één keer, na de eerste habit uit de introductie (docs/ONBOARDING.md O5)
  const firstTip = view.hasHabits && view.mode === 'today' && firstTipPending()
    ? h('div', { class: 'banner nudge first-tip', id: 'firstTip', role: 'status' },
      h('strong', null, nl.today.firstTip.title), ' ',
      h('span', null, nl.today.firstTip.text),
      h('button', { type: 'button', class: 'nudge__dismiss', onclick: (event) => { clearFirstTip(); event.target.closest('.first-tip').remove(); } }, nl.today.firstTip.dismiss))
    : null;

  const celebrate = allDone
    ? h('section', { class: 'section celebrate', role: 'status' },
      mascot('celebrate') ?? h('div', { class: 'celebrate__emoji', 'aria-hidden': 'true' }, uiIcon('ui-celebrate')),
      h('h2', { class: 'celebrate__title' }, nl.today.celebrateTitle),
      h('p', { class: 'celebrate__text' }, nl.today.celebrateText))
    : null;

  // Op mobiel onder elkaar; op desktop de dag links en de stapel (met zetje en feest) rechts.
  // Links begint elk dagdeel met een kopregel. Begint de rechterkolom met een kaart zonder kopregel (het feest of het zetje, als de stapel leeg is),
  // dan krijgt die er op desktop ook een, zodat de eerste kaarten links en rechts op dezelfde hoogte staan.
  const sideHead = !poolSection && (celebrate || nudge)
    ? h('div', { class: 'section-head desktop-only today__side-head' },
      h('h2', { class: 'section__title' }, celebrate ? nl.today.sideDone : nl.today.sideTip),
      celebrate ? h('span', { class: 'xs muted' }, nl.today.sectionCount(view.progress.done, view.progress.total)) : null)
    : null;
  const side = [sideHead, poolSection, nudge, celebrate].filter(Boolean);
  return h('div', { class: 'today__inner page__frame' },
    header(view, week),
    banner(view),
    view.groups.length === 0 && view.pool.length === 0 ? todayEmpty(view) : null,
    h('div', { class: 'today__columns page__panes' },
      h('div', { class: 'today__main page__pane' }, firstTip, attentionSection, ...groupSections),
      side.length > 0 ? h('div', { class: 'today__side page__pane' }, ...side) : null));
}

function dayLink(date, label, symbol, enabled) {
  return enabled
    ? h('a', { class: 'icon-button', href: dayHref(date, state.today), 'aria-label': label }, icon(symbol))
    : h('span', { class: 'icon-button is-disabled', 'aria-hidden': 'true' }, icon(symbol));
}

function header(view, week) {
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
    view.hasHabits ? weekStrip(week, { hrefFor: (d) => dayHref(d, state.today) }) : null,
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
      cta: { href: '#/habits/new', label: nl.today.createFirst }, // Vandaag heeft geen zwevende knop meer (die hoort bij de lijst op Habits), dus ook op de telefoon een gewone knop
    });
  }
  return emptyState({
    art: 'moon', title: view.mode === 'today' ? nl.today.restTitle : nl.today.nothingTitle, text: nl.today.empty,
    secondary: { href: '#/habits', label: nl.today.seeHabits },
  });
}
