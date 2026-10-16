// De kaart bovenaan Voortgang: doorverwijzing naar de ranglijst, met je plek als je meedoet.
import { h } from '../dom.js';
import { icon } from '../svg.js';
import { account } from '../account.js';
import { social } from '../social-app.js';
import { socialLive } from '../social-view.js';
import { pendingInviteBanner } from './social-parts.js';
import { myPosition } from '../../app/social.js';
import { nl } from '../../content/nl.js';

const c = nl.friends.card;

export function socialCard() {
  function render() {
    if (account.status === 'restoring' || social.status === 'unavailable') return h('div', { hidden: true });
    const invite = pendingInviteBanner();

    if (social.status === 'signed-out') {
      return h('div', null, h('section', { class: 'card social-card', id: 'socialCard' },
        h('div', { class: 'social-card__icon' }, icon('friends')),
        h('div', { class: 'social-card__body' }, h('h2', { class: 'section__title' }, c.title), h('p', { class: 'section__hint' }, c.login)),
        h('a', { class: 'button button--secondary button--small', href: '#/login' }, c.loginLink)));
    }

    if (social.status === 'on') {
      const position = myPosition(social.board);
      const count = social.friends.length;
      // nog geen vrienden: de kaart is zelf de uitnodiging om er een toe te voegen (en dus geen link om de hele kaart)
      if (count === 0) {
        return h('div', null, invite, h('section', { class: 'card social-card', id: 'socialCard' },
          h('div', { class: 'social-card__icon' }, icon('friends')),
          h('div', { class: 'social-card__body' },
            h('h2', { class: 'section__title' }, c.title),
            h('p', { class: 'social-card__line' }, position ? [c.points(position.points), ' ', c.alone] : c.alone),
            social.incoming.length > 0 ? h('a', { class: 'badge badge--risk', id: 'socialRequests', href: '#/vrienden' }, c.requests(social.incoming.length)) : null),
          h('a', { class: 'button button--primary button--small', id: 'socialAddLink', href: '#/vrienden/toevoegen' }, c.addFirst)));
      }
      const alone = !position;
      return h('div', null, invite, h('a', { class: 'card social-card social-card--link', id: 'socialCard', href: '#/vrienden' },
        h('div', { class: 'social-card__icon' }, icon('friends')),
        h('div', { class: 'social-card__body' },
          h('h2', { class: 'section__title' }, c.title),
          h('p', { class: 'social-card__line' }, alone
            ? (position ? [c.points(position.points), ' ', c.alone] : c.alone)
            : [c.position(position.rank, position.total), ' · ', c.friendCount(count), ' · ', c.points(position.points)]),
          social.incoming.length > 0 ? h('span', { class: 'badge badge--risk', id: 'socialRequests' }, c.requests(social.incoming.length)) : null),
        h('span', { class: 'social-card__go' }, icon('next'))));
    }

    // 'off' of 'unknown': we weten niet of (of het maakt niet uit dat) je al meedoet; uitnodigen om te kijken, zonder iets op te halen
    return h('div', null, invite, h('section', { class: 'card social-card', id: 'socialCard' },
      h('div', { class: 'social-card__icon' }, icon('friends')),
      h('div', { class: 'social-card__body' }, h('h2', { class: 'section__title' }, c.title), h('p', { class: 'section__hint' }, c.lead)),
      h('a', { class: 'button button--primary button--small', id: 'socialJoinLink', href: '#/vrienden' }, social.status === 'off' ? c.join : c.open)));
  }

  return socialLive({ className: 'social-card-host', render });
}
