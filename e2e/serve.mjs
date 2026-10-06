// Dependency-free static file server for the E2E suite.
//
// By default it serves the repo root exactly the way GitHub Pages serves a source
// checkout (no build step). With E2E_ROOT=dist and E2E_PREFIX=/pm-ops-map it serves
// the production build under a sub-path, the way a GitHub *project* Pages site is
// hosted — and answers 404 for anything outside that prefix, so an absolute asset
// URL (src="/js/app.js") that would break on Pages breaks here too.
// ES modules are refused by browsers unless they arrive as text/javascript.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(REPO, process.env.E2E_ROOT || '.');
const PREFIX = (process.env.E2E_PREFIX || '').replace(/\/+$/, '');
const PORT = Number(process.env.E2E_PORT) || 4173;
const SERVING_REPO_ROOT = ROOT === REPO;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (PREFIX) {
      if (urlPath !== PREFIX && !urlPath.startsWith(`${PREFIX}/`)) {
        res.writeHead(404).end('Not found (outside the sub-path this site is hosted under)');
        return;
      }
      urlPath = urlPath.slice(PREFIX.length) || '/';
    }
    const rel = urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
    const file = path.normalize(path.join(ROOT, rel));
    // Refuse anything that escapes the root, and keep tooling/secrets private when serving the repo.
    const relative = path.relative(ROOT, file);
    if (!file.startsWith(ROOT + path.sep) || (SERVING_REPO_ROOT && /(^|[\\/])(node_modules|\.git|server)([\\/]|$)/.test(relative))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`E2E static server on http://127.0.0.1:${PORT}${PREFIX}/ (root: ${path.relative(REPO, ROOT) || '.'})`));
