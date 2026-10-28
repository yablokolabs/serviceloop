# ServiceLoop current state
October 27, 2026 Asia/Kolkata. Build kit/branding prepared. No application implemented. Original externally supplied model smoke report preserved: API access works; Spark/Wonder behavior checks need revised domain/oracles, voice semantic one-clip pass; Muse Code text-only pass, sandbox tools not verified. No reruns performed by this kit.

Next action: build M1 conversation API plus browser loop on top of tested domain core.

Checkpoint 2026-10-26 22:00 Asia/Kolkata: M0 done. 18 tests pass, tsc clean.
Muse ran from this sandbox; evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md untouched.
Bank serviceloop-ai created on port 8888. No WhatsApp creds touched.

Checkpoint 2026-10-26 22:05 Asia/Kolkata: M1 API plus browser loop done.
22 API/domain tests plus 2 Playwright Chromium tests pass (24 total), tsc clean.
Routes: turns, proposals, confirm (approval-bound, idempotent), cancel, voice-501.
UI at :5173 shows simulated-workshop label; Moli --layout screenshot verified.
Moli is the full renderer; Lightpanda is text-only fetch, no mic/audio/video.
No model calls yet; voice endpoint returns honest 501 until M2.

Checkpoint 2026-10-26 22:20 Asia/Kolkata: M2 done. 32 tests pass, tsc clean.
Spark/Wonder/Transcribe wired via verified direct contracts; Wonder escalates once,
then human clarification. Rule-based path stays labeled rules-demo.
Cancel needs booking id plus cancel token. Key read via dotenv parse of
META_API_KEY only, never injected into process env.
UI: kit logo plus favicon, token-system restyle (kozz36 pattern, brand hues),
contrast pairs verified 5.4-14.4. ui-ux-pro-max skill rejected (needs Tailwind
plus AI providers); critique kit not installed so self-review only.
e2e flakiness root-caused: fixed convo id reused demo.db state; now unique per load.
Moli does not load the logo PNG (naturalWidth 0); Chromium is the visual proof.

- [ ] M0 inventory/domain/oracle and schemas
- [ ] M1 ledger/scheduler/booking/browser
- [ ] M2 direct Meta + WhatsApp live integration
- [ ] M3 follow-up jobs/evaluation/adverse cases
- [x] M4 diagram/video/public source/submission readiness (code complete; license choice plus publish authorization still yours)

Checkpoint 2026-10-26 22:45 Asia/Kolkata: build complete, submission pending your call.
44 tests pass, tsc clean. Dev eval 20/20 P/R 1.0, frozen eval 40/40 P/R 1.0, zero bookings against unconfirmed constraints.
Demo video evidence/demo-video/demo-booking.mp4 (207 s) plus 3 stills, all genuine Chromium captures.
README, architecture SVG, build-vs-reused ledger written. No WhatsApp, no live calls, no license file.
Next action: you pick a license and authorize any publish or submit; nothing goes public from here without that.

Checkpoint 2026-10-27 Asia/Kolkata: video rebuilt as staged explainer (reference /tmp/Example.mp4): 6 scenes, 2:24, per-scene narration, animated workflow stepper, live demo segment, architecture scene. Old single-take cut replaced.
Checkpoint 2026-10-27 Asia/Kolkata: audio audit found s4 dip (70-80 s at -33.6 dB, 10 s digital silence between s4a/s4b plus under-leveled s4a). Fixed with 5 level-matched clips (new s4c/s4d/s4e bridge lines, same Alba voice) timed to on-screen action; static arch scene replaced with animated build-up (staged cards, flowing wires, traveling dots, guard chips, worker pulse) matching the example style. Final 2:25, all 10 s windows -15.8 to -20 dB, `scripts/audit-video-audio.sh` passes. No verified Muse image/video generation model exists (Spark/Wonder are text, voice is transcription-only), so animation is code-driven motion graphics. Diagram follows cathrynlavery/diagram-design method (legend strip, label masks, rx 6, no shadows, coral on 1), exported to PNG for README.

Checkpoint 2026-10-27 Asia/Kolkata: Baseten adapter added as explicit opt-in, default unchanged.
47 tests pass. Smoke verified exact model, stop-with-JSON under reasoning_effort minimal plus json_schema, usage returned, reasoning_content never stored.
12-case frozen comparison: accuracy tie (R 0.765 / P 0.867 both), Baseten +41% tokens, similar latency, 26.6 k of 120 k budget spent. Evidence eval-baseten JSON.

