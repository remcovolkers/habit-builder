import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { nl } from '../../content/nl.js';
import { mascot } from './mascot.js';
import { uiIcon } from './habit-icon.js';
import { ACHIEVEMENT_INFO } from '../../content/achievements.js';

/** Eén medaille. sub = ondertitel (bv. de habit waarvoor je hem haalde). */
export function achievementMedal({ info, sub = null, locked = false }) {
  return h('li', { class: `achv${locked ? ' achv--locked' : ''}`, dataset: { state: locked ? 'locked' : 'unlocked' } },
    h('span', { class: 'achv__medal', 'aria-hidden': 'true' }, uiIcon(info.icon)),
    h('span', { class: 'achv__title' }, info.title),
    sub ? h('span', { class: 'achv__sub' }, sub) : null);
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
