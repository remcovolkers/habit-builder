// Een headless Edge of Chrome besturen via het DevTools-protocol, zonder dependencies (Node 22+ heeft WebSocket). Zoals tools/layout-check.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findBrowser() {
  const found = [
    process.env.BROWSER,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].find((path) => path && existsSync(path));
  if (!found) throw new Error('Geen Edge of Chrome gevonden (zet BROWSER op het pad van de browser)');
  return found;
}

/** Start een browser met een tijdelijk profiel, opent een lege pagina met de gevraagde afmeting en geeft een handvat terug. */
export async function launch({ width = 1920, height = 1080, port = 9341 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'hb-film-'));
  const browser = spawn(findBrowser(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1', `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((entry) => entry.type === 'page');
    } catch { /* nog niet klaar */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('De browser startte niet');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('Geen verbinding met de browser')); });
  let nextId = 0;
  const waiting = new Map();
  const listeners = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message}`)); else resolve(data.result);
    } else if (data.method) {
      for (const listener of listeners.get(data.method) ?? []) listener(data.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, listener) => { listeners.set(method, [...(listeners.get(method) ?? []), listener]); };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (url) => { await send('Page.navigate', { url }); await sleep(600); };
  const close = () => {
    try { socket.close(); } catch { /* al dicht */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
    else browser.kill('SIGKILL');
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* het besturingssysteem ruimt het later op */ }
  };
  return { send, on, evaluate, navigate, close };
}
