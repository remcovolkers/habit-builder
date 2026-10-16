import { h } from '../dom.js';
import { liveView } from '../live.js';
import { state } from '../state.js';
import { achievementMedal } from '../components/achievement.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO } from '../../content/achievements.js';
import { ACHIEVEMENT_KEYS, achievementProgress } from '../../domain/achievements.js';
import { achievementInput } from '../../app/achievement-runner.js';
import { formatDateShort } from '../../app/format.js';

export function achievementsView() {
  return liveView({
    className: 'achievements-page',
    load: async () => {
      const snapshot = await state.repo.snapshot();
      return { unlocked: snapshot.achievements, habits: snapshot.habits, progress: achievementProgress(achievementInput(snapshot, state.today)) };
    },
    render: ({ unlocked, habits, progress }) => {
      const names = new Map(habits.map((habit) => [habit.id, habit.name]));
      const keys = ACHIEVEMENT_KEYS.filter((key) => ACHIEVEMENT_INFO[key]);
      const reached = keys.filter((key) => unlocked.some((a) => a.key === key));

      // een prestatie die een getal haalt toont hoe ver je bent ("37 van 50"), de rest "Nog niet behaald"
      const lockedSub = (key) => (progress[key] ? nl.achievements.progress(progress[key].value, progress[key].target) : nl.achievements.locked);

      const medal = (key) => {
        const records = unlocked.filter((a) => a.key === key).sort((a, b) => (a.date < b.date ? -1 : 1));
        const info = ACHIEVEMENT_INFO[key];
        if (records.length === 0) return achievementMedal({ info, sub: lockedSub(key), locked: true });
        const habitNames = records.map((a) => names.get(a.habitId)).filter(Boolean);
        const sub = habitNames.length > 0 ? nl.achievements.forHabits(habitNames) : nl.achievements.unlockedOn(formatDateShort(records[0].date));
        return achievementMedal({ info, sub });
      };

      const group = ({ id, label, keys: groupKeys }) => {
        const shown = groupKeys.filter((key) => ACHIEVEMENT_INFO[key]);
        if (shown.length === 0) return null;
        const done = shown.filter((key) => reached.includes(key)).length;
        return h('section', { class: 'section achievements-group', id: `achievements-${id}` },
          h('div', { class: 'section-head' },
            h('h2', { class: 'section__title' }, label),
            h('span', { class: 'kicker' }, nl.achievements.count(done, shown.length))),
          h('ul', { class: 'achievements' }, ...shown.map(medal)));
      };

      return h('div', null,
        h('div', { class: 'page-header' },
          h('h1', { class: 'page-title' }, nl.achievements.title),
          h('span', { class: 'kicker' }, nl.achievements.count(reached.length, keys.length))),
        reached.length === 0
          ? emptyState({ art: 'achievements', slot: 'achievement', title: nl.achievements.emptyTitle, text: nl.achievements.empty, compact: true })
          : null,
        ...ACHIEVEMENT_GROUPS.map(group));
    },
  });
}
