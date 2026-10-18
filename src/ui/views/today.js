import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state, wallClockNow } from '../state.js';
import { showToast } from '../components/toast.js';
import { openDialog } from '../components/dialog.js';
import { entryState, habitCard } from '../components/habit-card.js';
import { poolCard, periodLabel as periodSummary } from '../components/pool-card.js';
import { countToPlan, planWeekButton, planWeekPrompt } from '../components/week-planner.js';
import { ring } from '../components/ring.js';
import { icon } from '../svg.js';
import { mascot } from '../components/mascot.js';
import { emptyState } from '../components/empty-state.js';
import { weekStrip } from '../components/week-strip.js';
import { buildWeekStrip } from '../../app/overview.js';
import { uiIcon } from '../components/habit-icon.js';
import { account, dismissNudge, nudgeDismissed, nudgeElement } from '../account.js';
import { openFeedbackSheet } from '../components/feedback-sheet.js';
import { feedbackInviteDue, snoozeFeedbackInvite } from '../feedback-state.js';
import { clearFirstTip, firstTipPending } from '../intro.js';
import { nl } from '../../content/nl.js';
import { buildDayView } from '../../app/day-view.js';
import { adjustCounter, clearCheckIn, completeMonthTask, logCheckIn, planHabit, rateAutomaticity, recordReason, RuleError, togglePart, unplanHabit } from '../../app/actions.js';
import { buildAttention, forToday } from '../../app/attention.js';
import { attentionCard, openReasonSheet, reasonLabel } from '../components/attention.js';
import { monthTasks, REVIEW_CLOSING_TIME, reviewNudges } from '../../domain/reviews.js';
import { dismissReviewNudges, reviewNudgeDismissed } from '../review-nudge-state.js';
import { counterDoneValue } from '../../domain/counter.js';
import { habitDayparts, hasMultipleDayparts } from '../../domain/dayparts.js';
import { charCounter } from '../components/char-counter.js';
import { datesBetween, formatDateLong, greetingFor, localHour, relativeDayLabel } from '../../app/format.js';
import { addDays, diffDays, isValidDate } from '../../domain/dates.js';
import { BACKFILL_DAYS, NOTE_MAX_LENGTH, PLAN_AHEAD_DAYS } from '../../domain/constants.js';

// hoeveel kaarten van de stapel er in beeld staan voordat de rest wordt ingeklapt (wat dreigt te falen telt altijd mee en blijft in beeld)
const POOL_VISIBLE = 4;

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
        toPlan: countToPlan(snapshot, state.today), // hoeveel flexibele taken nog dagen nodig hebben (op de knop Plan je week)
        monthTasks: date === state.today ? monthTasks({ reviews: snapshot.reviews, today: state.today }) : [], // de eenmalige taak uit de maandreview
        reviewNotes: date === state.today ? reviewNudges({ reviews: snapshot.reviews, now: wallClockNow() }).filter((nudge) => !reviewNudgeDismissed(nudge)) : [], // een review die open staat
      };
    },
    render: ({ view, week, attention, toPlan, monthTasks: tasks, reviewNotes }) => renderDay(view, week, attention, toPlan, tasks, reviewNotes),
  });
}

