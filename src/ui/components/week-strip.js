import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

/**
 * De week (ma t/m zo) als strook onder de kop van Vandaag: per dag een stipje met hoe het ging, tikken opent die dag.
 * Het zichtbare deel is voor het oog; schermlezers krijgen per dag één zin ("donderdag 15: 2 van 3 gedaan").
 */
export function weekStrip(days, { hrefFor }) {
  return h('nav', { class: 'weekstrip', 'aria-label': nl.today.week.label },
    h('ul', { class: 'weekstrip__list' }, ...days.map((day) => {
      const number = Number(day.date.slice(8, 10));
      const props = { class: 'weekstrip__day', dataset: { state: day.state, today: day.isToday ? 'true' : null, selected: day.isSelected ? 'true' : null } };
      const content = [
        h('span', { class: 'visually-hidden' }, nl.today.week.day(nl.weekdays.long[day.weekdayIndex], number, day)),
        h('span', { class: 'weekstrip__name', 'aria-hidden': 'true' }, nl.weekdays.short[day.weekdayIndex]),
        h('span', { class: 'weekstrip__number', 'aria-hidden': 'true' }, String(number)),
        h('i', { class: 'weekstrip__dot', 'aria-hidden': 'true' }),
      ];
      return h('li', { class: 'weekstrip__item' }, day.selectable
        ? h('a', { ...props, href: hrefFor(day.date), 'aria-current': day.isSelected ? 'page' : null }, ...content)
        : h('span', props, ...content));
    })));
}
