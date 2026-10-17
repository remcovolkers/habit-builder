import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { nl } from '../../content/nl.js';
import { mascot } from './mascot.js';
import { uiIcon } from './habit-icon.js';
import { ACHIEVEMENT_INFO } from '../../content/achievements.js';

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
