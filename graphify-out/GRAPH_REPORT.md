# Graph Report - serviceloop  (2026-10-28)

## Corpus Check
- 121 files · ~58,638 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 620 nodes · 989 edges · 48 communities (33 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de464174`
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
- dotenv
- Hosting the demo at serviceloop.yablokolabs.com
- directories
- @types/better-sqlite3@^9.6.0
- ServiceLoop web — design system
- typescript@^7.0.2
- PRODUCT.md
- reset-public-demo.sh

## God Nodes (most connected - your core abstractions)
1. `createServer()` - 45 edges
2. `vitest` - 20 edges
3. `remotion` - 14 edges
4. `Header()` - 13 edges
5. `liveInterpret()` - 12 edges
6. `Muse Code and Meta Model Smoke Test Results` - 12 edges
7. `socialReply()` - 11 edges
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

## Communities (48 total, 15 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.06
Nodes (61): cannedSocial(), hasBookingSignal(), OFF_TOPIC_REPLY, parseReplyVariant(), renderSocial(), ReplyVariant, socialIntent, socialReply() (+53 more)

### Community 1 - "Demo.tsx"
Cohesion: 0.09
Nodes (48): Header(), Demo(), TOTAL_FRAMES, Root(), Arrow(), Feedback(), Rise(), StepCard() (+40 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (15): author, dependencies, react@^19.3.1, react-dom@^19.3.1, description, react, react-dom, keywords (+7 more)

### Community 3 - "serve-production.mjs"
Cohesion: 0.09
Nodes (20): cases, out, path, results, root, runBackend(), runOne(), withTimeout() (+12 more)

### Community 4 - "store.ts"
Cohesion: 0.17
Nodes (12): cancelBooking(), confirmBooking(), ConfirmRequest, ConfirmResult, Db, dbOf(), HoldRequest, holdSlot() (+4 more)

### Community 5 - "modelInterpret.ts"
Cohesion: 0.09
Nodes (28): ExtractedPatch, isQuotaError(), CallUsage, FIELD_ALIASES, interpreterLabel(), InterpretResult, KNOWN_FIELDS, liveInterpret() (+20 more)

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
Nodes (13): devDependencies, better-sqlite3@^13.0.3, @types/react@^19.3.0, @types/react-dom@^19.3.0, vite@^8.3.5, @vitejs/plugin-react@^6.1.2, vitest@^5.0.5, zod@^4.6.7 (+5 more)

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
Cohesion: 0.08
Nodes (24): basetenAvailable(), consumeFallbackSlot(), FALLBACK_LABEL, fallbackLimitPerHour(), fallbackSlotsLeft(), slots, BASETEN_MODEL, basetenChat() (+16 more)

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

### Community 40 - "dotenv"
Cohesion: 0.17
Nodes (9): dotenv@^18.0.9, dotenv, img, j, key, parsed, files, key (+1 more)

### Community 41 - "Hosting the demo at serviceloop.yablokolabs.com"
Cohesion: 0.09
Nodes (17): Build-time tooling (not in the product), Built With, Hosting (public demo), Media, Product, Changing interpretation mode, Cloudflare objects, Demo database reset (+9 more)

### Community 42 - "directories"
Cohesion: 0.67
Nodes (3): directories, doc, test

## Knowledge Gaps
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `ref_node_fs` to `server.ts`, `package.json`, `store.ts`, `modelInterpret.ts`, `dates.ts`, `devDependencies`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.055905220288781934 - nodes in this community are weakly interconnected._
- **Why does `createServer()` connect `server.ts` to `dates.ts`, `ref_node_fs`, `store.ts`, `modelInterpret.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Demo.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08960573476702509 - nodes in this community are weakly interconnected._
- **Why does `better-sqlite3` connect `server.ts` to `package.json`, `store.ts`, `devDependencies`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._
- **Should `serve-production.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08547008547008547 - nodes in this community are weakly interconnected._