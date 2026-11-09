import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { nl } from '../../content/nl.js';
import { mascot } from './mascot.js';
import { uiIcon } from './habit-icon.js';
import { ACHIEVEMENT_INFO } from '../../content/achievements.js';
import { formatDateShort } from '../../app/format.js';

/** Eén medaille. sub = ondertitel (bv. de habit waarvoor je hem haalde). Met onOpen is hij aan te tikken (de uitleg op de pagina Prestaties). */
export function achievementMedal({ info, sub = null, locked = false, onOpen = null }) {
  const parts = [
    h('span', { class: 'achv__medal', 'aria-hidden': 'true' }, uiIcon(info.icon)),
    h('span', { class: 'achv__title' }, info.title),
    sub ? h('span', { class: 'achv__sub' }, sub) : null,
  ];
  const attrs = { class: `achv${locked ? ' achv--locked' : ''}`, dataset: { state: locked ? 'locked' : 'unlocked' } };
  return onOpen
    ? h('li', attrs, h('button', { type: 'button', class: 'achv__button', onclick: onOpen }, ...parts))
    : h('li', attrs, ...parts);
}

/**
 * Het blok op de habit-pagina: wat je bij deze habit behaalde en de eerstvolgende per soort met voortgang. `achievements` komt uit habitAchievements
 * (app/habit-achievements.js); de teksten staan in content/achievements.js.
 */
export function habitAchievementsCard({ achievements }) {
  const t = nl.achievements.habit;
  const reached = achievements.reached.filter(({ key }) => ACHIEVEMENT_INFO[key]);
  const next = achievements.next.filter(({ key }) => ACHIEVEMENT_INFO[key]);
  const progress = (item) => {
    if (item.target === null) return t.goal;
    if (item.key.startsWith('days_')) return item.repsNeeded > 0 ? t.daysReps(item.value, item.target, item.repsNeeded) : t.days(item.value, item.target);
    return t.times(item.value, item.target);
  };
  return h('section', { class: 'card habit-achievements' },
    h('h2', { class: 'section__title' }, t.title),
    reached.length === 0 ? h('p', { class: 'card__text muted' }, t.empty) : null,
    reached.length > 0
      ? h('ul', { class: 'achievements', 'aria-label': t.title }, ...reached.map(({ key, date }) => achievementMedal({ info: ACHIEVEMENT_INFO[key], sub: t.reachedOn(formatDateShort(date)) })))
      : null,
    next.length > 0 ? h('p', { class: 'kicker' }, t.next) : null,
    next.length > 0
      ? h('ul', { class: 'achievements', 'aria-label': t.next }, ...next.map((item) => achievementMedal({ info: ACHIEVEMENT_INFO[item.key], sub: progress(item), locked: true })))
      : null);
}

/** Het blad met de uitleg bij één prestatie (zie app/achievement-detail.js voor wat erin staat). */
export function openAchievementDetail({ info, explanation }) {
  const { unlocked, heading, text, status, rows } = explanation;
  openDialog({
    title: info.title,
    className: 'achv-detail',
    content: h('div', { class: 'achv-detail__body' },
      h('div', { class: `achv achv-detail__medal${unlocked ? '' : ' achv--locked'}`, 'aria-hidden': 'true' },
        h('span', { class: 'achv__medal' }, uiIcon(info.icon))),
      h('h3', { class: 'achv-detail__heading' }, heading),
      h('p', { class: 'achv-detail__text' }, text),
      status ? h('p', { class: 'achv-detail__status' }, status) : null,
      rows.length > 0
        ? h('ul', { class: 'achv-detail__rows' },
          ...rows.map(({ label, when }) => h('li', { class: 'achv-detail__row' },
            label ? h('span', { class: 'achv-detail__habit' }, label) : null,
            h('span', { class: 'achv-detail__when' }, when))))
        : null),
    actions: [{ label: nl.achievements.detailClose, variant: 'primary' }],
    cancelLabel: null,
  });
}

/** Viering als er nieuwe prestaties zijn: één sheet met alle medailles. */
export function celebrateAchievements(fresh, habits) {
  const names = new Map(habits.map((habit) => [habit.id, habit.name]));
  const medals = fresh
    .filter(({ key }) => ACHIEVEMENT_INFO[key])
    .map(({ key, habitId }) => achievementMedal({ info: ACHIEVEMENT_INFO[key], sub: habitId ? names.get(habitId) : null }));
  if (medals.length === 0) return;
  openDialog({
    title: medals.length === 1 ? nl.achievements.celebrateTitle : nl.achievements.celebrateTitleMany(medals.length),
    content: h('div', null,
      mascot('achievement', 'celebrate-mascot'),
      h('ul', { class: 'achievements celebrate-list', 'aria-label': nl.achievements.title }, ...medals)),
    actions: [{ label: nl.achievements.celebrateClose, variant: 'primary' }],
    cancelLabel: null,
  });
}
