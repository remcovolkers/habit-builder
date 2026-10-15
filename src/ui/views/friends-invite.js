// Een uitnodigingslink openen (#/vrienden/uitnodiging/<code>): eventueel eerst inloggen en meedoen, dan word je meteen vrienden.
import { h } from '../dom.js';
import { account } from '../account.js';
import { social, socialApp } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { onboardingForm, reasonText, rulesList, sharingSummary } from '../components/social-parts.js';
import { parseInviteHash } from '../../app/social.js';
import { nl } from '../../content/nl.js';

const f = nl.friends;

export function friendsInviteView({ code: raw }) {
  const code = parseInviteHash(`#/vrienden/uitnodiging/${raw}`);
  const ui = { phase: 'idle', person: null, reason: null, refreshing: false, offlineUnknown: false };
  let form = null; // één keer per scherm, zodat je invoer en foutmelding een hertekening overleven

  // de uitnodiging blijft bewaard tot ze is afgehandeld: ook als je eerst moet inloggen (of terugkomt van Google)
  if (code) socialApp.rememberInvite(code);

  async function redeem() {
    ui.phase = 'redeeming';
    root.redraw();
    const result = await socialApp.redeemInvite(code);
    if (result.ok) { ui.phase = 'done'; ui.person = result.person; } else { ui.phase = 'failed'; ui.reason = result.reason; }
    root.redraw();
  }

  /** Doet de volgende stap zodra de status het toelaat. */
  function kick() {
    if (!code || account.status !== 'signed-in') return;
    if (social.status === 'unknown' && !ui.refreshing && !ui.offlineUnknown) {
      ui.refreshing = true;
      socialApp.refresh().then((result) => {
        ui.refreshing = false;
        ui.offlineUnknown = !result.ok && result.reason === 'offline' && social.status === 'unknown';
        root.redraw();
      });
      return;
    }
    if (social.status === 'on' && ui.phase === 'idle') redeem();
  }

  const header = h('div', { class: 'page-header' }, h('a', { class: 'back-link', href: '#/vrienden' }, `‹ ${f.title}`), h('h1', { class: 'page-title' }, f.invite.title));
  const card = (...children) => h('div', { class: 'detail' }, header, h('section', { class: 'card friends__message' }, ...children));

  function render() {
    if (!code) return card(h('p', { id: 'inviteInvalid' }, f.invite.invalid), h('a', { class: 'button button--primary', href: '#/vrienden' }, f.title));
    if (account.status === 'restoring') return card(h('p', null, f.restoring));
    if (social.status === 'signed-out') {
      return card(h('h2', { class: 'section__title' }, f.invite.signedOutTitle), h('p', null, f.invite.signedOutText),
        h('a', { class: 'button button--primary', id: 'loginLink', href: '#/login' }, f.signedOut.login));
    }
    if (social.status === 'unavailable') return card(h('h2', { class: 'section__title' }, f.unavailable.title), h('p', null, f.unavailable.text));
    if (ui.offlineUnknown) {
      return card(h('h2', { class: 'section__title' }, f.offline.title), h('p', null, f.offline.text),
        h('button', { type: 'button', id: 'retryInvite', class: 'button button--secondary', onclick: () => { ui.offlineUnknown = false; kick(); root.redraw(); } }, f.invite.retry));
    }
    if (social.status === 'off') {
      return h('div', { class: 'detail' }, header,
        h('section', { class: 'card' }, h('p', { class: 'friends__lead' }, f.intro.forInvite), sharingSummary()),
        h('section', { class: 'card' }, h('h2', { class: 'section__title' }, f.rules.title), rulesList()),
        h('section', { class: 'card' }, (form ??= onboardingForm())));
    }
    if (ui.phase === 'done') {
      return card(h('h2', { class: 'section__title', id: 'inviteSuccess' }, f.invite.success(ui.person?.name ?? '')), h('p', null, f.invite.successText),
        h('a', { class: 'button button--primary', id: 'toBoard', href: '#/vrienden' }, f.invite.toBoard));
    }
    if (ui.phase === 'failed') {
      return card(h('p', { id: 'inviteFailed', role: 'alert' }, ui.reason === 'invalid' ? f.invite.invalid : reasonText(ui.reason)),
        ui.reason === 'invalid'
          ? h('a', { class: 'button button--primary', href: '#/vrienden' }, f.title)
          : h('button', { type: 'button', id: 'retryInvite', class: 'button button--secondary', onclick: () => { ui.phase = 'idle'; kick(); } }, f.invite.retry));
    }
    return card(h('p', { role: 'status' }, f.invite.checking));
  }

  const root = socialLive({ className: 'friends friends--invite', render, afterDraw: kick, onAccount: kick });
  return root;
}
