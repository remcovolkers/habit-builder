import { habitIcon } from './habit-icon.js';
import { fill, h } from '../dom.js';
import { buildDayDetail, buildPeriodOverview } from '../../app/overview.js';
import { formatDateLong, formatDateShort } from '../../app/format.js';
import { nl } from '../../content/nl.js';
import { openDialog } from './dialog.js';

// Welke periode je bekeek blijft staan als het scherm door een wijziging opnieuw wordt getekend.
const chosen = { period: 'week', anchor: null };

/** Het detail van een dag in een blad: per habit hoe het ging, met een knop om het op Vandaag aan te passen. */
function openDayDialog(detail) {
  const o = nl.stats.overview.detail;
  openDialog({
    title: formatDateLong(detail.date),
    content: h('ul', { class: 'overview__detail-list' }, ...detail.items.map((item) =>
      h('li', { class: 'overview__detail-item', dataset: { color: item.color, state: item.state } },
        h('span', { class: 'overview__detail-icon', 'aria-hidden': 'true' }, habitIcon(item.icon)),
        h('span', { class: 'overview__detail-name' }, item.name),
        h('span', { class: 'overview__detail-state' }, o.states[item.state])))),
    actions: detail.editable
      ? [{ label: o.open, variant: 'primary', onClick: () => { location.hash = `#/today?date=${detail.date}`; } }]
      : [],
    cancelLabel: nl.app.close,
  });
}

const periodLabel = (o) => (o.period === 'week'
  ? `${formatDateShort(o.start)} – ${formatDateShort(o.end)}`
  : `${nl.months.long[Number(o.start.slice(5, 7)) - 1]} ${o.start.slice(0, 4)}`);

const dayText = (day, today) => {
  const date = `${nl.weekdays.long[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(day.date.slice(8, 10))}`;
  if (day.total === 0) return `${date}: ${nl.stats.overview.nothingPlanned}`;
  return `${date}: ${day.date > today ? nl.stats.overview.planned(day.total) : nl.stats.overview.doneOf(day.done, day.total)}`;
};

/** Overzicht per week of maand voor Voortgang: een raster met per dag hoeveel van het geplande gedaan is. */
export function overviewSection(snapshot, today) {
  const o = nl.stats.overview;
  const root = h('section', { class: 'section overview', 'aria-labelledby': 'overview-title' });
  if (!chosen.anchor || chosen.anchor > today) chosen.anchor = today;

  function render() {
    const active = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset?.focusKey ?? null;
    const fallbackKey = active?.dataset?.focusFallback ?? null;
    const data = buildPeriodOverview({ snapshot, today, period: chosen.period, anchor: chosen.anchor });
    const go = (anchor) => { chosen.anchor = anchor; render(); };
    const step = (key, label, target, enabled, symbol) => h('button', {
      type: 'button', class: 'icon-button', dataset: { focusKey: key, focusFallback: key === 'prev' ? 'next' : 'prev' }, 'aria-label': label, disabled: !enabled, onclick: () => go(target.anchor),
    }, symbol);

    const { percent, done, total } = data.totals;
    fill(root,
      h('div', { class: 'section-head' },
        h('h2', { id: 'overview-title', class: 'section__title' }, o.title),
        h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': o.periodLabel },
          ...['week', 'month'].map((period) => h('label', { class: 'segmented__item' },
            h('input', {
              class: 'choice__input', type: 'radio', name: 'overviewPeriod', value: period, checked: period === chosen.period,
              dataset: { focusKey: `period:${period}` },
              onchange: () => { chosen.period = period; render(); },
            }),
            h('span', { class: 'segmented__face' }, o[period]))))),
      h('div', { class: 'overview__nav' },
        step('prev', o.previous, data.previous, data.previous.enabled, '‹'),
        h('p', { class: 'overview__label', 'aria-live': 'polite' }, periodLabel(data)),
        step('next', o.next, data.next, data.next.enabled, '›')),
      h('p', { class: 'overview__summary' }, total === 0 ? o.nothingPlannedPeriod : o.summary(done, total, percent)),
      h('div', { class: 'overview__dows', 'aria-hidden': 'true' }, ...nl.weekdays.short.map((name) => h('span', null, name))),
      h('ul', { class: `overview__grid overview__grid--${data.period}` }, ...data.days.map((day) => {
        const selectable = day.inPeriod && day.total > 0;
        const props = { class: 'overview__cell', dataset: { state: day.state, level: String(day.level), today: day.isToday ? 'true' : null } };
        const content = day.inPeriod
          ? [
            h('span', { class: 'visually-hidden' }, dayText(day, today)),
            h('span', { class: 'overview__number', 'aria-hidden': 'true' }, String(Number(day.date.slice(8, 10)))),
            data.period === 'week' && day.total > 0 && day.date <= today
              ? h('span', { class: 'overview__count', 'aria-hidden': 'true' }, `${day.done}/${day.total}`)
              : null,
          ]
          : [];
        return h('li', { class: 'overview__item' }, selectable
          ? h('button', {
            ...props,
            type: 'button',
            'aria-haspopup': 'dialog',
            dataset: { ...props.dataset, focusKey: `day:${day.date}` },
            onclick: () => openDayDialog(buildDayDetail({ snapshot, date: day.date, today })),
          }, ...content)
          : h('span', props, ...content));
      })),
    );

    const find = (key) => (key ? root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null);
    let target = find(focusKey);
    if (!target || target.disabled) target = find(fallbackKey);
    target?.focus({ preventScroll: true });
  }

  render();
  return root;
}
