// Zo werkt het (#/uitleg): de naslag bij de app (docs/ONBOARDING.md O1). Statisch, werkt offline en zonder account.
import { h } from '../dom.js';
import { nl } from '../../content/nl.js';
import { GUIDE_COUNTER, GUIDE_SECTIONS, GUIDE_TYPES } from '../../content/guide.js';
import { INTRO_HASH } from '../intro.js';

const g = nl.guide;

function typeList() {
  const item = (title, { text, example }) => h('li', { class: 'guide__type' },
    h('span', { class: 'guide__type-title' }, title),
    h('span', { class: 'guide__type-text' }, text),
    h('span', { class: 'guide__type-example' }, g.example(example)));
  return h('ul', { class: 'guide__types' },
    ...GUIDE_TYPES.map((type) => item(nl.form.scheduleTypes[type.key], type)),
    item(g.counter, GUIDE_COUNTER));
}

export function guideView() {
  return h('div', { class: 'guide page' },
    h('div', { class: 'page-header' },
      h('a', { class: 'back-link', href: '#/settings' }, `‹ ${nl.nav.settings}`),
      h('h1', { class: 'page-title' }, g.title)),
    // op desktop scrolt de pagina niet zelf (docs/SCROLLEN.md): de kop blijft staan en de uitleg scrolt in `page__scroll`
    h('div', { class: 'page__scroll guide__scroll' },
      h('div', { class: 'detail guide__body' },
        h('p', { class: 'section__hint' }, g.intro),
        ...GUIDE_SECTIONS.map((section) => h('section', { class: 'section guide__section', id: `uitleg-${section.id}`, 'aria-labelledby': `uitleg-${section.id}-title` },
          h('h2', { class: 'section__title', id: `uitleg-${section.id}-title` }, section.title),
          ...section.paragraphs.map((text) => h('p', null, text)),
          section.types ? typeList() : null)),
        h('section', { class: 'section guide__section' },
          h('p', { class: 'section__hint' }, g.replayHint),
          h('a', { class: 'button button--secondary button--block', id: 'replayIntro', href: INTRO_HASH }, g.replay)))));
}
