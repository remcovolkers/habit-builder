// Feedback geven: een blad boven de huidige pagina (docs/FEEDBACK.md). Geen aparte pagina: je raakt niets kwijt en hoeft nergens heen.
// Een soort kiezen, iets schrijven, en zichtbaar welke context er meegaat. Het e-mailadres gaat alleen mee als je ingelogd bent én het vinkje aanzet.
import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { charCounter } from './char-counter.js';
import { showToast } from './toast.js';
import { account } from '../account.js';
import { markFeedbackSent } from '../feedback-state.js';
import * as auth from '../../data/auth.js';
import { FEEDBACK_BODY_MAX, FEEDBACK_KINDS, sendFeedback, toFeedbackError } from '../../data/feedback-remote.js';
import { routeForFeedback, validateFeedback } from '../../app/feedback.js';
import { config } from '../../config.js';
import { nl } from '../../content/nl.js';

const f = nl.feedback;

/** `opener`: de knop die het blad opende; de focus gaat er na het sluiten naar terug (niet elke browser geeft een knop bij een tik focus). */
export function openFeedbackSheet({ opener = null } = {}) {
  let kind = null;
  let busy = false;
  const route = routeForFeedback(location.hash);
  const errorEl = () => h('p', { class: 'field__error', role: 'alert', hidden: true });
  const kindError = errorEl();
  const textError = errorEl();
  const sendError = errorEl();

  const kindGroup = h('div', { class: 'choices choices--reasons', role: 'radiogroup', 'aria-labelledby': 'feedbackKindLabel' },
    ...FEEDBACK_KINDS.map((value) => h('label', { class: 'choice' },
      h('input', {
        class: 'choice__input', type: 'radio', name: 'feedbackKind', value,
        onchange: () => { kind = value; kindError.hidden = true; },
      }),
      h('span', { class: 'choice__face choice__face--text choice__face--reason' }, f.kinds[value]))));

  const text = h('textarea', { id: 'feedbackText', class: 'input', rows: 5, placeholder: f.textPlaceholder, 'aria-describedby': 'feedbackTextError' });
  textError.id = 'feedbackTextError';

  // het e-mailadres kan alleen mee als er een account is; zonder account of zonder vinkje blijft het bericht anoniem
  const contact = account.status === 'signed-in' ? h('input', { id: 'feedbackContact', type: 'checkbox' }) : null;

  const show = (el, message) => { el.textContent = message; el.hidden = false; };

  async function submit() {
    if (busy) return false;
    for (const el of [kindError, textError, sendError]) el.hidden = true;
    const errors = validateFeedback({ kind, body: text.value });
    if (errors.length > 0) {
      for (const { field, code } of errors) show(field === 'kind' ? kindError : textError, f.errors[field][code]);
      (errors[0].field === 'kind' ? kindGroup.querySelector('input') : text).focus();
      return false;
    }
    busy = true;
    try {
      await sendFeedback(() => auth.getClient(), { kind, body: text.value.trim(), route, version: config.appVersion, contact: Boolean(contact?.checked) });
    } catch (error) {
      show(sendError, f.errors[toFeedbackError(error).code] ?? f.errors.unknown); // de tekst blijft staan: bij een fout hoef je niets over te typen
      return false;
    } finally {
      busy = false;
    }
    markFeedbackSent();
    showToast({ message: f.thanks });
    return true;
  }

  openDialog({
    title: f.title,
    description: f.intro,
    className: 'dialog--feedback',
    content: h('div', { class: 'feedback-form stack' },
      h('div', { class: 'field' },
        h('p', { class: 'field__label', id: 'feedbackKindLabel' }, f.kindLabel),
        kindGroup,
        kindError),
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'feedbackText' }, f.textLabel),
        text,
        charCounter(text, FEEDBACK_BODY_MAX),
        textError),
      contact
        ? h('div', { class: 'field' },
          h('label', { class: 'switch' }, contact, h('span', null, f.contactLabel)),
          h('p', { class: 'field__hint' }, f.contactHint))
        : null,
      h('p', { class: 'field__hint feedback-form__context' }, f.context(route, config.appVersion)),
      sendError),
    actions: [{ label: f.send, variant: 'primary', onClick: submit }],
    onClose: () => opener?.focus(),
  });
}
