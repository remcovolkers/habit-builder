// Dev-server zonder dependencies. Gebruik: npm run serve  (poort via PORT, standaard 5173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// SERVE_ROOT: een andere map serveren (bv. _site, om de uitgerolde versie met service worker te proberen)
const ROOT = process.env.SERVE_ROOT ? resolve(process.env.SERVE_ROOT) : resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

// Alleen wat ook op Pages terechtkomt; docs/, tests/, supabase/ e.d. blijven onbereikbaar.
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'vendor', 'icons', 'fonts', 'themes'];

function isPublic(relative) {
  const [first] = relative.split(sep);
  return PUBLIC.includes(first);
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '') || 'index.html';
    const file = resolve(join(ROOT, relative));
    if (!file.startsWith(ROOT + sep) || !isPublic(relative)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`Habit Builder op http://localhost:${PORT}/`));
