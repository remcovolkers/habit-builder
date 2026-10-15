import { h } from '../dom.js';
import { nl } from '../../content/nl.js';

/**
 * De ranglijst als geordende lijst. Rijen komen uit buildLeaderboard: { rank, name, username, points, streak, activeHabits, isMe }.
 * Alles staat als tekst (plek, naam, "jij", punten); de balk is alleen een extra visuele hint en geen betekenis in kleur.
 */
export function leaderboardList(board) {
  const t = nl.friends.board;
  const max = Math.max(1, ...board.map((row) => row.points));
  return h('ol', { class: 'board', 'aria-label': t.label },
    ...board.map((row) => {
      const fillBar = h('div', { class: 'meter__fill' });
      fillBar.style.setProperty('--p', String(Math.round((row.points / max) * 100)));
      return h('li', { class: row.isMe ? 'board__row board__row--me' : 'board__row', dataset: { me: row.isMe ? 'true' : null } },
        h('span', { class: 'board__rank' }, h('span', { class: 'visually-hidden' }, `${t.place} `), String(row.rank)),
        h('div', { class: 'board__who' },
          h('span', { class: 'board__name' }, row.name, row.isMe ? h('span', { class: 'board__you' }, ` (${t.you})`) : null),
          h('span', { class: 'board__user' }, `@${row.username}`)),
        h('span', { class: 'board__points' }, h('b', null, String(row.points)), ` ${t.points}`),
        h('div', { class: 'meter board__meter', 'aria-hidden': 'true' }, fillBar),
        h('span', { class: 'board__meta' }, [t.streak(row.streak), t.habits(row.activeHabits)].join(' · ')));
    }));
}
