// De stem onder het filmpje: haalt alle uitlegteksten uit het draaiboek, laat er met Microsofts neurale stem (edge-tts) geluid van maken, meet hoe lang
// elk fragment duurt (de opname laat elke uitleg zo lang staan) en zet de fragmenten na de opname op de juiste momenten onder het beeld.
// Eenmalig: python -m venv tools/film/.venv && tools/film/.venv/Scripts/python -m pip install edge-tts  (zie tools/film/README.md).
// De teksten gaan naar de online spraakdienst van Microsoft; verder verlaat niets de computer.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chapterNarration, narrationFor } from './stage/narration.js';

const here = dirname(fileURLToPath(import.meta.url));
export const VOICE_DIR = join(here, 'out', 'voice');
export const DEFAULT_VOICE = 'nl-NL-ColetteNeural';
const SAMPLE_RATE = 24000;

function findPython() {
  if (process.env.EDGE_TTS_PYTHON) return process.env.EDGE_TTS_PYTHON;
  for (const candidate of [join(here, '.venv', 'Scripts', 'python.exe'), join(here, '.venv', 'bin', 'python')]) if (existsSync(candidate)) return candidate;
  return 'python';
}

/** Draait het draaiboek met een nep-F die niets doet en onthoudt wat er gezegd wordt: de gesproken teksten, in volgorde. */
export async function collectLines({ only } = {}) {
  const { play } = await import(pathToFileURL(join(here, 'stage', 'script.js')).href);
  const lines = [];
  let chapters = [];
  const handlers = {
    setChapters: (list) => { chapters = list; },
    chapter: (index, { sub = '' } = {}) => lines.push(chapterNarration(index, chapters[index], sub)),
    say: (content) => lines.push(narrationFor(content)),
    sayAndRead: (content) => lines.push(narrationFor(content)),
    showCard: ({ title = '', sub = '', voice } = {}) => lines.push(narrationFor(voice !== undefined ? { voice } : { title, body: sub })),
  };
  const F = new Proxy({}, { get: (_, name) => (...args) => { handlers[name]?.(...args); return Promise.resolve(); } });
  await play(F, { only: only ?? null });
  return [...new Set(lines.filter(Boolean))];
}

function synthesize(text, file, { voice, rate }) {
  return new Promise((resolve, reject) => {
    const child = spawn(findPython(), ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 && existsSync(file) ? resolve() : reject(new Error(`edge-tts faalde (${code}): ${error.slice(-300)}`))));
  });
}

/** De stem laat na elke punt bijna een seconde stilte; dat klinkt traag. Stiltes langer dan een halve seconde worden ingekort tot een kwart seconde. */
function tighten(ffmpeg, source, target) {
  const result = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', source, '-af', 'silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-45dB:stop_silence=0.25', '-ar', '24000', '-ac', '1', target]);
  if (result.status !== 0 || !existsSync(target)) throw new Error(`Geluid inkorten mislukt: ${source}`);
}

/** De duur van een geluidsbestand in ms, via ffmpeg. */
function durationMs(ffmpeg, file) {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!match) throw new Error(`Geen duur gevonden voor ${file}`);
  return Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
}

/** Zorgt dat elke tekst een geluidsbestand heeft (cache op tekst en stem) en geeft { tekst: { file, ms } } terug. */
export async function prepareVoice({ ffmpeg, only, voice = DEFAULT_VOICE, rate = '+0%', log = console.log } = {}) {
  mkdirSync(VOICE_DIR, { recursive: true });
  const lines = await collectLines({ only });
  const manifest = {};
  const todo = [];
  for (const text of lines) {
    const file = join(VOICE_DIR, `${createHash('sha1').update(`${voice}|${rate}|strak1|${text}`).digest('hex').slice(0, 20)}.mp3`);
    manifest[text] = { file, ms: 0 };
    if (!existsSync(file)) todo.push({ text, file });
  }
  log(`Stem: ${lines.length} fragmenten, ${todo.length} nieuw te maken (${voice}).`);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const job = todo[next++];
      const raw = `${job.file}.ruw.mp3`;
      try { await synthesize(job.text, raw, { voice, rate }); } catch { await synthesize(job.text, raw, { voice, rate }); } // één nieuwe poging
      tighten(ffmpeg, raw, job.file);
      rmSync(raw, { force: true });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const entry of Object.values(manifest)) entry.ms = durationMs(ffmpeg, entry.file);
  return manifest;
}

/** Zet de fragmenten (log: [{ text, at }], at in ms sinds 1970) op hun momenten onder één geluidsspoor en geeft het wav-bestand terug. */
export function mixVoice({ ffmpeg, manifest, log, startEpochMs, totalSeconds, out }) {
  const samples = Math.ceil((totalSeconds + 2) * SAMPLE_RATE);
  const track = new Int16Array(samples);
  for (const { text, at } of log) {
    const clip = manifest[text];
    if (!clip) continue;
    const decoded = spawnSync(ffmpeg, ['-v', 'error', '-i', clip.file, '-f', 's16le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-'], { maxBuffer: 256 * 1024 * 1024 });
    if (decoded.status !== 0) throw new Error(`Geluid decoderen mislukt: ${clip.file}`);
    const pcm = new Int16Array(decoded.stdout.buffer, decoded.stdout.byteOffset, Math.floor(decoded.stdout.length / 2));
    const offset = Math.max(0, Math.round(((at - startEpochMs) / 1000) * SAMPLE_RATE));
    for (let i = 0; i < pcm.length && offset + i < samples; i += 1) track[offset + i] = Math.max(-32768, Math.min(32767, track[offset + i] + pcm[i]));
  }
  const data = Buffer.from(track.buffer);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(out, Buffer.concat([header, data]));
  return out;
}
