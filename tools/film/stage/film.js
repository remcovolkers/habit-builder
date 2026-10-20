// De motor van het uitlegfilmpje: bestuurt de echte app in het iframe (tikken, typen, scrollen), toont de uitleg ernaast en de titelkaarten.
// De scènes staan in script.js. Dev: open /film/?dev (geen autoplay; window.F is beschikbaar) of /film/?scene=3 (alleen scène 3).
import { narrationFor, chapterNarration } from './narration.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const frame = $('app');
const params = new URLSearchParams(location.search);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- de stem ------------------------------------------------------------------------------------------------------------------
// record.mjs maakt van elke uitleg een geluidsfragment (stage/narration.js bepaalt de tekst) en zet de lengtes in /film/voice.json. Een uitleg blijft
// zo lang staan als zijn fragment duurt en de volgende wacht tot het klaar is: er overlapt dus nooit iets. Zonder voice.json is het filmpje stil
// en bepaalt de leestijd hoe lang een uitleg blijft staan. Het moment waarop elk fragment begint, bewaren we in window.__audioLog.
let voice = {};
try {
  const response = await fetch('/film/voice.json');
  if (response.ok) voice = await response.json();
} catch { /* geen stem */ }
const realNow = () => performance.timeOrigin + performance.now();
window.__audioLog = [];
let audioEnd = 0;
const VOICE_GAP = 500; // een korte stilte na elk fragment
const untilFree = async () => { const wait = audioEnd - realNow(); if (wait > 0) await sleep(wait); };
/** Laat nu een fragment horen (we wachten niet). Geeft de ms tot het einde terug, of null als er geen fragment is. */
function speak(text) {
  const clip = text ? voice[text] : null;
  if (!clip) return null;
  const at = realNow();
  window.__audioLog.push({ text, at });
  audioEnd = at + clip.ms + VOICE_GAP;
  return clip.ms + VOICE_GAP;
}

function fit() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
  stage.dataset.scale = String(scale);
}
addEventListener('resize', fit);
fit();

// ---- de app in de telefoon ----------------------------------------------------------------------------------------------
const doc = () => frame.contentDocument;
const win = () => frame.contentWindow;

/** Leeg maken en vullen: kind = 'empty' | 'demo'. Draait in een verborgen iframe (zie seed.html). */
async function seed({ kind, today, intro = 'seen', theme = '', variant = 'full' }) {
  frame.src = 'about:blank';
  await sleep(150);
  const hidden = document.createElement('iframe');
  hidden.style.display = 'none';
  const done = new Promise((resolve) => {
    const onMessage = (event) => { if (event.data?.film === 'seeded') { removeEventListener('message', onMessage); resolve(event.data.message); } };
    addEventListener('message', onMessage);
  });
  hidden.src = `/film/seed.html?kind=${kind}&today=${today}&intro=${intro}&theme=${theme}&variant=${variant}`;
  document.body.append(hidden);
  const result = await done;
  hidden.remove();
  if (result !== 'ok') throw new Error(`seed mislukt: ${result}`);
  await sleep(150);
}

/** Zet de nepklok (voor de app en voor de volgende seed) en geeft de datum van "vandaag" terug. */
function setClock(iso) {
  $('clock').textContent = iso.slice(11).replace(/^0/, '') || '8:12';
  try { sessionStorage.setItem('film-now', iso); } catch { /* geen opslag: de klok blijft dan op de echte tijd */ }
  return iso.slice(0, 10);
}

/** Laadt de app opnieuw op een pagina (hash) en wacht tot hij getekend is. */
async function open(hash = '#/today', { wait = 900 } = {}) {
  await new Promise((resolve) => { frame.onload = resolve; frame.src = `/index.html${hash}`; });
  frame.onload = null;
  await sleep(wait);
}

/** Zet de app op een nieuwe stand: klok, gegevens en pagina. */
async function startApp({ now = '2026-10-20T08:12', kind = 'demo', hash = '#/today', intro = 'seen', theme = '', variant = 'full', social = false } = {}) {
  try { sessionStorage.setItem('film-social', social ? '1' : '0'); } catch { /* zonder opslag geen nepserver */ }
  const today = setClock(now);
  await seed({ kind, today, intro, theme, variant });
  await open(hash);
}

/** De tekst op het scherm van de app, op één regel (om te zien wat er staat). */
const text = (max = 3000) => doc().body.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, max);
const labels = () => [...doc().querySelectorAll('button, a[href], [role=button], input, select, textarea')].filter(visible).map((el) => labelOf(el)).filter(Boolean);

const go = async (hash, wait = 700) => { win().location.hash = hash; await sleep(wait); };

// ---- zoeken, tikken, typen -----------------------------------------------------------------------------------------------
const INTERACTIVE = 'button, a[href], [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem], summary, label, input, select, textarea';
const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const labelOf = (el) => norm(el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder);
function visible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = win().getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && el.closest('[hidden], [inert], [aria-hidden="true"]') === null;
}

