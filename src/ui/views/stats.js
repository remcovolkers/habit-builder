import { habitIcon } from '../components/habit-icon.js';
import { h } from '../dom.js';
import { liveView } from '../live.js';
import { state } from '../state.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { overviewSection } from '../components/overview.js';
import { closeReviewForm, periodReview, spotlightReview } from '../components/period-review.js';
import { socialCard } from '../components/social-card.js';
import { statsForHabit, streakSpan } from '../../app/habit-detail.js';
import { buildPeriodOverview, countDone } from '../../app/overview.js';
import { addDays, isValidDate } from '../../domain/dates.js';
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
        h('span', { class: 'habit-card__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
        h('span', { class: 'overview-row__name' }, habit.name),
        h('span', { class: `badge badge--phase badge--${stats.phase.phase}` }, nl.detail.phases[stats.phase.phase])),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${nl.stats.strength} ${strength}%` }, fill),
      h('div', { class: 'overview-row__stats' },
        h('span', null, `${nl.stats.strength} ${strength}%`),
        h('span', null, nl.stats.streak(stats.streaks.current, unit)),
        h('span', null, stats.consistency.rate === null ? nl.detail.noData : nl.stats.consistency(Math.round(stats.consistency.rate * 100))))));
}

// Week of maand en welke: dat bepaalt het overzicht, de tegel en de review samen. Blijft staan als het scherm opnieuw wordt getekend.
const picked = { period: 'week', anchor: null };

/** De tegel bij het overzicht: de laatste dagen voor de huidige periode, anders de hele gekozen periode (of wat erin gepland staat). */
function periodTile(snapshot, today, overview) {
  const t = nl.stats.summary;
  const { period } = picked;
  if (overview.isCurrent) return { label: t.rolling[period], value: countDone(snapshot, addDays(today, period === 'week' ? -6 : -30), today) };
  if (overview.isFuture) return { label: t.planned[period], value: overview.planned };
  return { label: t.done[period], value: countDone(snapshot, overview.start, overview.end) };
}

/**
 * query.review ('week' | 'month') en query.date: je komt via de melding "je review staat klaar". Dan staat het scherm op die periode
 * en licht de reviewkaart één keer op.
 */
export function statsView({ query = {} } = {}) {
  const wanted = query.review === 'week' || query.review === 'month' ? query.review : null;
  let spotlight = wanted !== null;
  if (wanted) {
    closeReviewForm();
    picked.period = wanted;
    picked.anchor = isValidDate(query.date) ? query.date : null; // null: vandaag
    // de verwijzing weg uit het adres, zodat vernieuwen of terug niet nogmaals oplicht
    if (location.hash.startsWith('#/stats?')) history.replaceState(null, '', `${location.pathname}${location.search}#/stats`);
  }
  return liveView({
    className: 'stats page',
    load: () => state.repo.snapshot(),
    render: (snapshot, refresh) => {
      const { today } = state;
      if (!picked.anchor) picked.anchor = today;
      const choose = ({ period, anchor }) => {
        closeReviewForm();
        picked.period = period;
        picked.anchor = anchor;
        refresh();
      };
      const overview = buildPeriodOverview({ snapshot, today, period: picked.period, anchor: picked.anchor });
      const tile = periodTile(snapshot, today, overview);
      const habits = snapshot.habits.filter((habit) => habit.status !== 'archived' && habit.startDate <= today);
      const graduated = snapshot.habits.filter((habit) => habit.status === 'graduated').length;
      const active = snapshot.habits.filter((habit) => habit.status === 'active' && isTracked(habit, today)).length;

      const frame = h('div', { class: 'page__frame' },
        h('h1', { class: 'page-title' }, nl.stats.title),
        h('div', { class: 'stats__columns page__panes' },
          // op desktop blijven de vriendenkaart en het overzicht (week of maand met de datumkeuze) staan; alleen de taken eronder scrollen
          h('div', { class: 'stats__main page__col' },
            h('div', { class: 'page__fixed' },
              socialCard(),
              habits.length === 0 ? null : overviewSection(snapshot, today, picked, choose)),
            h('div', { class: 'page__scroll' },
              habits.length === 0
                ? emptyState({ art: 'stats', title: nl.stats.emptyTitle, text: nl.stats.empty, cta: { href: '#/habits/new', label: nl.habits.new } })
                : h('div', { class: 'detail' },
                  h('section', { class: 'tiles' },
                    h('div', { class: 'tile' }, h('span', { class: 'tile__label' }, tile.label), h('span', { class: 'tile__value' }, String(tile.value))),
                    h('div', { class: 'tile' }, h('span', { class: 'tile__label' }, nl.stats.summary.graduated), h('span', { class: 'tile__value' }, String(graduated)),
                      h('span', { class: 'tile__hint' }, `${active} ${nl.stats.summary.active.toLowerCase()}`))),
                  h('ul', { class: 'card-list stats__list' }, ...habits.map((habit) => overviewRow(habit, snapshot, today)))))),
          h('div', { class: 'stats__side page__pane section' }, periodReview(snapshot, today, picked, choose))));
      if (spotlight) {
        spotlight = false;
        setTimeout(() => spotlightReview(frame.querySelector('.review-card')), 120); // pas als het scherm in de pagina staat
      }
      return frame;
    },
  });
}
