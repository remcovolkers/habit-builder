import { fill, h } from '../dom.js';
import { account, onAccountChanged } from '../account.js';
import { showToast } from './toast.js';
import * as auth from '../../data/auth.js';
import { fetchReviewMailPref, setReviewMailPref } from '../../data/review-mail-remote.js';
import { nl } from '../../content/nl.js';

/**
 * "E-mail als je even weg bent" voor Instellingen: alleen voor wie is ingelogd (de mail gaat naar het adres van het account).
 * Staat standaard aan; hij gaat alleen uit als je 14 dagen niet in de app was, op vrijdag (week) en de 25e (maand).
 */
export function mailCard() {
  const m = nl.reviewMail;
  const root = h('section', { class: 'section mail-card', id: 'mailCard', hidden: true });
  const input = h('input', { id: 'reviewMail', type: 'checkbox', disabled: true });
  const note = h('p', { class: 'field__hint', role: 'status', 'aria-live': 'polite' });
  let loaded = false;

  input.addEventListener('change', async () => {
    const wanted = input.checked;
    input.disabled = true;
    const result = await setReviewMailPref(() => auth.getClient(), wanted);
    input.disabled = false;
    if (result === null) {
      input.checked = !wanted; // het lukte niet: de schakelaar blijft zoals hij was
      note.textContent = m.failed;
      note.className = 'field__error';
      return;
    }
    note.textContent = '';
    note.className = 'field__hint';
    showToast({ message: result ? m.on : m.off });
  });

  fill(root,
    h('h2', { class: 'section__title' }, m.title),
    h('p', { class: 'section__hint' }, m.hint),
    h('label', { class: 'switch' }, input, h('span', null, m.label)),
    note,
    h('p', { class: 'field__hint' }, m.privacy));

  async function show() {
    root.hidden = account.status !== 'signed-in';
    if (root.hidden || loaded) return;
    loaded = true;
    const pref = await fetchReviewMailPref(() => auth.getClient());
    if (pref === null) { // de server kent de functie (nog) niet, of er is geen verbinding: dan laten we de kaart weg
      root.hidden = true;
      loaded = false;
      return;
    }
    input.checked = pref;
    input.disabled = false;
  }
  show();
  const stop = onAccountChanged(() => (root.isConnected ? show() : stop()));
  return root;
}