/** spec: een element, 'css:.selector', een tekst (exact, anders "bevat") of { text, nth, within, css }. */
function find(spec) {
  if (spec instanceof win().Element) return spec;
  const options = typeof spec === 'string' ? { text: spec } : spec;
  const root = options.within ? (typeof options.within === 'string' ? doc().querySelector(options.within) : options.within) : doc();
  if (!root) return null;
  const nth = options.nth ?? 0;
  let list;
  if (options.css || (options.text && options.text.startsWith('css:'))) list = [...root.querySelectorAll(options.css ?? options.text.slice(4))].filter(visible);
  else {
    const wanted = norm(options.text);
    const all = [...root.querySelectorAll(INTERACTIVE)].filter(visible);
    list = all.filter((el) => labelOf(el) === wanted);
    if (!list.length) list = all.filter((el) => labelOf(el).includes(wanted));
  }
  if (options.inside) {
    const wanted = norm(options.inside);
    list = list.filter((el) => norm(el.closest('li, article, section')?.textContent).includes(wanted));
  }
  return list.at(nth) ?? null;
}

async function waitFor(spec, timeout = 5000) {
  const end = Date.now() + timeout;
  for (;;) {
    const el = find(spec);
    if (el) return el;
    if (Date.now() > end) throw new Error(`niet gevonden in de app: ${JSON.stringify(typeof spec === 'string' ? spec : spec.text ?? spec.css)}`);
    await sleep(120);
  }
}

/** Het eerste scrollgebied in de app dat echt scrolt (de pagina zelf of een kolom). */
function scroller() {
  const candidates = [...doc().querySelectorAll('main, [class*=view], [class*=scroll], .app, body')].filter((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(win().getComputedStyle(el).overflowY));
  return candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? doc().scrollingElement;
}
async function scrollBy(top, wait = 900) {
  scroller().scrollBy({ top, behavior: 'smooth' });
  await sleep(wait);
}
async function scrollTop(wait = 600) {
  scroller().scrollTo({ top: 0, behavior: 'smooth' });
  await sleep(wait);
}
/** Scrolt naar een kop of tekst (die hoeft niet aantikbaar te zijn) en zet hem in het midden van het scherm. */
async function scrollToText(text, { block = 'start', wait = 1000 } = {}) {
  const wanted = norm(text);
  const own = (node) => norm([...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(' '));
  const el = [...doc().body.querySelectorAll('*')].filter(visible).find((node) => own(node).includes(wanted));
  if (!el) throw new Error(`tekst niet gevonden in de app: ${text}`);
  el.scrollIntoView({ block, behavior: 'smooth' });
  await sleep(wait);
}

/** Haalt "testomgeving" weg uit de versieregel (we draaien op localhost, maar het filmpje hoort bij de echte app). */
function cleanVersionLine() {
  const line = doc().getElementById('versionLine');
  if (line) line.textContent = line.textContent.replace(' · testomgeving', '');
}

async function reveal(el) {
  const rect = el.getBoundingClientRect();
  const height = win().innerHeight;
  if (rect.top < 90 || rect.bottom > height - 110) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(750);
  }
}

const tapDot = $('tap');
async function showTap(el) {
  const scale = Number(stage.dataset.scale) || 1;
  const rect = el.getBoundingClientRect();
  const x = 14 + rect.left + Math.min(rect.width / 2, 90);
  const y = 14 + 44 + rect.top + rect.height / 2;
  tapDot.className = 'tap';
  tapDot.style.left = `${x}px`;
  tapDot.style.top = `${y}px`;
  void tapDot.offsetWidth;
  tapDot.classList.add('is-down');
  await sleep(170);
  tapDot.classList.replace('is-down', 'is-up');
  return scale;
}

/** Tikt op een knop, link of vakje, met een zichtbare tik. */
async function tap(spec, { after = 650 } = {}) {
  const el = await waitFor(spec);
  await reveal(el);
  await showTap(el);
  el.focus?.({ preventScroll: true });
  el.click();
  await sleep(after);
  return el;
}

/** Typt tekst in een veld, letter voor letter. */
async function type(spec, text, { delay = 55, after = 500 } = {}) {
  const el = await waitFor(spec);
  await reveal(el);
  await showTap(el);
  el.focus({ preventScroll: true });
  const proto = el instanceof win().HTMLTextAreaElement ? win().HTMLTextAreaElement.prototype : win().HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  let value = '';
  for (const char of text) {
    value += char;
    setter.call(el, value);
    el.dispatchEvent(new (win().Event)('input', { bubbles: true }));
    await sleep(delay);
  }
  el.dispatchEvent(new (win().Event)('change', { bubbles: true }));
  await sleep(after);
}

// ---- uitleg naast de telefoon --------------------------------------------------------------------------------------------
const panel = $('panel');
/** "**vet**" en "{{accent}}" in een tekst. */
function rich(target, text) {
  target.textContent = '';
  for (const part of String(text ?? '').split(/(\*\*[^*]+\*\*|\{\{[^}]+\}\})/)) {
    if (!part) continue;
    if (part.startsWith('**')) { const b = document.createElement('b'); b.textContent = part.slice(2, -2); target.append(b); }
    else if (part.startsWith('{{')) { const em = document.createElement('em'); em.textContent = part.slice(2, -2); target.append(em); }
    else target.append(part);
  }
}

