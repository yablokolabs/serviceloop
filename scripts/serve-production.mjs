// Production front server for the hosted demo.
// Serves the built web app (apps/web/dist), proxies /api/* to the API on
// 127.0.0.1:3101, and rate-limits the paid paths. No dependencies.
//
// Env: WEB_PORT (default 8080), API_PORT (default 3101),
//      TURN_LIMIT_PER_MIN (default 20 per IP for POST /api/turns),
//      API_LIMIT_PER_MIN (default 180 per IP for all /api).
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const WEB_PORT = Number(process.env.WEB_PORT ?? 8080);
const API_PORT = Number(process.env.API_PORT ?? 3101);
const TURN_LIMIT = Number(process.env.TURN_LIMIT_PER_MIN ?? 20);
const API_LIMIT = Number(process.env.API_LIMIT_PER_MIN ?? 180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

// Sliding one-minute counters per client IP. In-memory by design: this is
// a single-instance demo front door, not a fleet.
const hits = new Map();
function limited(ip, limit) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

function securityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'microphone=(), camera=()');
}

const server = createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url ?? '/', 'http://x');
  const ip = (req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? 'unknown').toString();

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const isTurn = req.method === 'POST' && url.pathname === '/api/turns';
    if (limited(ip, isTurn ? TURN_LIMIT : API_LIMIT)) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
      res.end(JSON.stringify({ ok: false, error: 'rate-limited', detail: 'Too many requests. Wait a minute and try again.' }));
      return;
    }
    const proxy = httpRequest(
      { host: '127.0.0.1', port: API_PORT, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'api-unreachable' }));
    });
    req.pipe(proxy);
    return;
  }

  // Static files with SPA fallback to index.html.
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, safe === '/' ? 'index.html' : safe);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }
});

server.listen(WEB_PORT, '127.0.0.1', () => {
  console.log(`serviceloop web on 127.0.0.1:${WEB_PORT} (api -> 127.0.0.1:${API_PORT})`);
});
