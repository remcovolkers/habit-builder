// Een uitnodigingslink openen (#/vrienden/uitnodiging/<code>). De flow voor een nieuwe gebruiker (docs/ITERATIE-1.2.md §2) is drie momenten:
//   1. welkom: "Anna nodigt je uit" (ook zonder account; de naam komt uit invite_peek)  →  account maken
//   2. één naamstap: "Hoe wil je heten?" (doet meteen mee aan sociaal)
//   3. "Jij en Anna zijn nu vrienden!" (de uitnodiging wordt direct ingewisseld, zonder nog iets te bevestigen)
// Wie al ingelogd is slaat het welkom over; wie al meedoet krijgt direct het laatste scherm.
import { h } from '../dom.js';
import { account } from '../account.js';
import { social, socialApp } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { inviteNameForm, reasonText } from '../components/social-parts.js';
import { state } from '../state.js';
import { INTRO_HASH, introSeen } from '../intro.js';
import { parseInviteHash } from '../../app/social.js';
import { nl } from '../../content/nl.js';

const f = nl.friends;
const t = f.invite;

export function friendsInviteView({ code: raw }) {
  const code = parseInviteHash(`#/vrienden/uitnodiging/${raw}`);
  const ui = { phase: 'idle', person: null, alreadyFriends: false, hasHabits: false, reason: null, refreshing: false, offlineUnknown: false, refreshError: null, peek: null, peeking: false };
  let form = null; // één keer per scherm, zodat je invoer en foutmelding een hertekening overleven

  // de uitnodiging blijft bewaard tot ze is afgehandeld: ook als je eerst moet inloggen (of terugkomt van Google)
  if (code) socialApp.rememberInvite(code);

  const inviterName = () => (ui.peek?.ok ? ui.peek.name : '') || socialApp.pendingInviter();

  async function redeem() {
    ui.phase = 'redeeming';
    root.redraw();
    const result = await socialApp.redeemInvite(code);
    if (result.ok) {
      ui.phase = 'done';
      ui.person = result.person;
      ui.alreadyFriends = result.alreadyFriends === true;
      try { ui.hasHabits = (await state.repo.listHabits()).length > 0; } catch { ui.hasHabits = false; }
    } else {
      ui.phase = 'failed';
      ui.reason = result.reason;
    }
    root.redraw();
  }

  /** Wie nodigt je uit? (Werkt zonder account.) */
  function loadPeek() {
    if (!code || ui.peeking || ui.peek) return;
    ui.peeking = true;
    socialApp.peekInvite(code).then((result) => {
      ui.peeking = false;
      ui.peek = result;
      root.redraw();
    });
  }

  const retryPeek = () => { ui.peek = null; ui.offlineUnknown = false; kick(); root.redraw(); };

  /** Doet de volgende stap zodra de status het toelaat. */
  function kick() {
    if (!code || account.status === 'restoring') return;
    if (social.status === 'signed-out' || social.status === 'off' || social.status === 'on') loadPeek();
    if (account.status !== 'signed-in') return;
    if (social.status === 'unknown' && !ui.refreshing && !ui.offlineUnknown && !ui.refreshError) {
      ui.refreshing = true;
      socialApp.refresh().then((result) => {
        ui.refreshing = false;
        ui.offlineUnknown = !result.ok && result.reason === 'offline' && social.status === 'unknown';
        // een andere fout (server, begrenzing): laten zien met "opnieuw proberen" in plaats van het meteen nog eens te proberen
        if (!result.ok && !ui.offlineUnknown && social.status === 'unknown') ui.refreshError = result.reason;
        root.redraw();
      });
      return;
    }
    // doe je al mee: inwisselen, behalve met je eigen link (die kan niet; dan zeggen we dat)
    if (social.status === 'on' && ui.phase === 'idle' && ui.peek && ui.peek.status !== 'own') redeem();
  }

  const header = h('div', { class: 'page-header' }, h('a', { class: 'back-link', href: '#/vrienden' }, `‹ ${f.title}`), h('h1', { class: 'page-title' }, t.title));
  const card = (...children) => h('div', { class: 'detail' }, header, h('section', { class: 'card friends__message' }, ...children));
  // voor wie nog geen account heeft: geen "terug naar Vrienden", dat scherm bestaat voor die persoon nog niet
  const welcomeCard = (heading, ...children) => h('div', { class: 'detail friends__welcome' }, heading, h('section', { class: 'card friends__message' }, ...children));
  const mainHeading = (text, id) => h('h1', { class: 'page-title', id }, text);
  const retryButton = (onclick) => h('button', { type: 'button', id: 'retryInvite', class: 'button button--secondary', onclick }, t.retry);
  const toToday = () => h('a', { class: 'button button--primary', href: '#/today' }, t.toToday);

  function peekProblem(wrap) {
    if (ui.peek.reason === 'unavailable') return wrap(h('h2', { class: 'section__title' }, f.unavailable.title), h('p', null, f.unavailable.text));
    return wrap(h('h2', { class: 'section__title' }, f.offline.title), h('p', null, f.offline.text), retryButton(retryPeek));
  }

  /** Een uitnodiging die niet (meer) werkt: de ontvanger kan nog steeds een account maken en later vrienden worden (N9). */
  function expired(signedIn) {
    socialApp.dropInvite(); // anders komt ze bij elke start terug
    return signedIn
      ? card(h('p', { id: 'inviteInvalid', role: 'alert' }, t.expired(inviterName())), toToday())
      : welcomeCard(mainHeading(t.title), h('p', { id: 'inviteInvalid', role: 'alert' }, t.expired(inviterName())), h('p', { class: 'muted' }, t.expiredAccount),
        h('a', { class: 'button button--primary', id: 'loginLink', href: '#/login' }, t.createAccount));
  }

  function welcome() {
    if (!ui.peek) return welcomeCard(mainHeading(t.title), h('p', { role: 'status' }, t.checking));
    if (!ui.peek.ok) return peekProblem((...children) => welcomeCard(mainHeading(t.title), ...children));
    if (ui.peek.status !== 'ok') return expired(false);
    return welcomeCard(
      mainHeading(t.welcomeTitle(ui.peek.name), 'inviteWelcome'),
      h('p', null, t.welcomeText),
      h('a', { class: 'button button--primary button--block', id: 'loginLink', href: '#/login' }, t.createAccount),
      h('p', { class: 'xs muted' }, t.haveAccount, ' ', h('a', { id: 'haveAccountLink', href: '#/login' }, t.login)));
  }

  function nameStep() {
    if (!ui.peek) return card(h('p', { role: 'status' }, t.checking));
    if (!ui.peek.ok) return peekProblem(card);
    if (ui.peek.status === 'own') { socialApp.dropInvite(); return card(h('p', { id: 'inviteOwn' }, t.own), toToday()); }
    if (ui.peek.status !== 'ok') return expired(true);
    return h('div', { class: 'detail friends__welcome' },
      mainHeading(t.nameTitle, 'inviteNameTitle'),
      h('section', { class: 'card friends__message' },
        h('p', null, t.nameText(ui.peek.name)),
        (form ??= inviteNameForm({ inviterName: ui.peek.name })),
        h('button', { type: 'button', id: 'inviteLater', class: 'button button--ghost button--small', onclick: () => { socialApp.dropInvite(); location.hash = introSeen() ? '#/today' : INTRO_HASH; } }, t.later)));
  }

  function done() {
    const name = ui.person?.name ?? '';
    const board = h('a', { class: `button ${ui.hasHabits ? 'button--primary' : 'button--secondary'}`, id: 'toBoard', href: '#/vrienden' }, t.toBoard);
    // wie nog geen habits heeft en de introductie nog niet zag, gaat daarheen (docs/ONBOARDING.md O4); anders direct naar de eerste habit
    const next = ui.hasHabits
      ? h('a', { class: 'button button--secondary', id: 'toToday', href: '#/today' }, t.toToday)
      : introSeen()
        ? h('a', { class: 'button button--primary', id: 'firstHabit', href: '#/habits/new' }, t.firstHabit)
        : h('a', { class: 'button button--primary', id: 'startIntro', href: INTRO_HASH }, t.startIntro);
    return h('div', { class: 'detail friends__welcome' },
      mainHeading(ui.alreadyFriends ? t.already(name) : t.success(name), 'inviteSuccess'),
      h('section', { class: 'card friends__message' },
        ui.person ? h('div', { class: 'person person--result' }, h('div', { class: 'person__body' }, h('span', { class: 'person__name' }, name), h('span', { class: 'person__user' }, `@${ui.person.username}`))) : null,
        h('p', null, t.successText),
        ui.hasHabits ? [board, next] : [next, board]));
  }

  function render() {
    if (!code) return card(h('p', { id: 'inviteInvalid' }, t.invalid), h('a', { class: 'button button--primary', href: '#/vrienden' }, f.title));
    if (account.status === 'restoring') return card(h('p', null, f.restoring));
    if (social.status === 'signed-out') return welcome();
    if (social.status === 'unavailable') return card(h('h2', { class: 'section__title' }, f.unavailable.title), h('p', null, f.unavailable.text));
    if (ui.refreshError) {
      return card(h('p', { id: 'inviteFailed', role: 'alert' }, reasonText(ui.refreshError)), retryButton(() => { ui.refreshError = null; kick(); root.redraw(); }));
    }
    if (ui.offlineUnknown) {
      return card(h('h2', { class: 'section__title' }, f.offline.title), h('p', null, f.offline.text),
        retryButton(() => { ui.offlineUnknown = false; kick(); root.redraw(); }));
    }
    if (social.status === 'off') return nameStep();
    if (social.status === 'on' && ui.peek?.ok && ui.peek.status === 'own' && ui.phase === 'idle') { socialApp.dropInvite(); return card(h('p', { id: 'inviteOwn' }, t.own), toToday()); }
    if (ui.phase === 'done') return done();
    if (ui.phase === 'failed') {
      if (ui.reason === 'invalid') return expired(true);
      // een fout die herhalen niet oplost (het maximum aantal vrienden): de uitnodiging laten we los; bij een tijdelijke fout blijft ze staan voor een nieuwe poging
      if (['friend_limit', 'not_found'].includes(ui.reason)) socialApp.dropInvite();
      return card(h('p', { id: 'inviteFailed', role: 'alert' }, reasonText(ui.reason)), retryButton(() => { ui.phase = 'idle'; kick(); }));
    }
    return card(h('p', { role: 'status' }, t.checking));
  }

  const root = socialLive({
    className: 'friends friends--invite',
    render,
    afterDraw: kick,
    // inloggen of uitloggen: het anonieme antwoord van de voorvertoning klopt niet meer (jij kunt de uitnodiger zijn), dus opnieuw vragen
    onAccount: () => { ui.peek = null; ui.peeking = false; kick(); },
  });
  return root;
}