let chapterName = '';
/** Toont een uitleg; geeft het aantal ms terug dat een rustige lezer nodig heeft. */
async function say(content = {}) {
  const { title = '', body = '', points = [], kicker } = content;
  const text = narrationFor(content);
  if (voice[text]) await untilFree(); // de vorige uitleg blijft staan tot zijn stem klaar is
  panel.classList.add('is-out');
  await sleep(400);
  rich($('kicker'), kicker ?? chapterName);
  rich($('title'), title);
  rich($('body'), body);
  const list = $('points');
  list.textContent = '';
  for (const point of points) { const li = document.createElement('li'); rich(li, point); list.append(li); }
  panel.classList.remove('is-out');
  const spoken = speak(text);
  if (spoken !== null) return spoken;
  const words = `${title} ${body} ${points.join(' ')}`.trim().split(/\s+/).length;
  return Math.max(3000, Math.round(words * 270));
}
/** Uitleg tonen en meteen de leestijd afwachten. */
async function sayAndRead(content) { await sleep(await say(content)); }
async function hush() { panel.classList.add('is-out'); await sleep(420); }
// de pauzes in het draaiboek zijn voor stil lezen bedoeld; met een stem erbij zijn ze veel te lang
const hold = (ms) => sleep(Object.keys(voice).length ? Math.max(500, Math.round(ms * 0.4)) : ms);

// ---- hoofdstukken en titelkaarten ------------------------------------------------------------------------------------------
let chapters = [];
function renderProgress(index) {
  const bar = $('progress');
  bar.textContent = '';
  chapters.forEach((name, i) => {
    const item = document.createElement('div');
    item.className = `progress__item${i < index ? ' is-done' : ''}${i === index ? ' is-now' : ''}`;
    item.textContent = i === index ? `${i + 1} ${name}` : String(i + 1);
    bar.append(item);
  });
}
async function showCard({ kicker = '', title = '', sub = '', icon = '', ms = 3500, voice: said } = {}) {
  const text = said !== undefined ? narrationFor({ voice: said }) : narrationFor({ title, body: sub });
  if (voice[text]) await untilFree();
  $('cardKicker').textContent = kicker;
  $('cardTitle').textContent = title;
  $('cardSub').textContent = sub;
  if (icon) $('cardIcon').src = icon; else $('cardIcon').removeAttribute('src');
  $('card').classList.add('is-on');
  const spoken = speak(text);
  await sleep(Math.max(ms, spoken ?? 0));
}
async function hideCard() { $('card').classList.remove('is-on'); await sleep(650); }

/** Opent een hoofdstuk: titelkaart (met de app op de achtergrond klaargezet), daarna de set met de voortgang. */
async function chapter(index, { sub = '', ms = 2600, start = null } = {}) {
  const text = chapterNarration(index, chapters[index], sub);
  await untilFree();
  chapterName = chapters[index];
  renderProgress(index);
  await hush();
  const began = Date.now();
  await showCard({ kicker: `Hoofdstuk ${index + 1}`, title: chapterName, sub, ms: 700, voice: '' });
  const spoken = speak(text);
  if (start) await startApp(start);
  const left = Math.max(ms, 700 + (spoken ?? 0)) - (Date.now() - began);
  if (left > 0) await sleep(left);
  await hideCard();
}

/** Een zachte overgang binnen een hoofdstuk: de app wordt opnieuw gezet achter een lege kaart. */
async function cut(start) {
  await untilFree();
  await hush();
  await showCard({ ms: 650 });
  await startApp(start);
  await hideCard();
}

export const F = {
  cut,
  scrollToText, cleanVersionLine, text, labels, frame, doc, win, sleep, hold, find, waitFor, tap, type, scrollBy, scrollTop, go, open, startApp, setClock, seed,
  say, sayAndRead, hush, showCard, hideCard, chapter, renderProgress,
  setChapters(list) { chapters = list; },
  beginChapter(index) { chapterName = chapters[index]; renderProgress(index); },
  panel, stage,
};
window.F = F;

// ---- afspelen ------------------------------------------------------------------------------------------------------------------
if (!params.has('dev')) {
  while (params.has('wait') && !window.__filmStart) await sleep(40); // de opname geeft het startsein, zodat er geen stem klinkt voor het beeld loopt
  const { play } = await import('./script.js');
  window.__filmDone = false;
  try {
    await play(F, { only: params.get('scene') });
    await untilFree();
  } catch (error) {
    window.__filmError = String(error?.stack ?? error);
    console.error(error);
  }
  window.__filmDone = true;
}
