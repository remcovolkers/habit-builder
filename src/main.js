import { startRouter } from './router.js';
import { fill, h } from './ui/dom.js';
import { initState, state } from './ui/state.js';
import { openRepository } from './data/index.js';
import { placeholderView } from './ui/views/placeholder.js';
import { todayView } from './ui/views/today.js';
import { habitsView } from './ui/views/habits.js';
import { habitFormView } from './ui/views/habit-form.js';
import { settingsView } from './ui/views/settings.js';
import { nl } from './content/nl.js';

const NAV = [
  { key: 'today', path: '/today', icon: '☀' },
  { key: 'habits', path: '/habits', icon: '☰' },
  { key: 'stats', path: '/stats', icon: '▤' },
  { key: 'achievements', path: '/achievements', icon: '★' },
  { key: 'settings', path: '/settings', icon: '⚙' },
];

const routes = [
  { path: '/today', render: (ctx) => todayView(ctx) },
  { path: '/habits', render: () => habitsView() },
  { path: '/habits/new', render: () => habitFormView({ id: null }) },
  { path: '/habits/:id', render: ({ params }) => habitFormView({ id: params.id }) },
  { path: '/stats', render: () => placeholderView(nl.views.stats) },
  { path: '/achievements', render: () => placeholderView(nl.views.achievements) },
  { path: '/settings', render: () => settingsView() },
];

const tabbar = document.getElementById('tabbar');
fill(tabbar, 
  ...NAV.map(({ key, path, icon }) =>
    h('a', { class: 'tabbar__item', href: `#${path}`, dataset: { path } },
      h('span', { class: 'tabbar__icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'tabbar__label' }, nl.nav[key]),
    ),
  ),
);

function markActive({ path }) {
  for (const link of tabbar.children) {
    const active = path === link.dataset.path || path.startsWith(`${link.dataset.path}/`);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const outlet = document.getElementById('app');
fill(outlet, h('p', { class: 'muted' }, nl.app.loading));

const repo = await openRepository();
await initState(repo);

if (repo.storeKind === 'memory') {
  outlet.parentNode.insertBefore(h('p', { class: 'banner banner--warning', role: 'alert' }, nl.app.memoryWarning), outlet);
}

startRouter({
  routes,
  outlet,
  notFound: () =>
    placeholderView(nl.views.notFound, [
      h('a', { class: 'placeholder__link', href: '#/today' }, nl.views.notFound.back),
    ]),
  onChange: markActive,
});

// Handig bij het ontwikkelen: window.habitBuilder in de console.
if (location.hostname === 'localhost') window.habitBuilder = { state };
