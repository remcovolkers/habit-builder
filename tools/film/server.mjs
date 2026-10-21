// Kleine server voor het uitlegfilmpje: de app (zoals tools/serve.mjs) en de "set" van het filmpje op /film/.
// De app krijgt een nepklok mee (stage/clock.js), zodat het filmpje altijd dezelfde dag en tijd laat zien.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const STAGE = resolve(fileURLToPath(new URL('./stage', import.meta.url)));
const PUBLIC = ['index.html', 'manifest.webmanifest', 'src', 'styles', 'vendor', 'icons', 'fonts', 'themes'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf',
};

export function startServer(port, { voice = null } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === '/film/voice.json') {
        if (!voice) { res.writeHead(404).end('Geen stem'); return; }
        // de browser heeft alleen de lengtes nodig, niet de bestanden
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(Object.fromEntries(Object.entries(voice).map(([text, clip]) => [text, { ms: clip.ms }]))));
        return;
      }
      const relative = normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/, '') || 'index.html';
      const inStage = relative.startsWith(`film${sep}`) || relative === 'film';
      const base = inStage ? STAGE : ROOT;
      const file = resolve(join(base, inStage ? relative.slice(5) || 'index.html' : relative));
      if (!file.startsWith(base + sep) || (!inStage && !PUBLIC.includes(relative.split(sep)[0]))) { res.writeHead(404).end('Not found'); return; }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      let body = await readFile(file);
      // de app in het filmpje: nepklok vóór alle andere scripts (en een lichtere CSP is niet nodig: hetzelfde domein)
      if (relative === 'index.html') body = Buffer.from(body.toString('utf8').replace('<script src="src/theme-boot.js"></script>', '<script src="/film/clock.js"></script>\n  <script src="/film/mock.js"></script>\n  <script src="src/theme-boot.js"></script>'));
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5180;
  await startServer(port);
  console.log(`Filmset op http://localhost:${port}/film/  ·  app op http://localhost:${port}/`);
}
