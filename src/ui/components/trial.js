// De proef "zonder app" in beeld (docs/AUTOMATISME.md): de kaart op de habit-pagina en de vragen en aanbiedingen in de week- en maandreview.
import { h } from '../dom.js';
import { notifyChanged, state, wallClockNow } from '../state.js';
import { showToast } from './toast.js';
import { nl } from '../../content/nl.js';
import { answerTrial, cancelTrial, logCheckIn, RuleError, startTrial } from '../../app/actions.js';
import { doneBetween } from '../../app/habit-detail.js';
import { formatDateLong } from '../../app/format.js';
import { trialCooldownUntil, trialOffer, trialsOf, trialsToAnswer } from '../../domain/trial.js';

const t = nl.trial;

/** 'deze week' / 'volgende week' / 'deze maand' / 'volgende maand', naar wanneer de proef begint. */
export function startLabel(period, rangeStart, today) {
  const now = rangeStart === today;
  const labels = t.periodLabel;
  if (period === 'month') return now ? labels.thisMonth : labels.nextMonth;
  return now ? labels.thisWeek : labels.nextWeek;
}

async function begin(habit, offer) {
  try {
    await startTrial(state.repo, { habitId: habit.id }, state.today, wallClockNow());
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    notifyChanged(); // de stand is veranderd (bijvoorbeeld op een ander apparaat): het scherm toont hem nu zoals hij is
    return;
  }
  notifyChanged();
  showToast({ message: t.started(startLabel(offer.period, offer.range.start, state.today)) });
}

/** De kaart op de habit-pagina: uitleg en een knop om te beginnen, of hoe de proef ervoor staat. Null als een proef bij deze habit niet past. */
export function trialCard(detail) {
  const { habit, trial } = detail;
  const { offer, current } = trial;
  if (offer.state === 'inactive' || offer.state === 'not_flexible') return null;

  let body;
  if (current) {
    const line = current.status === 'planned' ? t.states.planned(formatDateLong(current.start))
      : current.status === 'answer' ? t.states.answer : t.states.running(formatDateLong(current.end));
    const started = current.status !== 'planned';
    const doneToday = detail.stats.lastDoneDate === state.today;
    body = [
      h('p', { class: 'card__text' }, line),
      started ? h('p', { class: 'xs muted card__text' }, t.done(current.done)) : null,
      h('div', { class: 'detail__actions' },
        started
          ? h('button', {
            type: 'button',
            class: 'button button--primary',
            disabled: doneToday,
            dataset: { focusKey: 'trial:tick' },
            onclick: async () => {
              const { undo } = await logCheckIn(state.repo, { habitId: habit.id, date: state.today, status: 'done' }, state.today);
              notifyChanged();
              showToast({ message: t.ticked, actionLabel: nl.app.undo, onAction: async () => { await undo(); notifyChanged(); } });
            },
          }, doneToday ? t.ticked : t.tickToday)
          : null,
        h('button', {
          type: 'button',
          class: 'button button--ghost',
          dataset: { focusKey: 'trial:cancel' },
          onclick: async () => {
            await cancelTrial(state.repo, { habitId: habit.id }, state.today, wallClockNow());
            notifyChanged();
            showToast({ message: t.cancelled });
          },
        }, t.cancel)),
    ];
  } else if (offer.state === 'available') {
    body = [
      h('p', { class: 'card__text' }, t.intro),
      h('p', { class: 'xs muted card__text' }, t.how(offer.period)),
      h('button', {
        type: 'button',
        class: 'button button--secondary button--block',
        dataset: { focusKey: 'trial:start' },
        onclick: () => begin(habit, offer),
      }, t.start(startLabel(offer.period, offer.range.start, state.today))),
    ];
  } else if (offer.state === 'cooldown') {
    body = [h('p', { class: 'card__text' }, t.cooldown(formatDateLong(offer.until)))];
  } else {
    body = [
      h('p', { class: 'card__text' }, t.intro),
      h('p', { class: 'xs muted card__text' }, t.needScores, ' ', t.needScoresHave(offer.have ?? 0)),
    ];
  }
  return h('section', { class: 'card card--quiet trial', dataset: { state: current ? current.status : offer.state } },
    h('div', { class: 'trial__head' },
      h('h2', { class: 'section__title' }, t.title),
      trial.passed ? h('span', { class: 'badge badge--ok' }, `✓ ${t.passed}`) : null),
    ...body,
    trial.passed ? h('p', { class: 'xs muted card__text' }, t.passedText) : null);
}

