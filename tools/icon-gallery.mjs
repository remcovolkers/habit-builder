// Maakt een voorbeeldpagina van de hele iconenset (icons/set.svg) in de stijl van de eerste voorbeeldpagina van Moda: per icoon
// 24, 40 en 56 px op de kaart, op de pagina, als gekozen tegel (neon gloed) en op de 8 habitkleuren, en voor prestaties ook op de medaille.
// Gebruik: npm run icons:gallery  ->  docs/icons/galerij.html (niet in git: opnieuw te maken). Zonder Moda en zonder de app.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_GROUPS } from '../src/content/icons.js';
import { UI_ICON_GROUPS } from '../src/content/ui-icons.js';
import { ICON_SET_KEYS } from '../src/content/icon-set.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'icons', 'galerij.html');
const sprite = readFileSync(join(ROOT, 'icons', 'set.svg'), 'utf8').replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg xmlns="http://www.w3.org/2000/svg" class="defs" width="0" height="0" aria-hidden="true">');
const HABIT_COLORS = ['#29ffb9', '#2ed3c6', '#5cc8ff', '#b6f25c', '#ffc857', '#ff8a7a', '#ff7eb6', '#d9c7a3'];

const use = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${key}"/></svg>`;
const sizes = (key) => ['s24', 's40', 's56'].map((s) => `<span class="${s}">${use(key)}</span>`).join('');
const tile = (key, style, cls = '') => `<div class="t ${cls}" style="${style}">${sizes(key)}</div>`;

function card(key, medal) {
  const colors = HABIT_COLORS.map((c) => tile(key, `background:color-mix(in srgb, ${c} 22%, #18181a);color:#e4e9f2;--icon-accent:${c}`)).join('');
  const medals = medal
    ? tile(key, 'background:#29ffb9;color:#06140f;--icon-accent:#06140f;border-radius:999px') + tile(key, 'background:#ffcb05;color:#1a1206;--icon-accent:#1a1206;border-radius:999px') + tile(key, 'background:#22307a;color:#e4e9f2;--icon-accent:#ffcb05')
    : '';
  return `<div class="card" id="${key}"><div class="key">${key}</div><div class="row">`
    + tile(key, 'background:#18181a;color:#e4e9f2;--icon-accent:#29ffb9')
    + tile(key, 'background:#090c0c;color:#e4e9f2;--icon-accent:#29ffb9')
    + tile(key, 'background:#1c1c1f;color:#e4e9f2;--icon-accent:#29ffb9', 'sel')
    + colors + medals
    + `</div><small>kaart #18181a · pagina #090c0c · gekozen · 8 habitkleuren (tegel = kleur 22% op donker, accent = habitkleur)${medal ? ' · medaille mint, geel, en op het blauwe thema' : ''}</small></div>`;
}

const sections = [
  ...ICON_GROUPS.map((group) => ({ title: `Habits · ${group.label}`, keys: group.icons.map((i) => i.key), medal: false })),
  ...UI_ICON_GROUPS.map((group) => ({ title: group.label, keys: [...group.keys], medal: true })),
];
const present = new Set(ICON_SET_KEYS);
const body = sections.map((s, i) => `<h2 id="sec${i}">${s.title} <span>${s.keys.filter((k) => present.has(k)).length}/${s.keys.length}</span></h2>${s.keys.filter((k) => present.has(k)).map((k) => card(k, s.medal)).join('')}`).join('\n');

writeFileSync(OUT, `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Habit Builder iconen</title><style>
body{margin:0;padding:40px;background:#090c0c;color:#e4e9f2;font-family:Manrope,system-ui,sans-serif}
h1{font-family:'Chakra Petch',sans-serif;letter-spacing:.05em} h2{font-family:'Chakra Petch',sans-serif;margin:36px 0 8px} h2 span{color:#8d919a;font-weight:400;font-size:.7em}
.rule{max-width:980px;color:#8d919a;line-height:1.6;font-size:14px;border:1px solid rgba(41,255,185,.5);border-radius:14px;padding:16px 20px;background:#18181a}
.defs{position:absolute;width:0;height:0;overflow:hidden} nav{max-width:980px;line-height:2;color:#8d919a;font-size:13px;margin:16px 0} nav a{color:#29ffb9;text-decoration:none}
.card{background:#18181a;border:1px solid rgba(41,255,185,.5);border-radius:14px;padding:16px;margin:16px 0}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center} .key{font-family:monospace;color:#29ffb9;font-size:15px;margin-bottom:10px}
.t{display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.08)}
.t span{display:grid;place-items:center;border-radius:10px} .s24 svg{width:24px} .s40 svg{width:40px} .s56 svg{width:56px}
.t svg{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.sel{box-shadow:0 0 0 2px #29ffb9,0 0 18px rgba(41,255,185,.35)} .sel svg{filter:drop-shadow(0 0 4px rgba(41,255,185,.6))}
small{color:#8d919a;font-size:11px;display:block;margin-top:6px}
</style></head><body>${sprite}<h1>HABIT BUILDER · ICONENSET (${ICON_SET_KEYS.length})</h1>
<div class="rule"><b>Voorbeeldpagina, gemaakt uit icons/set.svg</b> (de set die de app gebruikt) met <code>npm run icons:gallery</code>. Elke tekening staat één keer in de set; de tegels hieronder tonen hem met verschillende kleuren, zoals de app dat doet: <code>currentColor</code> is de tekstkleur, <code>--icon-accent</code> de habitkleur (of de donkere kleur op een medaille).</div>
<nav>${sections.map((s, i) => `<a href="#sec${i}">${s.title}</a>`).join(' · ')}</nav>
${body}
</body></html>
`);
console.log(`✓ ${OUT.replace(ROOT, '')}: ${ICON_SET_KEYS.length} iconen`);
