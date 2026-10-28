## Inspiration
My car is due for service, but repeated workshop calls do not show which appointments fit my schedule. ServiceLoop explores customer-controlled coordination instead of repeated chasing. No garage partnership or validated market demand is claimed.

## What it does
A conversation-first booking demo against a labeled simulated workshop. The workshop writes first from its reminder schedule; the customer replies in chat (text, plus a voice-note upload that honestly reports transcription is not wired yet). Meta models interpret the words; deterministic code validates preferences, checks the coupled service-bay and pickup-driver resources, and books only after the customer approves the exact service, slot and final price. Follow-ups, snooze, opt-out and win-back offers are persisted, bounded and consent-aware. Live phone calls and WhatsApp are not connected.

## How we built it
Direct Meta models do the language work: `muse-spark-1.3` interprets, `muse-wonder-1.0` resolves ambiguity once, and `muse-spark-1.3-contributor` only chooses between server-written social reply variants. A typed constraint ledger keeps every preference as a revision; a deterministic solver, transactional SQLite store and job worker own availability, approval binding, idempotent confirmation and cancellation authorization. An owner-authorized fallback chain (Meta → Baseten's exact `meta-models/muse-spark-open-1026` → Modal's Muse Spark Open endpoint) serves a turn only on quota/auth failure and labels every fallback answer. Hosted publicly at serviceloop.yablokolabs.com (Modal + Cloudflare Worker). 128 secret-free CI tests, a 40-scenario frozen evaluation that also validates the booked terms, and a sub-3-minute narrated demo video.

## Challenges we ran into
Initial externally supplied smoke prompts confused maintenance with passenger transport and used a questionable 11-AM-versus-morning oracle; those results are preserved in `evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md` and the evaluation was corrected before any model comparison. Live testing then exposed clarification loops (bare times, yes/no answers, stale revisions), fixed with server-side conversation memory, ledger-aware clarification and compare-and-swap revision writes. An independent repository review found booking-integrity gaps (overlap, idempotency scope, consent overwrites); all were fixed with regression tests.

## Accomplishments that we're proud of
A booking the customer can trust: no model output books anything, approval binds the exact terms, overlapping slots cannot double-book one bay or driver, and cancellation needs a per-booking token. The whole flow runs live in the browser against real Meta interpretation with honest simulated-workshop labeling.

## What we learned
Language interpretation and booking authority must stay separate. Most "model is dumb" bugs were actually state bugs: forgotten times, re-asked questions, revisions that did not advance. Deterministic guards plus a persistent ledger fixed what prompt tweaks could not.

## What's next for ServiceLoop
Verify WhatsApp ingress with real credentials, wire voice transcription into the browser flow, and seek service-adviser feedback. No dealer integration, production readiness or legal compliance is claimed.

Timeline note: externally supplied model smoke results and evaluation scaffolding date to 2026-10-26 (preserved evidence files). The first application build also ran on 2026-10-26 in the working environment (checkpoints in `docs/PROGRESS.md`); the Git history begins 2026-10-27 with a squashed import of that work, and the hosted production build was finalized 2026-10-27 to 2026-10-28. Nothing was relabeled or backdated.
