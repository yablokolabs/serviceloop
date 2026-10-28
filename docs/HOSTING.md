# Hosting the demo at serviceloop.yablokolabs.com

Public demo of the simulated workshop. The repository stays private; hosting the built demo is a separate, owner-authorized step.

Current production is the Modal deployment below; the tunnel shape in this section is the kept rollback path.

## Shape (rollback path via this host)

```text
visitor -> https://serviceloop.yablokolabs.com
        -> Cloudflare Tunnel (cloudflared, outbound only)
        -> scripts/serve-production.mjs on 127.0.0.1:8080
             serves apps/web/dist, proxies /api/* to 127.0.0.1:3101
        -> API (INTERPRET_MODE=live) with rate limits at the front server
```

- Front server rate limits: 20 `POST /api/turns` per minute per IP, 180 `/api` requests per minute per IP (env-tunable). Live model keys never reach the browser; the API reads them server-side only.
- Security headers: `nosniff`, `x-frame-options: DENY`, no-referrer, microphone/camera denied.
- Health check: `/healthz` on the front server.

## Run

Each long-running process needs its own terminal or session — every command below stays in the foreground of its own shell. Build once, in any terminal:

```bash
npm ci
npm run build
npx vite build --config apps/web/vite.config.ts apps/web
```

Terminal 1 — API (live Meta interpretation; keys from the server-side env file only):

```bash
INTERPRET_MODE=live PORT=3101 DB_PATH=data/demo.db node dist/apps/api/src/start.js
```

Terminal 2 — front server:

```bash
WEB_PORT=8080 node scripts/serve-production.mjs
```

Terminal 3 — tunnel (reads the operator-placed token file; never commit it; `--token-file` requires cloudflared 2025.4.0 or later):

```bash
cloudflared tunnel run --token-file ~/.cloudflared/serviceloop.token
```

Detaching with a process supervisor (systemd, tmux, `setsid`) is fine; what matters is that no step waits on a previous foreground process.

## Changing interpretation mode

`INTERPRET_MODE` is read once at API startup. To switch (for example to `rules-demo` to stop model spend), restart the API process in Terminal 1 with the new value; connected visitors see one failed request during the restart second, and the front server and tunnel keep running. There is no hot switch, by design: mode changes are explicit operator actions, never silent fallbacks.

## Cloudflare objects

- Zone: `yablokolabs.com` (active).
- Tunnel: `serviceloop` (config source: cloudflare, ingress `serviceloop.yablokolabs.com` -> `http://127.0.0.1:8080`, fallback 404).
- DNS: `serviceloop.yablokolabs.com` CNAME to `<tunnel-id>.cfargotunnel.com`, proxied.

Provisioned by the operator in the Cloudflare dashboard (the account API key available to automation is read-only: tunnel and DNS creation return 403). The tunnel's Public Hostname entry created the DNS record. The tunnel token was placed by the operator at `~/.cloudflared/serviceloop.token` (mode 0600) and is read from there at startup. No tunnel token, API key, or credential JSON is stored in this repository.

## Rollback stack on this host (not production)

If the Worker route is deleted, the domain falls back to this stack: API (`INTERPRET_MODE=live`) on 127.0.0.1:3101 with `DB_PATH=data/prod-live.db` (the front server proxies `/api` to port 3101 by default), the front server on 127.0.0.1:8080, and cloudflared running with the operator-placed token file. The VM's hourly reset timer was retired after the Modal cutover (it restarted the old API once at 20:15 UTC on 2026-10-28); the Modal `reset_demo` cron owns resets now. Rebuild and restart the VM processes from `main` before using this fallback so its code matches production.

## Demo database reset

The workshop has one bay and one driver, so a single completed booking exhausts the demo day. The reset clears demo state so slots come back. It only runs when at least one booking exists, and it preserves conversations still negotiating (their holds just expire); terminal conversations lose all their rows.

Production (Modal): the `reset_demo` function fires hourly and calls `POST /api/admin/reset-demo` on the API, which performs the reset through its own SQLite connection — the API stays the only writer. The endpoint exists only when `SL_RESET_KEY` is configured and requires the same value in the `x-reset-key` header; anything else is a 404.

