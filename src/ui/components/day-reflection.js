import { h } from '../dom.js';
import { charCounter } from './char-counter.js';
import { nl } from '../../content/nl.js';
import { NOTE_MAX_LENGTH } from '../../domain/constants.js';
import { REFLECTION_SCORES } from '../../domain/reflections.js';

const t = nl.today.reflection;

// wat je typde en nog niet hebt bewaard blijft staan als het scherm zich ververst (een sync, een tik op een kaart)
let draft = null; // { date, note }

/**
 * "Hoe ging je dag?": vijf woorden om uit te kiezen en daaronder, zodra je gekozen hebt, een korte notitie (optioneel). Kiezen bewaart meteen; de notitie
 * bewaar je met de knop. Het telt nergens mee en staat terug in de weekreview (docs/DAGDEEL-EN-DAGREFLECTIE.md).
 *
 * reflection: { score, note } of null; onSave({ score, note }); onClear()
 */
export function dayReflectionCard({ date, isToday, reflection, onSave, onClear }) {
  const score = reflection?.score ?? null;
  const note = h('textarea', {
    id: 'reflectionNote', class: 'input', rows: 2, placeholder: t.notePlaceholder, dataset: { focusKey: 'reflection-note' },
    oninput: () => { draft = { date, note: note.value }; },
  }, draft?.date === date ? draft.note : reflection?.note ?? '');
  const save = (chosen) => { draft = null; return onSave({ score: chosen, note: note.value }); };

  const scale = h('div', { class: 'segmented reflection__scale', role: 'radiogroup', 'aria-label': isToday ? t.questionToday : t.question },
    ...REFLECTION_SCORES.map((value) => h('label', { class: 'segmented__item' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'dayScore', value: String(value), checked: value === score,
        dataset: { focusKey: `reflection:${value}` }, 'aria-label': t.scoreLabel(value, t.scale[value]),
        onchange: () => { if (value !== score) save(value); },
      }),
      h('span', { class: 'segmented__face' }, t.scale[value]))));

  return h('section', { class: 'section reflection', id: 'dayReflection', 'aria-labelledby': 'reflection-title' },
    h('div', { class: 'section-head' }, h('h2', { id: 'reflection-title', class: 'section__title' }, t.title)),
    h('div', { class: 'reflection__card' },
      h('p', { class: 'reflection__question' }, isToday ? t.questionToday : t.question),
      scale,
      score === null ? h('p', { class: 'xs muted' }, t.hint) : null,
      score !== null
        ? h('div', { class: 'field reflection__note' },
          h('label', { class: 'field__label', for: 'reflectionNote' }, t.noteLabel),
          note,
          charCounter(note, NOTE_MAX_LENGTH),
          h('div', { class: 'reflection__actions' },
            h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: 'reflection-save' }, onclick: () => { draft = null; return onSave({ score, note: note.value, noteOnly: true }); } }, t.saveNote),
            h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: 'reflection-clear' }, onclick: () => { draft = null; return onClear(); } }, t.clear)),
          h('p', { class: 'xs muted' }, t.hint))
        : null));
}
