import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { nl } from '../../content/nl.js';
import { formatDateShort, formatSchedule } from '../../app/format.js';
import { pauseAll, resumeAll } from '../../app/actions.js';
import { scheduleAt } from '../../domain/schedule.js';

export const currentSchedule = (habit, today) => scheduleAt(habit.schedules, today) ?? habit.schedules[0].schedule;

const isPausedOn = (pauses, today) => pauses.some((p) => today >= p.from && (p.to == null || today <= p.to));

function sectionOf(habit, pauses, today) {
  if (habit.status === 'archived') return 'archived';
  if (habit.status === 'graduated') return 'graduated';
  if (habit.startDate > today) return 'planned';
  return isPausedOn(pauses, today) ? 'paused' : 'active';
}

function row(habit, section, today) {
  const meta = [formatSchedule(currentSchedule(habit, today))];
  if (section === 'planned') meta.push(nl.habits.startsOn(formatDateShort(habit.startDate)));
  return h('li', { class: 'habit-row', dataset: { color: habit.color, section } },
    h('a', { class: 'habit-row__link', href: `#/habits/${encodeURIComponent(habit.id)}` },
      h('span', { class: 'habit-row__icon', 'aria-hidden': 'true' }, habit.icon),
      h('span', { class: 'habit-row__body' },
        h('span', { class: 'habit-row__name' }, habit.name),
        h('span', { class: 'habit-row__meta' }, meta.join(' · '))),
      h('span', { class: 'habit-row__chevron', 'aria-hidden': 'true' }, '›')));
}

export function habitsView() {
  return liveView({
    className: 'habits',
    load: async () => {
      const { habits, pauses } = await state.repo.snapshot();
      return { habits, pauses };
    },
    render: ({ habits, pauses }) => {
      const { today } = state;
      const groups = { active: [], paused: [], planned: [], graduated: [], archived: [] };
      for (const habit of habits) {
        groups[sectionOf(habit, pauses.filter((p) => p.habitId === habit.id), today)].push(habit);
      }
      const running = [...groups.active, ...groups.paused];
      const allPaused = running.length > 0 && groups.active.length === 0;

      const section = (key, { collapsed = false } = {}) => {
        if (groups[key].length === 0) return null;
        const list = h('ul', { class: 'card-list' }, ...groups[key].map((habit) => row(habit, key, today)));
        const title = nl.habits.sections[key];
        return collapsed
          ? h('details', { class: 'section' }, h('summary', { class: 'section__title' }, `${title} (${groups[key].length})`), list)
          : h('section', { class: 'section' }, h('h2', { class: 'section__title' }, title), list);
      };

      return h('div', null,
        h('header', { class: 'page-header' },
          h('h1', { class: 'page-title' }, nl.habits.title),
          h('a', { class: 'button button--primary', href: '#/habits/new' }, nl.habits.new)),
        running.length > 0
          ? h('button', {
            type: 'button',
            class: 'button button--ghost',
            onclick: async () => {
              await (allPaused ? resumeAll(state.repo, today) : pauseAll(state.repo, today));
              notifyChanged();
              showToast({ message: allPaused ? nl.habits.resumedAll : nl.habits.pausedAll });
            },
          }, allPaused ? nl.habits.resumeAll : nl.habits.pauseAll)
          : null,
        habits.length === 0 ? h('p', { class: 'muted' }, nl.habits.empty) : null,
        section('active'),
        section('paused'),
        section('planned'),
        section('graduated', { collapsed: true }),
        section('archived', { collapsed: true }));
    },
  });
}