/** Het antwoord in de review. Beantwoorden slaat op en ververst het scherm; een afgesloten review of een niet-afgevinkte taak geeft een melding. */
async function answer(habit, trial, passed) {
  try {
    await answerTrial(state.repo, { habitId: habit.id, start: trial.start, passed }, state.today, wallClockNow());
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    showToast({ message: error.code === 'trial_not_done' ? t.review.needTick : t.review.closed });
    notifyChanged();
    return;
  }
  const saved = await state.repo.getHabit(habit.id);
  notifyChanged();
  showToast({ message: passed ? t.review.passedToast(habit.name) : t.review.failedToast(formatDateLong(trialCooldownUntil(saved))) });
}

/**
 * Wat de week- of maandreview over proeven te zeggen heeft: de vraag "heb je het gedaan zonder de app?" bij elke proef van deze periode, en een
 * aanbod voor taken die zover zijn. Null als er niets te vragen of aan te bieden valt. `period`: 'week' | 'month'; `start`: de maandag of de eerste.
 * `open`: staat de review open? (Alleen dan kun je antwoorden of een proef plannen.)
 */
export function trialReviewBlock({ snapshot, today, period, start, open }) {
  const now = wallClockNow();
  const rows = [];

  for (const { habit, trial } of trialsToAnswer({ habits: snapshot.habits, period, start, today, now })) {
    const done = doneBetween(snapshot.checkIns.filter((c) => c.habitId === habit.id), trial.start, trial.end);
    rows.push(h('li', { class: 'trial-ask', dataset: { habit: habit.id } },
      h('p', { class: 'trial-ask__question' }, t.review.question(habit.name)),
      h('p', { class: 'xs muted' }, t.review.detail(done), done === 0 ? ` ${t.review.needTick}` : ''),
      h('div', { class: 'trial-ask__buttons' },
        h('button', { type: 'button', class: 'button button--primary', dataset: { focusKey: `trial-yes:${habit.id}` }, onclick: () => answer(habit, trial, true) }, t.review.yes),
        h('button', { type: 'button', class: 'button button--secondary', dataset: { focusKey: `trial-no:${habit.id}` }, onclick: () => answer(habit, trial, false) }, t.review.no))));
  }

  // wat in deze periode al is beantwoord, als rustige regel
  for (const habit of snapshot.habits) {
    for (const trial of trialsOf(habit)) {
      if (trial.period === period && trial.start === start && trial.result) {
        rows.push(h('li', { class: 'trial-done', dataset: { result: trial.result } },
          h('span', null, habit.name), h('span', { class: 'badge badge--phase' }, t.review.answered[trial.result])));
      }
    }
  }

  if (open) {
    for (const habit of snapshot.habits) {
      const offer = trialOffer({ habit, ratings: snapshot.ratings.filter((r) => r.habitId === habit.id), today, now });
      if (offer.state !== 'available' || offer.period !== period) continue;
      rows.push(h('li', { class: 'trial-offer', dataset: { habit: habit.id } },
        h('p', { class: 'trial-offer__text' }, t.offer.text(habit.name, startLabel(period, offer.range.start, today))),
        h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `trial-offer:${habit.id}` }, onclick: () => begin(habit, offer) }, t.offer.button)));
    }
  }

  if (rows.length === 0) return null;
  return h('div', { class: 'review-trial' },
    h('p', { class: 'kicker' }, t.review.title),
    h('ul', { class: 'review-trial__list' }, ...rows));
}
