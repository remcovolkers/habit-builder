import { habitIcon } from '../components/habit-icon.js';
import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { nl } from '../../content/nl.js';
import { emptyState } from '../components/empty-state.js';
import { fab } from '../components/fab.js';
import { countPlanSkipped, countToPlan, planWeekPrompt } from '../components/week-planner.js';
import { formatDateShort, formatSchedule } from '../../app/format.js';
import { pauseAll, reorderHabit, resumeAll } from '../../app/actions.js';
import { habitRowInfo, isFlexible } from '../../app/habits-overview.js';
import { byOrder } from '../../app/ordering.js';
import { habitDayparts, hasMultipleDayparts } from '../../domain/dayparts.js';
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

function dots(count, target) {
  return h('span', { class: 'dots', 'aria-hidden': 'true' },
    ...Array.from({ length: Math.min(target, 7) }, (_, i) => h('i', { class: i < count ? 'is-on' : '' })));
}

/** De statusregel onder de naam: de fase, en bij een flexibele taak hoe ver deze week of maand is (en of hij dreigt te falen). */
function statusLine(habit, section, info) {
  const chips = [];
  if (section === 'active' && info.phase) {
    const { key, unit, day } = info.phase;
    chips.push(h('span', { class: 'badge badge--phase' }, key === 'established' ? nl.detail.phases.established : `${nl.detail.phases[key]} · ${unit === 'times' ? nl.detail.time(day) : nl.detail.day(day)}`));
  } else if (section === 'graduated') {
    chips.push(h('span', { class: 'badge badge--phase' }, nl.detail.phases.established));
  }
  if (section === 'active' && info.period) {
    const { span, count, target, urgent } = info.period;
    chips.push(h('span', { class: 'habit-row__progress' },
      dots(count, target),
      h('span', null, span === 'week' ? nl.today.progressWeek(count, target) : nl.today.progressMonth(count, target))));
    if (urgent) chips.push(h('span', { class: 'badge badge--risk' }, nl.today.pool.urgentTitle));
  }
  return chips.length > 0 ? h('span', { class: 'habit-row__status' }, ...chips) : null;
}

function row(habit, section, today, info, order = null) {
  const meta = [formatSchedule(currentSchedule(habit, today))];
  if (hasMultipleDayparts(habit)) meta.push(habitDayparts(habit).map((part) => nl.dayparts[part].toLowerCase()).join(' en '));
  if (section === 'planned') meta.push(nl.habits.startsOn(formatDateShort(habit.startDate)));
  return h('li', { class: 'habit-row', dataset: { color: habit.color, section, reordering: order ? 'true' : null } },
    h('a', { class: 'habit-row__link', href: `#/habits/${encodeURIComponent(habit.id)}` },
      h('span', { class: 'habit-row__icon', 'aria-hidden': 'true' }, habitIcon(habit.icon)),
      h('span', { class: 'habit-row__body' },
        h('span', { class: 'habit-row__name' }, habit.name),
        h('span', { class: 'habit-row__meta' }, meta.join(' · ')),
        statusLine(habit, section, info)),
      order ? null : h('span', { class: 'habit-row__chevron', 'aria-hidden': 'true' }, '›')),
    order ? h('div', { class: 'habit-row__moves' }, moveButton(habit, -1, order.ids, order.index > 0), moveButton(habit, 1, order.ids, order.index < order.ids.length - 1)) : null);
}

