# Graph Report - serviceloop  (2026-10-28)

## Corpus Check
- 125 files · ~60,514 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 633 nodes · 1025 edges · 54 communities (41 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f16c1e72`
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
- devDependencies
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
- ref_node_fs
- EVALUATION.md
- MEDIA_WORKFLOWS.md
- scripts
- SESSION_TOOLING.md
- SUBMISSION_CHECKLIST.md
- audit-video-audio.sh
- SESSION_CONTINUATION.md
- with
- steps
- eval-baseten.mjs
- playwright-core
- vision-check.mjs
- Hosting the demo at serviceloop.yablokolabs.com
- directories
- solver.ts
- ServiceLoop web — design system
- ledger.ts
- PRODUCT.md
- snooze.test.ts
- How ServiceLoop uses Meta products and partner technology
- reset-public-demo.sh
- dependencies
- vite
- vision-timestamps.mjs
- ManagedServer

## God Nodes (most connected - your core abstractions)
1. `createServer()` - 45 edges
2. `vitest` - 20 edges
3. `socialReply()` - 14 edges
4. `liveInterpret()` - 14 edges
5. `remotion` - 14 edges
6. `Header()` - 13 edges
7. `Muse Code and Meta Model Smoke Test Results` - 12 edges
8. `Demo()` - 10 edges
9. `C` - 10 edges
10. `FONT` - 10 edges

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

## Communities (54 total, 13 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.12
Nodes (31): hasBookingSignal(), socialIntent, evaluateOffer(), OfferRow, Quote, seedOffers(), SERVICE_PRICES, activeValue() (+23 more)

### Community 1 - "Demo.tsx"
Cohesion: 0.09
Nodes (48): Header(), Demo(), TOTAL_FRAMES, Root(), Arrow(), Feedback(), Rise(), StepCard() (+40 more)

### Community 2 - "package.json"
Cohesion: 0.18
Nodes (10): author, description, keywords, license, main, name, private, type (+2 more)

### Community 3 - "serve-production.mjs"
Cohesion: 0.06
Nodes (25): cases, out, path, results, root, runBackend(), runOne(), withTimeout() (+17 more)

### Community 4 - "store.ts"
Cohesion: 0.17
Nodes (12): cancelBooking(), confirmBooking(), ConfirmRequest, ConfirmResult, Db, dbOf(), HoldRequest, holdSlot() (+4 more)

### Community 5 - "modelInterpret.ts"
Cohesion: 0.07
Nodes (48): cannedSocial(), OFF_TOPIC_REPLY, parseReplyVariant(), renderSocial(), ReplyVariant, socialReply(), VARIANT_FORMAT, VARIANT_TEXT (+40 more)

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

### Community 13 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, better-sqlite3@^13.0.3, @types/better-sqlite3@^9.6.0, @types/react@^19.3.0, @types/react-dom@^19.3.0, typescript@^7.0.2, vitest@^5.0.5, zod@^4.6.7 (+5 more)

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
Cohesion: 0.40
Nodes (4): Baseten adapter (optional, not default), Credit fallback (quota/auth only, 2026-10-28), Direct Meta model setup, Social layer model (greetings only)

### Community 28 - "ref_node_fs"
Cohesion: 0.14
Nodes (10): fallbackLimitPerHour(), fallbackSlotsLeft(), vitest, boot(), PATCH, servers, servers, page() (+2 more)

### Community 31 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, api, build, test, test:ci, web

### Community 36 - "with"
Cohesion: 0.07
Nodes (26): concurrency, cancel-in-progress, group, jobs, verify, name, on, pull_request (+18 more)

### Community 37 - "steps"
Cohesion: 0.10
Nodes (20): BASETEN_API_KEY, META_API_KEY, jobs, live, runs-on, steps, timeout-minutes, name (+12 more)

### Community 38 - "eval-baseten.mjs"
Cohesion: 0.15
Nodes (14): EXTRA, frozen, IDS, maxCases, out, queue, results, root (+6 more)

### Community 39 - "playwright-core"
Cohesion: 0.25
Nodes (3): playwright-core@^1.64.1, playwright-core, recordStill()

### Community 40 - "vision-check.mjs"
Cohesion: 0.40
Nodes (4): img, j, key, parsed

### Community 41 - "Hosting the demo at serviceloop.yablokolabs.com"
Cohesion: 0.09
Nodes (17): Build-time tooling (not in the product), Built With, Hosting (public demo), Media, Product, Changing interpretation mode, Cloudflare objects, Demo database reset (+9 more)

### Community 42 - "directories"
Cohesion: 0.67
Nodes (3): directories, doc, test

### Community 43 - "solver.ts"
Cohesion: 0.25
Nodes (9): BayWindow, Candidate, DriverWindow, findSlots(), fmt(), SlotRequest, SolverOutput, WorkshopConfig (+1 more)

### Community 45 - "ledger.ts"
Cohesion: 0.31
Nodes (7): applyPatch(), ConstraintRecord, ConstraintState, ConstraintStatus, latestActive(), Patch, empty

### Community 47 - "snooze.test.ts"
Cohesion: 0.32
Nodes (6): hourInTz(), JobRow, Sender, tick(), boot(), servers

### Community 48 - "How ServiceLoop uses Meta products and partner technology"
Cohesion: 0.25
Nodes (7): Describe your use of Meta products to build the submitted project, Feedback from our experience using Meta products, Feedback from our experience using partner technologies (Baseten), Feedback from our experience using partner technologies (Modal inference), How ServiceLoop uses Meta products and partner technology, What we deliberately did not do, Why are Meta's models important to your solution?

### Community 50 - "dependencies"
Cohesion: 0.33
Nodes (6): dependencies, dotenv@^18.0.9, react@^19.3.1, react-dom@^19.3.1, react, react-dom

### Community 51 - "vite"
Cohesion: 0.40
Nodes (4): vite@^8.3.5, @vitejs/plugin-react@^6.1.2, vite, @vitejs/plugin-react

### Community 52 - "vision-timestamps.mjs"
Cohesion: 0.40
Nodes (3): files, key, parsed

## Knowledge Gaps
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `ref_node_fs` to `server.ts`, `package.json`, `store.ts`, `modelInterpret.ts`, `dates.ts`, `solver.ts`, `devDependencies`, `ledger.ts`, `snooze.test.ts`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1226890756302521 - nodes in this community are weakly interconnected._
- **Why does `createServer()` connect `server.ts` to `store.ts`, `modelInterpret.ts`, `dates.ts`, `solver.ts`, `ledger.ts`, `snooze.test.ts`, `ref_node_fs`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Demo.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08960573476702509 - nodes in this community are weakly interconnected._
- **Why does `better-sqlite3` connect `server.ts` to `package.json`, `store.ts`, `devDependencies`, `snooze.test.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `serve-production.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06386554621848739 - nodes in this community are weakly interconnected._
- **Should `modelInterpret.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07481005260081823 - nodes in this community are weakly interconnected._