function renderDay(view, week, attention, toPlan = 0, tasks = [], reviewNotes = []) {
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

  // De stapel: wat dreigt te falen staat bovenaan en altijd in beeld; de rest toont hoogstens POOL_VISIBLE kaarten en de overige zitten ingeklapt.
  // Elke kaart is één regel met één knop; "een andere dag" en "al gedaan" zitten achter ⋯.
  function poolMore(entry) {
    const { habit } = entry;
    const actions = [];
    if (view.canPlan && date === today) actions.push({ label: nl.today.pool.otherDay, onClick: () => planOther(entry) });
    if (view.canLog) actions.push({ label: nl.today.pool.alreadyDone, onClick: () => perform(() => log(entry.habitId, 'done'), nl.today.toasts.done(habit.name)) });
    openDialog({ title: habit.name, description: periodSummary(entry), actions, cancelLabel: nl.app.close });
  }
  const poolOptions = { date, today, canPlan: view.canPlan, canMore: view.canPlan || view.canLog, onPlan: (e) => planOnDay(e, date), onMore: poolMore };
  const poolList = (entries) => h('ul', { class: 'card-list' }, ...entries.map((entry) => poolCard(entry, poolOptions)));
  const urgentPool = view.pool.filter((e) => e.urgent);
  const restPool = view.pool.filter((e) => !e.urgent);
  const restShown = restPool.slice(0, Math.max(0, POOL_VISIBLE - urgentPool.length));
  const restHidden = restPool.slice(restShown.length);

  // de kop blijft ook staan als de stapel leeg is doordat taken "Niet in deze week" kregen: zo blijft Plan je week bereikbaar om er toch een in te plannen
  const poolSection = view.pool.length > 0 || view.poolSkipped > 0
    ? h('section', { class: 'section pool', 'aria-labelledby': 'pool-title' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'pool-title', class: 'section__title' }, nl.today.pool.title),
        view.canPlan && toPlan === 0 ? planWeekButton() : h('span', { class: 'kicker' }, poolPeriod)),
      h('p', { class: 'section__hint' }, nl.today.pool.hint),
      view.canPlan && toPlan > 0 ? planWeekPrompt({ toPlan }) : null,
      // niets meer in te plannen: alles heeft zijn aandacht gehad (ingepland, gedaan of bewust niet deze week)
      view.canPlan && toPlan === 0 ? h('p', { class: 'pool__all-planned', role: 'status' }, nl.today.pool.allPlanned) : null,
      urgentPool.length > 0
        ? h('div', { class: 'pool__group' }, h('h3', { class: 'pool__group-title pool__group-title--urgent' }, nl.today.pool.urgentTitle), poolList(urgentPool))
        : null,
      restShown.length > 0
        ? h('div', { class: 'pool__group' }, urgentPool.length > 0 ? h('h3', { class: 'pool__group-title' }, nl.today.pool.restTitle) : null, poolList(restShown))
        : null,
      restHidden.length > 0
        ? h('details', { class: 'pool__more' }, h('summary', { class: 'pool__more-summary' }, nl.today.pool.showMore(restHidden.length)), poolList(restHidden))
        : null)
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

  // De eenmalige taak uit de review van vorige maand: een eigen kaart, los van de habits (telt niet mee in punten, reeksen of voortgang)
  const m = nl.today.monthTask;
  const monthTaskSection = tasks.length > 0
    ? h('section', { class: 'section monthtask', 'aria-labelledby': 'monthtask-title' },
      h('h2', { id: 'monthtask-title', class: 'visually-hidden' }, m.title),
      h('ul', { class: 'card-list' }, ...tasks.map((task) => h('li', { class: 'monthtask__card', dataset: { month: task.monthStart } },
        h('div', { class: 'monthtask__head' },
          h('span', { class: 'badge badge--monthtask' }, m.badge),
          h('span', { class: 'kicker' }, m.from(nl.months.long[Number(task.monthStart.slice(5, 7)) - 1]))),
        h('p', { class: 'monthtask__text' }, task.text),
        h('button', {
          type: 'button', class: 'button button--primary monthtask__done', dataset: { focusKey: `monthtask:${task.monthStart}` },
          onclick: () => perform(() => completeMonthTask(repo, { monthStart: task.monthStart }, today), m.toast),
        }, m.done)))))
    : null;

  // "Week review staat vanaf nu open" / "Maand review staat vanaf nu open": een kaart met een knop naar de review (Voortgang markeert hem), tot je hem invult.
  // "Niet nu" verbergt hem voor deze week of maand.
  const r = nl.today.reviewNote;
  const reviewNote = reviewNotes.length > 0 && view.hasHabits
    ? (() => {
      const kinds = reviewNotes.map((note) => note.kind);
      const title = kinds.length === 2 ? r.both : kinds[0] === 'week' ? r.week : r.month;
      const card = h('section', { class: 'section reviewnote', id: 'reviewNote', 'aria-labelledby': 'reviewnote-title' },
        h('div', { class: 'reviewnote__card' },
          h('span', { class: 'badge badge--review' }, r.badge),
          h('h2', { id: 'reviewnote-title', class: 'reviewnote__title' }, title),
          h('p', { class: 'xs muted reviewnote__until' }, reviewNotes.map((note) => {
            const label = `${formatDateLong(note.closesOn)} ${REVIEW_CLOSING_TIME}`;
            return kinds.length === 1 ? r.until(label) : r.untilKind[note.kind](label);
          }).join(' ')),
          h('div', { class: 'reviewnote__actions' },
            ...reviewNotes.map((note) => h('a', {
              class: kinds.length === 1 || note.kind === 'week' ? 'button button--primary' : 'button button--secondary',
              href: `#/stats?review=${note.kind}&date=${note.start}`,
              dataset: { kind: note.kind },
            }, note.kind === 'week' ? r.toWeek : r.toMonth)),
            h('button', { type: 'button', class: 'button button--ghost', onclick: () => { dismissReviewNudges(reviewNotes); card.remove(); } }, r.later))));
      return card;
    })()
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
  // Een rustige uitnodiging voor feedback, onderaan en nooit tijdens het afvinken: pas na een week gebruik, niet naast het zetje om in te loggen,
  // en na "Niet nu" of openen weer maanden stil (docs/FEEDBACK.md)
  const feedbackInvite = !nudge && view.hasHabits && view.mode === 'today' && feedbackInviteDue()
    ? (() => {
      const f = nl.feedback.invite;
      const card = h('div', { class: 'banner feedback-invite', id: 'feedbackInvite', role: 'region', 'aria-label': f.title },
        h('strong', null, f.title),
        h('p', { class: 'feedback-invite__text' }, f.text),
        h('div', { class: 'feedback-invite__actions' },
          h('button', {
            type: 'button', id: 'feedbackInviteYes', class: 'button button--secondary button--small',
            onclick: () => { snoozeFeedbackInvite(); card.remove(); openFeedbackSheet({ opener: document.getElementById('app') }); },
          }, f.yes),
          h('button', { type: 'button', id: 'feedbackInviteLater', class: 'button button--ghost button--small', onclick: () => { snoozeFeedbackInvite(); card.remove(); } }, f.later)));
      return card;
    })()
    : null;
  const side = [sideHead, poolSection, nudge, feedbackInvite, celebrate].filter(Boolean);
  return h('div', { class: 'today__inner page__frame' },
    header(view, week),
    banner(view),
    // de maandtaak en de review-melding staan boven beide kolommen: zo beginnen de dag links en de stapel rechts op dezelfde hoogte
    monthTaskSection || reviewNote ? h('div', { class: 'today__notes' }, monthTaskSection, reviewNote) : null,
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
