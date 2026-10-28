// Production front server for the hosted demo.
// Serves the built web app (apps/web/dist), proxies /api/* to the API on
// 127.0.0.1:3101, and rate-limits the paid paths. No dependencies.
//
// Env: WEB_HOST (default 127.0.0.1; 0.0.0.0 on Modal), WEB_PORT (default 8080), API_PORT (default 3101),
//      TURN_LIMIT_PER_MIN (default 20 per IP for POST /api/turns),
//      API_LIMIT_PER_MIN (default 180 per IP for all /api).
import { createServer, request as httpRequest } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const WEB_HOST = process.env.WEB_HOST ?? '127.0.0.1';
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

// Sliding one-minute counters per client IP, kept in separate buckets for
// turns and for all API calls so inbox polling can never starve turns.
// Rejected requests are not stored, and lists stay bounded by their limit.
// In-memory by design: a single-instance demo front door, not a fleet.
const buckets = { turn: new Map(), api: new Map() };
function limited(bucket, ip, limit) {
  const map = buckets[bucket];
  const now = Date.now();
  const hadEntry = map.has(ip);
  const arr = (map.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= limit) {
    // Do not create an entry for a rejected first request (including a
    // zero limit); only refresh an existing, still-active window.
    if (arr.length) map.set(ip, arr);
    else if (hadEntry) map.delete(ip);
    return true;
  }
  arr.push(now);
  map.set(ip, arr);
  if (map.size > 5000) map.clear();
  return false;
}

function securityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'microphone=(), camera=()');
}

// Proxy trust: the public origin is directly reachable, so a client-IP
// header is only believed when the request also carries the shared proxy
// secret (set by the Cloudflare Worker from its own secret store). With
// no SL_PROXY_SECRET configured, headers are never trusted.
const PROXY_SECRET = process.env.SL_PROXY_SECRET ?? '';
function fromTrustedProxy(req) {
  if (!PROXY_SECRET) return false;
  const given = Buffer.from(String(req.headers['x-proxy-secret'] ?? ''));
  const expected = Buffer.from(PROXY_SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const server = createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url ?? '/', 'http://x');
  // Behind the Cloudflare Worker proxy the real client IP arrives as
  // x-client-ip (set by the Worker); behind the tunnel it was
  // cf-connecting-ip. Both are honored only from the trusted proxy.
  const trusted = fromTrustedProxy(req);
  const ip = (
    trusted
      ? (req.headers['x-client-ip'] ?? req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress)
      : req.socket.remoteAddress ?? 'unknown'
  ).toString();

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Browser traffic must arrive through the Worker: it is the only path
  // that can prove the client IP the rate limits key on. API paths are
  // refused for untrusted callers when a proxy secret is configured.
  if (PROXY_SECRET && !trusted && url.pathname.startsWith('/api/')) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'proxy-required' }));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const isTurn = req.method === 'POST' && url.pathname === '/api/turns';
    if (limited('api', ip, API_LIMIT) || (isTurn && limited('turn', ip, TURN_LIMIT))) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
      res.end(JSON.stringify({ ok: false, error: 'rate-limited', detail: 'Too many requests. Wait a minute and try again.' }));
      return;
    }
    // Buffer the small JSON body so a refused connect can be retried: the
    // API may still be booting (container start) when an early request
    // arrives. Only ECONNREFUSED retries, so the request was never sent
    // and cannot double-book; the window is about 4 seconds. Bodies are
    // capped while reading (the API contract is small JSON), and an
    // aborted client ends the request instead of crashing the process.
    const BODY_LIMIT = 64 * 1024;
    const chunks = [];
    let size = 0;
    try {
      for await (const c of req) {
        size += c.length;
        if (size > BODY_LIMIT) {
          res.writeHead(413, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'body-too-large' }));
          return;
        }
        chunks.push(c);
      }
    } catch {
      // Client went away mid-upload; nothing to answer, just stop.
      res.destroy();
      return;
    }
    const body = Buffer.concat(chunks);
    let attempt = 0;
    let clientGone = false;
    res.on('close', () => {
      clientGone = true;
    });
    const tryProxy = () => {
      // A client that disconnected during the retry delay gets nothing,
      // and the API must not run an operation nobody will learn about.
      if (clientGone) return;
      const proxy = httpRequest(
        { host: '127.0.0.1', port: API_PORT, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.on('error', () => res.destroy());
          up.pipe(res);
        },
      );
      proxy.on('error', (err) => {
        // If a partial upstream response already went out, headers are sent:
        // tear the connection down instead of writing a second status line.
        if (res.headersSent) {
          res.destroy();
          return;
        }
        // ECONNREFUSED only: the TCP connect itself failed, so the
        // request provably never reached the API (no double-booking risk).
        if (err.code === 'ECONNREFUSED' && attempt < 8) {
          attempt += 1;
          setTimeout(tryProxy, 500);
          return;
        }
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'api-unreachable' }));
      });
      proxy.end(body);
    };
    tryProxy();
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

server.listen(WEB_PORT, WEB_HOST, () => {
  console.log(`serviceloop web on ${WEB_HOST}:${WEB_PORT} (api -> 127.0.0.1:${API_PORT})`);
});
