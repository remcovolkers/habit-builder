import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { fab } from '../components/fab.js';
import { formatDateShort, formatSchedule } from '../../app/format.js';
import { pauseAll, reorderHabit, resumeAll } from '../../app/actions.js';
import { byOrder } from '../../app/ordering.js';
import { scheduleAt } from '../../domain/schedule.js';

export const currentSchedule = (habit, today) => scheduleAt(habit.schedules, today) ?? habit.schedules[0].schedule;

const isPausedOn = (pauses, today) => pauses.some((p) => today >= p.from && (p.to == null || today <= p.to));

function sectionOf(habit, pauses, today) {
  if (habit.status === 'archived') return 'archived';
  if (habit.status === 'graduated') return 'graduated';
  if (habit.startDate > today) return 'planned';
  return isPausedOn(pauses, today) ? 'paused' : 'active';
}

// of je de volgorde aanpast; blijft staan als het scherm opnieuw wordt getekend
let reordering = false;

function moveButton(habit, direction, ids, enabled) {
  const up = direction < 0;
  return h('button', {
    type: 'button',
    class: 'icon-button habit-row__move',
    dataset: { focusKey: `move:${habit.id}:${up ? 'up' : 'down'}`, focusFallback: `move:${habit.id}:${up ? 'down' : 'up'}` },
    'aria-label': up ? nl.habits.reorder.up(habit.name) : nl.habits.reorder.down(habit.name),
    disabled: !enabled,
    onclick: async () => {
      await reorderHabit(state.repo, { habitId: habit.id, visibleIds: ids, direction });
      notifyChanged();
    },
  }, up ? '↑' : '↓');
}

function row(habit, section, today, order = null) {
  const meta = [formatSchedule(currentSchedule(habit, today))];
  if (section === 'planned') meta.push(nl.habits.startsOn(formatDateShort(habit.startDate)));
  return h('li', { class: 'habit-row', dataset: { color: habit.color, section, reordering: order ? 'true' : null } },
    h('a', { class: 'habit-row__link', href: `#/habits/${encodeURIComponent(habit.id)}` },
      h('span', { class: 'habit-row__icon', 'aria-hidden': 'true' }, habit.icon),
      h('span', { class: 'habit-row__body' },
        h('span', { class: 'habit-row__name' }, habit.name),
        h('span', { class: 'habit-row__meta' }, meta.join(' · '))),
      order ? null : h('span', { class: 'habit-row__chevron', 'aria-hidden': 'true' }, '›')),
    order ? h('div', { class: 'habit-row__moves' }, moveButton(habit, -1, order.ids, order.index > 0), moveButton(habit, 1, order.ids, order.index < order.ids.length - 1)) : null);
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
      for (const habit of [...habits].sort(byOrder)) {
        groups[sectionOf(habit, pauses.filter((p) => p.habitId === habit.id), today)].push(habit);
      }
      const running = [...groups.active, ...groups.paused];
      const allPaused = running.length > 0 && groups.active.length === 0;

      const section = (key, { collapsed = false } = {}) => {
        if (groups[key].length === 0) return null;
        const ids = groups[key].map((habit) => habit.id);
        const canOrder = reordering && !collapsed && ids.length > 1;
        const list = h('ul', { class: 'card-list' }, ...groups[key].map((habit, index) => row(habit, key, today, canOrder ? { ids, index } : null)));
        const title = nl.habits.sections[key];
        return collapsed
          ? h('details', { class: 'section' }, h('summary', { class: 'section__title' }, `${title} (${groups[key].length})`), list)
          : h('section', { class: 'section' }, h('h2', { class: 'section__title' }, title), list);
      };

      const canReorder = groups.active.length + groups.paused.length + groups.planned.length > 1 && ['active', 'paused', 'planned'].some((k) => groups[k].length > 1);
      if (!canReorder) reordering = false;

      return h('div', null,
        h('header', { class: 'page-header' },
          h('h1', { class: 'page-title' }, nl.habits.title),
          h('a', { class: 'button button--primary desktop-only', href: '#/habits/new' }, nl.habits.new)),
        canReorder
          ? h('div', { class: 'habits__tools' },
            h('button', {
              type: 'button', id: 'reorderToggle', class: reordering ? 'button button--secondary' : 'button button--ghost', 'aria-pressed': reordering ? 'true' : 'false',
              onclick: () => { reordering = !reordering; notifyChanged(); },
            }, reordering ? nl.habits.reorder.done : nl.habits.reorder.start),
            reordering ? h('p', { class: 'section__hint' }, nl.habits.reorder.hint) : null)
          : null,
        running.length > 0 && !reordering
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
        habits.length === 0
          ? emptyState({
            art: 'habits', title: nl.habits.emptyTitle, text: nl.habits.empty, starters: true, // de actie staat al in de kop (desktop) en in de zwevende knop (mobiel)
          })
          : null,
        section('active'),
        section('paused'),
        section('planned'),
        section('graduated', { collapsed: true }),
        section('archived', { collapsed: true }),
        fab({ href: '#/habits/new', label: nl.habits.new }));
    },
  });
}
