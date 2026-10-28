# Built With

Actual stack, taken from source and lockfile. Nothing is listed that the code does not use.

## Product

| Layer | Technology |
|---|---|
| Language | TypeScript (strict), Node.js |
| API | Node `http` server, deterministic constraint ledger + bay/pickup solver |
| Storage | SQLite via `better-sqlite3` — transactions, constraints, persistent demo DB |
| Validation | Zod schemas on every model patch; no model output books directly |
| Web | React + Vite, conversation-first UI with simulated-workshop labeling |
| Models (Meta-direct) | `muse-spark-1.3` (routine interpretation), `muse-wonder-1.0` (one bounded escalation on ambiguity), `muse-voice-transcribe-1.0` (ASR contract verified; browser upload not yet wired), `muse-spark-1.3-contributor` (greeting/social phrasing only, no booking authority) |
| Models (optional) | Baseten, exact model `meta-models/muse-spark-open-1026`: explicit `live-baseten` mode, plus quota/auth-only fallback bounded at 60/h with honest labels |
| Tests | Vitest (domain, API, concurrency, lifecycle, live-model), frozen 40-case evaluation, Playwright-core browser flow |

## Hosting (public demo)

| Piece | Technology |
|---|---|
| Public URL | `https://serviceloop.yablokolabs.com` — Cloudflare Worker route proxying to Modal (app `serviceloop`, `modal/modal_app.py`); survives this VM being off |
| Container | `@modal.web_server(8080)` running API + front in one container (`scripts/serve-modal.mjs`); the API is the only SQLite writer |
| Storage on Modal | SQLite demo DB on Modal Volume `serviceloop-data` (`SQLITE_JOURNAL_MODE=delete`; WAL unsafe on network FS), model keys in Modal secret `serviceloop-env` |
| Front server | `scripts/serve-production.mjs` — static web build, `/api` proxy with refused-connect retries, per-IP rate limits, security headers |
| Demo upkeep | `reset_demo` Modal function on an hourly cron asks the API (key-gated endpoint, own connection) to clear demo state; only when a booking exists, preserving active conversations |

## Media

| Piece | Technology |
|---|---|
| Demo video | Remotion (`apps/video`), frame-locked scenes, deadline-paced live recording |
| Narration | Local Piper `en_GB-alba-medium`, loudness-normalized; no voice-generation API |

## Build-time tooling (not in the product)

Muse Code as coding agent; Graphify code-only AST graph of the repo; Hindsight project memory. Detailed roles and honest limits: `docs/META_AND_PARTNER_TECHNOLOGY.md` and `docs/SESSION_TOOLING.md`.

Not used, and not claimed: WhatsApp (no credentials configured), PostgreSQL, Docker, telephony, voice synthesis APIs, any non-Meta model on Baseten.
