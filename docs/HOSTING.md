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

```bash
npm ci
npm run build
npx vite build --config apps/web/vite.config.ts apps/web

# API (live Meta interpretation; keys from the server-side env file only)
INTERPRET_MODE=live PORT=3101 DB_PATH=data/demo.db node dist/apps/api/src/start.js

# Front server
WEB_PORT=8080 node scripts/serve-production.mjs

# Tunnel (token supplied by the operator at runtime; never commit it)
cloudflared tunnel run --token <TUNNEL_TOKEN>
```

## Cloudflare objects

- Zone: `yablokolabs.com` (active).
- Tunnel: `serviceloop` (config source: cloudflare, ingress `serviceloop.yablokolabs.com` -> `http://127.0.0.1:8080`, fallback 404).
- DNS: `serviceloop.yablokolabs.com` CNAME to `<tunnel-id>.cfargotunnel.com`, proxied.

Created through the Cloudflare API with the account credentials held outside the repo. No tunnel token, API key, or credential JSON is stored in this repository.

## Honest limits

- Single instance on this host; processes are operator-managed, not a fleet. If the host or processes stop, the site stops.
- Live interpretation is public: anyone can spend bounded model calls, capped by the rate limits above. Watch usage; drop `INTERPRET_MODE` to `rules-demo` (labeled in the UI) to cut model spend to zero without taking the site down.
- All workshop data remains simulated. No real appointments, no WhatsApp, no live calls.
