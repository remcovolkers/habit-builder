// Onderdelen die meerdere sociale schermen delen: foutteksten, uitsplitsing van je punten, het aanmeldformulier, een uitnodigingsbanner.
import { h } from '../dom.js';
import { showToast } from './toast.js';
import { saveSettings, state } from '../state.js';
import { socialApp } from '../social-app.js';
import { describeBreakdown, suggestUsername, validateUsername } from '../../app/social.js';
import { DISPLAY_NAME_MAX } from '../../app/settings.js';
import { MISS_PENALTY, START_BONUS_MAX, TASK_POINTS } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';

export const reasonText = (reason) => nl.friends.errors[reason] ?? nl.friends.errors.unknown;

const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

let breakdownOpen = false; // blijft dicht of open over hertekeningen (bijvoorbeeld als een verversing klaar is)

/** "Waar komen mijn punten vandaan?": een uitklapbare kaart met de uitsplitsing en de regels in gewone taal. */
export function breakdownCard(summary) {
  const t = nl.friends.breakdown;
  const rows = describeBreakdown(summary?.breakdown);
  const empty = !summary || rows.every((row) => row.points === 0);
  return h('details', { class: 'card card--quiet breakdown', id: 'breakdown', open: breakdownOpen, ontoggle: (event) => { breakdownOpen = event.target.open; } },
    h('summary', { class: 'section__title breakdown__summary' }, t.title),
    h('p', { class: 'xs muted' }, t.window),
    empty
      ? h('p', { class: 'muted' }, t.none)
      : h('dl', { class: 'points-list' },
        ...rows.flatMap((row) => [
          h('dt', null, t[row.key]),
          h('dd', { class: row.points < 0 ? 'points-list__minus' : null }, signed(row.points)),
        ]),
        h('dt', { class: 'points-list__total' }, t.total),
        h('dd', { class: 'points-list__total' }, String(summary.points))),
    h('ul', { class: 'rules' }, ...t.rules({ task: TASK_POINTS, startMax: START_BONUS_MAX, miss: MISS_PENALTY }).map((rule) => h('li', null, rule))));
}

/** Een banner als er een uitnodiging is binnengekomen die nog niet is afgehandeld (bijvoorbeeld voor het inloggen). */
export function pendingInviteBanner() {
  const code = socialApp.pendingInvite();
  if (!code) return null;
  return h('div', { class: 'banner', id: 'pendingInvite' },
    h('span', null, nl.friends.card.invite, ' '),
    h('a', { href: `#/vrienden/uitnodiging/${code}` }, nl.friends.card.inviteOpen));
}

/**
 * Het formulier om mee te doen: je naam (die ook in Instellingen komt te staan) en een gebruikersnaam. Controleert eerst lokaal,
 * en laat bij een serverfout (bezet, niet toegestaan, …) de reden zien bij het veld. `onJoined` na succes.
 */
export function onboardingForm({ onJoined = null } = {}) {
  const t = nl.friends.intro;
  const startName = String(state.settings?.displayName ?? '').trim();
  const nameInput = h('input', {
    id: 'socialName', class: 'input', type: 'text', maxlength: DISPLAY_NAME_MAX + 10, autocomplete: 'nickname', value: startName, 'aria-describedby': 'socialNameHint',
  });
  const userInput = h('input', {
    id: 'socialUsername', class: 'input', type: 'text', maxlength: 30, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
    value: suggestUsername(startName), 'aria-describedby': 'socialUserHint socialUserError', 'aria-required': 'true',
  });
  let touched = false;
  userInput.addEventListener('input', () => { touched = true; });
  nameInput.addEventListener('input', () => { if (!touched) userInput.value = suggestUsername(nameInput.value); });

  const nameError = h('p', { id: 'socialNameError', class: 'field__error', role: 'alert', hidden: true });
  const userError = h('p', { id: 'socialUserError', class: 'field__error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', id: 'socialJoin', class: 'button button--primary button--block' }, t.submit);

  const show = (el, input, reason) => {
    el.textContent = reasonText(reason);
    el.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  };
  const clear = () => {
    for (const [el, input] of [[nameError, nameInput], [userError, userInput]]) { el.hidden = true; input.removeAttribute('aria-invalid'); }
  };

  async function onsubmit(event) {
    event.preventDefault();
    document.activeElement?.blur?.(); // het veld loslaten: anders wacht het scherm met bijwerken tot je het veld verlaat (niet elke telefoon geeft een knop focus)
    clear();
    const name = nameInput.value.trim();
    if (name.length > DISPLAY_NAME_MAX) { show(nameError, nameInput, 'invalid_display_name'); nameInput.focus(); return; }
    const username = validateUsername(userInput.value);
    if (!username.ok) { show(userError, userInput, username.reason); userInput.focus(); return; }

    submit.disabled = true;
    if (name !== startName) await saveSettings({ displayName: name, nameAsked: true }); // dezelfde naam als in Instellingen en op Vandaag
    const result = await socialApp.enable({ username: username.value, displayName: name });
    submit.disabled = false;
    if (!result.ok) {
      const nameProblem = result.reason === 'invalid_display_name';
      if (['offline', 'signed-out', 'unavailable', 'too_many_requests', 'unknown', 'not_authenticated'].includes(result.reason)) showToast({ message: reasonText(result.reason) });
      else if (nameProblem) show(nameError, nameInput, result.reason);
      else show(userError, userInput, result.reason);
      (nameProblem ? nameInput : userInput).focus();
      return;
    }
    showToast({ message: t.joined });
    onJoined?.();
  }

  return h('form', { class: 'form onboarding', novalidate: true, onsubmit },
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'socialName' }, t.nameLabel), nameInput,
      h('p', { id: 'socialNameHint', class: 'field__hint' }, t.nameHint), nameError),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'socialUsername' }, t.usernameLabel), userInput,
      h('p', { id: 'socialUserHint', class: 'field__hint' }, t.usernameHint), userError),
    submit,
    h('p', { class: 'xs muted' }, t.offAnytime, ' ',
      h('a', { id: 'socialPrivacy', href: `${nl.login.legalBase}/PRIVACY.md`, target: '_blank', rel: 'noopener noreferrer' }, t.privacy)));
}

/** Wat vrienden wel en niet zien: twee korte lijsten. */
export function sharingSummary() {
  const t = nl.friends.intro;
  const list = (title, items, modifier) => h('div', { class: `sharing__col sharing__col--${modifier}` },
    h('h3', { class: 'sharing__title' }, title),
    h('ul', { class: 'sharing__list' }, ...items.map((item) => h('li', null, item))));
  return h('div', { class: 'sharing' }, list(t.seesTitle, t.sees, 'sees'), list(t.privateTitle, t.private, 'private'));
}

/** Kopieert tekst naar het klembord. Geeft false als dat niet lukt (geen toestemming of geen ondersteuning). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opent het deelmenu van het toestel. Geeft false als dat er niet is of als je het wegklikt. */
export async function shareLink(link) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: 'Habit Builder', text: nl.friends.add.shareText, url: link });
    return true;
  } catch {
    return false;
  }
}

/** "12 oktober" voor een datum-tijd van de server. */
export const untilLabel = (iso) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
