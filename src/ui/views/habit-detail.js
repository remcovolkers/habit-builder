import { h } from '../dom.js';
import { liveView } from '../live.js';
import { notifyChanged, state } from '../state.js';
import { showToast } from '../components/toast.js';
import { openDialog } from '../components/dialog.js';
import { icon } from '../svg.js';
import { mascot } from '../components/mascot.js';
import { nl } from '../../content/nl.js';
import { TIPS } from '../../content/tips.js';
import { buildHabitDetail } from '../../app/habit-detail.js';
import { formatDateShort, formatSchedule } from '../../app/format.js';
import {
  archiveHabit, graduateHabit, pauseHabit, rateAutomaticity, resumeHabit, setMaintenance, unarchiveHabit,
} from '../../app/actions.js';
import { currentSchedule } from './habits.js';

const PHASE_INDEX = { planned: -1, starting: 0, building: 1, established: 2 };

function phaseBar(detail) {
  const { phaseBar: bar, stats } = detail;
  const phases = h('div', { class: 'phases' },
    ...bar.fills.map((fill) => {
      const seg = h('i', { class: 'phase-seg' });
      seg.style.setProperty('--fill', String(fill));
      return seg;
    }),
    h('i', { class: 'phase-marker' }));
  const labels = h('div', { class: 'phase-labels' },
    ...nl.detail.phaseLabels.map((label, i) => h('span', { class: i === PHASE_INDEX[stats.phase.phase] ? 'on' : null }, label)));
  for (const el of [phases, labels]) bar.sizes.forEach((size, i) => el.style.setProperty(`--s${i + 1}`, `${size}fr`));
  phases.lastChild.style.setProperty('--m', String(bar.markerPercent));
  return h('div', { class: 'phase-wrap' }, phases, labels);
}

const pluralUnit = (span, n) => nl.detail.units[span][n === 1 ? 0 : 1];

function tile(label, value, unit, extra) {
  return h('div', { class: 'tile' },
    h('span', { class: 'tile__label' }, label),
    h('span', { class: `tile__value${label === nl.detail.tiles.streak ? ' shimmer' : ''}` }, value, unit ? h('small', null, unit) : null),
    extra);
}

function meter(percent) {
  const fill = h('div', { class: 'meter__fill' });
  fill.style.setProperty('--p', String(percent));
  return h('div', { class: 'meter', 'aria-hidden': 'true' }, fill);
}

function heatmapCard(detail) {
  const cells = detail.heatmap.weeks.flat();
  const done = cells.filter((c) => c.state === 'done' || c.state === 'minimal').length;
  const missed = cells.filter((c) => c.state === 'missed').length;
  const legend = nl.detail.heatmap.legend;
  const legendItem = (stateName, label, extra = '') => h('span', null, h('i', { class: `cell cell--${stateName} ${extra}` }), label);
  return h('section', { class: 'card card--quiet' },
    h('h2', { class: 'section__title' }, nl.detail.heatmap.title),
    h('div', { class: 'heat', role: 'img', 'aria-label': nl.detail.heatmap.summary(done, missed) },
      ...nl.detail.heatmap.days.map((day) => h('span', { class: 'heat__day', 'aria-hidden': 'true' }, day)),
      ...cells.map((c) => h('i', { class: `cell cell--${c.state}${c.today ? ' cell--today' : ''}`, 'aria-hidden': 'true', title: `${formatDateShort(c.date)}` }))),
    h('div', { class: 'legend' },
      legendItem('done', legend.done), legendItem('minimal', legend.minimal), legendItem('skipped', legend.skipped),
      legendItem('paused', legend.paused), legendItem('missed', legend.missed), legendItem('none', legend.none),
      legendItem('none', legend.today, 'cell--today')));
}

function criterionRow(criterion, detail) {
  const g = nl.detail.graduation;
  if (criterion.key === 'days') {
    return h('li', null,
      h('i', { class: `ck ${criterion.met ? 'ck--ok' : 'ck--part'}` }, criterion.met ? '✓' : '·'),
      g.days(criterion.value, criterion.required),
      h('span', { class: `checklist__value${criterion.met ? ' checklist__value--ok' : ''}` }, g.daysValue(criterion.value, criterion.required)));
  }
  if (criterion.key === 'consistency') {
    const pct = criterion.value === null ? null : Math.round(criterion.value * 100);
    return h('li', null,
      h('i', { class: `ck ${criterion.met ? 'ck--ok' : pct === null ? '' : 'ck--part'}` }, criterion.met ? '✓' : pct === null ? '?' : '·'),
      g.consistency,
      h('span', { class: `checklist__value${criterion.met ? ' checklist__value--ok' : ''}` }, pct === null ? nl.detail.noData : `${pct}%${criterion.met ? ' ✓' : ''}`));
  }
  return h('li', null,
    h('i', { class: `ck ${criterion.met ? 'ck--ok' : 'ck--part'}` }, criterion.met ? '✓' : '·'),
    g.automaticity,
    h('span', { class: `checklist__value${criterion.met ? ' checklist__value--ok' : ''}` }, `${criterion.value ?? nl.detail.noData}/5${criterion.met ? ' ✓' : ''}`));
}

