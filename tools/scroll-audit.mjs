// Meet per pagina hoe er gescrold wordt: hoe hoog de pagina is ten opzichte van het scherm, welke elementen zelf scrollen en wat blijft staan
// (sticky of vast). Met het gevulde testaccount (tools/lib/stub-data.mjs), op 1920×1080 en op een telefoon. Alleen lezen: er wordt niets aangepast.
// Gebruik: npm run audit:scroll. Een andere browser: zet BROWSER op het pad. De uitkomst is de basis voor docs/SCROLLEN.md.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
const PORT = 5176;
const DEBUG = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'hb-scroll-'));
const edge = spawn(BROWSER, ['--headless=new', '--disable-gpu', ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  server.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
  else edge.kill('SIGKILL');
};

// het stub-bestand is een module met relatieve imports; de pagina mag dat bestand niet laden, dus de tekst wordt hier een functie
const stubSource = readFileSync(join(ROOT, 'tools/lib/stub-data.mjs'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export /gm, '');
const SEED = `(async () => {
  const { ICONS } = await import('/src/content/icons.js');
  const { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek } = await import('/src/domain/dates.js');
  const { dueDateInMonth } = await import('/src/domain/schedule.js');
  const { state, notifyChanged } = await import('/src/ui/state.js');
  ${stubSource}
  await fillStubAccount(state.repo, state.today);
  notifyChanged();
  return (await state.repo.listHabits()).map((h) => [h.id, h.name]);
})()`;

const MEASURE = `(() => {
  const vh = innerHeight;
  const doc = document.documentElement;
  const sc = [...document.querySelectorAll('body *')].filter((e) => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.getBoundingClientRect().height > 0;
  }).map((e) => (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0] + ' (' + e.clientHeight + '/' + e.scrollHeight + ')');
  const pinned = [...document.querySelectorAll('body *')].filter((e) => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0 && !e.closest('dialog'))
    .map((e) => '.' + String(e.className).split(' ')[0] + ':' + getComputedStyle(e).position);
  const title = document.querySelector('h1')?.getBoundingClientRect();
  return { vh, page: doc.scrollHeight, factor: Math.round((doc.scrollHeight / vh) * 100) / 100, hasScrollbar: innerWidth - doc.clientWidth, scrollers: sc, pinned: [...new Set(pinned)], title: title ? Math.round(title.top) : null };
})()`;

async function main() {
  let page = null;
  for (let i = 0; i < 160 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()).find((t) => t.type === 'page') ?? null; } catch { /* start nog */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('de browser kwam niet op');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await nav('today');
  const habits = await ev(SEED);
  const id1 = (name) => habits.find(([, n]) => n === name)[0];

  const routes = [
    ['Vandaag', 'today'], ['Habits', 'habits'], ['Habit: detail (Water drinken)', `habits/${id1('Water drinken')}`], ['Habit: bewerken', `habits/${id1('Water drinken')}/edit`],
    ['Habit: nieuw', 'habits/new'], ['Voortgang', 'stats'], ['Prestaties', 'achievements'], ['Instellingen', 'settings'],
  ];
  const results = [];
  // 1536×730 = een 1080p-scherm op 125% schaal met de balken van de browser eraf: wat veel laptops echt overhouden
  const VIEWS = [['desktop 1920×1080', [1920, 1080, 'desktop']], ['desktop 1536×730 (1080p op 125%)', [1536, 730, 'desktop']], ['telefoon 390×844', [390, 844, 'telefoon']]];
  for (const [view, [w, h, kind]] of VIEWS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: kind === 'telefoon' });
    for (const [name, route] of routes) {
      await nav(route);
      await ev(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
      await sleep(250);
      results.push({ view, name, ...(await ev(MEASURE)) });
      if (process.env.SHOTS) { // SHOTS=<map>: van elke pagina een schermafbeelding, om het met het oog te beoordelen
        mkdirSync(process.env.SHOTS, { recursive: true });
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(process.env.SHOTS, `${kind}-${name.replace(/[^a-z0-9]+/gi, '_')}-${w}.png`), Buffer.from(shot.result.data, 'base64'));
      }
    }
  }
  console.log(`Scroll-overzicht (vandaag: ${await ev("import('/src/ui/state.js').then((m) => m.state.today)")})\n`);
  for (const [view] of VIEWS) {
    console.log(`\n## ${view}`);
    console.log('| Pagina | Hoogte t.o.v. scherm | Scrollt zelf | Blijft staan |');
    console.log('|---|---|---|---|');
    for (const r of results.filter((x) => x.view === view)) {
      console.log(`| ${r.name} | ${r.factor}× (${r.page}/${r.vh}px) | ${r.scrollers.join(', ') || 'alleen de pagina'} | ${r.pinned.join(', ') || '-'} |`);
    }
  }
  ws.close();
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(cleanup);
