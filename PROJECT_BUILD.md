# ServiceLoop implementation specification

## 1. Product and measurable differentiation
Founder problem: personal vehicle due for service, repeated calls, no easy visibility into appointments. Proposed customer: workshop/service business; end user: vehicle owner. The business hypothesis is fewer repetitive follow-ups and better booking completion, not proven revenue or savings.

Core promise: check proposed actions against confirmed current preferences and explain conflicts. Avoid absolute “never violates constraints.” Demonstrate a conversational booking journey, not a dashboard as the main feature. The internal evidence inspector is supporting UI.

Rubric from supplied guide: impact 30%, Meta tooling 25%, technical execution 20%, demo 25%. Align with first-person pain and optional interviews; substantial transcribe/reason/tool loop; atomic state and tests; a genuine three-minute booking demo. Do not stretch model use by adding SAM or image generation without a task. Startup track and Build for Your World are distinct selections.

## 2. Narrow MVP
One clearly simulated workshop, one service type with fixed duration, one customer/vehicle per conversation, Asia/Kolkata workshop timezone, three-day test schedule, coupled service bay and optional pickup driver. English text/voice notes first. No untested multilingual quality claim.

Flow: due event from explicit mock schedule → consented message/draft → user text/audio → extraction/clarification → constraint update → feasible slots → proposal → explicit approval → fresh availability/constraints validation → atomic confirmed booking. Customer can ask service questions, change preferences, snooze, cancel pending proposal, say already serviced/sold vehicle, request human help or opt out. Each action updates the appropriate state rather than restarting.

Cut live calls, payments, multi-workshop marketplace, service diagnosis, Toyota APIs, invoice auditing and marketing automation. Feedback/promotions are stretch work after evaluation, not core scope. Service due is supplied by mock records or authorized schedules, never invented from make/model alone.

## 3. Stack and runtime
Proposed TypeScript frontend React/Vite; Node LTS API, Zod schemas, PostgreSQL transactions and persistent job worker; Vitest plus browser integration tests. Verify official versions and actual host first; lock dependencies. Docker Compose for local/VM reproducibility if supported. A simpler transactional local database is acceptable if carefully justified for one-instance demo and tests preserve invariants.

```text
apps/web/src/{conversation,slots,approval,review}
apps/api/src/{routes,meta,whatsapp,policy,booking}
apps/worker/src/{jobs,outbox}
packages/domain/src/{constraints,dates,schemas,resources}
packages/workshop/src/{contract,mock}
fixtures/{workshop,conversations,audio}
tests/{domain,api,concurrency,e2e}
scripts/{seed,evaluate,smoke}
docs/{PROGRESS,EVALUATION,MODEL_CONFIGURATION,WHATSAPP_SETUP}.md
```

Implement and verify setup, migrate, seed, dev, test, evaluate and build commands before claiming they work. Azure headless VM can run backend/browser tests; voice recording/demo capture and public webhook access must be separately verified. Public hosting can use a persistent container/VM. Do not presume serverless Sites hosts the worker; use Sites only after checking current runtime and durable-job compatibility, or host frontend separately with authenticated backend. Keep connector secrets server-side. Test webhook reachability with actual provider.

## 4. Constraint ledger and conversation state
Constraint record: id, conversationId, field, typedValue, unit/reference, sourceTurnId/excerpt, scope (booking/session/contact), status proposed/confirmed/superseded/revoked, supersedesId, revision, recordedAt, timezone. Fields include serviceDate/window, serviceStartBefore, pickupRequired, pickupWindow/addressReference, preferredWorkshop, contactChannel, callbackAt and notification consent. Separate hard requirement, preference and unknown. A new utterance is a proposed patch, not a replacement for the complete state.

“Before ten” needs event reference: pickup, workshop arrival, service start or completion. “Saturday” resolves against explicit request timestamp and user's/workshop timezone, not server local time. Ambiguous “next Saturday,” changed dates and pickup/travel assumptions require clarification. Define workshop policy meaning of morning if used; 11 AM is ordinarily within morning and is not automatically a conflict. Preserve explicit pickup 08:30 rather than asking whether it meant service time.

Store turn text/sanitized transcript with bounded retention and consent, ledger revisions, proposal revisions, bookings, resources, outbox and job state. Redact PII in public evidence. Use pseudonymous references; no private customer data in Hindsight. Correction adds revision/history rather than erasing provenance. Source excerpts are evidence of an utterance, not calibrated confidence. Don't store hidden chain-of-thought.

Model patch schema: intent, additions, supersessions, revocations, unresolvedFields, userVisibleQuestion, suggestedTool plus typed args. Validate at runtime. Only allow list_slots, describe_service, propose_booking, request_confirmation, confirm_booking, cancel_booking, snooze and handoff through server guards; model cannot directly invoke side effects. Cancellation of confirmed booking needs explicit approved target. Unknown or contradictory patch does not change authoritative state.

## 5. Coupled resource scheduler and approvals
Workshop contract: listAvailability(request), propose/hold(request,revision), confirm(proposalId,approvalToken,idempotencyKey), cancel(bookingId,authorization), getBooking and simulateExternalChange (development only). Version this seam independently; mock service is seeded, replayable and labeled on UI near appointments and receipt.

Fixture: free bay at 09:00, pickup driver only 10:00 onward, service must follow pickup plus explicitly configured travel/buffer. User asks service before 10 with pickup. No feasible option; explain why and offer labeled compromises. Do not conflate pickup time and workshop slot. No model-generated times enter capacity store.

