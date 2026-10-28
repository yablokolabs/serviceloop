# Direct Meta model setup

## Baseten adapter (optional, not default)
Server-side only, explicit `live-baseten` mode. `BASETEN_API_KEY` from `~/.hermes/.env` through a dotenv parse of that variable alone. Base `https://inference.baseten.co/v1`, exact model `meta-models/muse-spark-open-1026` (never the generic name). Meta-direct Spark, Wonder and Voice Transcribe are preserved and remain the default.

Verified 2026-10-27 by smoke plus a 12-case frozen comparison (late constraints, changed preferences, negation, ambiguous dates, opt-out; offer codes stay on the deterministic quote path by design):
- Response shape: OpenAI chat-completions; `reasoning_content` arrives as a separate message field and is never logged or stored. `finish_reason: length` fires when reasoning eats the cap; `reasoning_effort: minimal` plus `response_format: json_schema` gives `finish_reason: stop` with valid JSON.
- Accuracy tie with Meta-direct on identical inputs: extraction recall 0.765, precision 0.867 both sides (same validator, single-turn inputs).
- Cost: 12,614 tokens Baseten vs 8,923 Meta-direct for the same 12 cases. Latency p50 2.4 s vs 1.7 s, p95 4.9 s vs 6.1 s.
- Budget discipline: comparison script caps at 120 k tokens, concurrency 2, 90 s timeouts; this run spent 26,651.
- Offer-code mentions: neither backend puts codes into structured fields; eligibility stays deterministic in `/api/offers/quote`.
- Decision: default stays Meta-direct. Evidence: `evidence/eval-baseten-*.json`.
- Held-out single-turn benchmark (2026-10-27, 24 fresh cases in `fixtures/eval-heldout.json`, never in dev/frozen): Meta-direct P 0.833 / R 0.984 / F1 0.902 (18.1 k tokens, p50 1.49 s); Baseten Spark Open 1026 P 0.881 / R 0.967 / F1 0.922 (24.2 k tokens, p50 1.74 s). Most precision misses are the scorer counting a correct `pickupRequired: false` as a false positive. Evidence: `evidence/eval-heldout-*.json`.
- Fine-tuning decision: NOT pursued. Recall ≥ 0.96 on both backends clears the 0.9 gate; clarification absorbs the rest, so training buys nothing correctness-critical. Baseten use stays Meta-models-only (`meta-models/muse-spark-open-1026`); no non-Meta base would be fine-tuned, and a custom deployment would also break the exact-model rule.

User-supplied Ubuntu report verifies HTTP responses for muse-spark-1.3, muse-wonder-1.0 and muse-voice-transcribe-1.0. Chat route /v1/chat/completions; report ASR route /v1/asr/transcribe with documented multipart fixture. Confirm current schemas through official docs before application adoption. No Baseten/Modal/Fireworks in this build.

## Credit fallback (quota/auth only, 2026-10-28)

Meta-direct stays the default. When Meta answers with a quota/auth failure (401/402/403/429, or no usable Meta key), that turn alone is served by the exact same Baseten model (`meta-models/muse-spark-open-1026`) instead of failing — bounded by `FALLBACK_LIMIT_PER_HOUR` (default 60, sliding window, shared by all call sites in the API process). Past the cap, the API reports the outage honestly. Anything that is not a quota/auth failure — especially invalid model output — never falls back: it asks for clarification as before. Fallback answers carry the interpreter label `baseten:meta-models/muse-spark-open-1026 (meta quota fallback)` and a routing reason that names the Meta failure, and the same schema validation plus deterministic booking rules apply to the fallback output. Covers booking interpretation (Spark + Wonder) and the social variant choice; voice transcription stays an honest 501 stub. Explicit `live-baseten` mode never falls back further. Tests: `tests/api/fallback.test.ts` (quota → labeled fallback, 500 → honest error with zero Baseten calls, cap enforcement, social variant).

## Social layer model (greetings only)

`muse-spark-1.3-contributor` on the same Meta-direct chat route, verified 2026-10-28 (minimal probe returned HTTP 200). Used only in live modes for greetings, thanks, help, and farewells in `apps/api/src/converse.ts`. It receives no tools and no booking authority, and it never writes reply text: it only chooses between server-written reply variants (`{"variant": "A"}` or `"B"`), and the server renders the words, the confirmed facts, and the continuation. Empty completions retry once at a larger cap; anything invalid ships as the server default labeled `canned-social` instead of the model name. Booking interpretation stays on Spark/Wonder as above.

Muse Code 1.4.13 text-only request passed; resolved model/usage not returned and coding-tool sandbox untested (bwrap absent). Preserve protections and verify actual installed supported behavior. Do not infer exact model from documented default.

Official sources:
https://dev.meta.ai/docs/models
https://dev.meta.ai/docs/quickstart
https://dev.meta.ai/docs/muse-code
https://dev.meta.ai/docs/muse-code/auth
Use Muse Code if useful, not as a condition of eligible app inference. No API keys need creation; use META_API_KEY from ~/.hermes/.env via parser and process env, no source/dump/copy. Test files never contain values. All runtime model decisions observable; do not request hidden chain-of-thought. No voice synthesis model has been selected.
