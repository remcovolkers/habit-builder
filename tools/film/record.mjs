// Neemt het uitlegfilmpje op: speelt de set (tools/film/stage) af in een headless browser, vangt de beelden en maakt er met ffmpeg een mp4 van.
// Gebruik:
//   npm run film                     het hele filmpje  -> tools/film/out/habit-builder-uitleg.mp4
//   npm run film -- --scene 3        alleen scène 3 (met een contactvel om snel te kijken)
//   npm run film -- --out pad.mp4    ergens anders heen
// ffmpeg: zet FFMPEG op het pad van ffmpeg(.exe), of installeer het pakket @ffmpeg-installer/ffmpeg ergens in je NODE_PATH. Zie tools/film/README.md.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { launch, sleep } from './cdp.mjs';
import { startServer } from './server.mjs';
import { DEFAULT_VOICE, mixVoice, prepareVoice } from './voice.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const scene = option('scene');
const outFile = resolve(option('out') ?? join(here, 'out', scene ? `scene-${scene}.mp4` : 'habit-builder-uitleg.mp4'));
const keep = args.includes('--keep');
const withVoice = !args.includes('--no-voice');

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  for (const base of [process.env.FFMPEG_DIR, here, join(here, '..', '..')].filter(Boolean)) {
    try {
      const found = createRequire(join(base, 'x.js'))('@ffmpeg-installer/ffmpeg').path;
      if (existsSync(found)) return found;
    } catch { /* niet hier */ }
  }
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  if (probe.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg niet gevonden. Zet FFMPEG op het pad van ffmpeg of zie tools/film/README.md.');
}
const ffmpeg = findFfmpeg();

mkdirSync(dirname(outFile), { recursive: true });
const frames = join(tmpdir(), `hb-film-frames-${process.pid}`);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

let manifest = null;
if (withVoice) {
  try {
    manifest = await prepareVoice({ ffmpeg, only: scene, voice: option('voice') ?? DEFAULT_VOICE, rate: option('rate') ?? '+0%' });
  } catch (voiceError) {
    console.warn(`\nLet op: de stem is niet gelukt, het filmpje wordt stil.\n${voiceError.message}\n(Zie tools/film/README.md, "Stem".)\n`);
  }
}

const server = await startServer(0, { voice: manifest });
const appPort = server.address().port;
const page = await launch({ port: 9400 + Math.floor(Math.random() * 500) });
const times = [];
let count = 0;
let writing = Promise.resolve();
page.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const index = count++;
  times.push(metadata.timestamp);
  writing = writing.then(() => writeFileSync(join(frames, `f${String(index).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64')));
  page.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

let error = null;
let audioLog = [];
try {
  await page.navigate(`http://localhost:${appPort}/film/?wait=1${scene ? `&scene=${scene}` : ''}`);
  // wacht op de eerste echte afbeelding: pas dan starten we de opname (de set staat dan klaar)
  await sleep(1200);
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await page.evaluate('window.__filmStart = true');
  const started = Date.now();
  let lastLog = 0;
  for (;;) {
    await sleep(500);
    if (await page.evaluate('window.__filmDone === true')) break;
    if (Date.now() - lastLog > 15000) { lastLog = Date.now(); console.log(`  ... ${Math.round((Date.now() - started) / 1000)} s opgenomen, ${count} beelden`); }
    if (Date.now() - started > 25 * 60_000) throw new Error('De opname duurt te lang (meer dan 25 minuten)');
  }
  await sleep(1200); // de laatste beelden
  await page.send('Page.stopScreencast');
  error = await page.evaluate('window.__filmError ?? null');
  audioLog = await page.evaluate('window.__audioLog ?? []');
} finally {
  await writing;
  page.close();
  server.close();
}
if (error) console.error(`\nLet op: een scène stopte met een fout:\n${error}\n`);
if (count < 2) throw new Error('Er zijn geen beelden opgenomen');

// een lijst met per beeld de tijdsduur (de opname geeft alleen beelden als er iets verandert)
const slash = (path) => path.replaceAll('\\', '/');
const frameFile = (i) => `file 'f${String(i).padStart(6, '0')}.jpg'`; // relatief aan list.txt (een Windows-pad met stationsletter begrijpt deze ffmpeg niet)
const lines = [];
for (let i = 0; i < count; i += 1) {
  const duration = i + 1 < count ? times[i + 1] - times[i] : 1.5;
  lines.push(frameFile(i), `duration ${Math.max(0.001, duration).toFixed(4)}`);
}
lines.push(frameFile(count - 1)); // de concat-lezer wil het laatste bestand nog een keer
writeFileSync(join(frames, 'list.txt'), lines.join('\n'));
const seconds = times[count - 1] - times[0] + 1.5;
console.log(`${count} beelden, ${seconds.toFixed(1)} s. Coderen met ffmpeg ...`);

const encode = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', outFile], { stdio: 'inherit', cwd: frames });
if (encode.status !== 0) throw new Error('ffmpeg faalde');

// de stem eronder: elk fragment op het moment dat de uitleg in beeld kwam
if (manifest && audioLog.length) {
  const wav = join(frames, 'voice.wav');
  mixVoice({ ffmpeg, manifest, log: audioLog, startEpochMs: times[0] * 1000, totalSeconds: seconds, out: wav });
  const silent = outFile.replace(/\.mp4$/, '.stil.mp4');
  renameSync(outFile, silent);
  const mux = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-shortest', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  if (mux.status !== 0) throw new Error('ffmpeg faalde bij het toevoegen van de stem');
  rmSync(silent, { force: true });
  console.log(`Stem toegevoegd: ${audioLog.length} fragmenten.`);
}

// een contactvel: om snel te zien wat er in staat (één afbeelding met een beeld per paar seconden)
if (scene || args.includes('--sheet')) {
  const step = Math.max(2, Math.round(seconds / 12));
  const sheet = outFile.replace(/\.mp4$/, '-sheet.png');
  spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', outFile, '-vf', `fps=1/${step},scale=640:-1,tile=3x4`, '-frames:v', '1', sheet], { stdio: 'inherit' });
  console.log(`contactvel (een beeld per ${step} s): ${sheet}`);
}
if (!keep) rmSync(frames, { recursive: true, force: true });
console.log(`Klaar: ${outFile} (${(statSync(outFile).size / 1048576).toFixed(1)} MB, ${seconds.toFixed(0)} s)`);