Rollback path (this host): `scripts/reset-public-demo.sh` applies the same row-level semantics in one short SQLite transaction (no API restart needed; the API sees the committed deletions), and restarts the API if it finds it down. A systemd user timer (`serviceloop-demo-reset.timer`) fires it hourly from the deployed checkout; run it manually any time with:

```bash
systemctl --user start serviceloop-demo-reset.service
```

## Modal deployment (live since 2026-10-28)

`https://serviceloop.yablokolabs.com` is served entirely from Modal; this VM's tunnel is stopped and the site survives the VM being off. Modal's own custom domains are Team/Enterprise-only, so the hostname is attached through a free Cloudflare Worker instead.

```text
visitor -> https://serviceloop.yablokolabs.com
        -> Cloudflare Worker `serviceloop-proxy` (route serviceloop.yablokolabs.com/*)
        -> https://yablokolabs--serviceloop-serve.us-east.modal.run
        -> Modal web function (one container, min/max 1)
        -> node scripts/serve-modal.mjs (API on 127.0.0.1:3101 + front on 0.0.0.0:8080)
        -> SQLite demo DB on the Modal Volume serviceloop-data (/data/demo.db)
```

- The Worker rewrites the host, sets `x-client-ip` from `cf-connecting-ip`, and proves itself with an `x-proxy-secret` header (Worker secret binding `PROXY_SECRET`, matching the Modal secret `SL_PROXY_SECRET`). Its source is [`infra/cloudflare-worker.js`](../infra/cloudflare-worker.js). The front server trusts `x-client-ip` only from that proven proxy and refuses other `/api/*` callers outright when the secret is configured, so the public `.modal.run` origin cannot be used to spoof past the per-IP rate limits. The `serviceloop` DNS record stays proxied (orange cloud); the route overrides its tunnel target, which is now unused.
- App definition: `modal/modal_app.py`. It bakes Node 22 and the built app (`npm ci`, `tsc`, `vite build`) into the image and serves via `@modal.web_server(8080)`. Keys come from the Modal secret `serviceloop-env` (`META_API_KEY`, `BASETEN_API_KEY`, `SL_RESET_KEY`, `MODAL_PROXY_KEY`, `MODAL_PROXY_SECRET`, `SL_PROXY_SECRET`); they are never committed. Redeploy with `modal deploy modal/modal_app.py` from the repo root (Modal credentials provided as environment variables; the CLI lives in the project `.venv`).
- SQLite runs with `SQLITE_JOURNAL_MODE=delete` on the volume: the default WAL is unsafe on a network filesystem. The API is the only SQLite writer (the single-container pin preserves that), and startup refuses to run if the requested journal mode was not applied. The front retries refused connects for about 4 s; short API restarts may avoid a failed request, but longer restarts still fail requests.
- Demo reset: the `reset_demo` function (hourly cron in the app file) calls the API's key-gated `POST /api/admin/reset-demo`; the API clears demo state through its own connection, only when a booking exists, preserving conversations still negotiating. Verified live: reset removed a test booking and the demo served fresh candidates afterwards.
- Verified on 2026-10-28: `/healthz` ok, full live booking flow (greeting, clarification, candidates, proposal, confirm, persisted booking), Sunday-to-Monday offer, post-reset freshness, custom domain and `.modal.run` URL share one backend (hold placed via the domain blocked the slot on `.modal.run`), and the site kept answering after cloudflared was stopped on this host. Static UI serves from the same container.
- Rollback: delete the Worker route and the domain falls back to the tunnel CNAME; restart cloudflared with the operator token and the VM stack serves again. Modal credits apply: one always-warm minimal container; check the workspace usage page to confirm spend.

## Honest limits

- Single instance; on Modal, one always-warm container. If the Modal workspace or the Cloudflare account is unavailable, the site stops.
- Live interpretation is public: anyone can spend bounded model calls, capped by the rate limits above. Watch usage; drop `INTERPRET_MODE` to `rules-demo` (labeled in the UI) to cut model spend to zero without taking the site down.
- All workshop data remains simulated. No real appointments, no WhatsApp, no live calls.
