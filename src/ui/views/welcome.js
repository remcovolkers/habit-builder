// De introductie voor nieuwe gebruikers (#/welkom/1 t/m 4, docs/ONBOARDING.md O3): het idee, een dag en het ritme, de app installeren en de eerste habit.
// De stap voor het installeren valt weg als de app al geïnstalleerd is (je opende hem vanaf je beginscherm).
// Elke stap is over te slaan; overslaan of afronden zet de vlag (ui/intro.js) en de introductie komt niet vanzelf terug.
// Het beeld komt uit de app zelf (de mascotte van het thema, de iconenset en de echte habitkaart), zodat het bij elk thema past.
import { fill, h } from '../dom.js';
import { icon } from '../svg.js';
import { mascot } from '../components/mascot.js';
import { habitIcon, uiIcon } from '../components/habit-icon.js';
import { habitCard } from '../components/habit-card.js';
import { nl } from '../../content/nl.js';
import { GUIDE_COUNTER, GUIDE_TYPES } from '../../content/guide.js';
import { TEMPLATES } from '../../content/templates.js';
import { starterKind } from '../../app/starter-kind.js';
import { DEFAULT_GRADUATION_DAYS, PHASE_STARTING_UNTIL_DAY } from '../../domain/constants.js';
import { themeOptions } from '../components/theme-picker.js';
import { saveSettings, state } from '../state.js';
import { themeFor } from '../../app/themes.js';
import { markIntroSeen } from '../intro.js';
import { onPwaChanged, promptInstall, pwa } from '../../pwa.js';

const w = nl.welcome;

const stepHash = (n) => `#/welkom/${n}`;
const finish = () => markIntroSeen();

/** Het grote beeld bovenaan: de mascotte van het thema, of een icoon in een gloeiende cirkel. */
function hero(slot, fallbackIcon) {
  return h('div', { class: 'welcome__hero', 'aria-hidden': 'true' },
    mascot(slot, 'welcome__mascot') ?? mascot('empty', 'welcome__mascot') ?? h('div', { class: 'welcome__hero-art' }, uiIcon(fallbackIcon)));
}

// De stappen. "install" ontbreekt als de app al geïnstalleerd was toen de introductie voor het eerst getoond werd; dat onthouden we, zodat de
// stappen niet verschuiven als je halverwege installeert (dan staat er "Gelukt!" in plaats van dat de stap verdwijnt).
let installedAtStart = null;
const hasInstallStep = () => (installedAtStart ??= pwa.installed) === false;
export const introSteps = () => (hasInstallStep() ? ['idea', 'day', 'install', 'habit'] : ['idea', 'day', 'habit']);

/** Stippen: waar je bent. Voor een schermlezer staat de stap als tekst. */
function progress(n, total) {
  return h('div', { class: 'welcome__progress', role: 'img', 'aria-label': w.step(n, total) },
    ...Array.from({ length: total }, (_, i) => h('span', { class: 'welcome__dot', dataset: { state: i + 1 < n ? 'past' : i + 1 === n ? 'current' : 'future' } })));
}

/** Een gewoonte groeit in drie fases; de tekeningen worden groter, zoals de gewoonte. */
function growth() {
  const stops = [
    { key: 'starting', slot: 'phase.starting', fallback: 'sprout', day: 1 },
    { key: 'building', slot: 'phase.building', fallback: 'plants', day: PHASE_STARTING_UNTIL_DAY },
    { key: 'established', slot: 'phase.established', fallback: 'ach-first-graduated', day: DEFAULT_GRADUATION_DAYS },
  ];
  return h('ol', { class: 'welcome__growth', 'aria-label': w.growthLabel },
    ...stops.map((stop, i) => h('li', { class: 'welcome__stop', dataset: { stage: String(i + 1) } },
      h('span', { class: 'welcome__stop-art', 'aria-hidden': 'true' }, mascot(stop.slot, 'welcome__stop-mascot') ?? uiIcon(stop.fallback)),
      h('span', { class: 'welcome__stop-name' }, nl.detail.phases[stop.key]),
      h('span', { class: 'welcome__stop-day' }, nl.detail.day(stop.day)))));
}

/** Een lijstje met bij elk punt een icoon. */
function points(items, icons) {
  return h('ul', { class: 'welcome__points' },
    ...items.map((text, i) => h('li', null, h('span', { class: 'welcome__point-icon', 'aria-hidden': 'true' }, uiIcon(icons[i])), h('span', null, text))));
}

