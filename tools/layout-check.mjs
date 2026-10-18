// Meet in een echte browser (headless Edge of Chrome, zonder Supabase) de ruimte onder de laatste kaart op Vandaag en Habits, en of de
// zwevende knop (FAB) de laatste kaart afdekt. Aanleiding: te veel scrollruimte onder de lijst (docs/ITERATIE-1.2.md §4).
// Gebruik: npm run check:layout. Een andere browser: zet BROWSER op het pad.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROWSER = [
  process.env.BROWSER,
  process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env.ProgramFiles && `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].find((p) => p && existsSync(p));
if (!BROWSER) throw new Error('Geen Edge of Chrome gevonden (zet BROWSER op het pad van de browser)');
const PORT = 5175;
const DEBUG = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'hb-layout-'));
const edge = spawn(BROWSER, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
edge.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-1500); });
let browserExit = null;
edge.on('exit', (code, signal) => { browserExit = `${code ?? signal}`; });
const cleanup = () => {
  server.kill();
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); // wachten, anders houdt de browser het profiel nog vast
  else edge.kill('SIGKILL');
  // het tijdelijke browserprofiel (honderden MB) weghalen: zonder dit loopt de schijf na een paar runs vol
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* blijft liggen; het besturingssysteem ruimt tijdelijke bestanden later op */ }
};

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  -> ${detail}`}`);
  if (!ok) {
    failures.push(name);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Lay-outcontrole mislukt::${name} -> ${String(detail).replace(/[\r\n%]+/g, ' ').slice(0, 600)}`);
  }
};

const SEED = (from, to) => `(async () => {
  const { state, notifyChanged } = await import('/src/ui/state.js');
  const all = [0, 1, 2, 3, 4, 5, 6];
  const parts = ['morning', 'morning', 'afternoon', 'evening', 'evening', 'anytime'];
  const start = '2026-09-01';
  for (let i = ${from}; i < ${to}; i++) {
    const flex = i >= 6;
    await state.repo.saveHabit({
      name: (flex ? 'Flexibel ' : 'Habit ') + (i + 1), icon: flex ? '🎸' : '💧', color: flex ? 'c3' : 'c2', daypart: flex ? 'anytime' : parts[i], status: 'active',
      startDate: start, endDate: null, graduationDays: 66, maintenance: false, sortOrder: i, counter: null,
      schedules: [{ effectiveFrom: start, schedule: flex ? { type: 'times_per_period', period: 'week', count: 2 } : { type: 'weekdays', weekdays: all } }],
    });
  }
  notifyChanged();
  return true;
})()`;

// onderkant van de laatste zichtbare inhoud (zonder de FAB), de bovenkant van de tabbalk en de toestand van de FAB, na scrollen naar `offset` px boven het einde
const MEASURE = (offset) => `(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo(0, Math.max(0, max - ${offset}));
  const main = document.querySelector('.app__main');
  const fab = document.querySelector('.fab');
  const kids = [...main.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('.fab'));
  const lastBottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return new Promise((resolve) => setTimeout(() => {
    const barTop = document.querySelector('.tabbar').getBoundingClientRect().top;
    const fabTop = fab ? fab.getBoundingClientRect().top : null;
    resolve({
      scrollable: max, rem,
      gapPx: Math.round(barTop - lastBottom),
      hasFab: Boolean(fab),
      covered: fab ? lastBottom > fabTop : false,
      fabShown: fab ? getComputedStyle(fab).opacity === '1' : false,
    });
  }, 400));
})()`;

