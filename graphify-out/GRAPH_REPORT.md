# Graph Report - fix-video-main  (2026-10-28)

## Corpus Check
- 110 files scanned · 87 project files represented in the graph · ~45,904 words
- Verdict: corpus is large enough that graph structure adds value.
- Unrepresented: 23 of the 110 scanned files contributed no symbol nodes (verified by counting distinct `source_file` values in `graph.json`: 87 project files)

## Summary
- 554 nodes · 826 edges · 49 communities (33 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `977b2c8e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- Demo.tsx
- devDependencies
- serve-production.mjs
- dotenv
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
- with
- steps
- eval-baseten.mjs
- package.json
- ledger.ts
- Hosting the demo at serviceloop.yablokolabs.com
- scripts
- vision-timestamps.mjs
- ServiceLoop web — design system
- directories
- PRODUCT.md
- @types/react@^19.3.0
- zod@^4.6.7

## God Nodes (most connected - your core abstractions)
1. `createServer()` - 28 edges
2. `vitest` - 17 edges
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
- `How we used our agent tooling` --references--> `parseModelOutput()`  [INFERRED]
  docs/META_AND_PARTNER_TECHNOLOGY.md → apps/api/src/modelInterpret.ts
- `How we used our agent tooling` --references--> `liveInterpret()`  [INFERRED]
  docs/META_AND_PARTNER_TECHNOLOGY.md → apps/api/src/modelInterpret.ts
- `createServer()` --calls--> `applyPatch()`  [EXTRACTED]
  apps/api/src/server.ts → packages/domain/src/ledger.ts

## Import Cycles
- None detected.

## Communities (49 total, 16 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.05
Nodes (47): evaluateOffer(), OfferRow, Quote, seedOffers(), SERVICE_PRICES, activeValue(), createServer(), ManagedServer (+39 more)

### Community 1 - "Demo.tsx"
Cohesion: 0.09
Nodes (48): Header(), Demo(), TOTAL_FRAMES, Root(), Arrow(), Feedback(), Rise(), StepCard() (+40 more)

### Community 2 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, better-sqlite3@^13.0.3, @types/better-sqlite3@^9.6.0, @types/react-dom@^19.3.0, typescript@^7.0.2, vite@^8.3.5, @vitejs/plugin-react@^6.1.2, vitest@^5.0.5 (+5 more)

### Community 3 - "serve-production.mjs"
Cohesion: 0.08
Nodes (23): cases, out, path, results, root, runBackend(), runOne(), withTimeout() (+15 more)

### Community 4 - "dotenv"
Cohesion: 0.17
Nodes (11): dependencies, dotenv@^18.0.9, react@^19.3.1, react-dom@^19.3.1, react, react-dom, dotenv, img (+3 more)

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

### Community 36 - "with"
Cohesion: 0.07
Nodes (26): concurrency, cancel-in-progress, group, jobs, verify, name, on, pull_request (+18 more)

### Community 37 - "steps"
Cohesion: 0.10
Nodes (20): BASETEN_API_KEY, META_API_KEY, jobs, live, runs-on, steps, timeout-minutes, name (+12 more)

### Community 38 - "eval-baseten.mjs"
Cohesion: 0.15
Nodes (14): EXTRA, frozen, IDS, maxCases, out, queue, results, root (+6 more)

### Community 39 - "package.json"
Cohesion: 0.18
Nodes (10): author, description, keywords, license, main, name, private, type (+2 more)

### Community 40 - "ledger.ts"
Cohesion: 0.31
Nodes (7): applyPatch(), ConstraintRecord, ConstraintState, ConstraintStatus, latestActive(), Patch, empty

### Community 41 - "Hosting the demo at serviceloop.yablokolabs.com"
Cohesion: 0.25
Nodes (7): Changing interpretation mode, Cloudflare objects, Current deployment (2026-10-28), Honest limits, Hosting the demo at serviceloop.yablokolabs.com, Run, Shape

### Community 42 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, api, build, test, test:ci, web

### Community 43 - "vision-timestamps.mjs"
Cohesion: 0.40
Nodes (3): files, key, parsed

### Community 45 - "directories"
Cohesion: 0.67
Nodes (3): directories, doc, test

## Knowledge Gaps
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `server.ts` to `devDependencies`, `modelInterpret.ts`, `package.json`, `ledger.ts`, `dates.ts`, `solver.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05365686944634313 - nodes in this community are weakly interconnected._
- **Why does `better-sqlite3` connect `server.ts` to `devDependencies`, `package.json`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Should `Demo.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08960573476702509 - nodes in this community are weakly interconnected._
- **Why does `createServer()` connect `server.ts` to `dates.ts`, `ledger.ts`, `solver.ts`, `modelInterpret.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `serve-production.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07586206896551724 - nodes in this community are weakly interconnected._
- **Should `modelInterpret.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0944741532976827 - nodes in this community are weakly interconnected._