/** Een echte habitkaart, zoals op Vandaag. Alleen de eerste is te bedienen; het is een voorbeeld, er wordt niets opgeslagen. */
function demo() {
  const entry = (template, loggedToday) => ({
    habitId: `demo-${template.name}`, kind: 'day', loggedToday, overdue: false, recovery: false, noteToday: null, valueToday: null,
    habit: { id: `demo-${template.name}`, name: template.name, icon: template.icon, color: template.color, cue: template.cue ?? null, counter: null, minimalVersion: null, why: null },
  });
  const hint = h('p', { class: 'welcome__demo-hint', role: 'status' }, w.demoTry);
  const rows = [entry(TEMPLATES.water, null), entry(TEMPLATES.reading, 'minimal'), entry(TEMPLATES.running, 'skipped')];
  const noop = () => {};
  let list = null;
  const draw = (index) => {
    const row = rows[index];
    const options = { canLog: index === 0, onToggle: noop, onMore: noop, onAdjust: noop, onRate: noop, onLate: noop };
    if (index === 0) {
      options.onToggle = () => {
        row.loggedToday = row.loggedToday ? null : 'done';
        hint.textContent = row.loggedToday ? w.demoDone : w.demoTry;
        list.replaceChild(habitCard(row, options), list.children[0]);
        list.children[0].querySelector('.check')?.focus();
      };
    }
    return habitCard(row, options);
  };
  list = h('ul', { class: 'card-list welcome__demo', 'aria-label': w.demoLabel }, ...rows.map((_, i) => draw(i)));
  return h('div', { class: 'welcome__demo-box' },
    list,
    hint,
    h('ul', { class: 'welcome__legend' },
      ...w.legend.map(([mark, label]) => h('li', null, h('span', { class: 'welcome__legend-mark', 'aria-hidden': 'true' }, mark), ' ', label))));
}

function rhythmList() {
  return h('ul', { class: 'welcome__rhythms' },
    ...GUIDE_TYPES.map(({ key, example }) => h('li', null,
      h('strong', null, nl.form.scheduleTypes[key]), h('span', { class: 'muted' }, example.replace(/\.$/, '')))),
    h('li', null, h('strong', null, nl.guide.counter), h('span', { class: 'muted' }, GUIDE_COUNTER.example.replace(/\.$/, ''))));
}

function starters() {
  return h('div', { class: 'welcome__starters' },
    ...Object.entries(TEMPLATES).map(([key, template]) => h('a', {
      class: 'welcome__starter', href: `#/habits/new?template=${key}&intro=1`, dataset: { template: key, color: template.color }, onclick: finish,
    },
    h('span', { class: 'welcome__tile', 'aria-hidden': 'true' }, habitIcon(template.icon)),
    h('span', { class: 'welcome__starter-name' }, template.name),
    h('span', { class: 'welcome__starter-kind' }, starterKind(template)))));
}

/** Een genummerd lijstje met bij elke stap het icoon van de knop die je ziet (zoals Delen). */
function howTo(steps, icons) {
  return h('div', { class: 'welcome__howto' },
    h('h2', { class: 'welcome__subtitle' }, w.installSteps),
    h('ol', { class: 'welcome__steps' },
      ...steps.map((text, i) => h('li', null,
        h('span', { class: 'welcome__step-icon', 'aria-hidden': 'true' }, icon(icons[i])),
        h('span', null, text)))));
}

/**
 * Het installeren, per soort toestel: met een knop als de browser dat toestaat (Android, Chrome en Edge), met stappen op iOS (daar bestaat geen
 * knop) en met een algemene aanwijzing voor de rest. Volgt de toestand uit pwa.js: na het installeren staat er "Gelukt!".
 */
function installPanel() {
  const root = h('div', { class: 'welcome__install' });
  function draw() {
    if (pwa.installed) {
      fill(root, h('p', { class: 'welcome__installed', role: 'status' }, h('span', { class: 'welcome__installed-mark', 'aria-hidden': 'true' }, icon('check', { strokeWidth: 3 })), w.installDone));
    } else if (pwa.canInstall) {
      fill(root, h('button', { type: 'button', id: 'installApp', class: 'button button--primary button--block', onclick: () => promptInstall() }, nl.pwa.install));
    } else if (pwa.ios) {
      fill(root, howTo(w.installIos, ['share', 'addSquare', 'check']));
    } else {
      fill(root, howTo(w.installGeneric, ['menu', 'install']));
    }
  }
  const stop = onPwaChanged(() => (root.isConnected ? draw() : stop()));
  draw();
  return root;
}

