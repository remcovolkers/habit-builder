import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { overviewSection } from '../components/overview.js';
import { socialCard } from '../components/social-card.js';
import { statsForHabit, streakSpan } from '../../app/habit-detail.js';
import { saveWeeklyReview } from '../../app/actions.js';
import { formatDateShort } from '../../app/format.js';
import { ValidationError } from '../../data/repository.js';
import { addDays, startOfWeek } from '../../domain/dates.js';
import { isTracked } from '../../domain/rules.js';

function overviewRow(habit, snapshot, today) {
  const { stats } = statsForHabit({ habit, checkIns: snapshot.checkIns, pauses: snapshot.pauses, ratings: snapshot.ratings, today });
  const span = streakSpan(habit, stats.units, today);
  const strength = Math.round(stats.strength * 100);
  const fill = h('div', { class: 'meter__fill' });
  fill.style.setProperty('--p', String(strength));
  const unit = nl.detail.units[span][stats.streaks.current === 1 ? 0 : 1];
  return h('li', { class: 'card card--flush', dataset: { color: habit.color } },
    h('a', { class: 'overview-row', href: `#/habits/${encodeURIComponent(habit.id)}` },
      h('div', { class: 'overview-row__top' },
        h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habit.icon),
        h('span', { class: 'overview-row__name' }, habit.name),
        h('span', { class: `badge badge--phase badge--${stats.phase.phase}` }, nl.detail.phases[stats.phase.phase])),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${nl.stats.strength} ${strength}%` }, fill),
      h('div', { class: 'overview-row__stats' },
        h('span', null, `${nl.stats.strength} ${strength}%`),
        h('span', null, nl.stats.streak(stats.streaks.current, unit)),
        h('span', null, stats.consistency.rate === null ? nl.detail.noData : nl.stats.consistency(Math.round(stats.consistency.rate * 100))))));
}

function reviewCard(snapshot, today) {
  const weekStart = startOfWeek(today);
  const current = snapshot.reviews.find((r) => r.weekStart === weekStart) ?? null;
  const r = nl.stats.review;
  const wentWell = h('textarea', { id: 'wentWell', class: 'input', rows: 3, maxlength: 1100, value: null }, current?.wentWell ?? '');
  const adjust = h('textarea', { id: 'adjust', class: 'input', rows: 3, maxlength: 1100 }, current?.adjust ?? '');
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true }, r.tooLong);

  async function submit(event) {
    event.preventDefault();
    error.hidden = true;
    try {
      await saveWeeklyReview(state.repo, { wentWell: wentWell.value, adjust: adjust.value }, today);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      error.hidden = false;
      return;
    }
    notifyChanged();
    showToast({ message: r.saved });
  }

  const earlier = snapshot.reviews.filter((x) => x.weekStart !== weekStart);
  return h('section', { class: 'card' },
    h('h2', { class: 'section__title' }, r.title),
    h('form', { class: 'review form', novalidate: true, onsubmit: submit },
      h('p', { class: 'xs muted' }, r.week(formatDateShort(weekStart))),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'wentWell' }, r.wentWell), wentWell),
      h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'adjust' }, r.adjust), adjust),
      error,
      h('button', { type: 'submit', class: 'button button--primary button--block' }, r.save)),
    earlier.length > 0
      ? h('details', { class: 'section' },
        h('summary', { class: 'section__title' }, `${r.earlier} (${earlier.length})`),
        h('ul', { class: 'card-list' }, ...earlier.map((x) =>
          h('li', { class: 'card card--quiet' },
            h('span', { class: 'kicker' }, r.week(formatDateShort(x.weekStart))),
            x.wentWell ? h('p', { class: 'card__text' }, `+ ${x.wentWell}`) : null,
            x.adjust ? h('p', { class: 'card__text muted' }, `→ ${x.adjust}`) : null))))
      : null);
}

export function statsView() {
  return liveView({
    className: 'stats',
    load: () => state.repo.snapshot(),
    render: (snapshot) => {
      const { today } = state;
      const habits = snapshot.habits.filter((habit) => habit.status !== 'archived' && habit.startDate <= today);
      const weekAgo = addDays(today, -6);
      const doneLastWeek = snapshot.checkIns.filter((c) => (c.status === 'done' || c.status === 'minimal') && c.date >= weekAgo && c.date <= today).length;
      const graduated = snapshot.habits.filter((habit) => habit.status === 'graduated').length;
      const active = snapshot.habits.filter((habit) => habit.status === 'active' && isTracked(habit, today)).length;

      return h('div', null,
        h('h1', { class: 'page-title' }, nl.stats.title),
        h('div', { class: 'stats__columns' },
          h('div', { class: 'stats__main' },
            socialCard(),
            habits.length === 0
              ? emptyState({ art: 'stats', title: nl.stats.emptyTitle, text: nl.stats.empty, cta: { href: '#/habits/new', label: nl.habits.new } })
              : h('div', { class: 'detail' },
                overviewSection(snapshot, today),
                h('section', { class: 'tiles' },
                  h('div', { class: 'tile' }, h('span', { class: 'tile__label' }, nl.stats.summary.week), h('span', { class: 'tile__value' }, String(doneLastWeek))),
                  h('div', { class: 'tile' }, h('span', { class: 'tile__label' }, nl.stats.summary.graduated), h('span', { class: 'tile__value' }, String(graduated)),
                    h('span', { class: 'tile__hint' }, `${active} ${nl.stats.summary.active.toLowerCase()}`))),
                h('ul', { class: 'card-list stats__list' }, ...habits.map((habit) => overviewRow(habit, snapshot, today))))),
          h('div', { class: 'stats__side section' }, reviewCard(snapshot, today))));
    },
  });
}