Checkpoint fields: timestamp/timezone, branch/commit/dirty files, exact commands/exit/result, model/mode/usage, scenario/oracle/version, actual channel/job state, evidence path, missing tools/permissions, failure location → cause → fix, next action. No private messages/phones/credentials in memory. Original evidence append-only and new work distinguished.
Checkpoint 2026-10-27 Asia/Kolkata: review pass found + fixed: (1) expired holds bricked slots forever and confirms leaked the consumed hold (reap expired, consume on confirm, random hold tokens); (2) booked slots were proposed again and only failed at confirm (availability now excludes bookings + live holds; stale candidate -> 409 slot-taken); (3) hold collisions surfaced raw SqliteError (now 409 slot-held, UI already handles it). 52/52 tests pass, tsc clean, frozen eval 40/40. Win-back shipped: WINBACK10 seeded policy (10%, cap ₹500, staff approval), stage-1 lure + stage-2 blocker probe, complaint -> staff review, opt-out/snooze/booked suppression, price reply quotes deterministic ₹1,349. Video rebuilt in Remotion (apps/video, 1080p, 2:58, 8 scenes incl. win-back + feedback), audio audit passes. Held-out benchmark: Meta R 0.984 / Baseten R 0.967 -> fine-tune not pursued (Meta-models-only on Baseten).
Checkpoint 2026-10-27 Asia/Kolkata: outbound-first correction — workshop reminder now opens the conversation (POST /api/reminders/schedule -> real worker tick with quiet-hours/opt-out/booked suppression; UI polls inbox and renders workshop messages; convo deep-link via ?convo=). Prices switched INR->GBP (basic £149, full £499, caps scaled; finalPriceGbp; legacy cap column migrated 10:1). Video re-cut: reminder-first live capture, S1/S3/Winback reordered, S5 wire labels moved clear of dots, narration gaps closed; 2:59, audio audit passes. E2E browser test isolated onto its own ephemeral server + fresh DB (was flaking on shared dev state). 53/53 tests.
Checkpoint 2026-10-27 Asia/Kolkata: user-supplied final cut (dark cinematic render, same content: reminder-first, GBP, win-back) adopted as canonical demo — evidence/demo-video/demo-booking.mp4 is now a copy of their serviceloop-demo.mp4 (179.4 s, 1080p, audio audit passes). Remotion pipeline in apps/video remains as the reproducible scene source. No LICENSE file per decision; nothing published.
Checkpoint 2026-10-28 Asia/Kolkata: production hosting live at serviceloop.yablokolabs.com (Cloudflare Tunnel, dashboard-provisioned; API INTERPRET_MODE=live behind rate-limited front server). Web redesigned dark cinematic (Impeccable, detector 0 findings). Demo video re-rendered: live segment re-recorded against the public site with deadline pacing (record-scenes.mjs), S4 chrome now shows serviceloop.yablokolabs.com, canonical evidence/demo-video/demo-booking.mp4 replaced (179.3 s, 1080p, AUDIO OK, frames verified at 70 s and 104 s). README points at the live demo first, localhost kept for local dev.
Checkpoint 2026-10-28 Asia/Kolkata (later): PR #6 (public-URL video) was merged into the already-merged PR #5 branch, so the new video never reached main; owner still saw 127.0.0.1. Fixed in PR #7 (based on main): cherry-picked video/README commits, plus chat auto-scroll now sticks only while typing drives the conversation — Hold/Approve/Cancel freeze chat position so the button stage holds the user's place. Live segment re-recorded against the deployed fixed build and video re-rendered (179.3 s, AUDIO OK, frames verified). Public stack currently serves the PR #7 build (API INTERPRET_MODE=live, DB data/prod-video3.db) ahead of merge. True test counts: 55 full / 47 CI. Graphify regenerated at 4fed9fb: 110 scanned, 87 represented, 553 nodes, no import cycles.
Checkpoint 2026-10-28 Asia/Kolkata (Modal): public demo migrated off this VM to Modal (app `serviceloop`): one container serving API+front, SQLite DB on Volume `serviceloop-data` with `SQLITE_JOURNAL_MODE=delete`, hourly `reset_demo` cron, model keys in Modal secret `serviceloop-env`, front retries refused connects ~4s. Modal custom domains are Team/Enterprise-only, so `serviceloop.yablokolabs.com` attaches via the free Cloudflare Worker `serviceloop-proxy` (route on the hostname → `.modal.run` URL, sets `x-client-ip` so per-IP rate limits stay per-visitor). Verified: full live booking flow on Modal, domain/`.modal.run` one backend, reset proven, cloudflared stopped on this VM and the site kept answering. Stack: docs/BUILT_WITH.md + docs/HOSTING.md. Branch `feat/modal-hosting`.
Checkpoint 2026-10-28 Asia/Kolkata (fallback chain + video): inference fallback chain Meta-direct -> Baseten (meta-models/muse-spark-open-1026) -> Modal Shared Endpoint (meta-models/Muse-Spark-Open-816B-A42B): quota/auth-only trigger, one hourly slot per provider attempt (FALLBACK_LIMIT_PER_HOUR, default 60), honest per-leg labels, explicit live-baseten never chains further. Modal leg verified live (proxy-token auth, reasoning_effort low, json_schema; evidence/modal-endpoint-smoke-2026-10-28.json); serviceloop-env secret carries MODAL_PROXY_KEY/SECRET for the deployed API. Owner's updated demo cut adopted as canonical evidence/demo-video/demo-booking.mp4 (179.4 s, 1080p, AUDIO OK) with a regenerated thumbnail. True test counts: 118 full / 106 CI. PR #14 (retitled: Provider fallback chain).
