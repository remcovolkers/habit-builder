import { startRouter } from './router.js';
import { startScrollFades } from './ui/scroll-fade.js';
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
import { friendsView } from './ui/views/friends.js';
import { friendsAddView } from './ui/views/friends-add.js';
import { friendsManageView } from './ui/views/friends-manage.js';
import { friendsInviteView } from './ui/views/friends-invite.js';
import { loginView } from './ui/views/login.js';
import { account, initAccount, onAccountChanged } from './ui/account.js';
import { initReminders } from './ui/reminders.js';
import { initSocial, onSocialChanged, social, socialApp } from './ui/social-app.js';
import { setDev } from './ui/dev.js';
import { startPwa } from './pwa.js';
import { mountUpdateBanner } from './ui/components/update-banner.js';
import { celebrateAchievements } from './ui/components/achievement.js';
import { checkAchievements } from './app/achievement-runner.js';
import { settingsView } from './ui/views/settings.js';
import { guideView } from './ui/views/guide.js';
import { welcomeView } from './ui/views/welcome.js';
import { INTRO_HASH, afterLoginHash, introDue, markIntroSeen, peekReturn, takeReturn } from './ui/intro.js';
import { parseHash } from './router.js';
import { icon } from './ui/svg.js';
import { nl } from './content/nl.js';
import { feedbackAdminView } from './ui/views/feedback-admin.js';
import { admin, initAdmin, onAdminChanged } from './ui/admin.js';
import { openFeedbackSheet } from './ui/components/feedback-sheet.js';
import { markFirstRun } from './ui/feedback-state.js';

const NAV = [
  { key: 'today', path: '/today' },
  { key: 'habits', path: '/habits' },
  { key: 'stats', path: '/stats', also: ['/vrienden'] }, // de ranglijst hoort bij Voortgang (geen eigen tabblad)
  { key: 'achievements', path: '/achievements' },
  { key: 'settings', path: '/settings' },
];

const routes = [
  { path: '/today', render: (ctx) => todayView(ctx) },
  { path: '/habits', render: () => habitsView() },
  { path: '/habits/new', render: ({ query }) => habitFormView({ id: null, template: query.template ?? null, intro: query.intro === '1' }) },
  { path: '/habits/:id/edit', render: ({ params }) => habitFormView({ id: params.id }) },
  { path: '/habits/:id', render: ({ params }) => habitDetailView({ id: params.id }) },
  { path: '/stats', render: ({ query }) => statsView({ query }) },
  { path: '/achievements', render: () => achievementsView() },
  { path: '/vrienden', render: () => friendsView() },
  { path: '/vrienden/toevoegen', render: () => friendsAddView() },
  { path: '/vrienden/beheer', render: () => friendsManageView() },
  { path: '/vrienden/uitnodiging/:code', render: ({ params }) => friendsInviteView({ code: params.code }) },
  { path: '/settings', render: () => settingsView() },
  { path: '/uitleg', render: () => guideView() },
  { path: '/feedback', render: () => feedbackAdminView() },
  { path: '/welkom/:step', render: ({ params }) => welcomeView({ step: params.step }) },
  { path: '/login', render: () => loginView() },
];

// Het tabje Feedback is alleen voor de beheerder en alleen op de computer: het staat verborgen tot de server zegt dat je beheerder bent,
// en onder 960 px (telefoon en tablet) laat de CSS het ook dan weg (docs/FEEDBACK.md).
const feedbackTab = h('a', { class: 'tabbar__item tabbar__item--dev', id: 'feedbackTab', href: '#/feedback', dataset: { path: '/feedback' }, hidden: true },
  icon('feedback'),
  h('span', { class: 'tabbar__label' }, nl.nav.feedback),
  h('span', { class: 'tabbar__count', hidden: true }));

const tabbar = document.getElementById('tabbar');
fill(tabbar,
  ...NAV.map(({ key, path, also }) =>
    h('a', { class: 'tabbar__item', href: `#${path}`, dataset: { path, also: also?.join(' ') } },
      icon(key),
      h('span', { class: 'tabbar__label' }, nl.nav[key]),
    ),
  ),
  feedbackTab,
);

function showFeedbackTab() {
  feedbackTab.hidden = admin.status !== 'yes';
  const count = feedbackTab.querySelector('.tabbar__count');
  count.hidden = admin.newCount === 0;
  count.textContent = String(admin.newCount);
  count.setAttribute('aria-label', nl.feedback.admin.newCount(admin.newCount));
}
onAdminChanged(showFeedbackTab);

// Onderaan de zijbalk (alleen op de computer; op de telefoon staat het onder Instellingen): een stille regel om feedback te geven
const feedbackLink = document.getElementById('feedbackLink');
fill(feedbackLink, icon('feedback'), h('span', null, nl.feedback.title));
feedbackLink.addEventListener('click', () => openFeedbackSheet({ opener: feedbackLink }));

