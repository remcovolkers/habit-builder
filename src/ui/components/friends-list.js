// "Je vrienden (n)": alle vrienden onder de ranglijst, ook wie er (nog) niet op staat (docs/ITERATIE-1.2.md §3).
import { h } from '../dom.js';
import { social } from '../social-app.js';
import { untilLabel } from './social-parts.js';
import { friendsOverview } from '../../app/social.js';
import { SOCIAL_ACTIVE_DAYS } from '../../domain/constants.js';
import { nl } from '../../content/nl.js';

const t = nl.friends.list;

export function friendsList() {
  const rows = friendsOverview({ friends: social.friends, board: social.board });
  return h('section', { class: 'section', id: 'friendsList' },
    h('h2', { class: 'section__title' }, t.title(rows.length)),
    h('ul', { class: 'person-list card', 'aria-label': t.label },
      ...rows.map((row) => h('li', { class: 'person', dataset: { userId: row.userId } },
        h('div', { class: 'person__body' },
          h('span', { class: 'person__name' }, row.name, row.isNew ? ' ' : null, row.isNew ? h('span', { class: 'badge badge--ok person__new' }, t.isNew) : null),
          h('span', { class: 'person__user' }, row.since ? `@${row.username} · ${t.since(untilLabel(row.since))}` : `@${row.username}`),
          row.onBoard ? null : h('span', { class: 'person__note' }, t.notOnBoard(SOCIAL_ACTIVE_DAYS)))))));
}
