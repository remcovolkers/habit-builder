import { startRouter } from './router.js';
import { h } from './ui/dom.js';
import { placeholderView } from './ui/views/placeholder.js';
import { nl } from './content/nl.js';

const NAV = [
  { key: 'today', path: '/today', icon: '☀' },
  { key: 'habits', path: '/habits', icon: '☰' },
  { key: 'stats', path: '/stats', icon: '▤' },
  { key: 'achievements', path: '/achievements', icon: '★' },
  { key: 'settings', path: '/settings', icon: '⚙' },
];

const routes = NAV.map(({ key, path }) => ({
  path,
  render: () => placeholderView(nl.views[key]),
}));

const tabbar = document.getElementById('tabbar');
tabbar.replaceChildren(
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

startRouter({
  routes,
  outlet: document.getElementById('app'),
  notFound: () =>
    placeholderView(nl.views.notFound, [
      h('a', { class: 'placeholder__link', href: '#/today' }, nl.views.notFound.back),
    ]),
  onChange: markActive,
});
