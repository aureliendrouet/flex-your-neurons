/**
 * A foreground static file server for end-to-end tests.
 *
 * `astro preview` in Astro 7 always detaches into a background daemon, so Playwright's
 * `webServer` — which needs a process it can own and kill — cannot manage it. This script
 * is that process, and it deliberately mimics how GitHub Pages serves the built site:
 * everything mounted under the base path, directory URLs resolving to `index.html`, and
 * `404.html` for anything else.
 *
 * Usage: node scripts/serve-static.mjs [--port 4321] [--dir dist] [--base /iq]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const PORT = Number(flag('port', process.env.PORT ?? 4321));
const ROOT = resolve(flag('dir', 'dist'));
const BASE = (flag('base', process.env.BASE_PATH ?? '/iq') || '/').replace(/\/$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, file) {
  res.writeHead(status, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

/** Resolves a URL path to a file on disk, or null. Refuses to escape ROOT. */
function resolveFile(urlPath) {
  let rel = urlPath;
  // Anything outside the base path 404s, exactly as a project Page would. Serving the
  // site at the origin root too would quietly hide missing-base-path bugs.
  if (BASE) {
    if (!rel.startsWith(`${BASE}/`)) return null;
    rel = rel.slice(BASE.length);
  }

  const decoded = decodeURIComponent(rel || '/');
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = join(ROOT, safe);
  if (!target.startsWith(ROOT + sep) && target !== ROOT) return null;

  if (existsSync(target) && statSync(target).isFile()) return target;

  // Directory URLs resolve to index.html, with or without a trailing slash.
  for (const candidate of [join(target, 'index.html'), `${target}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0].split('#')[0];

  // A bare base path without its trailing slash: redirect, as a real host does.
  if (BASE && urlPath === BASE) {
    res.writeHead(301, { Location: `${BASE}/` });
    res.end();
    return;
  }

  const file = resolveFile(urlPath);
  if (file) {
    send(res, 200, file);
    return;
  }

  const notFound = join(ROOT, '404.html');
  if (existsSync(notFound)) {
    send(res, 404, notFound);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

if (!existsSync(ROOT)) {
  console.error(`serve-static: "${ROOT}" does not exist — run \`npm run build\` first.`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`serve-static: ${ROOT} at http://localhost:${PORT}${BASE}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
