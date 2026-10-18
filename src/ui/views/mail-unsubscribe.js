import { fill, h } from '../dom.js';
import { config } from '../../config.js';
import { unsubscribeWithToken } from '../../data/review-mail-remote.js';
import { nl } from '../../content/nl.js';

/**
 * De landingspagina van de link "Geen mails meer" in de e-mailherinnering: meldt af met de ondertekende code uit de link (zonder inloggen)
 * en biedt "Toch weer ontvangen" aan. De pagina zelf doet niets bij het openen van de link door een mailscanner: pas dit scherm roept de server aan.
 */
export function mailUnsubscribeView({ token }) {
  const m = nl.reviewMail.unsubscribe;
  const root = h('section', { class: 'placeholder mail-unsubscribe' });
  const render = (state) => {
    const undo = async () => {
      render('working');
      render((await unsubscribeWithToken({ supabaseUrl: config.supabaseUrl, token, undo: true })) === 'ok' ? 'resubscribed' : 'failed');
    };
    fill(root,
      h('h1', { class: 'placeholder__title' }, m.title[state]),
      h('p', { class: 'placeholder__text', role: 'status', 'aria-live': 'polite' }, m.text[state]),
      state === 'done' ? h('button', { type: 'button', id: 'mailResubscribe', class: 'button button--secondary', onclick: undo }, m.undo) : null,
      state === 'working' ? null : h('a', { class: 'button button--ghost', href: '#/today' }, m.open));
  };
  render('working');
  unsubscribeWithToken({ supabaseUrl: config.supabaseUrl, token }).then((result) => render(result === 'ok' ? 'done' : result === 'invalid' ? 'invalid' : 'failed'));
  return root;
}
