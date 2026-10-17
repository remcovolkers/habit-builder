// Meet in een echte browser (headless Edge of Chrome, zonder Supabase) de ruimte onder de laatste kaart op Vandaag en Habits, en of de
// zwevende knop (FAB) de laatste kaart afdekt. Aanleiding: te veel scrollruimte onder de lijst (docs/ITERATIE-1.2.md §4).
// Gebruik: npm run check:layout. Een andere browser: zet BROWSER op het pad.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
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
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
  else edge.kill('SIGKILL');
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
    const fabTop = fab.getBoundingClientRect().top;
    resolve({
      scrollable: max, rem,
      gapPx: Math.round(barTop - lastBottom),
      covered: lastBottom > fabTop,
      fabShown: getComputedStyle(fab).opacity === '1',
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
        if (phase === 'weinig habits') {
          // past de pagina niet op het scherm, dan scrolt hij (en geldt de rest hieronder niet); anders staat de knop er gewoon
          if (end.scrollable <= 0) check(`${label}: past op het scherm, knop blijft staan`, end.fabShown, JSON.stringify(end));
          else check(`${label}: einde, hoogstens 2rem onder de laatste kaart`, end.gapPx <= 2 * end.rem, `${end.gapPx}px`);
          continue;
        }
        check(`${label}: einde, hoogstens 2rem onder de laatste kaart`, end.gapPx <= 2 * end.rem, `${end.gapPx}px (${(end.gapPx / end.rem).toFixed(1)}rem)`);
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
  const noPageScroll = () => ev(`({ page: document.documentElement.scrollHeight - innerHeight, bodyY: Math.round(window.scrollY) })`);
  const settle = async (route) => { await nav(route); await ev(`document.documentElement.style.fontSize = '100%'`); await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`); await sleep(300); };
  for (const [what, route] of [['Vandaag', 'today'], ['Habits', 'habits'], ['Voortgang', 'stats'], ['Habit: nieuw', 'habits/new'], ['Instellingen', 'settings'], ['Prestaties', 'achievements']]) {
    await settle(route);
    const m = await noPageScroll();
    check(`desktop, ${what}: de pagina zelf scrolt niet (alleen het werkvlak of een kolom)`, m.page <= 1 && m.bodyY === 0, JSON.stringify(m));
  }
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
  ws.close();
}

main()
  .catch((error) => { console.error(error); failures.push(String(error)); })
  .finally(() => {
    cleanup();
    console.log(failures.length === 0 ? '\nAlle lay-outcontroles slagen.' : `\n${failures.length} mislukt.`);
    process.exitCode = failures.length === 0 ? 0 : 1;
  });
