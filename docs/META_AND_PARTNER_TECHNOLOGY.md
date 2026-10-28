# How ServiceLoop uses Meta products and partner technology

Crisp submission notes. Every claim below maps to code or an evidence file in this repo. Simulated workshop data is labeled as simulated everywhere it appears.

## Describe your use of Meta products to build the submitted project

ServiceLoop turns vehicle-service reminders into customer-approved workshop appointments. The workshop messages first from the annual reminder schedule; the customer replies in browser chat (text, plus voice-note upload).

| Meta product | Where it runs | What it does |
|---|---|---|
| Muse Spark 1.3 (Meta-direct) | `apps/api/src/modelInterpret.ts`, `live` mode | Routine interpretation. Converts one customer message into a structured constraint patch (intent, field additions) |
| Muse Wonder 1.0 (Meta-direct) | Same path, escalation only | One bounded second opinion when Spark output is ambiguous or fails schema validation. Then the flow asks the customer, it does not loop |
| Muse Voice Transcribe 1.0 (Meta-direct) | ASR contract verified by smoke test | Speech to text for voice notes. Contract verified (`/v1/asr/transcribe`, multipart). Browser upload still returns an honest not-configured status until transcription is wired into the demo flow |
| Muse Spark Open (`meta-models/muse-spark-open-1026` via Baseten) | `packages/meta/src/baseten.ts`, explicit `live-baseten` mode only | Open-weight Spark behind an OpenAI-compatible endpoint. Same interpretation contract, structured `json_schema` output. Never the default, never substituted with the generic model name |
| Muse Code | Build-time only | Coding agent used to build and test this project (smoke-verified 1.4.13, text-only). It never runs inside the product |

The hard rule of the design: models interpret, deterministic code decides. A model patch is parsed by Zod (`parseModelOutput`), written to a revisioned constraint ledger, and checked by the bay + pickup-driver solver. No model output can hold, approve, or book a slot. Booking needs a hold plus an approval token bound to the exact proposal and final price.

## Why are Meta's models important to your solution?

1. The problem is language, not forms. Customers write "service Saturday morning with pickup at 10, not before school run". Spark extracts day, time window, and pickup need from that in one call, including late constraints, changed preferences, negation, and ambiguous dates.
2. Tiered cost matches tiered difficulty. Spark handles routine turns cheaply. Wonder is spent once, only on ambiguity. A clarification question absorbs whatever is left, so extraction recall of 0.96+ is enough; nothing safety-critical rides on the model.
3. Deterministic validation makes model quality measurable. The same schema and solver judge every backend, so Spark, Wonder, and Spark Open can be benchmarked head-to-head on frozen cases (below) instead of demoed by anecdote.
4. Spark Open gives an open-weight path without changing the product. The exact Baseten deployment speaks the same structured-output contract, so provider choice stays a configuration decision, not a rewrite.
5. Voice Transcribe fits the channel. Workshop customers reply by voice note; ASR is the matching Meta product for that input, with transcription kept separate from any speech synthesis (none is used).

## Feedback from our experience using Meta products

What worked:

- Structured output held up. With a JSON schema and one bounded repair, Spark and Wonder produced validator-clean patches on the frozen suite; the full frozen evaluation scores 40/40 scenarios with zero bookings violating confirmed constraints.
- The Spark/Wonder split is real, not marketing. Routing only ambiguous turns to Wonder kept routine latency near Spark's while resolving the "before ten" class of ambiguity into a question instead of a guessed slot.
- Contracts were verifiable before building on them. The supplier smoke results (`evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md`, preserved untouched) pinned chat and ASR shapes early, and every later surprise was in our code, not the API.

Friction, honestly:

- First oracles were wrong, not the models. Our initial evaluation expected model behavior that deterministic code should own (who may book, what a discount may do). We rewrote the oracle so models are scored on interpretation only; that split is now the core design rule.
- Reasoning output needs handling. On Spark Open, free reasoning can consume the completion budget (`finish_reason: length`, empty answer). `reasoning_effort: minimal` plus `response_format: json_schema` fixed it. `reasoning_content` is never logged or stored.
- Single-turn extraction has a ceiling. On 12 frozen single-turn cases both backends scored recall 0.765 / precision 0.867. Multi-turn clarification, not a bigger prompt, is what closes the gap. Budget for the conversation, not one perfect call.

## Feedback from our experience using partner technologies (Baseten)

Yes, we used Baseten, as an optional adapter only. Meta-direct remains the default provider.