/** Het icoon van de app zelf, zoals het straks op het beginscherm staat. */
function appIcon() {
  return h('div', { class: 'welcome__hero', 'aria-hidden': 'true' },
    h('img', { class: 'welcome__app-icon', src: 'icons/icon-192.png', alt: '', width: 96, height: 96, decoding: 'async' }));
}

export function welcomeView({ step }) {
  const keys = introSteps();
  const total = keys.length;
  const n = Math.min(total, Math.max(1, Number.parseInt(step, 10) || 1));
  const key = keys[n - 1];
  const skip = h('a', { class: 'button button--ghost', id: 'welcomeSkip', href: '#/today', onclick: finish }, w.skip);
  // Scrollen (docs/SCROLLEN.md): de stappen en de titel staan vast, de inhoud scrolt eronder (zonder zichtbare balk, met de zachte fade)
  const page = (title, ...content) => h('div', { class: 'welcome-page page welcome', dataset: { step: String(n), key } },
    h('header', { class: 'welcome__header' },
      progress(n, total),
      h('h1', { class: 'page-title welcome__title', id: 'welcomeTitle' }, title)),
    h('div', { class: 'page__scroll welcome__scroll', role: 'region', 'aria-labelledby': 'welcomeTitle' }, ...content));
  const actions = (...children) => h('div', { class: 'welcome__actions' }, ...children);
  const next = (primary = true) => h('a', { class: `button button--${primary ? 'primary button--block' : 'secondary button--block'}`, id: 'welcomeNext', href: stepHash(n + 1) }, w.next);
  const back = h('a', { class: 'button button--ghost', id: 'welcomeBack', href: stepHash(n - 1) }, w.back);

  if (key === 'idea') {
    // De stijl kies je meteen, zodat je de rest van de introductie al in je eigen thema ziet (kleuren én mascottes). Na een keuze tekenen we
    // de stap opnieuw, op dezelfde scrollplek en met de focus weer op de gekozen kaart.
    const pick = async (id) => {
      const scrolled = root.querySelector('.welcome__scroll')?.scrollTop ?? 0;
      await saveSettings({ theme: id });
      const fresh = welcomeView({ step });
      root.replaceWith(fresh);
      fresh.querySelector('.welcome__scroll').scrollTop = scrolled;
      fresh.querySelector(`input[name="theme"][value="${id}"]`)?.focus();
    };
    const root = page(
      w.title1,
      hero('brand', 'sprout'),
      h('p', null, w.text1),
      h('section', { class: 'welcome__theme', 'aria-labelledby': 'welcomeThemeTitle' },
        h('h2', { class: 'welcome__subtitle', id: 'welcomeThemeTitle' }, w.themeTitle),
        themeOptions({ current: themeFor(state.settings.theme).id, onPick: pick }),
        h('p', { class: 'xs muted' }, w.themeHint)),
      growth(),
      points(w.points1, ['tip-never-miss-twice', 'tip-start-small']),
      actions(next(), skip),
      h('p', { class: 'xs muted' }, w.haveAccount, ' ', h('a', { id: 'welcomeLogin', href: '#/login', onclick: finish }, w.login)));
    return root;
  }
  if (key === 'install') {
    // met een installeerknop is die de hoofdzaak en is "Volgende" de rustiger keuze
    return page(
      w.titleInstall,
      appIcon(),
      h('p', null, w.textInstall),
      points(w.installBenefits, ['phone', 'screen-off']),
      installPanel(),
      actions(next(!pwa.canInstall), back, skip),
      h('p', { class: 'xs muted' }, w.installLater));
  }
  if (key === 'day') {
    return page(
      w.title2,
      h('p', null, w.text2),
      demo(),
      h('p', null, w.points2[0]),
      h('h2', { class: 'welcome__subtitle' }, w.rhythmsTitle),
      h('p', null, w.points2[1]),
      rhythmList(),
      actions(next(), back, skip));
  }
  return page(
    w.title3,
    hero('empty', 'tip-start-small'),
    h('p', null, w.text3),
    starters(),
    actions(
      h('a', { class: 'button button--secondary button--block', id: 'welcomeOwn', href: '#/habits/new?intro=1', onclick: finish }, w.own),
      h('a', { class: 'button button--ghost', id: 'welcomeLater', href: '#/today', onclick: finish }, w.later),
      back),
    h('p', { class: 'xs muted' }, w.laterHint));
}