export function habitsView() {
  return liveView({
    className: 'habits page',
    load: async () => state.repo.snapshot(),
    render: (snapshot) => {
      const { habits, pauses } = snapshot;
      const { today } = state;
      // lopende habits splitsen we in vaste dagen en flexibel (N× per week of maand): die tweede soort plan je zelf in
      const groups = { fixed: [], flexible: [], paused: [], planned: [], graduated: [], archived: [] };
      for (const habit of [...habits].sort(byOrder)) {
        const key = sectionOf(habit, pauses.filter((p) => p.habitId === habit.id), today);
        groups[key === 'active' ? (isFlexible(habit, today) ? 'flexible' : 'fixed') : key].push(habit);
      }
      const running = [...groups.fixed, ...groups.flexible, ...groups.paused];
      const allPaused = running.length > 0 && groups.fixed.length + groups.flexible.length === 0;
      const infoOf = new Map(habits.map((habit) => [habit.id, habitRowInfo({ habit, snapshot, today })]));

      const section = (key, { collapsed = false, title = nl.habits.sections[key], hint = null, intro = null } = {}) => {
        if (groups[key].length === 0) return null;
        const ids = groups[key].map((habit) => habit.id);
        const canOrder = reordering && !collapsed && ids.length > 1;
        const sectionKey = key === 'fixed' || key === 'flexible' ? 'active' : key;
        const list = h('ul', { class: 'card-list' }, ...groups[key].map((habit, index) => row(habit, sectionKey, today, infoOf.get(habit.id), canOrder ? { ids, index } : null)));
        return collapsed
          ? h('details', { class: 'section' }, h('summary', { class: 'section__title' }, `${title} (${groups[key].length})`), list)
          : h('section', { class: 'section' },
            h('h2', { class: 'section__title' }, title),
            hint ? h('p', { class: 'section__hint' }, hint) : null,
            intro, // wat er bij deze groep te doen is, in woorden (bijvoorbeeld "Nog 2 taken om in te plannen" bij Flexibel)
            list);
      };

      const orderable = ['fixed', 'flexible', 'paused', 'planned'];
      const canReorder = orderable.some((k) => groups[k].length > 1);
      if (!canReorder) reordering = false;
      const hasFlexible = groups.flexible.length > 0;

      return h('div', { class: 'page__frame' },
        h('header', { class: 'page-header' },
          h('h1', { class: 'page-title' }, nl.habits.title),
          h('a', { class: 'button button--primary desktop-only', href: '#/habits/new' }, nl.habits.new)),
        // één werkbalk met de acties op vaste plekken, in plaats van losse knoppen onder elkaar
        canReorder || running.length > 0
          ? h('div', { class: 'habits__tools', role: 'toolbar', 'aria-label': nl.habits.toolsLabel },
            canReorder
              ? h('button', {
                type: 'button', id: 'reorderToggle', class: `button button--small ${reordering ? 'button--secondary' : 'button--ghost'}`, 'aria-pressed': reordering ? 'true' : 'false',
                onclick: () => { reordering = !reordering; notifyChanged(); },
              }, reordering ? nl.habits.reorder.done : nl.habits.reorder.start)
              : null,
            running.length > 0 && !reordering
              ? h('button', {
                type: 'button',
                class: 'button button--ghost button--small',
                onclick: async () => {
                  await (allPaused ? resumeAll(state.repo, today) : pauseAll(state.repo, today));
                  notifyChanged();
                  showToast({ message: allPaused ? nl.habits.resumedAll : nl.habits.pausedAll });
                },
              }, allPaused ? nl.habits.resumeAll : nl.habits.pauseAll)
              : null,
            reordering ? h('p', { class: 'section__hint habits__hint' }, nl.habits.reorder.hint) : null)
          : null,
        // de kop en de werkbalk hierboven blijven staan, de lijsten scrollen (alleen op desktop; op de telefoon scrolt de pagina)
        h('div', { class: 'page__scroll' },
          habits.length === 0
            ? emptyState({
              art: 'habits', title: nl.habits.emptyTitle, text: nl.habits.empty, starters: true, // de actie staat al in de kop (desktop) en in de zwevende knop (mobiel)
            })
            : null,
          section('fixed', { title: hasFlexible ? nl.habits.sections.fixed : nl.habits.sections.active }),
          section('flexible', { title: nl.habits.sections.flexible, hint: nl.habits.flexibleHint, intro: reordering ? null : planWeekPrompt({ toPlan: countToPlan(snapshot, today), skipped: countPlanSkipped(snapshot, today) }) }),
          section('paused'),
          section('planned'),
          section('graduated', { collapsed: true }),
          section('archived', { collapsed: true })),
        fab({ href: '#/habits/new', label: nl.habits.new }));
    },
  });
}
