# Built vs reused ledger
Honest provenance for every part of this demo.

## Built here
- Constraint ledger, coupled bay/driver solver, hold/confirm/cancel store (SQLite, transactions, idempotency, cancel tokens).
- Rule-based extractor plus live Spark/Wonder interpreter with schema validation and alias normalization.
- REST API: turns, proposals, approval-bound confirm, snooze jobs, opt-out, offers, feedback, inbox.
- Follow-up worker: leases, bounded retries, quiet hours, opt-out/booked rechecks; runs on a timer in production through the API's own connection.
- Win-back sequence: staff-approved WINBACK10 lure (seeded policy, 10%, cap £50), blocker probe (price/timing/pickup/service), complaint -> persisted staff review, opt-out/snooze/booked suppression.
- Stateful availability: booked slots and live holds are never proposed; overlapping bay/driver intervals block across different start times; expired holds are reaped; confirm consumes its hold, revalidates capacity, and its idempotency key only replays its own booking.
- Browser chat UI with kit logo, token-system styling, simulated-workshop labeling.
- 128 secret-free CI tests (140 with live-model tests), 20-scenario dev eval, 40-scenario frozen eval that also validates the booked terms, 24-case held-out extraction benchmark, Playwright browser tests.
- Remotion demo video (apps/video): 1080p React scenes, frame-locked narration beats, genuine product capture for the live segment. The canonical cut's background music is royalty-free (owner-confirmed 2026-10-29).
- Architecture diagram drawn from this implementation.

## Reused as-is
- Kit docs and brand assets (`assets/`, `docs/BRANDING.md`, participant guide).
- Supplier smoke evidence (`evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md`) — preserved, never edited.
- Synthetic TTS fixture (`fixtures/audio/pickup-wednesday.wav`, copied from muse-model-smoke with provenance note).
- Third-party libraries: React, Vite, Vitest, Zod, better-sqlite3, dotenv, Playwright (test driver only).
- Remotion 4 (video rendering only; free tier for individuals/companies up to 3 people per its license).
- Design token pattern from kozz36/frontend-designer-skill (Apache-2.0); aesthetic method from plugin87/ux-ui-agent-skills. No code copied from either.
- Meta models via direct API (inference only, no training on our data beyond standard product-improvement terms of the free credit).

## Not built, not claimed
- WhatsApp integration, live telephony, real garage adapter, payments, multilingual quality, production hardening.
