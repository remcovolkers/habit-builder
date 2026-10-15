import { h } from '../dom.js';
import { liveView } from '../live.js';
import { state } from '../state.js';
import { achievementMedal } from '../components/achievement.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { ACHIEVEMENT_INFO } from '../../content/achievements.js';
import { ACHIEVEMENT_KEYS } from '../../domain/achievements.js';
import { formatDateShort } from '../../app/format.js';

export function achievementsView() {
  return liveView({
    className: 'achievements-page',
    load: async () => {
      const snapshot = await state.repo.snapshot();
      return { unlocked: snapshot.achievements, habits: snapshot.habits };
    },
    render: ({ unlocked, habits }) => {
      const names = new Map(habits.map((habit) => [habit.id, habit.name]));
      const keys = ACHIEVEMENT_KEYS.filter((key) => ACHIEVEMENT_INFO[key]);
      const reached = keys.filter((key) => unlocked.some((a) => a.key === key));

      const medal = (key) => {
        const records = unlocked.filter((a) => a.key === key).sort((a, b) => (a.date < b.date ? -1 : 1));
        const info = ACHIEVEMENT_INFO[key];
        if (records.length === 0) return achievementMedal({ info, sub: nl.achievements.locked, locked: true });
        const habitNames = records.map((a) => names.get(a.habitId)).filter(Boolean);
        const sub = habitNames.length > 0 ? nl.achievements.forHabits(habitNames) : nl.achievements.unlockedOn(formatDateShort(records[0].date));
        return achievementMedal({ info, sub });
      };

      return h('div', null,
        h('div', { class: 'page-header' },
          h('h1', { class: 'page-title' }, nl.achievements.title),
          h('span', { class: 'kicker' }, nl.achievements.count(reached.length, keys.length))),
        reached.length === 0
          ? emptyState({ art: 'achievements', slot: 'achievement', title: nl.achievements.emptyTitle, text: nl.achievements.empty, compact: true })
          : null,
        h('ul', { class: 'achievements' }, ...keys.map(medal)));
    },
  });
}
