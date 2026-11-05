import { fill, h } from '../dom.js';
import { icon } from '../svg.js';
import { charCounter } from './char-counter.js';
import { nl } from '../../content/nl.js';
import { NOTE_MAX_LENGTH } from '../../domain/constants.js';
import { REFLECTION_SCORES } from '../../domain/reflections.js';

const t = nl.today.reflection;

// wat je typde en nog niet hebt bewaard blijft staan als het scherm zich ververst (een sync, een tik op een kaart)
let draft = null; // { date, note }
// de dag waarvan het schrijfveld openstaat (ook als er nog niets getypt is)
let opened = null;

/**
 * "Hoe ging je dag?": vijf woorden om uit te kiezen en daaronder, zodra je gekozen hebt, je notitie (optioneel). Kiezen bewaart meteen. Een bewaarde notitie staat
 * als tekst op de kaart, geen invoerveld: met "Notitie aanpassen" (of "Er iets bij schrijven" als er nog geen is) opent het veld, en bewaren sluit het weer.
 * Het telt nergens mee en staat terug in de weekreview (docs/DAGDEEL-EN-DAGREFLECTIE.md).
 *
 * reflection: { score, note } of null; onSave({ score, note }); onClear()
 */
export function dayReflectionCard({ date, isToday, reflection, onSave, onClear }) {
  const score = reflection?.score ?? null;
  const saved = reflection?.note ?? '';
  let editing = opened === date || draft?.date === date;

  const note = h('textarea', {
    id: 'reflectionNote', class: 'input', rows: 3, placeholder: t.notePlaceholder, dataset: { focusKey: 'reflection-note' },
    oninput: () => { draft = { date, note: note.value }; },
  }, draft?.date === date ? draft.note : saved);
  const save = (chosen) => { draft = null; opened = null; return onSave({ score: chosen, note: note.value }); };

  const scale = h('div', { class: 'segmented reflection__scale', role: 'radiogroup', 'aria-label': isToday ? t.questionToday : t.question },
    ...REFLECTION_SCORES.map((value) => h('label', { class: 'segmented__item' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'dayScore', value: String(value), checked: value === score,
        dataset: { focusKey: `reflection:${value}` }, 'aria-label': t.scoreLabel(value, t.scale[value]),
        onchange: () => { if (value !== score) save(value); },
      }),
      h('span', { class: 'segmented__face' }, t.scale[value]))));

  const clear = h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: 'reflection-clear' }, onclick: () => { draft = null; opened = null; return onClear(); } }, t.clear);

  // de notitie: gelezen als tekst, of in het schrijfveld. Wisselen gebeurt hier ter plekke; bewaren ververst de hele pagina (zoals elke wijziging).
  const noteArea = h('div', { class: 'field reflection__note' });
  const renderNote = () => {
    if (editing) {
      fill(noteArea,
        h('label', { class: 'field__label', for: 'reflectionNote' }, t.noteLabel),
        note,
        charCounter(note, NOTE_MAX_LENGTH),
        h('div', { class: 'reflection__actions' },
          h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: 'reflection-save' }, onclick: () => { draft = null; opened = null; return onSave({ score, note: note.value, noteOnly: true }); } }, t.saveNote),
          h('button', { type: 'button', class: 'button button--ghost button--small', dataset: { focusKey: 'reflection-cancel' }, onclick: () => { editing = false; draft = null; opened = null; note.value = saved; renderNote(); noteArea.querySelector('[data-focus-key="reflection-edit"]')?.focus(); } }, t.cancel),
          clear));
      return;
    }
    const open = () => { editing = true; opened = date; renderNote(); note.focus(); };
    fill(noteArea,
      saved !== '' ? h('div', { class: 'reflection__saved' },
        h('span', { class: 'reflection__saved-label' }, t.noteTitle),
        h('p', { class: 'reflection__text', id: 'reflectionText' }, saved)) : null,
      h('div', { class: 'reflection__actions' },
        h('button', { type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: 'reflection-edit' }, onclick: open },
          saved !== '' ? icon('edit') : icon('plus'), saved !== '' ? t.noteEdit : t.noteAdd),
        clear));
  };
  if (score !== null) renderNote();

  return h('section', { class: 'section reflection', id: 'dayReflection', 'aria-labelledby': 'reflection-title' },
    h('div', { class: 'section-head' }, h('h2', { id: 'reflection-title', class: 'section__title' }, t.title)),
    h('div', { class: 'reflection__card' },
      h('p', { class: 'reflection__question' }, isToday ? t.questionToday : t.question),
      scale,
      score === null ? h('p', { class: 'xs muted' }, t.hint) : null,
      score !== null ? noteArea : null,
      score !== null ? h('p', { class: 'xs muted' }, t.hint) : null));
}