Feasibility checks run for every candidate and again at confirmation: active hard constraints, bay interval/capacity, driver and travel intervals, workshop hours, required vehicle/customer fields and approval revision. Deterministic solver creates typed candidate IDs; model may explain approved alternatives but cannot change facts. Compromises show exact violated preference and require explicit relaxation before becoming bookable.

Proposal includes customer/vehicle refs, service type, date/timezone, service start/duration, pickup time/terms if applicable, known price or unknown-estimate label, constraints revision/hash, calendar revision, hold expiration and action summary. Approval bound to that version/token, never a bare global yes. “Yes” only applies if one unexpired clear proposal is active; otherwise clarify.

Use transactional capacity reservation, unique action/idempotency keys and serialized constraint revision updates. Same key/different payload conflict. Repeated webhook/approval cannot duplicate booking. Concurrent clients competing for one resource yield one winner. Expired or externally taken slot returns no booking, refresh options and seek new approval. Don't silently move appointment. Model timeouts never trigger fallback bookings. Use ISO UTC storage and local presentation with timezone; retain original meaning.

## 6. WhatsApp voice/text integration
Verify current Meta WhatsApp Cloud API docs and actual account/test-number access before coding route/auth/media formats. Record app/phone ID, required permissions, test recipients, webhook signature validation, verification handshake, inbound message identity and supported message templates in docs/WHATSAPP_SETUP.md. Never assume $150 Model API credit includes WhatsApp/phone delivery or telephony.

Authenticate webhook origin by official method; deduplicate inbound IDs; process bounded media size/type through authorized provider media URLs, not arbitrary customer URLs. Keep ephemeral audio secure and delete per stated policy. Voice Transcribe produces text, then same domain pipeline; transcription uncertainties/numbers need confirmation where consequential. Output text replies initially. No TTS/live-phone functionality inferred from ASR. Outbound messaging obeys current consent/template/service-window/quiet-hour rules and API limits; verify exact current rules before sending. During development only owner/explicit consented test recipients.

Use outbox transactional scheduling and send-state records. External send may have ambiguous outcome after timeout; don't promise exactly-once delivery if provider offers no idempotent guarantee. Persist attempt, reconcile where supported, bound retries and flag uncertain outcomes to avoid duplicate outreach. Browser simulation remains development mode if WhatsApp blocked, not live demo proof. Do not impersonate dealership or send unsolicited marketing.

## 7. Snooze, follow-up and lifecycle
State due/negotiating/awaiting_approval/booked/snoozed/completed/opted_out with explicit permitted transitions. Existing-provider calls aren't controlled by app; say ServiceLoop stops its own reminders only.

“I’m busy, call tomorrow”: clarify exact date/time/timezone/channel and consent. Core supports scheduled WhatsApp/text follow-up, not an unimplemented phone call. If call requested without telephony, explain limitation and offer supported channel/human handoff. Persist jobId, dueAt UTC, customer consent revision, channel, payload intent, status, attempt, lease and cancel revision. Survive restart, recheck opt-out/booked status and quiet hours at execution; current availability queried then, not captured yesterday. One planned follow-up with configured attempt cap, no escalating spam after silence. Time acceleration only in labeled testing mode.

Completion is explicit mock event or workshop confirmation, not inference from elapsed appointment time. Feedback optional: one consented question, human escalation, no automatic refund or diagnosis. Discounts optional: explicit workshop-owned eligibility/expiry/cap rules, deterministic evaluation and disclosure, no invented discount. No multi-channel cascade without consent.

## 8. Model contracts, privacy and budgets
Direct base https://api.meta.ai/v1. Verified user report IDs muse-spark-1.3, muse-wonder-1.0, muse-voice-transcribe-1.0. Spark routine interpretation; Wonder explicit ambiguity/conflict fallback with bounded calls; ASR audio input. Document exact endpoint/format from official docs and actual tests. Application schema validation needed regardless of provider structured-output feature.

Keep model selection observable with latency/usage and routing reason, not hidden internal reasoning. Start low budget per turn but reserve enough tokens for visible structured output; reasoning tokens consumed first smoke caps. Truncation/empty output/malformed JSON are failed interpretations, not no-preference signals. One bounded repair/escalation, then human clarification. Don't silently swap providers. Preserve developer report as externally supplied evidence; reproduce minimal cases only when needed.

META_API_KEY in ~/.hermes/.env; read only that entry securely. Meta account $150 credit active per user screenshot, remaining balance unverified. Content may be used for product improvement under displayed free-credit conditions; use synthetic or explicitly consented minimal data. Track actual returned usage, official prices if converting cost, capped retries/concurrency. Spend notifications may not hard-cap charges; verify actual limit behavior, do not claim protection without testing. No third-party inference provider credit assumed.

## 9. Milestones and completion
Estimate 45–60 focused hours dependent on WhatsApp access. Oct 27 M0 3–5h: inventory, test-oracle fix, schemas and mock seam. Oct 28–29 M1 12–15h: ledger, coupled scheduler, transactional booking and browser loop. Oct 30–31 M2 10–14h: direct models + WhatsApp audio/text. Nov 1–2 M3 10–12h: persisted follow-ups, adversarial evaluation and concurrency. Nov 3–4 M4 10–14h: polish, diagram, genuine demo, public repo prep and submission. Cut optional lifecycle/live calls before core reliability.

Done means one multi-turn real model journey and honest channel status; changing/ambiguous constraints preserved; impossible request explained; stale slot recovered with reapproval; no duplicate under tested concurrency; opt-out stops job; original tests retained; reproducible setup; public source and accessible three-minute video prepared. No hidden planned features in demo claims. Publication/submission only when authorized.
