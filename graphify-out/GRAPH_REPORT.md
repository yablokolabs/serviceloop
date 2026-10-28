# Graph Report - serviceloop  (2026-10-28)

## Corpus Check
- 118 files · ~57,357 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 607 nodes · 941 edges · 47 communities (34 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df862597`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- Demo.tsx
- package.json
- serve-production.mjs
- store.ts
- modelInterpret.ts
- project.yml
- App.tsx
- dates.ts
- video/package.json
- Muse Code and Meta Model Smoke Test Results
- compilerOptions
- web/package.json
- solver.ts
- ServiceLoop implementation specification
- compilerOptions
- DEVPOST_PROJECT_STORY.md
- domain/package.json
- ServiceLoop
- Built vs reused ledger
- api/package.json
- worker/package.json
- PORTAL_COPY.md
- meta/package.json
- Direct Meta model setup
- AGENTS.md
- css.d.ts
- BRANDING.md
- vitest
- EVALUATION.md
- MEDIA_WORKFLOWS.md
- conversation.test.ts
- SESSION_TOOLING.md
- SUBMISSION_CHECKLIST.md
- audit-video-audio.sh
- SESSION_CONTINUATION.md
- with
- steps
- eval-baseten.mjs
- snooze.test.ts
- ref_node_fs
- Hosting the demo at serviceloop.yablokolabs.com
- ledger.ts
- ManagedServer
- ServiceLoop web — design system
- PRODUCT.md
- reset-public-demo.sh

## God Nodes (most connected - your core abstractions)
1. `createServer()` - 43 edges
2. `vitest` - 19 edges
3. `remotion` - 14 edges
4. `Header()` - 13 edges
5. `Muse Code and Meta Model Smoke Test Results` - 12 edges
6. `Demo()` - 10 edges
7. `C` - 10 edges
8. `FONT` - 10 edges
9. `compilerOptions` - 10 edges
10. `ServiceLoop implementation specification` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Describe your use of Meta products to build the submitted project` --references--> `parseModelOutput()`  [INFERRED]
  docs/META_AND_PARTNER_TECHNOLOGY.md → apps/api/src/modelInterpret.ts
- `How we used our agent tooling` --references--> `createServer()`  [INFERRED]
  docs/META_AND_PARTNER_TECHNOLOGY.md → apps/api/src/server.ts
- `Hosting (public demo)` --references--> `reset_demo()`  [INFERRED]
  docs/BUILT_WITH.md → modal/modal_app.py
- `Demo database reset` --references--> `reset_demo()`  [INFERRED]
  docs/HOSTING.md → modal/modal_app.py
- `Modal deployment (live since 2026-10-28)` --references--> `reset_demo()`  [INFERRED]
  docs/HOSTING.md → modal/modal_app.py

## Import Cycles
- None detected.

## Communities (47 total, 13 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.17
Nodes (23): evaluateOffer(), seedOffers(), activeValue(), clockMinutes(), createServer(), demoOfferDay(), dropsStalePickupTime(), hasDateReference() (+15 more)

### Community 1 - "Demo.tsx"
Cohesion: 0.09
Nodes (48): Header(), Demo(), TOTAL_FRAMES, Root(), Arrow(), Feedback(), Rise(), StepCard() (+40 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (41): author, dependencies, react@^19.3.1, react-dom@^19.3.1, description, devDependencies, better-sqlite3@^13.0.3, @types/better-sqlite3@^9.6.0 (+33 more)

### Community 3 - "serve-production.mjs"
Cohesion: 0.06
Nodes (25): cases, out, path, results, root, runBackend(), runOne(), withTimeout() (+17 more)

### Community 4 - "store.ts"
Cohesion: 0.17
Nodes (12): cancelBooking(), confirmBooking(), ConfirmRequest, ConfirmResult, Db, dbOf(), HoldRequest, holdSlot() (+4 more)

### Community 5 - "modelInterpret.ts"
Cohesion: 0.09
Nodes (27): ExtractedPatch, CallUsage, FIELD_ALIASES, interpreterLabel(), InterpretResult, KNOWN_FIELDS, liveInterpret(), ModelBackend (+19 more)

### Community 6 - "project.yml"
Cohesion: 0.08
Nodes (25): activation_command, activation_command_timeout, added_modes, agent_interface, default_modes, encoding, excluded_apis, excluded_tools (+17 more)

### Community 7 - "App.tsx"
Cohesion: 0.18
Nodes (12): App(), approve(), cancel(), propose(), sendText(), Candidate, fmt(), Msg (+4 more)

### Community 8 - "dates.ts"
Cohesion: 0.16
Nodes (15): extractTurn(), WEEKDAYS, port, srv, workshopDates, AMBIGUOUS_EVENTS, dateInTz(), DAYS (+7 more)

### Community 9 - "video/package.json"
Cohesion: 0.16
Nodes (12): dependencies, remotion@^4.0.539, @remotion/cli@^4.0.539, zod@^4.5.4, zod, name, private, scripts (+4 more)

### Community 10 - "Muse Code and Meta Model Smoke Test Results"
Cohesion: 0.15
Nodes (12): Credentials and safety, Evidence files, Final status, Limitations, Model catalog and contracts, Muse Code, Muse Code and Meta Model Smoke Test Results, Muse Spark (+4 more)

### Community 11 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, jsx, module, moduleResolution, resolveJsonModule, skipLibCheck, strict (+3 more)

### Community 12 - "web/package.json"
Cohesion: 0.20
Nodes (11): dependencies, react@^19.0.0, react-dom@^19.0.0, react, react-dom, name, private, scripts (+3 more)

### Community 13 - "solver.ts"
Cohesion: 0.25
Nodes (9): BayWindow, Candidate, DriverWindow, findSlots(), fmt(), SlotRequest, SolverOutput, WorkshopConfig (+1 more)

### Community 14 - "ServiceLoop implementation specification"
Cohesion: 0.18
Nodes (10): 1. Product and measurable differentiation, 2. Narrow MVP, 3. Stack and runtime, 4. Constraint ledger and conversation state, 5. Coupled resource scheduler and approvals, 6. WhatsApp voice/text integration, 7. Snooze, follow-up and lifecycle, 8. Model contracts, privacy and budgets (+2 more)

### Community 15 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, module, moduleResolution, outDir, skipLibCheck, strict, target (+2 more)

### Community 16 - "DEVPOST_PROJECT_STORY.md"
Cohesion: 0.25
Nodes (7): Accomplishments that we're proud of, Challenges we ran into, How we built it, Inspiration, What it does, What's next for ServiceLoop, What we learned

### Community 17 - "domain/package.json"
Cohesion: 0.29
Nodes (6): exports, ./dates, ./ledger, name, type, version

### Community 18 - "ServiceLoop"
Cohesion: 0.29
Nodes (6): Endpoints, Honest limits, How booking works, Models, Run it, ServiceLoop

### Community 19 - "Built vs reused ledger"
Cohesion: 0.40
Nodes (4): Built here, Built vs reused ledger, Not built, not claimed, Reused as-is

### Community 20 - "api/package.json"
Cohesion: 0.50
Nodes (3): name, type, version

### Community 21 - "worker/package.json"
Cohesion: 0.50
Nodes (3): name, type, version

### Community 22 - "PORTAL_COPY.md"
Cohesion: 0.50
Nodes (3): Elevator pitch, One-line technical description, Project name

### Community 23 - "meta/package.json"
Cohesion: 0.50
Nodes (3): name, type, version

### Community 24 - "Direct Meta model setup"
Cohesion: 0.50
Nodes (3): Baseten adapter (optional, not default), Direct Meta model setup, Social layer model (greetings only)

### Community 28 - "vitest"
Cohesion: 0.19
Nodes (5): vitest, servers, page(), boot(), servers

### Community 31 - "conversation.test.ts"
Cohesion: 0.27
Nodes (11): cannedSocial(), hasBookingSignal(), OFF_TOPIC_REPLY, parseReplyVariant(), renderSocial(), ReplyVariant, socialIntent, socialReply() (+3 more)

### Community 36 - "with"
Cohesion: 0.07
Nodes (26): concurrency, cancel-in-progress, group, jobs, verify, name, on, pull_request (+18 more)

### Community 37 - "steps"
Cohesion: 0.10
Nodes (20): BASETEN_API_KEY, META_API_KEY, jobs, live, runs-on, steps, timeout-minutes, name (+12 more)

### Community 38 - "eval-baseten.mjs"
Cohesion: 0.15
Nodes (14): EXTRA, frozen, IDS, maxCases, out, queue, results, root (+6 more)

### Community 39 - "snooze.test.ts"
Cohesion: 0.19
Nodes (10): OfferRow, Quote, SERVICE_PRICES, hourInTz(), JobRow, Sender, tick(), better-sqlite3 (+2 more)

### Community 40 - "ref_node_fs"
Cohesion: 0.10
Nodes (16): dotenv@^18.0.9, playwright-core@^1.64.1, BASETEN_MODEL, basetenChat(), BasetenChatResult, basetenKey(), dotenv, playwright-core (+8 more)

### Community 41 - "Hosting the demo at serviceloop.yablokolabs.com"
Cohesion: 0.09
Nodes (17): Build-time tooling (not in the product), Built With, Hosting (public demo), Media, Product, Changing interpretation mode, Cloudflare objects, Demo database reset (+9 more)

### Community 42 - "ledger.ts"
Cohesion: 0.31
Nodes (7): applyPatch(), ConstraintRecord, ConstraintState, ConstraintStatus, latestActive(), Patch, empty

## Knowledge Gaps
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `server.ts`, `package.json`, `store.ts`, `modelInterpret.ts`, `snooze.test.ts`, `dates.ts`, `ref_node_fs`, `ledger.ts`, `solver.ts`, `conversation.test.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `Demo.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08960573476702509 - nodes in this community are weakly interconnected._
- **Why does `better-sqlite3` connect `snooze.test.ts` to `server.ts`, `package.json`, `store.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05758582502768549 - nodes in this community are weakly interconnected._
- **Why does `createServer()` connect `server.ts` to `store.ts`, `modelInterpret.ts`, `snooze.test.ts`, `dates.ts`, `ref_node_fs`, `ledger.ts`, `solver.ts`, `vitest`, `conversation.test.ts`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `serve-production.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06386554621848739 - nodes in this community are weakly interconnected._
- **Should `modelInterpret.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0944741532976827 - nodes in this community are weakly interconnected._