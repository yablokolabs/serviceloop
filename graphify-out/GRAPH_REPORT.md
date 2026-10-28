# Graph Report - docs-meta-partner-usage  (2026-10-28)

## Corpus Check
- 100 files · ~41,210 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 3, .css 1)

## Summary
- 473 nodes · 739 edges · 36 communities (24 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cbfabcce`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- Demo.tsx
- package.json
- eval-baseten.mjs
- ref_node_fs
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
- BUILT_WITH.md
- EVALUATION.md
- MEDIA_WORKFLOWS.md
- PROGRESS.md
- SESSION_TOOLING.md
- SUBMISSION_CHECKLIST.md
- audit-video-audio.sh
- SESSION_CONTINUATION.md

## God Nodes (most connected - your core abstractions)
1. `createServer()` - 27 edges
2. `vitest` - 15 edges
3. `remotion` - 14 edges
4. `Header()` - 13 edges
5. `Muse Code and Meta Model Smoke Test Results` - 12 edges
6. `Demo()` - 10 edges
7. `C` - 10 edges
8. `FONT` - 10 edges
9. `compilerOptions` - 10 edges
10. `ServiceLoop implementation specification` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createServer()` --calls--> `findSlots()`  [EXTRACTED]
  apps/api/src/server.ts → packages/domain/src/solver.ts
- `boot()` --calls--> `createServer()`  [EXTRACTED]
  tests/api/booking-flow.test.ts → apps/api/src/server.ts
- `page()` --calls--> `createServer()`  [EXTRACTED]
  tests/e2e/browser-flow.test.ts → apps/api/src/server.ts
- `boot()` --calls--> `createServer()`  [EXTRACTED]
  tests/jobs/snooze.test.ts → apps/api/src/server.ts
- `boot()` --calls--> `createServer()`  [EXTRACTED]
  tests/lifecycle/lifecycle.test.ts → apps/api/src/server.ts

## Import Cycles
- None detected.

## Communities (36 total, 12 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.06
Nodes (47): evaluateOffer(), OfferRow, Quote, seedOffers(), SERVICE_PRICES, activeValue(), createServer(), ManagedServer (+39 more)

### Community 1 - "Demo.tsx"
Cohesion: 0.09
Nodes (48): Header(), Demo(), TOTAL_FRAMES, Root(), Arrow(), Feedback(), Rise(), StepCard() (+40 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (40): author, dependencies, react@^19.3.1, react-dom@^19.3.1, description, devDependencies, better-sqlite3@^13.0.3, @types/better-sqlite3@^9.6.0 (+32 more)

### Community 3 - "eval-baseten.mjs"
Cohesion: 0.06
Nodes (30): ../dist/apps/api/src/extract.js, ../dist/apps/api/src/modelInterpret.js, ../dist/apps/api/src/server.js, EXTRA, frozen, IDS, maxCases, out (+22 more)

### Community 4 - "ref_node_fs"
Cohesion: 0.10
Nodes (16): dotenv@^18.0.9, playwright-core@^1.64.1, BASETEN_MODEL, basetenChat(), BasetenChatResult, basetenKey(), dotenv, playwright-core (+8 more)

### Community 5 - "modelInterpret.ts"
Cohesion: 0.13
Nodes (20): ExtractedPatch, CallUsage, FIELD_ALIASES, interpreterLabel(), InterpretResult, KNOWN_FIELDS, liveInterpret(), ModelBackend (+12 more)

### Community 6 - "project.yml"
Cohesion: 0.08
Nodes (25): activation_command, activation_command_timeout, added_modes, agent_interface, default_modes, encoding, excluded_apis, excluded_tools (+17 more)

### Community 7 - "App.tsx"
Cohesion: 0.19
Nodes (11): App(), approve(), cancel(), propose(), sendText(), Candidate, fmt(), Msg (+3 more)

### Community 8 - "dates.ts"
Cohesion: 0.24
Nodes (11): extractTurn(), WEEKDAYS, AMBIGUOUS_EVENTS, dateInTz(), DAYS, isMorning(), resolveWeekday(), splitTimeReference() (+3 more)

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

## Knowledge Gaps
- **2 isolated node(s):** `../dist/apps/api/src/server.js`, `../dist/apps/api/src/extract.js`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 247 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `server.ts` to `package.json`, `ref_node_fs`, `modelInterpret.ts`, `dates.ts`, `solver.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `../dist/apps/api/src/server.js`, `../dist/apps/api/src/extract.js` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0567287784679089 - nodes in this community are weakly interconnected._
- **Why does `better-sqlite3` connect `server.ts` to `package.json`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Demo.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08960573476702509 - nodes in this community are weakly interconnected._
- **Why does `dotenv` connect `ref_node_fs` to `package.json`, `modelInterpret.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.059233449477351915 - nodes in this community are weakly interconnected._