function graduationCard(detail, refresh) {
  const { habit, stats } = detail;
  const g = nl.detail.graduation;
  if (stats.graduated) {
    const since = habit.graduatedAt ? formatDateShort(habit.graduatedAt) : null;
    return h('section', { class: 'card' },
      h('h2', { class: 'section__title' }, nl.detail.phases.established),
      since ? h('p', { class: 'card__text muted' }, g.since(since)) : null,
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox',
          id: 'maintenance',
          checked: habit.maintenance === true,
          onchange: async (event) => {
            await setMaintenance(state.repo, habit, event.target.checked);
            notifyChanged();
            showToast({ message: event.target.checked ? g.maintenanceOn : g.maintenanceOff });
          },
        }),
        h('span', null, g.maintenance)));
  }

  const rows = stats.graduation.criteria.map((c) => criterionRow(c, detail));
  if (!detail.useAutomaticity) {
    rows.push(h('li', null,
      h('i', { class: 'ck' }, '?'),
      h('span', null, g.automaticity, ' ', h('span', { class: 'xs muted' }, g.optional)),
      h('span', { class: 'checklist__value' }, g.notEntered)));
  }

  const confirm = () => openDialog({
    title: g.confirmTitle,
    description: g.confirmText(habit.name),
    actions: [{
      label: g.confirm,
      variant: 'primary',
      onClick: async () => {
        await graduateHabit(state.repo, habit, state.today);
        notifyChanged();
        showToast({ message: g.done(habit.name) });
      },
    }],
  });

  const hint = detail.remainingDays > 0 ? g.remaining(detail.remainingDays) : detail.canGraduate ? g.ready : g.almost;
  return h('section', { class: 'card' },
    h('h2', { class: 'section__title' }, g.title),
    h('ul', { class: 'checklist' }, ...rows),
    h('button', { type: 'button', id: 'graduate', class: `button button--block${detail.canGraduate ? ' button--primary' : ''}`, disabled: !detail.canGraduate, onclick: confirm }, g.button),
    h('p', { class: 'xs muted card__text' }, hint));
}

function automaticityCard(detail) {
  const { habit, ratingThisWeek } = detail;
  if (habit.status !== 'active' && habit.status !== 'graduated') return null;
  const a = nl.detail.automaticity;
  return h('section', { class: 'card card--quiet' },
    h('h2', { class: 'section__title' }, a.title),
    h('p', { class: 'xs muted card__text' }, a.hint),
    h('div', { class: 'rating', role: 'group', 'aria-label': a.title },
      ...[1, 2, 3, 4, 5].map((score) => h('button', {
        type: 'button',
        'aria-pressed': ratingThisWeek?.score === score ? 'true' : 'false',
        'aria-label': a.scoreLabel(score),
        dataset: { focusKey: `rate:${score}` },
        onclick: async () => {
          await rateAutomaticity(state.repo, { habitId: habit.id, score }, state.today);
          notifyChanged();
          showToast({ message: a.saved(score) });
        },
      }, String(score)))));
}

