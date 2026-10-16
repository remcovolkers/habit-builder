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
const edge = spawn(BROWSER, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(250);
    try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((t) => t.type === 'page'); } catch { /* de browser start nog */ }
  }
  if (!page) throw new Error('browser niet bereikbaar');
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
  ws.close();
}

main()
  .catch((error) => { console.error(error); failures.push(String(error)); })
  .finally(() => {
    cleanup();
    console.log(failures.length === 0 ? '\nAlle lay-outcontroles slagen.' : `\n${failures.length} mislukt.`);
    process.exitCode = failures.length === 0 ? 0 : 1;
  });
