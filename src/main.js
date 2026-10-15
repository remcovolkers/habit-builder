import { startRouter } from './router.js';
import { fill, h } from './ui/dom.js';
import { initState, notifyChanged, onChanged, saveSettings, state } from './ui/state.js';
import { isTheme } from './app/themes.js';
import { openRepository } from './data/index.js';
import { placeholderView } from './ui/views/placeholder.js';
import { todayView } from './ui/views/today.js';
import { habitsView } from './ui/views/habits.js';
import { habitFormView } from './ui/views/habit-form.js';
import { habitDetailView } from './ui/views/habit-detail.js';
import { statsView } from './ui/views/stats.js';
import { achievementsView } from './ui/views/achievements.js';
import { loginView } from './ui/views/login.js';
import { initAccount } from './ui/account.js';
import { startPwa } from './pwa.js';
import { mountUpdateBanner } from './ui/components/update-banner.js';
import { celebrateAchievements } from './ui/components/achievement.js';
import { checkAchievements } from './app/achievement-runner.js';
import { settingsView } from './ui/views/settings.js';
import { icon } from './ui/svg.js';
import { nl } from './content/nl.js';

const NAV = [
  { key: 'today', path: '/today' },
  { key: 'habits', path: '/habits' },
  { key: 'stats', path: '/stats' },
  { key: 'achievements', path: '/achievements' },
  { key: 'settings', path: '/settings' },
];

const routes = [
  { path: '/today', render: (ctx) => todayView(ctx) },
  { path: '/habits', render: () => habitsView() },
  { path: '/habits/new', render: ({ query }) => habitFormView({ id: null, template: query.template ?? null }) },
  { path: '/habits/:id/edit', render: ({ params }) => habitFormView({ id: params.id }) },
  { path: '/habits/:id', render: ({ params }) => habitDetailView({ id: params.id }) },
  { path: '/stats', render: () => statsView() },
  { path: '/achievements', render: () => achievementsView() },
  { path: '/settings', render: () => settingsView() },
  { path: '/login', render: () => loginView() },
];

const tabbar = document.getElementById('tabbar');
fill(tabbar, 
  ...NAV.map(({ key, path }) =>
    h('a', { class: 'tabbar__item', href: `#${path}`, dataset: { path } },
      icon(key),
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

// Een gedeelde link zoals .../habit-builder/?theme=mel wordt een blijvende keuze en daarna uit de adresbalk gehaald.
const linkedTheme = new URLSearchParams(location.search).get('theme');
if (isTheme(linkedTheme)) {
  if (state.settings.theme !== linkedTheme) await saveSettings({ theme: linkedTheme });
  const url = new URL(location.href);
  url.searchParams.delete('theme');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

if (repo.storeKind === 'memory') {
  outlet.parentNode.insertBefore(h('p', { class: 'banner banner--warning', role: 'alert' }, nl.app.memoryWarning), outlet);
}

// Na elke wijziging: zijn er nieuwe prestaties? Ze worden één voor één verwerkt en blijven bewaard.
let achievementQueue = Promise.resolve();
function checkForAchievements() {
  achievementQueue = achievementQueue
    .then(async () => {
      const fresh = await checkAchievements(state.repo, state.today);
      if (fresh.length > 0) {
        celebrateAchievements(fresh, await state.repo.listHabits());
        notifyChanged(); // zodat de prestatiepagina meteen klopt (de volgende controle vindt niets nieuws)
      }
    })
    .catch((error) => console.error('prestaties controleren mislukt', error));
}
onChanged(checkForAchievements);
checkForAchievements();

// Account: alleen actief als er een sessie is (of we terugkomen van Google); een mislukte start blokkeert de app nooit.
initAccount().catch((error) => console.warn('account starten mislukt', error));

// PWA: service worker (offline + updates). Mislukt dit, dan werkt de app gewoon online verder.
mountUpdateBanner();
startPwa().catch((error) => console.warn('PWA starten mislukt', error));

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