function renderDetail(detail) {
  const { habit, stats } = detail;
  const { today } = state;
  const schedule = formatSchedule(currentSchedule(habit, today));
  const phaseKey = stats.phase.phase;
  const pct = (n) => Math.round(n * 100);
  const act = (fn, message) => async () => {
    await fn();
    notifyChanged();
    showToast({ message });
  };
  const tip = TIPS[detail.tipKey];

  return h('div', null,
    h('div', { class: 'topbar' },
      h('a', { class: 'icon-button', href: '#/habits', 'aria-label': nl.detail.back }, icon('back')),
      h('span', { class: 'kicker' }, nl.detail.kicker),
      h('a', { class: 'icon-button', href: `#/habits/${encodeURIComponent(habit.id)}/edit`, 'aria-label': nl.detail.edit }, icon('edit'))),

    h('div', { class: 'detail detail--grid' },
     h('div', { class: 'detail__primary' },
      h('section', { class: 'card card--hero' },
        mascot(`phase.${phaseKey}`, 'hero__mascot'),
        h('div', { class: 'hero__top' },
          h('span', { class: 'habit-card__icon', dataset: { color: habit.color }, 'aria-hidden': 'true' }, habit.icon),
          h('div', null,
            h('h1', { class: 'page-title hero__name' }, habit.name),
            h('span', { class: 'hero__meta' }, [schedule, nl.dayparts[habit.daypart]].join(' · ')))),
        h('div', { class: 'hero__row' },
          h('span', { class: 'badge-group' },
            h('span', { class: `badge badge--phase badge--${phaseKey}` }, nl.detail.phases[phaseKey]),
            detail.pausedNow ? h('span', { class: 'badge badge--phase badge--paused' }, nl.detail.pausedBadge) : null,
            habit.status === 'archived' ? h('span', { class: 'badge badge--phase badge--paused' }, nl.detail.archivedBadge) : null),
          h('span', { class: 'hero__day' }, h('b', { class: 'num' }, nl.detail.day(stats.activeDays)), ' ', h('span', { class: 'muted' }, nl.detail.ofTotal(detail.graduationDays)))),
        phaseBar(detail),
        h('p', { class: 'hero__note' }, nl.detail.theory)),

      h('section', { class: 'tiles' },
        tile(nl.detail.tiles.strength, String(pct(stats.strength)), '%', meter(pct(stats.strength))),
        tile(nl.detail.tiles.streak, String(stats.streaks.current), pluralUnit(detail.streakSpan, stats.streaks.current),
          h('span', { class: 'tile__hint' }, nl.detail.streakBest(stats.streaks.best, pluralUnit(detail.streakSpan, stats.streaks.best)))),
        tile(nl.detail.tiles.consistency, stats.consistency.rate === null ? nl.detail.noData : String(pct(stats.consistency.rate)), stats.consistency.rate === null ? '' : '%',
          h('span', { class: 'tile__hint' }, nl.detail.consistencyHint)),
        tile(nl.detail.tiles.total, String(stats.totalDone), '×',
          h('span', { class: 'tile__hint' }, nl.detail.totalSince(formatDateShort(habit.startDate))))),

      heatmapCard(detail)),
     h('div', { class: 'detail__secondary' },
      graduationCard(detail),
      automaticityCard(detail),

      habit.why ? h('section', { class: 'card card--quiet' }, h('span', { class: 'kicker' }, nl.detail.personal.why), h('p', { class: 'quote' }, `“${habit.why}”`)) : null,
      habit.cue ? h('section', { class: 'card card--quiet' }, h('span', { class: 'kicker' }, nl.detail.personal.cue), h('p', { class: 'card__text' }, habit.cue)) : null,
      habit.minimalVersion ? h('section', { class: 'card card--quiet' }, h('span', { class: 'kicker' }, nl.detail.personal.minimal), h('p', { class: 'card__text' }, habit.minimalVersion)) : null,

      tip
        ? h('section', { class: 'card card--quiet tip', dataset: { tip: detail.tipKey } },
          h('span', { class: 'tip__icon', 'aria-hidden': 'true' }, tip.emoji),
          h('div', null, h('span', { class: 'kicker' }, nl.detail.tip), h('p', { class: 'tip__title' }, tip.title), h('p', { class: 'tip__text' }, tip.text)))
        : null,

      h('section', { class: 'detail__actions' },
        h('a', { class: 'button button--secondary', href: `#/habits/${encodeURIComponent(habit.id)}/edit` }, nl.detail.edit),
        habit.status === 'archived'
          ? h('button', { type: 'button', class: 'button button--secondary', onclick: act(() => unarchiveHabit(state.repo, habit, today), nl.form.toasts.unarchived) }, nl.detail.actions.unarchive)
          : [
            h('button', {
              type: 'button',
              class: 'button button--secondary',
              onclick: detail.pausedNow
                ? act(() => resumeHabit(state.repo, habit.id, today), nl.form.toasts.resumed)
                : act(() => pauseHabit(state.repo, habit.id, today), nl.form.toasts.paused),
            }, detail.pausedNow ? nl.detail.actions.resume : nl.detail.actions.pause),
            h('button', { type: 'button', class: 'button button--danger', onclick: act(() => archiveHabit(state.repo, habit, today), nl.form.toasts.archived) }, nl.detail.actions.archive),
          ]))));
}

export function habitDetailView({ id }) {
  return liveView({
    className: 'habit-detail',
    load: async () => {
      const snapshot = await state.repo.snapshot();
      const habit = snapshot.habits.find((x) => x.id === id) ?? null;
      return habit ? buildHabitDetail({ habit, snapshot, today: state.today }) : null;
    },
    render: (detail) => detail
      ? renderDetail(detail)
      : h('div', { class: 'empty' }, h('p', null, nl.form.notFound), h('a', { class: 'button button--ghost', href: '#/habits' }, nl.habits.title)),
  });
}