async function main() {
  // de browser krijgt ruim de tijd om op te starten (een trage CI-machine heeft er soms meer dan 10 seconden voor nodig)
  let page = null;
  for (let i = 0; i < 160 && !page && browserExit === null; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()).find((t) => t.type === 'page') ?? null; } catch { /* de browser start nog */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`de browser kwam niet op (${BROWSER}; ${browserExit === null ? 'geen antwoord na 40 s' : `gestopt met ${browserExit}`}): ${browserLog.replace(/\s+/g, ' ').slice(-400)}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  const nav = async (route) => { await send('Page.navigate', { url: `http://localhost:${PORT}/#/${route}` }); await sleep(1200); };

  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // anders krijgt een headless pagina nooit echte focus
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('today');

  // Introductie (docs/ONBOARDING.md): de browser begint met een leeg profiel, dus dit is een nieuwe gebruiker zonder habits
  const introHash = await ev('location.hash');
  check('een nieuwe gebruiker zonder habits landt bij het starten op de introductie', introHash === '#/welkom/1', introHash);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await nav('welkom/1');
  const totalSteps = await ev(`document.querySelectorAll('.welcome__dot').length`);
  check('introductie: vier stappen (met de app installeren) in een browser waar de app nog niet geïnstalleerd is', totalSteps === 4, String(totalSteps));
  const loginHint = await ev(`(() => { const l = document.querySelector('#welcomeLoginHint'); return { exists: !!l, hidden: l?.hidden ?? null, link: document.querySelector('#welcomeLogin')?.getAttribute('href') }; })()`);
  check('introductie, stap 1: zonder account staat "Heb je al een account? Log in" erbij', loginHint.exists && loginHint.hidden === false && loginHint.link === '#/login', JSON.stringify(loginHint));
  // "Log in" onthoudt dat je terug wilt naar de introductie (de inlog zelf is hier niet te doen); overslaan vergeet dat weer
  await ev(`document.querySelector('#welcomeLogin').click()`);
  await sleep(400);
  const remembered = await ev(`({ hash: location.hash, stored: JSON.parse(localStorage.getItem('hb-after-login') ?? 'null')?.hash ?? null })`);
  await nav('welkom/1');
  await ev(`document.querySelector('#welcomeSkip').click()`);
  await sleep(300);
  const forgotten = await ev(`localStorage.getItem('hb-after-login')`);
  check('introductie, stap 1: "Log in" onthoudt de terugweg naar de introductie en "Overslaan" vergeet hem weer', remembered.hash === '#/login' && remembered.stored === '#/welkom/1' && forgotten === null, JSON.stringify({ remembered, forgotten }));
  await ev(`localStorage.removeItem('hb-intro-seen')`); // de rest van de controle gaat uit van een introductie die nog niet is afgerond
  await nav('welkom/1');
  // de stijl kiezen op de eerste stap: het thema, de mascottes en de stap zelf veranderen meteen mee, en de focus blijft op de gekozen kaart
  // de kaarten staan naast elkaar (320 px) met een omschrijving van een verschillende lengte, en zijn toch even hoog
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await ev(`document.querySelector('.welcome__theme .theme-option__desc').textContent += ' met een veel langere omschrijving die over meer regels loopt dan de andere kaart'`);
  const cardHeights = await ev(`[...document.querySelectorAll('.welcome__theme .theme-option__face')].map((f) => Math.round(f.getBoundingClientRect().height))`);
  const sideBySide = await ev(`new Set([...document.querySelectorAll('.welcome__theme .theme-option')].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1`);
  check('introductie, stap 1: de stijlkaarten staan naast elkaar en zijn even hoog, ook als de omschrijving van de ene langer is', sideBySide && cardHeights.length === 2 && cardHeights[0] === cardHeights[1], JSON.stringify({ sideBySide, cardHeights }));
  await nav('welkom/1'); // de langere omschrijving was alleen voor de meting
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  const themed = await ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = { theme: document.documentElement.dataset.theme, cards: document.querySelectorAll('.welcome__theme .theme-option').length, mascots: document.querySelectorAll('.welcome__stop-mascot').length };
    document.querySelector('.welcome__theme input[value="mel"]').click();
    await wait(600);
    const after = { theme: document.documentElement.dataset.theme, mascots: document.querySelectorAll('.welcome__stop-mascot').length, checked: document.querySelector('.welcome__theme input[value="mel"]')?.checked === true,
      focus: document.activeElement?.value ?? null, step: document.querySelector('.welcome')?.dataset.key };
    document.querySelector('.welcome__theme input[value="v0lky1"]').click();
    await wait(600);
    return { before, after, back: document.documentElement.dataset.theme };
  })()`);
  check('introductie, stap 1: de stijl kiezen (twee kaarten) past het thema meteen toe, de mascottes veranderen mee en de focus blijft op de gekozen kaart',
    themed.before.cards === 2 && themed.before.theme === 'v0lky1' && themed.before.mascots === 0 && themed.after.theme === 'mel' && themed.after.mascots === 3 && themed.after.checked && themed.after.focus === 'mel' && themed.after.step === 'idea' && themed.back === 'v0lky1',
    JSON.stringify(themed));
  for (let step = 1; step <= totalSteps; step++) {
    await nav(`welkom/${step}`);
    await ev(`document.documentElement.style.fontSize = '200%'`);
    await sleep(300);
    const s = await ev(`(() => ({ key: document.querySelector('.welcome')?.dataset.key, title: document.querySelector('#welcomeTitle')?.textContent ?? '', overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tiny: [...document.querySelectorAll('.welcome a.button, .welcome__starter')].filter((a) => a.getBoundingClientRect().height < 44).length, starters: document.querySelectorAll('.welcome__starter').length,
      installIcon: !!document.querySelector('.welcome__app-icon'), installHow: !!document.querySelector('#installApp, .welcome__steps') }))()`);
    check(`introductie, stap ${step} (${s.key}): past op 320 px met 200% tekst en alle knoppen zijn minstens 44 px`,
      s.title !== '' && s.overflow <= 0 && s.tiny === 0 && (s.key !== 'habit' || s.starters >= 5) && (s.key !== 'install' || (s.installIcon && s.installHow)), JSON.stringify(s));
  }
  // Scrollen: de stappen en de titel staan vast, de inhoud scrolt eronder zonder zichtbare balk, en de pagina zelf scrolt niet (telefoon en desktop)
  for (const [what, w, h, mobile] of [['telefoon', 390, 844, true], ['desktop', 1280, 700, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await nav('welkom/2');
    await ev(`document.documentElement.style.fontSize = '100%'`);
    await sleep(500);
    const measure = () => ev(`(() => { const hd = document.querySelector('.welcome__header').getBoundingClientRect(); const sc = document.querySelector('.welcome__scroll');
      return { headerTop: Math.round(hd.top), headerBottom: Math.round(hd.bottom), top: sc.scrollTop, room: sc.scrollHeight - sc.clientHeight, bar: sc.offsetWidth - sc.clientWidth, win: window.scrollY,
        doc: document.documentElement.scrollHeight - innerHeight, fadeBottom: sc.hasAttribute('data-fade-bottom'), inView: hd.top >= 0 && hd.bottom <= innerHeight }; })()`);
    const before = await measure();
    await ev(`document.querySelector('.welcome__scroll').scrollTop = 200`);
    await sleep(400);
    const after = await measure();
    check(`introductie, ${what}: titel en stappen blijven staan terwijl de inhoud scrolt, zonder zichtbare scrollbalk en zonder dat de pagina scrolt`,
      before.room > 200 && after.top > 100 && after.headerTop === before.headerTop && after.headerBottom === before.headerBottom && after.inView && after.bar === 0 && after.win === 0 && after.doc <= 1 && before.fadeBottom,
      JSON.stringify({ before, after }));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  // de weg door de introductie: volgende, volgende, een sjabloon kiezen, opslaan, en dan op Vandaag één keer de tip
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await nav('welkom/1');
  const visited = [];
  for (let i = 0; i < totalSteps && !(await ev(`!!document.querySelector('.welcome__starter')`)); i++) {
    visited.push(await ev(`document.querySelector('.welcome')?.dataset.key`));
    await ev(`document.querySelector('#welcomeNext').click()`);
    await sleep(300);
  }
  visited.push(await ev(`document.querySelector('.welcome')?.dataset.key`));
  await ev(`document.querySelector('.welcome__starter[data-template="reading"]').click()`);
  await sleep(600);
  const form = await ev(`({ hash: location.hash, name: document.querySelector('#name')?.value, example: document.querySelector('#scheduleExample')?.textContent ?? '' })`);
  check('introductie: met "Volgende" via het idee, de dag en het installeren naar de eerste habit, en een sjabloon opent het formulier met een voorbeeld bij het ritme',
    visited.join(',') === 'idea,day,install,habit' && form.hash.includes('template=reading') && form.name === '10 minuten lezen' && form.example.startsWith('Bijvoorbeeld:'), JSON.stringify({ visited, form }));
  await ev(`document.querySelector('.form__actions .button--primary').click()`);
  await sleep(900);
  const tip = await ev(`({ hash: location.hash, tip: !!document.querySelector('#firstTip'), seen: localStorage.getItem('hb-intro-seen') })`);
  check('introductie: na het opslaan van de eerste habit sta je op Vandaag met de tip, en de introductie is gezien', tip.hash === '#/today' && tip.tip && tip.seen === '1', JSON.stringify(tip));
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); // een eerste habit met een minimale versie viert "Kleine stap" (een modale dialoog)
  await ev(`document.querySelector('#firstTip .nudge__dismiss').click()`);
  await sleep(200);
  const tipGone = await ev(`({ gone: !document.querySelector('#firstTip'), stored: localStorage.getItem('hb-first-tip') })`);
  check('introductie: de tip is te sluiten en komt niet terug', tipGone.gone && tipGone.stored === null, JSON.stringify(tipGone));
  // opruimen: de habit weer weg, zodat de metingen hieronder van een schone start uitgaan
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); for (const habit of await state.repo.listHabits()) await state.repo.deleteHabit(habit.id); notifyChanged(); })()`);
  // Zo werkt het: bereikbaar uit Instellingen, past op 320 px met 200% tekst en biedt de introductie opnieuw aan
  await nav('settings');
  const link = await ev(`document.querySelector('#guideLink')?.getAttribute('href')`);
  await nav('uitleg');
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(300);
  const guide = await ev(`({ sections: document.querySelectorAll('.guide__section').length, types: document.querySelectorAll('.guide__type').length, replay: document.querySelector('#replayIntro')?.getAttribute('href'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
  check('Zo werkt het: staat in Instellingen, past op 320 px met 200% tekst en biedt de introductie opnieuw aan', link === '#/uitleg' && guide.sections >= 8 && guide.types === 6 && guide.replay === '#/welkom/1' && guide.overflow <= 0, JSON.stringify({ link, guide }));
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('today');
  // zonder habits en zonder zwevende knop heeft een lege Vandaag op de telefoon zelf een knop om de eerste habit te maken
  const emptyToday = await ev(`(() => { const b = document.querySelector('.empty .button--primary[href="#/habits/new"]'); return { button: !!b && b.getBoundingClientRect().height >= 44, fab: !!document.querySelector('.fab') }; })()`);
  check('lege Vandaag op de telefoon: een knop "Eerste habit maken" en geen zwevende knop', emptyToday.button && !emptyToday.fab, JSON.stringify(emptyToday));

  // Scrollbalk: op een touchscherm geen (je scrolt met je vinger), met een muis de dunne balk in het thema en een gereserveerde strook
  const barInfo = () => ev(`(() => { const css = (el) => (el ? { width: getComputedStyle(el).scrollbarWidth, gutter: getComputedStyle(el).scrollbarGutter } : null);
    return { coarse: matchMedia('(pointer: coarse)').matches, noHover: matchMedia('(hover: none)').matches, html: css(document.documentElement), body: css(document.body) }; })()`);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }); // zoals een telefoon: pointer coarse, hover none
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await nav('habits');
  await sleep(300);
  const touchBar = await barInfo();
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 700, deviceScaleFactor: 1, mobile: false }); // een smal venster met een muis (vanaf 960 px scrolt het werkvlak en reserveert de pagina zelf geen strook)
  await nav('habits');
  await sleep(300);
  const mouseBar = await barInfo();
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  check('scrollbalk: op een touchscherm geen balk en geen gereserveerde strook, met een muis de dunne balk in het thema en een gereserveerde strook',
    touchBar.coarse && touchBar.noHover && touchBar.html.width === 'none' && touchBar.html.gutter === 'auto' && touchBar.body.width === 'none'
      && !mouseBar.coarse && mouseBar.html.width === 'thin' && mouseBar.html.gutter.startsWith('stable'), JSON.stringify({ touchBar, mouseBar }));

  const sizes = [['390x844', 390, 844, 100], ['320x568', 320, 568, 100], ['320x568, tekst 200%', 320, 568, 200]];
  for (const [phase, count] of [['weinig habits', 2], ['veel habits', 8]]) {
    await ev(SEED(phase === 'weinig habits' ? 0 : 2, count));
    for (const [size, w, h, zoom] of sizes) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      for (const route of ['today', 'habits']) {
        await nav(route);
        await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
        await sleep(300);
        const label = `${route} · ${phase} · ${size}`;
        const end = await ev(MEASURE(0));
        // de zwevende knop hoort bij de lijst op Habits; op Vandaag staat hij niet (daar suggereert hij samen met de datumkeuze dat je ook voor een andere dag een habit kunt toevoegen)
        check(`${label}: ${route === 'habits' ? 'de zwevende knop staat er' : 'geen zwevende knop'}`, end.hasFab === (route === 'habits'), JSON.stringify(end));
        if (phase === 'weinig habits') {
          // past de pagina niet op het scherm, dan scrolt hij (en geldt de rest hieronder niet); anders staat de knop er gewoon
          if (end.scrollable <= 0) { if (route === 'habits') check(`${label}: past op het scherm, knop blijft staan`, end.fabShown, JSON.stringify(end)); }
          else check(`${label}: einde, hoogstens 2rem onder de laatste kaart`, end.gapPx <= 2 * end.rem, `${end.gapPx}px`);
          continue;
        }
        check(`${label}: einde, hoogstens 2rem onder de laatste kaart`, end.gapPx <= 2 * end.rem, `${end.gapPx}px (${(end.gapPx / end.rem).toFixed(1)}rem)`);
        if (route !== 'habits') continue;
        check(`${label}: einde, de knop dekt de laatste kaart niet af`, !end.covered || !end.fabShown, JSON.stringify(end));
        const up = await ev(MEASURE(Math.round(8 * end.rem)));
        check(`${label}: 8rem hoger is de knop er weer`, up.fabShown, JSON.stringify(up));
      }
    }
  }

  // toetsenbord: op het einde van de pagina blijft de knop bereikbaar
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('today');
  // de prestatie "Drie tegelijk" door de testgegevens opent een viering (een modale dialoog): eerst sluiten, anders neemt zij de focus
  await ev(`document.querySelector('dialog[open] .button--primary')?.click()`);
  await sleep(400);
  await nav('habits');
  await sleep(400);
  await ev(MEASURE(0));
  const focused = await ev(`new Promise((resolve) => {
    const f = document.querySelector('.fab');
    f.focus();
    setTimeout(() => resolve({ active: document.activeElement === f, cls: f.className, opacity: getComputedStyle(f).opacity }), 400);
  })`);
  check('toetsenbordfocus haalt de knop terug aan het einde van de pagina', focused.active && focused.opacity === '1', JSON.stringify(focused));
  // zeldzame taken op Vandaag: na het afvinken vraagt de kaart om een cijfer voor het automatisme; een vaste dag in de maand die voorbij is
  // staat als "te laat" met de vraag wat je tegenhield (die dag is gisteren, dus niet te controleren op de eerste van de maand)
  const rare = await ev(`(async () => {
    const { state, notifyChanged } = await import('/src/ui/state.js');
    const base = { icon: '🌱', color: 'c4', daypart: 'anytime', status: 'active', startDate: '2026-01-01', endDate: null, graduationDays: 66, maintenance: false, counter: null };
    const garden = await state.repo.saveHabit({ ...base, name: 'Tuin opruimen', sortOrder: 20, schedules: [{ effectiveFrom: '2026-01-01', schedule: { type: 'times_per_period', period: 'month', count: 2 } }] });
    await state.repo.setCheckIn({ habitId: garden.id, date: state.today, status: 'done' });
    const day = Number(state.today.slice(8)) - 1;
    await state.repo.saveHabit({ ...base, name: 'Bed opmaken', icon: '🛏️', sortOrder: 22, schedules: [{ effectiveFrom: '2026-01-01', schedule: { type: 'times_per_period', period: 'month', count: 2 } }] }); // nooit gedaan: stil
    if (day >= 1) await state.repo.saveHabit({ ...base, name: 'Rekening betalen', sortOrder: 21, schedules: [{ effectiveFrom: '2026-01-01', schedule: { type: 'day_of_month', day } }] });
    notifyChanged();
    return { late: day >= 1 };
  })()`);
  for (const [size, w, h, zoom] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await nav('today');
    await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
    await sleep(300);
    const label = `zeldzame taak op Vandaag · ${size}`;
    await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); // een viering (prestatie) opent vanzelf; gemeten wordt de pagina zelf
    await sleep(200);
    const ask = await ev(`(() => { const a = document.querySelector('.habit-card__ask'); const b = [...(a?.querySelectorAll('.rating button') ?? [])].map((x) => x.getBoundingClientRect());
      return { asked: !!a, buttons: b.length, minW: Math.min(...b.map((r) => r.width)), minH: Math.min(...b.map((r) => r.height)), inside: a ? a.scrollWidth <= a.clientWidth : false, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
    check(`${label}: vraag om het cijfer, vijf knoppen ≥ 44px, past in de kaart`, ask.asked && ask.buttons === 5 && ask.minW >= 44 && ask.minH >= 44 && ask.inside, JSON.stringify(ask));
    if (ask.overflow > 0) console.log(`INFO ${label}: de pagina is ${ask.overflow}px breder dan het scherm (bekend, zie docs/SCROLLEN.md)`);
    const quiet = await ev(`(() => { const c = document.querySelector('.attention-card'); const b = [...(c?.querySelectorAll('button') ?? [])].map((x) => x.getBoundingClientRect());
      return { shown: !!c, buttons: b.length, minH: Math.min(...b.map((r) => r.height)), inside: c ? c.scrollWidth <= c.clientWidth : false, overflow: document.documentElement.scrollWidth - innerWidth, text: c?.querySelector('.attention-card__text')?.textContent }; })()`);
    check(`${label}: "Even kijken" met de stille taak, knoppen ≥ 44px, past in de kaart`, quiet.shown && quiet.buttons === 2 && quiet.minH >= 44 && quiet.inside, JSON.stringify(quiet));
    if (rare.late) {
      const late = await ev(`(() => { const l = document.querySelector('.habit-card__late'); const b = l?.querySelector('button')?.getBoundingClientRect(); return { shown: !!l, h: b?.height, inside: l ? l.scrollWidth <= l.clientWidth : false, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
      check(`${label}: "te laat" met knop ≥ 44px, past in de kaart`, late.shown && late.h >= 44 && late.inside, JSON.stringify(late));
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('today');
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); // een prestatie door de testgegevens opent een viering
  await sleep(300);
  await ev(`document.querySelector('.habit-card__ask .rating button[aria-label="Cijfer 4"]').click()`);
  await sleep(500);
  const rated = await ev(`({ title: document.querySelector('.habit-card__ask-title')?.textContent, pressed: document.querySelector('.habit-card__ask [aria-pressed="true"]')?.textContent })`);
  check('een cijfer geven slaat het op en toont het (aanpasbaar)', rated.title === 'Automatisme: 4 van 5' && rated.pressed === '4', JSON.stringify(rated));
  if (rare.late) {
    await ev(`document.querySelector('.habit-card__late button').click()`);
    await sleep(400);
    const dlg = await ev(`(() => { const d = document.querySelector('dialog[open]'); const radios = [...(d?.querySelectorAll('.choices--reasons input[type=radio]') ?? [])];
      const faces = [...(d?.querySelectorAll('.choice__face--reason') ?? [])].map((f) => f.getBoundingClientRect());
      return { open: !!d, radios: radios.length, field: !!d?.querySelector('#reasonNote'), actions: [...(d?.querySelectorAll('.dialog__actions .button') ?? [])].map((x) => x.textContent), minH: Math.min(...faces.map((r) => r.height)), overflow: d ? d.scrollWidth - d.clientWidth : 1 }; })()`);
    check('"Wat hield je tegen?" opent een blad met zeven redenen, een toelichting en vier knoppen', dlg.open && dlg.radios === 7 && dlg.field && dlg.actions.length === 4 && dlg.minH >= 44 && dlg.overflow <= 0, JSON.stringify(dlg));
    await ev(`[...document.querySelectorAll('.dialog__actions .button')].find((x) => x.textContent === 'Reden opslaan').click()`);
    await sleep(300);
    const noChoice = await ev(`({ still: !!document.querySelector('dialog[open]'), error: document.querySelector('dialog[open] .field__error')?.hidden === false })`);
    check('zonder een reden te kiezen blijft het blad open met een melding', noChoice.still && noChoice.error, JSON.stringify(noChoice));
    await ev(`(() => { document.querySelector('.choices--reasons input[value="no_time"]').click(); const i = document.querySelector('#reasonNote'); i.value = 'Geen tijd'; i.dispatchEvent(new Event('input')); [...document.querySelectorAll('.dialog__actions .button')].find((x) => x.textContent === 'Deze maand overslaan').click(); })()`);
    await sleep(600);
    const skipped = await ev(`(async () => { const { state } = await import('/src/ui/state.js'); const habit = (await state.repo.listHabits()).find((x) => x.name === 'Rekening betalen'); const c = await state.repo.getCheckIn(habit.id, state.today); const r = await state.repo.listReasons(habit.id); return { status: c?.status, note: c?.note, reason: r[0]?.reason, late: !!document.querySelector('.habit-card__late') }; })()`);
    check('overslaan met een reden legt de keuze en de toelichting vast en haalt de "te laat"-melding weg', skipped.status === 'skipped' && skipped.note === 'Geen tijd' && skipped.reason === 'no_time' && !skipped.late, JSON.stringify(skipped));
  }
  // de stille taak: een reden geven haalt hem uit "Even kijken" en zet hem in de terugblik van de week
  const bedCard = `[...document.querySelectorAll('.today__main .attention-card')].find((c) => c.textContent.includes('Bed opmaken'))`;
  await ev(`${bedCard}.querySelector('[data-focus-key^="why:"]').click()`);
  await sleep(400);
  await ev(`(() => { document.querySelector('.choices--reasons input[value="forgot"]').click(); [...document.querySelectorAll('.dialog__actions .button')].find((x) => x.textContent === 'Reden opslaan').click(); })()`);
  await sleep(700);
  const answered = await ev(`({ bed: !!(${bedCard}), others: document.querySelectorAll('.today__main .attention-card').length })`);
  check('na een reden staat de stille taak niet meer in "Even kijken" (de andere, nog onbeantwoorde taken wel)', !answered.bed && answered.others > 0, JSON.stringify(answered));
  for (const [size, w, h, zoom] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await nav('stats');
    await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
    await sleep(400);
    const lookback = await ev(`(() => { const l = document.querySelector('.review__lookback'); const cards = [...(l?.querySelectorAll('.attention-card') ?? [])];
      return { shown: !!l, cards: cards.length, answered: cards.filter((c) => /Bed opmaken/.test(c.textContent) && /Reden: Vergeten/.test(c.textContent)).length, inside: cards.every((c) => c.scrollWidth <= c.clientWidth), bad: cards.filter((c) => c.scrollWidth > c.clientWidth).map((c) => c.textContent.slice(0, 30) + ' ' + c.scrollWidth + '>' + c.clientWidth + ' ' + [...c.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ':' + e.scrollWidth + '>' + e.clientWidth).join(',')), overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
    check(`terugblik in de review · ${size}: taken die aandacht vragen, de beantwoorde met reden, past op het scherm`, lookback.shown && lookback.cards >= 1 && lookback.answered === 1 && lookback.inside && lookback.overflow <= 0, JSON.stringify(lookback));
  }
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await sleep(300);
  // de iconenkiezer: een knop bij de naam opent een blad met alle iconen, met zoeken; kiezen sluit het blad en zet het icoon
  for (const [size, w, h, zoom] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await nav('habits/new');
    await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
    await sleep(300);
    const label = `iconenkiezer · ${size}`;
    const before = await ev(`({ trigger: !!document.querySelector('#iconTrigger'), box: document.querySelector('#iconTrigger')?.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('.app__main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => e.tagName + '.' + e.className) })`);
    check(`${label}: knop bij de naam, groot genoeg, formulier verbreedt niet`, before.trigger && before.box >= 44 && before.overflow <= 0, JSON.stringify(before));
    await ev(`document.querySelector('#iconTrigger').click()`);
    await sleep(400);
    const open = await ev(`(() => { const d = document.querySelector('dialog.dialog--picker'); const tiles = [...d.querySelectorAll('.icon-picker__tile')]; const r = tiles[0].getBoundingClientRect();
      return { open: d.open, tiles: tiles.length, groups: d.querySelectorAll('.icon-picker__group').length, w: r.width, h: r.height, drawn: [...d.querySelectorAll('.icon-picker__tile .theme-icon use')].length, overflow: d.scrollWidth - d.clientWidth, keyboard: document.activeElement?.tagName }; })()`);
    check(`${label}: blad met 60 iconen in 9 onderwerpen, tegels ≥ 44px, geen overflow, focus niet in het zoekveld`, open.open && open.tiles === 60 && open.groups === 9 && open.w >= 44 && open.h >= 44 && open.drawn === 60 && open.overflow <= 0 && open.keyboard !== 'INPUT', JSON.stringify(open));
    await ev(`(() => { const i = document.querySelector('#iconSearch'); i.value = 'gitaar'; i.dispatchEvent(new Event('input')); })()`);
    const found = await ev(`[...document.querySelectorAll('.icon-picker__tile')].map((t) => t.title)`);
    check(`${label}: zoeken op "gitaar" vindt alleen de gitaar`, found.length === 1 && found[0] === 'Gitaar spelen', JSON.stringify(found));
    await ev(`document.querySelector('.icon-picker__tile').click()`);
    await sleep(400);
    const after = await ev(`({ closed: !document.querySelector('dialog'), label: document.querySelector('#iconTrigger').getAttribute('aria-label'), focus: document.activeElement?.id })`);
    check(`${label}: kiezen sluit het blad, zet het icoon en geeft de focus terug aan de knop`, after.closed && /Gitaar spelen/.test(after.label) && after.focus === 'iconTrigger', JSON.stringify(after));
  }
  // het blad sluit door buiten het blad te tikken en door het aan het handvat naar beneden te slepen; een klein stukje slepen veert terug
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const drag = async (x, y, dy) => {
    await mouse('mousePressed', x, y);
    for (let step = 1; step <= 8; step += 1) { await mouse('mouseMoved', x, y + (dy * step) / 8); await sleep(15); }
    await mouse('mouseReleased', x, y + dy);
    await sleep(500);
  };
  const openPicker = async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await nav('habits/new');
    await ev(`document.querySelector('#iconTrigger').click()`);
    await sleep(400);
    return ev(`(() => { const d = document.querySelector('dialog.dialog--picker'); const g = d.querySelector('.dialog__grab').getBoundingClientRect(); const r = d.getBoundingClientRect(); return { x: Math.round(g.left + g.width / 2), y: Math.round(g.top + g.height / 2), top: Math.round(r.top), h: Math.round(r.height) }; })()`);
  };
  const pickerOpen = () => ev(`!!document.querySelector('dialog.dialog--picker[open]')`);
  let at = await openPicker();
  await mouse('mousePressed', 195, 12);
  await mouse('mouseReleased', 195, 12);
  await sleep(300);
  check('het blad sluit door op het donkere vlak erbuiten te tikken', !(await pickerOpen()), JSON.stringify(at));
  at = await openPicker();
  await mouse('mousePressed', at.x, at.top + 200);
  await mouse('mouseReleased', at.x, at.top + 200);
  await sleep(300);
  check('een tik op het blad zelf sluit het niet', await pickerOpen());
  await drag(at.x, at.y, 40);
  const back = await ev(`({ open: !!document.querySelector('dialog.dialog--picker[open]'), transform: document.querySelector('dialog.dialog--picker')?.style.transform })`);
  check('een klein stukje naar beneden slepen veert terug', back.open && back.transform === '', JSON.stringify(back));
  await drag(at.x, at.y, Math.round(at.h * 0.5));
  check('ver naar beneden slepen aan het handvat sluit het blad', !(await pickerOpen()));
  at = await openPicker();
  const title = await ev(`(() => { const r = document.querySelector('dialog.dialog--picker .dialog__title').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }; })()`);
  await drag(title.x, title.y, Math.round(at.h * 0.5));
  check('slepen aan de titel sluit het blad ook', !(await pickerOpen()));
  at = await openPicker();
  const scroll = await ev(`(() => { const l = document.querySelector('.icon-picker__list'); return { scrollable: l.scrollHeight > l.clientHeight, grabTop: document.querySelector('.dialog__grab').getBoundingClientRect().top }; })()`);
  await ev(`document.querySelector('.icon-picker__list').scrollTop = 600`);
  const scrolled = await ev(`document.querySelector('.dialog__grab').getBoundingClientRect().top`);
  check('de lijst scrolt in het blad en het handvat blijft op zijn plek', scroll.scrollable && Math.abs(scrolled - scroll.grabTop) < 1, JSON.stringify({ scroll, scrolled }));
  await ev(`document.querySelectorAll('dialog').forEach((d) => d.close())`); // het blad van de vorige controle
  await sleep(200);
  // de pagina erachter scrolt niet mee, ook niet via het donkere vlak of door voorbij het einde van de lijst te scrollen
  const wheel = (x, y, deltaY) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await nav('habits/new');
  await ev('window.scrollTo(0, 200)');
  await sleep(200);
  const y0 = await ev('window.scrollY');
  await ev(`document.querySelector('#iconTrigger').click()`);
  await sleep(400);
  await wheel(195, 12, 400);
  await sleep(300);
  const afterBackdrop = await ev('window.scrollY');
  await wheel(195, 500, 400);
  await wheel(195, 500, 4000);
  await sleep(300);
  const afterList = await ev(`({ page: window.scrollY, list: document.querySelector('.icon-picker__list').scrollTop })`);
  check('met het blad open scrolt de pagina erachter niet (donker vlak, lijst en voorbij het einde van de lijst)', y0 > 0 && afterBackdrop === y0 && afterList.page === y0 && afterList.list > 0, JSON.stringify({ y0, afterBackdrop, afterList }));
  await ev(`document.querySelectorAll('dialog').forEach((d) => d.close())`);
  await sleep(200);
  await wheel(195, 300, 300);
  await sleep(900); // de browser scrolt zacht door
  const afterClose = await ev(`({ y: window.scrollY, overflow: getComputedStyle(document.documentElement).overflow, dialogs: [...document.querySelectorAll('dialog')].map((d) => d.className + ' open=' + d.open), docH: document.documentElement.scrollHeight })`);
  check('na het sluiten scrolt de pagina weer', afterClose.y > y0, JSON.stringify({ y0, afterClose }));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('habits/new');
  await ev(`document.querySelector('#iconTrigger').click()`);
  await sleep(300);
  await ev(`[...document.querySelectorAll('.icon-picker__tile')].find((t) => t.title === 'Fietsen').click()`);
  await sleep(300);
  await ev(`(() => { const n = document.querySelector('#name'); n.value = 'Naar werk fietsen'; n.dispatchEvent(new Event('input')); document.querySelector('form').requestSubmit(); })()`);
  await sleep(1000);
  const saved = await ev(`(async () => { const { state } = await import('/src/ui/state.js'); return (await state.repo.listHabits()).map((x) => x.icon + ' ' + x.name); })()`);
  check('een gekozen icoon wordt bij de habit opgeslagen (als emoji, zodat sync en export ongewijzigd blijven)', saved.includes('🚴 Naar werk fietsen'), JSON.stringify(saved));
  // desktop (docs/SCROLLEN.md): de pagina scrolt zelf niet; de kop blijft staan en alleen de kolommen scrollen
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 600, deviceScaleFactor: 1, mobile: false });
  // een pagina met kolommen (`.page`) laat het werkvlak niet scrollen: wat niet in een kolom of lijst staat die zelf scrolt, wordt afgeknipt. `clipped` meet dat.
  const noPageScroll = () => ev(`(() => { const main = document.querySelector('.app__main'); return { page: document.documentElement.scrollHeight - innerHeight, bodyY: Math.round(window.scrollY),
    clipped: getComputedStyle(main).overflowY === 'hidden' ? main.scrollHeight - main.clientHeight : 0 }; })()`);
  const settle = async (route) => { await nav(route); await ev(`document.documentElement.style.fontSize = '100%'`); await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); await sleep(300); };
  for (const [what, route] of [['Vandaag', 'today'], ['Habits', 'habits'], ['Voortgang', 'stats'], ['Habit: nieuw', 'habits/new'], ['Instellingen', 'settings'], ['Prestaties', 'achievements'], ['Zo werkt het', 'uitleg'], ['Introductie', 'welkom/2']]) {
    await settle(route);
    const m = await noPageScroll();
    check(`desktop, ${what}: de pagina zelf scrolt niet (alleen het werkvlak of een kolom)`, m.page <= 1 && m.bodyY === 0, JSON.stringify(m));
    check(`desktop, ${what}: niets wordt afgeknipt (alles is te bereiken door te scrollen)`, m.clipped <= 1, JSON.stringify(m));
  }
  // Zo werkt het scrolt op desktop in de pagina: met het einde van de uitleg in beeld staat ook de knop voor de introductie op het scherm
  await settle('uitleg');
  const guideEnd = await ev(`(async () => { const sc = document.querySelector('.guide__scroll'); const before = sc.scrollTop; sc.scrollTop = sc.scrollHeight; await new Promise((r) => setTimeout(r, 300));
    const b = document.querySelector('#replayIntro').getBoundingClientRect(); return { room: sc.scrollHeight - sc.clientHeight, before, after: sc.scrollTop, buttonInView: b.top >= 0 && b.bottom <= innerHeight }; })()`);
  check('desktop, Zo werkt het: de uitleg scrolt tot het einde (de knop "Bekijk de introductie opnieuw" komt in beeld)', guideEnd.room > 100 && guideEnd.after > guideEnd.before && guideEnd.buttonInView, JSON.stringify(guideEnd));
  // de kop blijft staan als een kolom scrolt, en de kolommen scrollen los van elkaar
  await settle('today');
  const headBefore = await ev(`Math.round(document.querySelector('.today__header').getBoundingClientRect().top)`);
  await ev(`document.querySelector('.today__main').scrollTop = 220`);
  await sleep(200);
  const paneScrolled = await ev(`({ head: Math.round(document.querySelector('.today__header').getBoundingClientRect().top), main: document.querySelector('.today__main').scrollTop, side: document.querySelector('.today__side').scrollTop, win: window.scrollY })`);
  check('desktop, Vandaag: een kolom scrollt, de kop en de andere kolom blijven staan', paneScrolled.main > 100 && paneScrolled.head === headBefore && paneScrolled.side === 0 && paneScrolled.win === 0, JSON.stringify({ headBefore, paneScrolled }));
  // fade: wat uit beeld scrolt smelt weg, alleen aan de kant waar nog inhoud achter zit
  const fades = () => ev(`(() => { const el = document.querySelector('.today__main'); return { top: el.hasAttribute('data-fade-top'), bottom: el.hasAttribute('data-fade-bottom'), mask: getComputedStyle(el).maskImage !== 'none' }; })()`);
  await ev(`document.querySelector('.today__main').scrollTop = 0`);
  await sleep(250);
  const fadeAtTop = await fades();
  await ev(`document.querySelector('.today__main').scrollTop = 220`);
  await sleep(250);
  const fadeInMiddle = await fades();
  await ev(`document.querySelector('.today__main').scrollTop = 99999`);
  await sleep(250);
  const fadeAtEnd = await fades();
  check('desktop, Vandaag: een fade boven en onder een kolom, alleen waar nog inhoud achter zit', fadeAtTop.mask && !fadeAtTop.top && fadeAtTop.bottom && fadeInMiddle.top && fadeInMiddle.bottom && fadeAtEnd.top && !fadeAtEnd.bottom, JSON.stringify({ fadeAtTop, fadeInMiddle, fadeAtEnd }));
  await ev(`document.querySelector('.today__main').scrollTop = 220`);
  await sleep(250);
  // een hertekening (bijvoorbeeld na een tik) laat de kolom op dezelfde plek staan
  await ev(`document.querySelector('.today__main .check').click()`);
  await sleep(700);
  const kept = await ev(`document.querySelector('.today__main').scrollTop`);
  check('desktop, Vandaag: na een wijziging blijft de kolom op dezelfde plek staan', Math.abs(kept - paneScrolled.main) <= 2, JSON.stringify({ before: paneScrolled.main, after: kept }));
  // Voortgang: de vriendenkaart en het overzicht (week of maand) blijven staan, alleen de taken eronder scrollen
  await settle('stats');
  for (const period of ['week', 'month']) {
    await ev(`document.querySelector('input[name="overviewPeriod"][value="${period}"]').click()`);
    await sleep(400);
    const top = await ev(`Math.round(document.querySelector('.overview').getBoundingClientRect().top)`);
    await ev(`document.querySelector('.page__scroll').scrollTop = 300`);
    await sleep(200);
    const vg = await ev(`(() => { const sc = document.querySelector('.page__scroll'); const fixedRight = Math.round(document.querySelector('.overview__grid').getBoundingClientRect().right); const listRight = Math.round(sc.querySelector('.stats__list').getBoundingClientRect().right); return { overviewTop: Math.round(document.querySelector('.overview').getBoundingClientRect().top), scrolled: sc.scrollTop, listH: sc.clientHeight, fixedRight, listRight, social: Math.round(document.querySelector('.social-card-host').getBoundingClientRect().top) >= 0, win: window.scrollY }; })()`);
    check(`desktop, Voortgang (${period}): overzicht en vriendenkaart blijven staan, alleen de taken scrollen (rechterranden onder elkaar)`, vg.scrolled > 100 && vg.overviewTop === top && vg.social && vg.win === 0 && vg.listH >= 60 && Math.abs(vg.fixedRight - vg.listRight) <= 2, JSON.stringify({ top, vg }));
    // een dag aantikken opent een blad en neemt geen ruimte in op het scherm; "Open op Vandaag" staat in het blad
    if (period === 'week') {
      const heightBefore = await ev(`Math.round(document.querySelector('.page__fixed').getBoundingClientRect().height)`);
      await ev(`document.querySelector('.overview__grid button.overview__cell').click()`);
      await sleep(400);
      const day = await ev(`(() => { const d = document.querySelector('dialog[open]'); return { open: !!d, rows: d?.querySelectorAll('.overview__detail-item').length ?? 0, openLink: [...(d?.querySelectorAll('.dialog__actions .button') ?? [])].map((b) => b.textContent), fixed: Math.round(document.querySelector('.page__fixed').getBoundingClientRect().height), inline: !!document.querySelector('#overviewDetail') }; })()`);
      check('desktop, Voortgang: een dag aantikken opent een blad met de taken van die dag en "Open op Vandaag"; het overzicht wordt niet hoger', day.open && day.rows > 0 && day.openLink.includes('Open op Vandaag') && day.fixed === heightBefore && !day.inline, JSON.stringify({ heightBefore, day }));
      await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
      await sleep(300);
    }
    // de rand van de geselecteerde dag wordt niet afgeknipt door het vaste deel (de selectie zit rondom het vakje, ook onderaan)
    const edge = await ev(`(() => { const cell = document.querySelector('.overview__cell[data-today="true"]'); const box = document.querySelector('.page__fixed'); if (!cell) return null; return { cellBottom: Math.round(cell.getBoundingClientRect().bottom), fixedBottom: Math.round(box.getBoundingClientRect().bottom), padBottom: parseFloat(getComputedStyle(box).paddingBottom) }; })()`);
    if (period === 'week') check('desktop, Voortgang: de rand van de geselecteerde dag wordt onderaan niet afgeknipt', edge !== null && edge.fixedBottom - edge.cellBottom >= 4, JSON.stringify(edge));
    await ev(`document.querySelector('.page__scroll').scrollTop = 0`);
  }
  // een blad: alles blijft staan waar het stond (de zijbalk, de kop en de scrollstand van de kolom), en na het sluiten ook
  const stand = () => ev(`(() => { const side = document.querySelector('.sidebar').getBoundingClientRect(); return { pane: Math.round((document.querySelector('.page__pane, .page__scroll') ?? document.querySelector('.app__main')).scrollTop), left: Math.round(document.querySelector('.app__main').getBoundingClientRect().left), sideTop: Math.round(side.top), sideBottom: Math.round(side.bottom), vh: innerHeight }; })()`);
  const same = (a, b) => a.pane === b.pane && a.left === b.left && a.sideTop === 0 && b.sideTop === 0 && b.sideBottom === b.vh;
  for (const [what, route, scrollSelector, open] of [
    ['blad "Wat hield je tegen?" op Vandaag', 'today', '.today__main', `document.querySelector('.attention-card [data-focus-key^="why:"]').click()`],
    ['iconenkiezer bij een habit bewerken', 'habits/new', '.page__scroll', `document.querySelector('#iconTrigger').click()`],
  ]) {
    await settle(route);
    await ev(`document.querySelector('${scrollSelector}').scrollTop = 120`);
    await sleep(300);
    const before = await stand();
    await ev(open);
    await sleep(500);
    const during = await stand();
    check(`desktop, ${what}: de zijbalk blijft in beeld, niets verspringt en de kolom blijft staan`, before.pane > 0 && same(before, during), JSON.stringify({ before, during }));
    await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
    await sleep(300);
    const after = await stand();
    check(`desktop, ${what}: na het sluiten staat alles weer waar het stond`, same(before, after), JSON.stringify({ before, after }));
  }

  // Prestaties: een medaille aantikken opent de uitleg (behaald: waarom en wanneer; niet behaald: hoe en hoe ver je bent)
  await settle('achievements');
  for (const [what, state, expectRows] of [['behaalde', 'unlocked', true], ['nog niet behaalde', 'locked', false]]) {
    const medal = await ev(`(() => { const b = document.querySelector('.achv[data-state="${state}"] .achv__button'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; })()`);
    if (medal === null) { check(`Prestaties: een ${what} medaille is aan te tikken`, false, 'geen medaille gevonden'); continue; }
    await ev(`document.querySelector('.achv[data-state="${state}"] .achv__button').click()`);
    await sleep(400);
    const detail = await ev(`(() => { const d = document.querySelector('dialog.achv-detail[open]'); return { open: !!d, title: d?.querySelector('.dialog__title')?.textContent ?? '', heading: d?.querySelector('.achv-detail__heading')?.textContent ?? '', text: d?.querySelector('.achv-detail__text')?.textContent ?? '', rows: d?.querySelectorAll('.achv-detail__row').length ?? 0, status: d?.querySelector('.achv-detail__status')?.textContent ?? '', overflow: d ? d.scrollWidth - d.clientWidth : 1 }; })()`);
    check(`Prestaties: een ${what} medaille is aan te tikken (minstens 44 px) en opent de uitleg zonder zijwaarts scrollen`,
      medal.h >= 44 && detail.open && detail.title !== '' && detail.text.length > 10 && detail.overflow <= 0 && (expectRows ? detail.rows > 0 && detail.heading === 'Waarom je hem hebt' : detail.rows === 0 && detail.status !== '' && detail.heading === 'Zo haal je hem'),
      JSON.stringify({ medal, detail }));
    await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
    await sleep(300);
  }

  // meerdere dagdelen: in het formulier kies je er meer dan één (behalve met een teller of zonder vaste dagen), en op Vandaag vink je ze apart af
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await settle('habits/new');
  const parts = () => ev(`[...document.querySelectorAll('input[name="daypart"]')].filter((i) => i.checked).map((i) => i.value).join(',')`);
  const pick = (value) => ev(`document.querySelector('input[name="daypart"][value="${value}"]').click()`);
  await pick('morning'); await pick('evening');
  const multi = await parts();
  const counterHint = await ev(`document.querySelector('#counterOn') === null`);
  await pick('anytime');
  const anytime = await parts();
  await pick('morning'); await pick('evening');
  await ev(`document.querySelector('input[name="scheduleType"][value="per_week"]').click()`);
  const trimmed = await parts();
  check('meerdere dagdelen: twee dagdelen kiezen kan, een teller kan dan niet, "Overdag" wist de rest en zonder vaste dagen blijft er één over',
    multi === 'morning,evening' && counterHint && anytime === 'anytime' && trimmed === 'morning', JSON.stringify({ multi, counterHint, anytime, trimmed }));
  const created = await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js');
    const habit = await state.repo.saveHabit({ name: 'Tandenpoetsen test', icon: '🦷', color: 'c2', daypart: 'morning', dayparts: ['morning', 'evening'], status: 'active', startDate: '2026-09-01', endDate: null,
      graduationDays: 66, maintenance: false, sortOrder: 99, counter: null, schedules: [{ effectiveFrom: '2026-09-01', schedule: { type: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] } }] });
    notifyChanged(); return habit.id; })()`);
  await nav('today');
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await sleep(400);
  const dayState = () => ev(`[...document.querySelectorAll('.habit-card')].filter((c) => c.querySelector('.habit-card__name')?.textContent === 'Tandenpoetsen test').map((c) => c.dataset.state + ':' + c.closest('section').getAttribute('aria-labelledby') + ':' + (c.querySelector('.habit-card__meta')?.textContent ?? ''))`);
  const before = await dayState();
  await ev(`[...document.querySelectorAll('.habit-card')].find((c) => c.querySelector('.habit-card__name')?.textContent === 'Tandenpoetsen test').querySelector('.check').click()`);
  await sleep(600);
  const half = await dayState();
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  check('meerdere dagdelen op Vandaag: de habit staat in ochtend en avond, de ochtend afvinken laat de avond open en toont "1 van 2 dagdelen"',
    before.length === 2 && before.every((s) => s.startsWith('open:')) && half.length === 2 && half[0].startsWith('done:dp-morning') && half[1].startsWith('open:dp-evening') && half.every((s) => s.includes('1 van 2 dagdelen')), JSON.stringify({ before, half }));
  await ev(`[...document.querySelectorAll('.habit-card')].filter((c) => c.querySelector('.habit-card__name')?.textContent === 'Tandenpoetsen test')[1].querySelector('.check').click()`);
  await sleep(600);
  const full = await dayState();
  check('meerdere dagdelen op Vandaag: beide dagdelen afvinken maakt de dag gedaan', full.length === 2 && full.every((s) => s.startsWith('done:') && s.includes('2 van 2 dagdelen')), JSON.stringify(full));
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); await state.repo.deleteHabit('${created}'); notifyChanged(); })()`);

  // De uitleg over de ritmes vanuit het formulier is een blad boven het formulier en geen andere pagina: wat je invulde blijft staan en je kunt terug
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await settle('habits/new');
  await ev(`(() => { const n = document.querySelector('#name'); n.value = 'Mijn nieuwe habit'; n.dispatchEvent(new Event('input')); })()`);
  const hashBefore = await ev('location.hash');
  await ev(`document.querySelector('#scheduleMore').click()`);
  await sleep(500);
  const rhythmSheet = await ev(`(() => { const d = document.querySelector('dialog.dialog--guide[open]'); return { open: !!d, items: d?.querySelectorAll('.guide__type').length ?? 0, hash: location.hash,
    overflow: d ? d.scrollWidth - d.clientWidth : 1, height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight, actions: [...(d?.querySelectorAll('.dialog__actions .button') ?? [])].map((b) => b.textContent) }; })()`);
  await ev(`[...document.querySelectorAll('dialog.dialog--guide .dialog__actions .button')].find((b) => b.textContent === 'Sluiten').click()`);
  await sleep(400);
  const afterRhythm = await ev(`({ open: !!document.querySelector('dialog[open]'), hash: location.hash, name: document.querySelector('#name').value, focus: document.activeElement?.id ?? '' })`);
  check('habit-formulier: "Uitleg over de ritmes" opent een blad met de vijf ritmes en de teller, de pagina blijft het formulier, en na sluiten staat je invoer er nog en zit de focus weer op de knop',
    rhythmSheet.open && rhythmSheet.items === 6 && rhythmSheet.hash === hashBefore && rhythmSheet.overflow <= 0 && rhythmSheet.height <= rhythmSheet.vh && rhythmSheet.actions.includes('Sluiten')
      && !afterRhythm.open && afterRhythm.hash === hashBefore && afterRhythm.name === 'Mijn nieuwe habit' && afterRhythm.focus === 'scheduleMore', JSON.stringify({ rhythmSheet, afterRhythm }));
  // en op de kleinste schermen met grote tekst
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(400);
  await ev(`document.querySelector('#scheduleMore').click()`);
  await sleep(500);
  const rhythmSmall = await ev(`(() => { const d = document.querySelector('dialog.dialog--guide[open]'); return { open: !!d, overflow: d ? d.scrollWidth - d.clientWidth : 1, height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight,
    tiny: [...(d?.querySelectorAll('.dialog__actions .button') ?? [])].filter((b) => b.getBoundingClientRect().height < 44).length, link: Math.round(document.querySelector('#scheduleMore')?.getBoundingClientRect().height ?? 0) }; })()`);
  check('habit-formulier: de uitleg over de ritmes past op 320 px met 200% tekst en niet hoger dan het scherm', rhythmSmall.open && rhythmSmall.overflow <= 0 && rhythmSmall.height <= rhythmSmall.vh && rhythmSmall.tiny === 0, JSON.stringify(rhythmSmall));
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Feedback (docs/FEEDBACK.md). Het blad opent boven de huidige pagina, controleert de invoer, houdt je tekst bij een fout en geeft de focus terug.
  const fbButtons = (label) => `[...document.querySelectorAll('dialog.dialog--feedback .dialog__actions .button')].find((b) => b.textContent === '${label}')`;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await settle('settings');
  await ev(`document.querySelector('#feedbackOpen').click()`);
  await sleep(500);
  const fbSheet = await ev(`(() => { const d = document.querySelector('dialog.dialog--feedback[open]'); return { open: !!d, kinds: d?.querySelectorAll('input[name="feedbackKind"]').length ?? 0, hash: location.hash, contact: !!d?.querySelector('#feedbackContact'),
    context: d?.querySelector('.feedback-form__context')?.textContent ?? '', height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight, overflow: d ? d.scrollWidth - d.clientWidth : 1 }; })()`);
  await ev(`${fbButtons('Versturen')}.click()`);
  await sleep(300);
  const fbEmpty = await ev(`({ open: !!document.querySelector('dialog.dialog--feedback[open]'), errors: [...document.querySelectorAll('dialog.dialog--feedback .field__error:not([hidden])')].map((e) => e.textContent) })`);
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); // nooit echt versturen vanuit een controle
  await ev(`(() => { document.querySelector('input[name="feedbackKind"][value="idea"]').click(); const t = document.querySelector('#feedbackText'); t.value = 'Een donker thema graag'; t.dispatchEvent(new Event('input')); })()`);
  await ev(`${fbButtons('Versturen')}.click()`);
  await sleep(1500);
  const fbOffline = await ev(`({ open: !!document.querySelector('dialog.dialog--feedback[open]'), text: document.querySelector('#feedbackText')?.value, errors: [...document.querySelectorAll('dialog.dialog--feedback .field__error:not([hidden])')].map((e) => e.textContent) })`);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await ev(`${fbButtons('Annuleren')}.click()`);
  await sleep(400);
  const fbClosed = await ev(`({ open: !!document.querySelector('dialog[open]'), hash: location.hash, focus: document.activeElement?.id ?? '' })`);
  check('feedback vanuit Instellingen: een blad met vier soorten (zonder mailvinkje zonder account) en de context die meegaat, de pagina blijft Instellingen, en het past op het scherm',
    fbSheet.open && fbSheet.kinds === 4 && fbSheet.hash === '#/settings' && !fbSheet.contact && fbSheet.context.includes('#/settings') && fbSheet.context.includes('1.2') && fbSheet.height <= fbSheet.vh && fbSheet.overflow <= 0, JSON.stringify(fbSheet));
  check('feedback: leeg versturen geeft twee meldingen en laat het blad open; zonder verbinding komt er een melding, het blad blijft open en je tekst blijft staan; annuleren geeft de focus terug',
    fbEmpty.open && fbEmpty.errors.length === 2 && fbOffline.open && fbOffline.text === 'Een donker thema graag' && fbOffline.errors.length === 1 && /probeer het zo opnieuw/.test(fbOffline.errors[0])
      && !fbClosed.open && fbClosed.hash === '#/settings' && fbClosed.focus === 'feedbackOpen', JSON.stringify({ fbEmpty, fbOffline, fbClosed }));
  // op de kleinste schermen met grote tekst
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(400);
  await ev(`document.querySelector('#feedbackOpen').click()`);
  await sleep(500);
  const fbSmall = await ev(`(() => { const d = document.querySelector('dialog.dialog--feedback[open]'); return { open: !!d, overflow: d ? d.scrollWidth - d.clientWidth : 1, height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight,
    tiny: [...(d?.querySelectorAll('.dialog__actions .button, .choice__face') ?? [])].filter((b) => b.getBoundingClientRect().height < 44).length }; })()`);
  check('feedback: het blad past op 320 px met 200% tekst, niet hoger dan het scherm, en alle knoppen zijn minstens 44 px', fbSmall.open && fbSmall.overflow <= 0 && fbSmall.height <= fbSmall.vh && fbSmall.tiny === 0, JSON.stringify(fbSmall));
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await ev(`document.documentElement.style.fontSize = '100%'`);
  // ook onderaan Zo werkt het
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await settle('uitleg');
  await ev(`document.querySelector('#guideFeedback').click()`);
  await sleep(400);
  const fbGuide = await ev(`({ open: !!document.querySelector('dialog.dialog--feedback[open]'), hash: location.hash })`);
  check('feedback: onderaan Zo werkt het opent hetzelfde blad zonder weg te gaan van de pagina', fbGuide.open && fbGuide.hash === '#/uitleg', JSON.stringify(fbGuide));
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);

  // de zijbalk en het tabje voor de beheerder: alleen op de computer
  const fbVisible = (selector) => `(() => { const e = document.querySelector('${selector}'); if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { display: s.display, shown: s.display !== 'none' && r.width > 0 && r.height > 0, bottom: Math.round(r.bottom) }; })()`;
  const phoneLink = await ev(fbVisible('#feedbackLink'));
  await ev(`document.querySelector('#feedbackTab').hidden = false`); // alsof de server zegt dat je beheerder bent: op de telefoon blijft het tabje toch weg
  const phoneTab = await ev(fbVisible('#feedbackTab'));
  await ev(`document.querySelector('#feedbackTab').hidden = true`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await settle('today');
  const deskLink = await ev(fbVisible('#feedbackLink'));
  const deskTabHidden = await ev(fbVisible('#feedbackTab'));
  await ev(`document.querySelector('#feedbackTab').hidden = false`);
  const deskTabShown = await ev(fbVisible('#feedbackTab'));
  await ev(`document.querySelector('#feedbackTab').hidden = true`);
  await ev(`document.querySelector('#feedbackLink').click()`);
  await sleep(500);
  const deskSheet = await ev(`({ open: !!document.querySelector('dialog.dialog--feedback[open]'), sidebarVisible: getComputedStyle(document.querySelector('.sidebar')).display !== 'none' })`);
  await ev(`${fbButtons('Annuleren')}.click()`);
  await sleep(400);
  const deskFocus = await ev(`document.activeElement?.id ?? ''`);
  check('feedback: op de telefoon geen regel in de zijbalk en nooit het tabje Feedback; op de computer wel de regel onderaan de zijbalk (die het blad opent), en het tabje alleen voor de beheerder',
    phoneLink && !phoneLink.shown && phoneTab && !phoneTab.shown && deskLink.shown && deskLink.bottom > 700 && deskTabHidden && !deskTabHidden.shown && deskTabShown.shown && deskSheet.open && deskFocus === 'feedbackLink',
    JSON.stringify({ phoneLink, phoneTab, deskLink, deskTabHidden, deskTabShown, deskSheet, deskFocus }));

  // het tabje Feedback voor de beheerder (met een nagebootste server): zonder beheerder een melding, met beheerder de lijst met filters, afhandelen en verwijderen
  await settle('feedback');
  const notAdmin = await ev(`document.querySelector('#feedbackOnlyAdmin')?.textContent ?? null`);
  await ev(`(async () => { const { admin } = await import('/src/ui/admin.js'); const auth = await import('/src/data/auth.js'); const client = await auth.getClient();
    const row = (id, kind, body, status, mail) => ({ id, created_at: new Date().toISOString(), kind, body, route: '#/habits', app_version: '1.2', user_id: null, contact_email: mail, status, handled_at: null });
    const rows = [row('1', 'idea', 'Een donker thema graag', 'new', null), row('2', 'problem', 'Het scherm hapert', 'new', 'anna@x.nl'), row('3', 'compliment', 'Mooie app', 'done', null)];
    window.__fbRows = rows; window.__fbCalls = [];
    client.rpc = async (fn, args) => { window.__fbCalls.push(fn);
      if (fn === 'feedback_list') return { data: rows.map((r) => ({ ...r })), error: null };
      if (fn === 'feedback_set_status') { const r = rows.find((x) => x.id === args.p_id); if (r) r.status = args.p_status; return { data: Boolean(r), error: null }; }
      if (fn === 'feedback_delete') { const i = rows.findIndex((x) => x.id === args.p_id); if (i >= 0) rows.splice(i, 1); return { data: i >= 0, error: null }; }
      return { data: null, error: null }; };
    admin.status = 'yes'; })()`);
  await settle('habits');
  await settle('feedback');
  await sleep(600);
  const adminState = () => ev(`({ items: document.querySelectorAll('.feedback-item').length, tabs: [...document.querySelectorAll('input[name="feedbackStatus"]')].map((i) => i.nextElementSibling.textContent),
    mail: document.querySelector('.feedback-item a[href^="mailto:"]')?.getAttribute('href') ?? null, anonymous: [...document.querySelectorAll('.feedback-item__meta')].some((m) => m.textContent.startsWith('Anoniem')),
    clipped: (() => { const m = document.querySelector('.app__main'); return getComputedStyle(m).overflowY === 'hidden' ? m.scrollHeight - m.clientHeight : 0; })() })`);
  const adminFirst = await adminState();
  await ev(`document.querySelector('.feedback-item .button--secondary').click()`); // het eerste bericht afhandelen
  await sleep(600);
  const adminAfterDone = await adminState();
  await ev(`document.querySelector('input[name="feedbackStatus"][value="all"]').click()`);
  await sleep(300);
  const adminAll = await adminState();
  await ev(`(() => { const s = document.querySelector('#feedbackKind'); s.value = 'compliment'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  const adminKind = await adminState();
  await ev(`(() => { const s = document.querySelector('#feedbackKind'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  await ev(`[...document.querySelectorAll('.feedback-item .button--ghost')][0].click()`); // verwijderen vraagt eerst om bevestiging
  await sleep(400);
  const confirm = await ev(`({ open: !!document.querySelector('dialog[open]'), rows: window.__fbRows.length })`);
  await ev(`[...document.querySelectorAll('dialog[open] .dialog__actions .button')].find((b) => b.textContent === 'Verwijderen').click()`);
  await sleep(700);
  const afterDelete = await ev(`({ rows: window.__fbRows.length, calls: window.__fbCalls.filter((c) => c !== 'feedback_list') })`);
  check('Feedback (beheerder): zonder beheerdersrechten staat er een melding; met rechten een lijst met Nieuw (2), Afgehandeld (1) en Alles (3), een mailto-link en "Anoniem", en niets wordt afgeknipt',
    notAdmin !== null && adminFirst.items === 2 && adminFirst.tabs.join('|') === 'Nieuw (2)|Afgehandeld (1)|Alles (3)' && adminFirst.mail === 'mailto:anna@x.nl' && adminFirst.anonymous && adminFirst.clipped <= 1, JSON.stringify({ notAdmin, adminFirst }));
  check('Feedback (beheerder): afhandelen verplaatst het bericht naar Afgehandeld, filteren op soort werkt, en verwijderen vraagt eerst om bevestiging en haalt het dan weg',
    adminAfterDone.items === 1 && adminAfterDone.tabs[0] === 'Nieuw (1)' && adminAll.items === 3 && adminKind.items === 1 && confirm.open && confirm.rows === 3 && afterDelete.rows === 2
      && afterDelete.calls.join(',') === 'feedback_set_status,feedback_delete', JSON.stringify({ adminAfterDone, adminAll, adminKind, confirm, afterDelete }));
  await ev(`(async () => { const { admin } = await import('/src/ui/admin.js'); const auth = await import('/src/data/auth.js'); const client = await auth.getClient(); delete client.rpc; admin.status = 'no'; })()`);
  await send('Network.disable');

  // De uitnodiging voor feedback onderaan Vandaag: pas na een week gebruik, niet naast het zetje om in te loggen, en na "Niet nu" een tijd stil
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`(() => { localStorage.setItem('hb-nudge-dismissed', '1'); localStorage.setItem('hb-first-run', String(Date.now() - 3 * 864e5)); localStorage.removeItem('hb-feedback-asked'); localStorage.removeItem('hb-feedback-sent'); })()`);
  await settle('today');
  const inviteEarly = await ev(`!!document.querySelector('#feedbackInvite')`);
  await ev(`localStorage.setItem('hb-first-run', String(Date.now() - 10 * 864e5))`);
  await settle('habits');
  await settle('today');
  const inviteLate = await ev(`(() => { const c = document.querySelector('#feedbackInvite'); return { shown: !!c, buttons: c ? [...c.querySelectorAll('button')].map((b) => b.textContent) : [], tiny: c ? [...c.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height < 44).length : 0 }; })()`);
  await ev(`document.querySelector('#feedbackInviteLater').click()`);
  await sleep(300);
  const inviteGone = await ev(`({ shown: !!document.querySelector('#feedbackInvite'), asked: localStorage.getItem('hb-feedback-asked') !== null })`);
  await settle('habits');
  await settle('today');
  const inviteStillGone = await ev(`!!document.querySelector('#feedbackInvite')`);
  check('feedback: de uitnodiging onderaan Vandaag komt niet in de eerste week, daarna met "Feedback geven" en "Niet nu" (minstens 44 px), verdwijnt na "Niet nu" en komt dan niet terug',
    inviteEarly === false && inviteLate.shown && inviteLate.buttons.join('|') === 'Feedback geven|Niet nu' && inviteLate.tiny === 0 && !inviteGone.shown && inviteGone.asked && inviteStillGone === false, JSON.stringify({ inviteEarly, inviteLate, inviteGone, inviteStillGone }));
  // terug naar de beginstand voor de controles hierna
  await ev(`(() => { localStorage.removeItem('hb-nudge-dismissed'); localStorage.removeItem('hb-feedback-asked'); localStorage.removeItem('hb-feedback-sent'); localStorage.setItem('hb-first-run', String(Date.now())); })()`);

  // De stapel (flexibele taken): compacte kaarten, wat dreigt te falen bovenaan, de rest ingeklapt; Habits met een werkbalk en een statusregel; en Plan je week.
  const flexIds = await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); const ids = [];
    const base = { icon: '💧', color: 'c2', daypart: 'anytime', status: 'active', startDate: '2026-01-01', endDate: null, graduationDays: 66, maintenance: false, counter: null };
    const flex = (name, period, count, order) => state.repo.saveHabit({ ...base, name, sortOrder: 200 + order, schedules: [{ effectiveFrom: '2026-01-01', schedule: { type: 'times_per_period', period, count } }] });
    // twee die bijna altijd dreigen te falen (7× per week, 31× per maand), en zes die deze maand al gehaald zijn (1× per maand, gisteren gedaan; wat vandaag is gedaan staat bij de dagdelen, niet in de stapel)
    ids.push((await flex('Dreigt A', 'week', 7, 0)).id, (await flex('Dreigt B', 'month', 31, 1)).id);
    const yesterday = new Date(state.today + 'T00:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1); const ymd = yesterday.toISOString().slice(0, 10);
    if (ymd.slice(0, 7) === state.today.slice(0, 7)) for (let i = 0; i < 6; i++) { const done = await flex('Klaar ' + (i + 1), 'month', 1, 2 + i); ids.push(done.id); await state.repo.setCheckIn({ habitId: done.id, date: ymd, status: 'done' }); }
    notifyChanged(); return ids; })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('today');
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await sleep(500);
  const poolInfo = await ev(`(() => { const cards = [...document.querySelectorAll('.pool .pool-card--compact')]; const outside = cards.filter((c) => !c.closest('details'));
    return { urgentTitle: !!document.querySelector('.pool__group-title--urgent'), shown: outside.length, hidden: document.querySelectorAll('.pool details .pool-card--compact').length, summary: document.querySelector('.pool__more-summary')?.textContent ?? '',
      maxHeight: Math.round(Math.max(...cards.map((c) => c.getBoundingClientRect().height))), planWeek: !!document.querySelector('#planWeek'), overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  const mondayTheFirst = await ev(`new Date().getDay() === 1 && new Date().getDate() === 1`); // dan is er niets krap; en op de eerste van de maand kan "gisteren" niet in dezelfde maand
  const firstOfMonth = await ev(`new Date().getDate() === 1`);
  check('Vandaag, de stapel: compacte kaarten (hoogstens 150 px, eerder ruim 230), wat dreigt te falen bovenaan, de rest ingeklapt met "Nog n taken tonen", en Plan je week',
    (poolInfo.urgentTitle || mondayTheFirst) && poolInfo.maxHeight <= 150 && (firstOfMonth || (poolInfo.hidden >= 1 && /^Nog \d+ taken? tonen$/.test(poolInfo.summary))) && poolInfo.planWeek && poolInfo.overflow <= 0, JSON.stringify(poolInfo));
  // de stapel op de kleinste schermen met grote tekst
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(400);
  const poolSmall = await ev(`({ overflow: document.documentElement.scrollWidth - innerWidth, tiny: [...document.querySelectorAll('.pool .pool-card--compact .button, .pool .pool-card--compact .habit-card__more')].filter((b) => b.getBoundingClientRect().height < 44).length })`);
  check('Vandaag, de stapel: past op 320 px met 200% tekst en alle knoppen zijn minstens 44 px', poolSmall.overflow <= 0 && poolSmall.tiny === 0, JSON.stringify(poolSmall));
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Habits: een werkbalk op één plek, een statusregel per habit, en een eigen groep voor flexibele taken
  await nav('habits');
  await sleep(500);
  const habitsInfo = await ev(`(() => { const tools = document.querySelector('.habits__tools'); const buttons = tools ? [...tools.querySelectorAll('button')] : []; const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
    const plan = document.querySelector('#planWeek');
    return { tools: !!tools, buttons: buttons.map((b) => b.textContent), rows: tops.size, plan: plan ? { inPrompt: !!plan.closest('.plan-prompt'), classes: plan.className, pressed: plan.getAttribute('aria-pressed'), popup: plan.getAttribute('aria-haspopup'), message: document.querySelector('.habits .plan-prompt__text strong')?.textContent ?? null, badge: !!document.querySelector('.badge--count'), icon: !!plan.querySelector('svg') } : null, titles: [...document.querySelectorAll('.habits h2.section__title')].map((e) => e.textContent), statuses: document.querySelectorAll('.habit-row__status').length, habitRows: document.querySelectorAll('.habit-row').length, flexible: document.querySelectorAll('.habit-row[data-section="active"] .habit-row__progress').length, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  check('Habits: een werkbalk (Volgorde, Pauzeer alles) op één regel, groepen Vaste dagen en Flexibel, en een statusregel bij de lopende habits',
    habitsInfo.tools && !habitsInfo.buttons.includes('Plan je week') && habitsInfo.buttons.includes('Volgorde') && habitsInfo.rows === 1 && habitsInfo.titles.includes('Vaste dagen') && habitsInfo.titles.includes('Flexibel') && habitsInfo.statuses >= 8 && habitsInfo.flexible >= 8 && habitsInfo.overflow <= 0, JSON.stringify(habitsInfo));

  // Plan je week staat bij de groep Flexibel en ziet er niet "aan" uit: een neutrale knop met een kalender, een getal voor wat nog dagen nodig heeft, en geen aan/uit-stand
  check('Habits: bij Flexibel staat in woorden wat er te doen is ("Nog n taken om in te plannen") met de knop Plan je week ernaast: een gewone knop (geen aan/uit-stand) met kalender die een blad opent, en geen los getal',
    habitsInfo.plan && habitsInfo.plan.inPrompt && habitsInfo.plan.pressed === null && habitsInfo.plan.popup === 'dialog' && habitsInfo.plan.icon && !habitsInfo.plan.badge && /^Nog \d+ taken? om in te plannen$/.test(habitsInfo.plan.message ?? ''), JSON.stringify(habitsInfo.plan));
  // Plan je week: een blad met per flexibele taak dagen om aan te tikken, en "Verdeel voor mij"
  await ev(`document.querySelector('#planWeek').click()`);
  await sleep(700);
  const planner = await ev(`(() => { const d = document.querySelector('dialog.dialog--planner[open]'); return { open: !!d, rows: d?.querySelectorAll('.planner__row').length ?? 0, days: d?.querySelectorAll('.planner__day').length ?? 0,
    overflow: d ? d.scrollWidth - d.clientWidth : 1, height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight, actions: [...(d?.querySelectorAll('.dialog__actions .button') ?? [])].map((b) => b.textContent) }; })()`);
  check('Plan je week: een blad met een rij per flexibele taak (acht dagen elk), de knoppen "Verdeel voor mij" en "Klaar", en niet hoger dan het scherm',
    planner.open && planner.rows >= 8 && planner.days === planner.rows * 8 && planner.overflow <= 0 && planner.height <= planner.vh && planner.actions.includes('Verdeel voor mij') && planner.actions.includes('Klaar'), JSON.stringify(planner));
  // wat nog ingepland moet worden is in het blad gemarkeerd: precies de rijen die nog "inplannen" willen (de taken van "Nog n taken om in te plannen")
  const marks = await ev(`(() => { const rows = [...document.querySelectorAll('dialog.dialog--planner .planner__row')]; const needing = rows.filter((r) => /inplannen/.test(r.querySelector('.planner__summary')?.textContent ?? '') && !r.querySelector('.planner__skip[aria-pressed="true"]')); const marked = rows.filter((r) => r.dataset.needs === 'true'); return { rows: rows.length, needing: needing.length, marked: marked.length, same: needing.every((r) => r.dataset.needs === 'true') && marked.every((r) => needing.includes(r)) }; })()`);
  check('Plan je week: de taken die nog ingepland moeten worden zijn gemarkeerd (en alleen die)', marks.rows > 0 && marks.same, JSON.stringify(marks));
  // "Niet in deze week": de taak telt niet meer mee voor "Nog n taken om in te plannen" en krijgt geen voorstel; terugdraaien kan
  const needCount = () => ev(`Number(/Nog ([0-9]+)/.exec(document.querySelector('.habits .plan-prompt__text strong')?.textContent ?? '')?.[1] ?? 0)`);
  const needBefore = await needCount();
  await ev(`document.querySelector('dialog.dialog--planner .planner__skip').click()`);
  await sleep(600);
  const skipped = await ev(`(() => { const row = document.querySelector('dialog.dialog--planner .planner__row[data-skipped="true"]'); const b = row?.querySelector('.planner__skip'); return { row: !!row, pressed: b?.getAttribute('aria-pressed'), label: b?.textContent, summary: row?.querySelector('.planner__summary')?.textContent, focused: document.activeElement === b }; })()`);
  const needSkipped = await needCount();
  await ev(`document.querySelector('dialog.dialog--planner .planner__skip[aria-pressed="true"]').click()`);
  await sleep(600);
  const needAfter = await needCount();
  check('Plan je week: "Niet in deze week" dempt de rij (geen herinnering meer voor die taak, de focus blijft op de knop) en "Toch deze week plannen" zet het terug', skipped.row && skipped.pressed === 'true' && skipped.label === 'Toch deze week plannen' && /niet in deze week/.test(skipped.summary ?? '') && skipped.focused && needSkipped === needBefore - 1 && needAfter === needBefore, JSON.stringify({ needBefore, needSkipped, needAfter, skipped }));
  await ev(`[...document.querySelectorAll('dialog.dialog--planner .dialog__actions .button')].find((b) => b.textContent === 'Verdeel voor mij').click()`);
  await sleep(900);
  const afterSuggest = await ev(`({ planned: document.querySelectorAll('dialog.dialog--planner .planner__day[aria-pressed="true"]').length, open: !!document.querySelector('dialog.dialog--planner[open]') })`);
  // één dag weer uitzetten en aanzetten
  await ev(`document.querySelector('dialog.dialog--planner .planner__day[aria-pressed="true"]').click()`);
  await sleep(500);
  const afterToggle = await ev(`document.querySelectorAll('dialog.dialog--planner .planner__day[aria-pressed="true"]').length`);
  check('Plan je week: "Verdeel voor mij" plant dagen en laat het blad open; een gepland dag is met een tik weer uit te zetten', afterSuggest.open && afterSuggest.planned >= 2 && afterToggle === afterSuggest.planned - 1, JSON.stringify({ afterSuggest, afterToggle }));
  // op de kleinste schermen met grote tekst
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await ev(`document.documentElement.style.fontSize = '200%'`);
  await sleep(500);
  const plannerSmall = await ev(`(() => { const d = document.querySelector('dialog.dialog--planner[open]'); return { overflow: d ? d.scrollWidth - d.clientWidth : 1, height: d ? Math.round(d.getBoundingClientRect().height) : 0, vh: innerHeight, tiny: [...(d?.querySelectorAll('.planner__day, .planner__skip, .dialog__actions .button') ?? [])].filter((b) => b.getBoundingClientRect().height < 44).length }; })()`);
  check('Plan je week: past op 320 px met 200% tekst, niet hoger dan het scherm en alle knoppen zijn minstens 44 px', plannerSmall.overflow <= 0 && plannerSmall.height <= plannerSmall.vh && plannerSmall.tiny === 0, JSON.stringify(plannerSmall));
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  // een taak die morgen start staat in Plan je week, maar is alleen te plannen vanaf zijn startdatum
  const startId = await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); const { addDays } = await import('/src/domain/dates.js'); const tomorrow = addDays(state.today, 1);
    const habit = await state.repo.saveHabit({ icon: '💧', color: 'c3', daypart: 'anytime', status: 'active', name: 'Start morgen', sortOrder: 300, startDate: tomorrow, endDate: null, graduationDays: 66, maintenance: false, counter: null, schedules: [{ effectiveFrom: tomorrow, schedule: { type: 'times_per_period', period: 'month', count: 2 } }] });
    notifyChanged(); return habit.id; })()`);
  await nav('habits');
  await sleep(500);
  await ev(`document.querySelector('#planWeek').click()`);
  await sleep(700);
  const startRow = await ev(`(() => { const row = [...document.querySelectorAll('dialog.dialog--planner .planner__row')].find((r) => r.textContent.includes('Start morgen')); const days = [...(row?.querySelectorAll('.planner__day') ?? [])]; return { exists: !!row, disabled: days.slice(0, 3).map((d) => d.disabled), summary: row?.querySelector('.planner__summary')?.textContent ?? null }; })()`);
  check('Plan je week: een taak die morgen start staat er ook in, met "start morgen"; vandaag is niet te plannen, vanaf morgen wel', startRow.exists && JSON.stringify(startRow.disabled) === '[true,false,false]' && /start morgen/.test(startRow.summary ?? ''), JSON.stringify(startRow));
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); await state.repo.deleteHabit(${JSON.stringify(startId)}); notifyChanged(); })()`);
  await sleep(300);
  // morgen bekijken: wat al op een andere dag is ingepland toont wanneer (bij alles ingepland zonder "＋ Morgen", met "Wijzig"), in plaats van een uitnodiging om het nog eens in te plannen
  const tomorrowIso = await ev(`(async () => { const { state } = await import('/src/ui/state.js'); const { addDays } = await import('/src/domain/dates.js'); return addDays(state.today, 1); })()`);
  await nav(`today?date=${tomorrowIso}`);
  await sleep(600);
  const plannedCards = await ev(`(() => { const cards = [...document.querySelectorAll('.pool-card')]; const covered = cards.filter((c) => c.dataset.state === 'planned'); const texts = cards.map((c) => c.querySelector('.pool-card__planned')?.textContent).filter(Boolean);
    return { cards: cards.length, texts, covered: covered.length, coveredWithPlus: covered.filter((c) => c.querySelector('[data-focus-key^="take:"]')).length, coveredWithChange: covered.filter((c) => c.querySelector('[data-focus-key^="change:"]')).length, partialWithPlus: cards.filter((c) => c.querySelector('.pool-card__planned') && c.dataset.state !== 'planned' && c.querySelector('[data-focus-key^="take:"]')).length, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  check('Vandaag, morgen bekijken: een taak die al is ingepland toont "Ingepland op …" of "Eerste keer ingepland op …"; alles ingepland heeft geen plusknop maar "Wijzig", en een gedeeltelijk ingeplande taak houdt de plusknop', plannedCards.texts.length > 0 && plannedCards.texts.every((t) => /^(Ingepland op|Eerste keer ingepland op) /.test(t)) && plannedCards.coveredWithPlus === 0 && plannedCards.coveredWithChange === plannedCards.covered && plannedCards.overflow <= 0, JSON.stringify(plannedCards));
  // "Niet in deze week": de taken verdwijnen uit "Oningepland" op Vandaag; de kop en de knop Plan je week blijven staan, met "Alles ingepland" eronder
  const poolBefore = await (async () => { await nav('today'); await sleep(500); return ev(`document.querySelectorAll('.pool .pool-card').length`); })();
  const flexAll = await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); const { setPlanSkip } = await import('/src/app/actions.js'); const ids = (await state.repo.listHabits()).filter((h) => h.schedules.some((s) => s.schedule.type === 'times_per_period')).map((h) => h.id); for (const id of ids) await setPlanSkip(state.repo, { habitId: id, skipped: true }, state.today); notifyChanged(); return ids; })()`);
  await sleep(600);
  const poolSkipped = await ev(`(() => { const p = document.querySelector('.pool'); return { exists: !!p, cards: p?.querySelectorAll('.pool-card').length ?? 0, title: p?.querySelector('.section__title')?.textContent ?? null, text: p?.querySelector('.pool__all-planned')?.textContent ?? null, button: !!p?.querySelector('.section-head #planWeek'), overflow: document.documentElement.scrollWidth - innerWidth, left: [...(p?.querySelectorAll('.pool-card') ?? [])].map((c) => c.textContent.slice(0, 40)), prompt: p?.querySelector('.plan-prompt__text')?.textContent ?? null }; })()`);
  check('Vandaag: met "Niet in deze week" verdwijnen de taken uit Oningepland; de kop, de knop Plan je week en "Alles ingepland" blijven staan', poolBefore > 0 && poolSkipped.exists && poolSkipped.cards === 0 && poolSkipped.title === 'Oningepland' && poolSkipped.text === 'Alles ingepland' && poolSkipped.button && poolSkipped.overflow <= 0, JSON.stringify({ poolBefore, poolSkipped }));
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); const { setPlanSkip } = await import('/src/app/actions.js'); for (const id of ${JSON.stringify(flexAll)}) await setPlanSkip(state.repo, { habitId: id, skipped: false }, state.today); notifyChanged(); })()`);
  // opruimen: de taken weer weg, zodat de controles hierna van dezelfde stand uitgaan
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); for (const id of ${JSON.stringify(flexIds)}) { await state.repo.deleteHabit(id); } for (const plan of await state.repo.listDayPlans?.() ?? []) { if (${JSON.stringify(flexIds)}.includes(plan.habitId)) await state.repo.clearDayPlan(plan.habitId, plan.date); } notifyChanged(); })()`);

  // "Anders": past geen van de redenen, dan is de toelichting de reden
  await nav('today');
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await ev(`document.querySelector('.attention-card [data-focus-key^="why:"]').click()`);
  await sleep(400);
  await ev(`document.querySelector('.choices--reasons input[value="other"]').click()`);
  await sleep(200);
  const other = await ev(`({ label: document.querySelector('dialog[open] .field__label')?.textContent, focused: document.activeElement?.id, geld: !!document.querySelector('.choices--reasons input[value="no_money"]') })`);
  check('"Anders" kiezen zet de focus in de toelichting en noemt die "Wat was het dan?"; "Geen geld" is er ook', other.label === 'Wat was het dan?' && other.focused === 'reasonNote' && other.geld, JSON.stringify(other));
  await ev(`(() => { const i = document.querySelector('#reasonNote'); i.value = 'Auto kapot'; i.dispatchEvent(new Event('input')); [...document.querySelectorAll('.dialog__actions .button')].find((x) => x.textContent === 'Reden opslaan').click(); })()`);
  await sleep(600);
  const savedOther = await ev(`(async () => { const { state } = await import('/src/ui/state.js'); return (await state.repo.listReasons()).filter((r) => r.reason === 'other').map((r) => r.note); })()`);
  check('"Anders" met een toelichting wordt als reden bewaard', savedOther.includes('Auto kapot'), JSON.stringify(savedOther));

  // Voortgang: week en maand bepalen samen het overzicht, de tegel en de review; bladeren kan onbeperkt; een review staat open van vrijdag 00:00 tot maandag
  // 12:00 (week) en van de 25e tot de 2e 12:00 (maand). Wat open, nog dicht of gesloten is hangt van de klok af: de verwachtingen worden met dezelfde regels nagerekend.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('stats');
  await ev(`document.documentElement.style.fontSize = '100%'`);
  const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
  const click = async (selector, wait = 350) => { await ev(`${q(selector)}.click()`); await sleep(wait); };
  const clock = await ev(`(async () => {
    const { wallClockNow, state } = await import('/src/ui/state.js');
    const r = await import('/src/domain/reviews.js');
    const d = await import('/src/domain/dates.js');
    const now = wallClockNow();
    const month = d.startOfMonth(state.today); // de periode van de app (met de dagwissel van 04:00), niet van de muurklok: tussen 00:00 en 04:00 is dat nog de vorige dag
    const week = d.startOfWeek(state.today);
    // een eerdere week (gesloten) en de vorige maand krijgen een review, zodat we de kaarten van gesloten reviews zien
    await state.repo.saveReview({ weekStart: d.addDays(week, -14), wentWell: 'Eerder goed', wentBad: 'Eerder slecht' });
    await state.repo.saveMonthReview({ monthStart: d.addMonths(month, -1), adjust: 'Telefoon om 22:00 in de lader' });
    const { notifyChanged } = await import('/src/ui/state.js');
    notifyChanged();
    return {
      now, week, month,
      weekState: r.weekReviewState(week, now), monthState: r.monthReviewState(month, now), prevMonthState: r.monthReviewState(d.addMonths(month, -1), now),
      weeksInMonth: r.weeksOfMonth(month).filter((w) => w === d.addDays(week, -14)).length,
      opensMonth: r.monthReviewOpensOn(month),
    };
  })()`);
  await sleep(500);
  const viewState = () => ev(`(() => ({ tile: document.querySelector('.tiles .tile__label').textContent, title: document.querySelector('.review-card .section__title').textContent, state: document.querySelector('.review-card').dataset.state, form: !!document.querySelector('.review-card form'), saved: !!document.querySelector('.review-saved'), edit: !!document.querySelector('.review-saved [data-focus-key^="edit:"]'), empty: document.querySelector('.review-empty__title')?.textContent ?? null, emptyText: document.querySelector('.review-empty .xs')?.textContent ?? null, foot: document.querySelector('.review-saved__foot .xs')?.textContent ?? null, prevOff: document.querySelector('[data-focus-key="prev"]').disabled, nextOff: document.querySelector('[data-focus-key="next"]').disabled, overflow: document.documentElement.scrollWidth - innerWidth }))()`);
  await click('input[name="overviewPeriod"][value="week"]'); // de keuze blijft staan van eerdere controles
  await click('.overview__today').catch(() => {}); // staat er niets (al op de huidige periode), dan is er niets om terug te gaan
  let v = await viewState();
  const weekFields = await ev(`!!document.querySelector('#wentWell') && !!document.querySelector('#wentBad') && !document.querySelector('#adjust')`);
  check(`Voortgang, week (nu ${clock.weekState}): de tegel heet "Laatste 7 dagen"; open = formulier met twee velden (goed en slecht), anders "Nog niet open" zonder formulier`, v.tile === 'Laatste 7 dagen' && v.title === 'Wekelijkse review' && v.state === clock.weekState
    && (clock.weekState === 'open' ? v.form && weekFields : !v.form && v.empty === 'Nog niet open'), JSON.stringify({ clock, v }));
  for (let i = 0; i < 4; i++) await click('[data-focus-key="next"]', 250);
  v = await viewState();
  check('Voortgang, week: vooruit bladeren kan (4 weken), de tegel toont wat gepland staat en de review is "Nog niet open" zonder formulier', !v.nextOff && v.tile === 'Gepland deze week' && v.empty === 'Nog niet open' && /opent op vrijdag/.test(v.emptyText ?? '') && !v.form, JSON.stringify(v));
  await click('.overview__today');
  for (let i = 0; i < 6; i++) await click('[data-focus-key="prev"]', 250);
  v = await viewState();
  check('Voortgang, week: terug bladeren kan (6 weken), ook naar weken zonder gegevens; een gesloten week zonder review is "Niet ingevuld" zonder formulier of "Alsnog invullen"', !v.prevOff && v.tile === 'Gedaan deze week' && v.empty === 'Niet ingevuld' && /gesloten/.test(v.emptyText ?? '') && !v.form, JSON.stringify(v));
  await click('.overview__today');
  for (let i = 0; i < 2; i++) await click('[data-focus-key="prev"]', 250);
  v = await viewState();
  check('Voortgang, week: een gesloten week met review staat als kaart (goed en slecht) zonder "Bewerk", met "Gesloten sinds maandag … 12:00"', v.state === 'closed' && v.saved && !v.edit && !v.form && /Gesloten sinds maandag .* 12:00/.test(v.foot ?? ''), JSON.stringify(v));
  await click('.overview__today');
  if (clock.weekState === 'open') {
    // de weekreview invullen: het formulier wordt een kaart met "Bewerk"
    await ev(`(() => { const set = (id, value) => { const i = document.querySelector(id); i.value = value; i.dispatchEvent(new Event('input')); }; set('#wentWell', 'Elke dag water'); set('#wentBad', 'Te laat naar bed'); })()`);
    await ev(`document.querySelector('.review-card form').requestSubmit()`);
    await sleep(700);
    const savedWeek = await ev(`(() => ({ form: !!document.querySelector('.review-card form'), items: [...document.querySelectorAll('.review-saved__text')].map((e) => e.textContent), edit: !!document.querySelector('.review-saved [data-focus-key^="edit:"]'), foot: document.querySelector('.review-saved__foot .xs')?.textContent }))()`);
    check('Voortgang, week: na opslaan staat de review als kaart (goed en slecht) met een "Bewerk"-knop en "Open tot maandag … 12:00", zonder formulier', !savedWeek.form && savedWeek.items.join('|') === 'Elke dag water|Te laat naar bed' && savedWeek.edit && /Open tot maandag .* 12:00/.test(savedWeek.foot ?? ''), JSON.stringify(savedWeek));
    await click('.review-saved [data-focus-key^="edit:"]');
    const editing = await ev(`({ well: document.querySelector('#wentWell')?.value, cancel: [...document.querySelectorAll('.review-card .button')].some((b) => b.textContent === 'Annuleren') })`);
    check('Voortgang, week: "Bewerk" opent het formulier met wat er stond en een "Annuleren"', editing.well === 'Elke dag water' && editing.cancel, JSON.stringify(editing));
    await ev(`[...document.querySelectorAll('.review-card .button')].find((b) => b.textContent === 'Annuleren').click()`);
    await sleep(300);
  } else {
    check(`Voortgang, week: invullen en bewerken wordt hier overgeslagen: de weekreview staat vandaag niet open (${clock.now}); de regels zelf zijn getest in tests/app/detail-backup.test.js`, true);
  }
  // maand: tegel, weken van de maand en de maandreview (open van de 25e tot de 2e 12:00)
  await click('input[name="overviewPeriod"][value="month"]');
  v = await viewState();
  const monthInfo = await ev(`({ weeks: document.querySelectorAll('.review-weeks__item').length, adjust: !!document.querySelector('#adjust'), weekField: !!document.querySelector('#wentWell') })`);
  const monthOk = clock.monthState === 'open' ? monthInfo.adjust : (!monthInfo.adjust && v.empty === 'Nog niet open' && /opent op .* 25 /.test(v.emptyText ?? ''));
  check(`Voortgang, maand (nu ${clock.monthState}): de tegel heet "Laatste 31 dagen", de maandreview vervangt de weekreview; open = formulier, anders "Nog niet open" met de 25e`, v.tile === 'Laatste 31 dagen' && v.title === 'Maandelijkse review' && v.state === clock.monthState && !monthInfo.weekField && monthOk, JSON.stringify({ clock, v, monthInfo }));
  // de vorige maand: sloot op de 2e om 12:00. Daarna alleen lezen; erbinnen nog te bewerken. Het is ook de bron van de maandtaak op Vandaag.
  await click('[data-focus-key="prev"]');
  v = await viewState();
  check(`Voortgang, maand: de vorige maand (nu ${clock.prevMonthState}) toont de afspraak als kaart; gesloten = zonder "Bewerk" en met "Gesloten sinds", open = met "Bewerk"`, v.saved && !v.form && v.edit === (clock.prevMonthState === 'open') && (clock.prevMonthState === 'closed' ? /Gesloten sinds .* 12:00/.test(v.foot ?? '') : /Open tot .* 12:00/.test(v.foot ?? '')) && /taak/.test(v.foot ?? ''), JSON.stringify({ clock, v }));
  await click('[data-focus-key="prev"]');
  v = await viewState();
  check('Voortgang, maand: een eerdere maand zonder review is "Niet ingevuld" (gesloten), zonder formulier', v.empty === 'Niet ingevuld' && !v.form && !v.edit, JSON.stringify(v));
  await nav('today');
  await sleep(300);
  const task = await ev(`(() => { const c = document.querySelector('.monthtask__card'); return { exists: !!c, badge: c?.querySelector('.badge--monthtask')?.textContent, text: c?.querySelector('.monthtask__text')?.textContent }; })()`);
  check('Vandaag: de maandtaak staat als eigen kaart met "Maandtaak" en de tekst uit de review', task.exists && task.badge === 'Maandtaak' && task.text === 'Telefoon om 22:00 in de lader', JSON.stringify(task));
  for (const [size, w, h2, zoom] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h2, deviceScaleFactor: 2, mobile: true });
    await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
    await sleep(300);
    const wide = await ev(`(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('.app__main .monthtask *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length, tap: Math.round(document.querySelector('.monthtask__done').getBoundingClientRect().height) }))()`);
    check(`Vandaag, maandtaak · ${size}: past zonder zijwaarts scrollen en de knop is minstens 44 px`, wide.overflow <= 0 && wide.wide === 0 && wide.tap >= 44, JSON.stringify(wide));
    await nav('stats');
    await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
    for (const period of ['week', 'month']) {
      await ev(`${q(`input[name="overviewPeriod"][value="${period}"]`)}.click()`);
      await sleep(300);
      const fits = await ev(`(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('.app__main .review-card *, .app__main .overview *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className).slice(0, 4), tiny: [...document.querySelectorAll('.review-card .button, .overview .button, .overview .icon-button')].filter((b) => b.getBoundingClientRect().height < 43).length }))()`);
      check(`Voortgang, ${period} · ${size}: overzicht en review passen zonder zijwaarts scrollen, knoppen minstens 44 px`, fits.overflow <= 0 && fits.wide.length === 0 && fits.tiny === 0, JSON.stringify(fits));
    }
    await nav('today');
  }
  await ev(`document.documentElement.style.fontSize = '100%'`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await click('.monthtask__done', 600);
  const taskGone = await ev(`!document.querySelector('.monthtask__card')`);
  check('Vandaag: de maandtaak afvinken haalt hem weg (eenmalig)', taskGone);
  // de melding "je review staat klaar": een tik opent Voortgang op die periode, de reviewkaart licht even op en het adres wordt weer schoon
  const todayIso = await ev(`(async () => (await import('/src/ui/state.js')).state.today)()`);
  for (const [kind, title] of [['month', 'Maandelijkse review'], ['week', 'Wekelijkse review']]) {
    await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); // een prestatie-viering van eerdere stappen houdt anders de focus vast
    await nav('today'); // vanaf een ander scherm, zoals bij een tik op de melding
    await nav(`stats?review=${kind}&date=${todayIso}`);
    await sleep(700);
    const landed = await ev(`(() => { const card = document.querySelector('.review-card'); const box = card?.getBoundingClientRect(); return { title: card?.querySelector('.section__title')?.textContent, lit: card?.classList.contains('review-card--spotlight') ?? false, inView: !!box && box.bottom > 0 && box.top < innerHeight, hash: location.hash, radio: document.querySelector('input[name="overviewPeriod"]:checked')?.value, focused: document.activeElement === card }; })()`);
    check(`melding "${kind}": Voortgang staat op die periode, de reviewkaart licht op, staat in beeld en het adres is weer schoon`, landed.title === title && landed.lit && landed.inView && landed.hash === '#/stats' && landed.radio === kind && landed.focused, JSON.stringify(landed));
  }
  await sleep(3800);
  const faded = await ev(`!document.querySelector('.review-card--spotlight')`);
  check('melding: de markering verdwijnt na een paar seconden', faded);
  // de melding "Week review staat vanaf nu open" op Vandaag (afhankelijk van de dag van de week en van de maand; we rekenen de verwachting met dezelfde regels na)
  await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  await ev(`localStorage.removeItem('hb-review-nudge-dismissed')`);
  await ev(`(async () => { const { state, notifyChanged } = await import('/src/ui/state.js'); const { startOfWeek } = await import('/src/domain/dates.js'); await state.repo.saveReview({ weekStart: startOfWeek(state.today), wentWell: '', wentBad: '' }); notifyChanged(); })()`);
  const expectedKinds = await ev(`(async () => { const { state, wallClockNow } = await import('/src/ui/state.js'); const { reviewNudges } = await import('/src/domain/reviews.js'); return reviewNudges({ reviews: await state.repo.listReviews(), now: wallClockNow() }); })()`);
  await nav('today');
  await sleep(400);
  const wantTitle = expectedKinds.length >= 2 && new Set(expectedKinds.map((n) => n.kind)).size === 2 ? 'Week- en maandreview staan vanaf nu open' : expectedKinds[0]?.kind === 'week' ? 'Week review staat vanaf nu open' : expectedKinds[0]?.kind === 'month' ? 'Maand review staat vanaf nu open' : null;
  const shown = await ev(`(async () => { const { state } = await import('/src/ui/state.js'); const c = document.querySelector('#reviewNote'); return { exists: !!c, title: c?.querySelector('.reviewnote__title')?.textContent ?? null, links: [...(c?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href')), today: state.today }; })()`);
  check(`Vandaag: de review-melding volgt de regels (nu: ${expectedKinds.map((n) => n.kind).join(' + ') || 'geen'}) met de juiste tekst en knoppen naar de review`, shown.exists === (wantTitle !== null) && shown.title === wantTitle
    && JSON.stringify(shown.links) === JSON.stringify(expectedKinds.map((n) => `#/stats?review=${n.kind}&date=${n.start}`)), JSON.stringify({ expectedKinds, shown }));
  if (wantTitle !== null) {
    for (const [size, w, h2, zoom] of sizes) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h2, deviceScaleFactor: 2, mobile: true });
      await ev(`document.documentElement.style.fontSize = '${zoom}%'`);
      await sleep(300);
      const fit = await ev(`(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('#reviewNote *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length, tiny: [...document.querySelectorAll('#reviewNote .button')].filter((b) => b.getBoundingClientRect().height < 43).length }))()`);
      check(`Vandaag, review-melding · ${size}: past zonder zijwaarts scrollen en de knoppen zijn minstens 44 px`, fit.overflow <= 0 && fit.wide === 0 && fit.tiny === 0, JSON.stringify(fit));
    }
    await ev(`document.documentElement.style.fontSize = '100%'`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    // op desktop staat de melding boven beide kolommen: de dag links en de stapel rechts beginnen op dezelfde hoogte (zie ook "alles gedaan" in social-browser-check)
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const columns = await ev(`(() => { const top = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null); const note = document.querySelector('#reviewNote'); return { aboveColumns: !!note?.closest('.today__notes') && !note.closest('.today__columns'), notesBottom: Math.round(note.getBoundingClientRect().bottom), main: top(document.querySelector('.today__main > :first-child')), side: top(document.querySelector('.today__side > :first-child')), columnsTop: top(document.querySelector('.today__columns')) }; })()`);
    check('Vandaag op desktop: de review-melding staat boven beide kolommen en de dag links en de stapel rechts beginnen op dezelfde hoogte', columns.aboveColumns && columns.main !== null && columns.side !== null && Math.abs(columns.main - columns.side) <= 2 && columns.columnsTop >= columns.notesBottom, JSON.stringify(columns));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    await ev(`[...document.querySelectorAll('#reviewNote .button--ghost')].find((b) => b.textContent === 'Niet nu').click()`);
    await sleep(300);
    const gone = await ev(`!document.querySelector('#reviewNote')`);
    await nav('habits');
    await nav('today');
    await sleep(300);
    const stays = await ev(`!document.querySelector('#reviewNote')`);
    check('Vandaag: "Niet nu" verbergt de review-melding, ook na een nieuwe keer openen van Vandaag', gone && stays);
    await ev(`localStorage.removeItem('hb-review-nudge-dismissed')`);
  }
  ws.close();
}

main()
  .catch((error) => { console.error(error); failures.push(String(error)); })
  .finally(() => {
    cleanup();
    console.log(failures.length === 0 ? '\nAlle lay-outcontroles slagen.' : `\n${failures.length} mislukt.`);
    process.exitCode = failures.length === 0 ? 0 : 1;
  });