function markActive({ path }) {
  for (const link of tabbar.children) {
    const roots = [link.dataset.path, ...(link.dataset.also?.split(' ') ?? [])];
    const active = roots.some((root) => path === root || path.startsWith(`${root}/`));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const outlet = document.getElementById('app');
startScrollFades(document.querySelector('.app'));

// "Naar de inhoud": wie met het toetsenbord werkt hoeft niet elke keer door de navigatie heen
document.getElementById('skipLink')?.addEventListener('click', () => {
  outlet.focus();
  outlet.scrollIntoView({ block: 'start' });
});
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

// ?dev=1 zet de ontwikkelaarsopties aan, ?dev=0 uit (daarna uit de adresbalk gehaald)
const linkedDev = new URLSearchParams(location.search).get('dev');
if (linkedDev === '1' || linkedDev === '0') {
  setDev(linkedDev === '1');
  const url = new URL(location.href);
  url.searchParams.delete('dev');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

if (repo.storeKind === 'memory') {
  outlet.parentNode.insertBefore(h('p', { class: 'banner banner--warning', role: 'alert' }, nl.app.memoryWarning), outlet);
}

// Na elke wijziging: zijn er nieuwe prestaties? Ze worden één voor één verwerkt en blijven bewaard.
let achievementQueue = Promise.resolve();
// het aantal vrienden komt uit de sociale cache (alleen als sociaal aan staat); checkedFriends is het aantal waarmee we het laatst controleerden
let checkedFriends = 0;
const friendCount = () => (social.status === 'on' ? social.friends.length : 0);
function checkForAchievements() {
  achievementQueue = achievementQueue
    .then(async () => {
      checkedFriends = friendCount();
      const fresh = await checkAchievements(state.repo, state.today, { friends: checkedFriends });
      if (fresh.length > 0) {
        celebrateAchievements(fresh, await state.repo.listHabits());
        notifyChanged(); // zodat de prestatiepagina meteen klopt (de volgende controle vindt niets nieuws)
      }
    })
    .catch((error) => console.error('prestaties controleren mislukt', error));
}
onChanged(checkForAchievements);
// een nieuwe vriend kan een prestatie opleveren
onSocialChanged(() => {
  if (friendCount() !== checkedFriends) checkForAchievements();
});
checkForAchievements();

// Wie vanuit de introductie ging inloggen komt daarna weer bij de introductie. Voor de e-mailcode regelt het inlogscherm dat zelf; dit is voor de omweg via
// Google, waarbij de pagina opnieuw laadt. We wachten tot de eerste sync binnen is: een bestaand account met habits hoort bij Vandaag te landen, niet bij de introductie.
let returningFromLogin = false;
onAccountChanged(() => {
  if (returningFromLogin || account.status !== 'signed-in' || !peekReturn()) return;
  returningFromLogin = true;
  const lastSync = account.sync?.lastSyncAt ?? null;
  const settled = new Promise((resolve) => {
    const done = () => { stop(); clearTimeout(timeout); resolve(); };
    const timeout = setTimeout(done, 8000);
    const stop = onAccountChanged(() => { if (account.sync?.state === 'error' || (account.sync?.lastSyncAt ?? null) !== lastSync) done(); });
  });
  settled.then(async () => {
    const back = takeReturn();
    returningFromLogin = false;
    if (!back || socialApp.pendingInvite()) return; // een uitnodiging die wacht gaat voor (die flow brengt je zelf bij de introductie)
    const target = afterLoginHash({ back, habitCount: (await state.repo.listHabits()).length });
    if (location.hash !== target) location.hash = target;
  });
});

// Account: alleen actief als er een sessie is (of we terugkomen van Google); een mislukte start blokkeert de app nooit.
initAccount().catch((error) => console.warn('account starten mislukt', error));
initReminders();
initSocial();
initAdmin();
markFirstRun(); // sinds wanneer je de app gebruikt: de rustige uitnodiging voor feedback komt pas na een week

// PWA: service worker (offline + updates). Mislukt dit, dan werkt de app gewoon online verder.
mountUpdateBanner();
startPwa().catch((error) => console.warn('PWA starten mislukt', error));

// Introductie (docs/ONBOARDING.md O3a): bij het starten op Vandaag, zolang er geen habits zijn en ze nog niet gezien is. Wie al habits heeft
// (ook na een update, of op een nieuw apparaat met een account) krijgt haar nooit. Een uitnodigingslink of een andere pagina wordt niet onderbroken.
// replaceState: de lege Vandaag komt niet in de geschiedenis, dus "terug" gaat niet naar een scherm zonder inhoud.
const habitCount = (await repo.listHabits().catch(() => [null])).length;
if (habitCount > 0) markIntroSeen();
else if (introDue({ habitCount }) && parseHash(location.hash).path === '/today') history.replaceState(null, '', INTRO_HASH);

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
