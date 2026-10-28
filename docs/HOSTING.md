# Hosting the demo at serviceloop.yablokolabs.com

Public demo of the simulated workshop. The repository stays private; hosting the built demo is a separate, owner-authorized step.

## Shape

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

## Current deployment (2026-10-28)

The public stack on this host currently serves the PR #7 build ahead of its merge (API `INTERPRET_MODE=live` on 127.0.0.1:3102 with `DB_PATH=data/prod-video3.db`, front server on 127.0.0.1:8080, cloudflared running with the operator-placed token file). After PR #7 merges, rebuild and restart the same processes from `main` so the deployed code and the default branch match again.

## Honest limits

- Single instance on this host; processes are operator-managed, not a fleet. If the host or processes stop, the site stops.
- Live interpretation is public: anyone can spend bounded model calls, capped by the rate limits above. Watch usage; drop `INTERPRET_MODE` to `rules-demo` (labeled in the UI) to cut model spend to zero without taking the site down.
- All workshop data remains simulated. No real appointments, no WhatsApp, no live calls.