- Exact model discipline matters. The hackathon requires `meta-models/muse-spark-open-1026`. Baseten docs default to the generic `muse-spark-open`; pinning the exact ID in one constant (`BASETEN_MODEL`) removed a whole class of silent-substitution risk.
- The OpenAI-compatible shape made the adapter small: one chat-completions client, explicit `live-baseten` selection, no silent fallback on errors.
- Measured comparison, same 12 frozen cases, same validator: accuracy tie with Meta-direct. Cost 12,614 tokens (Baseten) vs 8,923 (Meta-direct). Latency p50 2.4 s vs 1.7 s, p95 4.9 s vs 6.1 s.
- Held-out benchmark (24 fresh cases, never in dev/frozen): Meta-direct P 0.833 / R 0.984 / F1 0.902 at 18.1k tokens; Baseten Spark Open P 0.881 / R 0.967 / F1 0.922 at 24.2k tokens. Evidence: `evidence/eval-heldout-*.json`, `evidence/eval-baseten-*.json`.
- Verdict: Spark Open on Baseten is a credible open-weight path (and the only Baseten model family we allow ourselves: Meta models only). It did not beat Meta-direct enough to change the default, so we kept the default and the evidence.
- Fine-tuning was evaluated and rejected on data: recall at or above 0.96 on both backends clears our 0.9 gate, clarification absorbs the rest, and a custom deployment would break the exact-model rule. The advertised up-to-2M TPM was treated as headroom, never a spend target; the comparison ran capped at 120k tokens, concurrency 2.
- We also used Baseten Spark Open for vision QA of demo-video frames (frame/clipping checks in `scripts/vision-check.mjs`, `scripts/vision-timestamps.mjs`), which caught real label-clipping bugs before submission.

## How we used our agent tooling

These tools shaped the build process. None of them runs inside the product, and no product claim depends on them.

| Tool | How it was used | Concrete effect |
|---|---|---|
| Muse Code (Meta) | Primary coding agent for implementation, tests, CI | Built in small, reviewed PRs; CI typecheck + 46 secret-free tests gate every merge |
| i-have-adhd skill | Output and ideation style for the whole build | Next action first, numbered steps, state restated at every checkpoint. Kept a multi-week, multi-session build resumable |
| Ponytail skill | Minimal-change discipline | Rejected scope that evidence did not support: no fine-tune, no ESLint megachange, artifact-only CD, env-var key fallback instead of a new config system |
| Headroom skill | Token discipline for agent work | Bounded tool output, summaries over raw dumps. The Graphify pass below cost 0 model tokens |
| Hindsight (bank `serviceloop-ai`, local API on port 8888) | Durable project memory across sessions | Decisions, evidence numbers, and the open-gap list retained at each milestone (66 nodes at last update), so a fresh session starts from facts, not archaeology |
| Serena MCP | Enabled in the agent environment for semantic code navigation (symbols, references) | Supported codebase exploration alongside file/search tools. No product behavior depends on it |
| Graphify ([Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)) | Codebase knowledge graph, code-only AST mode (`graphify update .`), no LLM, nothing left this machine | Mapped 100 files into 473 nodes, 739 edges, 36 communities at 0 token cost. See findings below |

Graphify findings we actually used (report: `graphify-out/GRAPH_REPORT.md`, built from commit `cbfabcc`):

1. `createServer()` is the god node (27 edges). Every test suite boots through it, which confirms the API composition root is the right single place for holds, offers, and inbox wiring.
2. Interpretation and scheduling land in separate communities (`modelInterpret.ts` cohesion 0.13, `solver.ts` 0.25), matching the design rule that models never touch booking directly. `liveInterpret()` reaches validation (`parseModelOutput`) inside its own module; there is no direct model-to-booking edge.
3. No import cycles detected across the 100 files.
4. Honest negative: Graphify flags low cohesion in the `server.ts` community (0.06) and suggests splitting it. Noted as future work in the gap list; not hidden.
5. Regenerate after code changes with `graphify update .` (no API cost). `graphify-out/graph.json` is committed so anyone can run `graphify explain`, `graphify path`, or `graphify query` without reinstalling.

## What we deliberately did not do

- No Baseten, Modal, or Fireworks inference as a silent fallback. Baseten is explicit opt-in; the default stays Meta-direct.
- No non-Meta models on Baseten, no generic `muse-spark-open` model name.
- No WhatsApp connection claimed: no credentials configured, nothing sent. Browser chat is labeled simulated workshop.
- No fabricated schedules, diagnoses, discounts, or customer evidence. Offers are seeded, labeled workshop policy with caps and expiry.
