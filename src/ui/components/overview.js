import { habitIcon } from './habit-icon.js';
import { h } from '../dom.js';
import { buildDayDetail, buildPeriodOverview, periodOffset } from '../../app/overview.js';
import { isoWeek } from '../../domain/dates.js';
import { formatDateLong, formatDateShort } from '../../app/format.js';
import { nl } from '../../content/nl.js';
import { openDialog } from './dialog.js';

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

/** Onder de datum: waar je staat ten opzichte van nu ("Deze week", "Vorige maand", "3 weken geleden"). */
function relativeLabel(o, today) {
  const words = nl.stats.overview.relative[o.period];
  const offset = periodOffset({ period: o.period, start: o.start, today });
  if (offset === 0) return words.current;
  if (offset === -1) return words.previous;
  if (offset === 1) return words.next;
  return offset < 0 ? words.ago(-offset) : words.ahead(offset);
}

const dayText = (day, today) => {
  const date = `${nl.weekdays.long[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(day.date.slice(8, 10))}`;
  if (day.total === 0) return `${date}: ${nl.stats.overview.nothingPlanned}`;
  return `${date}: ${day.date > today ? nl.stats.overview.planned(day.total) : nl.stats.overview.doneOf(day.done, day.total)}`;
};

/**
 * Overzicht per week of maand voor Voortgang: de keuze tussen week en maand, het bladeren (onbeperkt, ook naar periodes zonder gegevens)
 * en een raster met per dag hoeveel van het geplande gedaan is. De gekozen periode hoort bij het hele scherm (tegels en review),
 * dus die houdt het scherm bij: `choice` is { period, anchor } en `onChange(choice)` meldt een nieuwe keuze.
 */
export function overviewSection(snapshot, today, choice, onChange) {
  const o = nl.stats.overview;
  const data = buildPeriodOverview({ snapshot, today, period: choice.period, anchor: choice.anchor });
  const go = (anchor) => onChange({ period: choice.period, anchor });
  const step = (key, label, target, symbol) => h('button', {
    type: 'button', class: 'icon-button', dataset: { focusKey: key }, 'aria-label': label, onclick: () => go(target.anchor),
  }, symbol);

  const { percent, done, total } = data.totals;
  let summary = o.summary(done, total, percent);
  if (data.isFuture) summary = data.planned > 0 ? o.plannedPeriod(data.planned) : o.nothingPlannedYet;
  else if (total === 0) summary = o.nothingPlannedPeriod;

  return h('section', { class: 'section overview', 'aria-labelledby': 'overview-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'overview-title', class: 'section__title' }, o.title),
      // terug naar nu staat in de kop: zo wordt het overzicht niet hoger zodra je ergens anders staat
      data.isCurrent
        ? null
        : h('button', { type: 'button', class: 'button button--ghost button--small overview__today', dataset: { focusKey: 'current' }, onclick: () => onChange({ period: choice.period, anchor: today }) },
          o.backToCurrent[choice.period]),
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': o.periodLabel },
        ...['week', 'month'].map((period) => h('label', { class: 'segmented__item' },
          h('input', {
            class: 'choice__input', type: 'radio', name: 'overviewPeriod', value: period, checked: period === choice.period,
            dataset: { focusKey: `period:${period}` },
            onchange: () => onChange({ period, anchor: choice.anchor }),
          }),
          h('span', { class: 'segmented__face' }, o[period]))))),
    h('div', { class: 'overview__nav' },
      step('prev', o.previous, data.previous, '‹'),
      h('div', { class: 'overview__label', 'aria-live': 'polite' },
        h('strong', { class: 'overview__label-main' }, periodLabel(data)),
        // waar je staat en hoe het ging, op één regel (de samenvatting hoort bij de periode, dus bij de datum)
        h('span', { class: 'overview__label-sub' },
          [data.period === 'week' ? o.weekNumber(isoWeek(data.start)) : null, relativeLabel(data, today), summary].filter(Boolean).join(' · '))),
      step('next', o.next, data.next, '›')),
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
    })));
}
