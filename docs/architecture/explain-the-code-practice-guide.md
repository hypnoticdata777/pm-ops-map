# Explain the Code: Interview Practice Guide

This guide helps you explain PM Ops Map as a software product, not just a collection of files. Use the short version for recruiter screens, the longer version for portfolio walkthroughs, and the questions to practice technical follow-ups.

## The 30-second answer

> PM Ops Map is a local-first operations workspace for small property-management companies. The core problem is unclear ownership: important work is scattered across people and systems, so leaders struggle to see who owns what and where risk is building. The app starts with 262 responsibilities across 17 departments, lets a team customize and assign them, balances unowned work using department affinities and current workload, and adds maintenance, portfolio, audit, backup, import/export, and handbook workflows. It is built with vanilla JavaScript modules and localStorage so the default product can deploy as a static site; an optional Express service adds version-checked shared workspaces for trusted teams.

## The two-minute product walkthrough

> I would start on the Launch Plan because it explains the product’s point of view: before adding more software, make ownership and operating gaps visible. A new operator can load demo data or enter a company profile. The Tracking view is the source of truth for 262 starter responsibilities; every task can be renamed, assigned, prioritized, dated, blocked, annotated, and filtered. The Map view projects the same state into a company-to-department-to-owner diagram. Team Manager shows workload and can assign only the unowned tasks using an affinity-first, least-loaded heuristic. Work Orders provides a four-stage maintenance pipeline, and Portfolio adds enough property, tenant, lease, delinquency, and vendor context to make the dashboard operationally useful. The app can then export its state as JSON/CSV or generate an operations handbook.
>
> Architecturally, `js/app.js` composes the modules and bootstraps `config.json` into shared state. Feature modules mutate plain objects in `js/state.js`, persist through `js/storage.js`, and rerender affected views. The product is local-first by default. If a team enables sync, `js/sync.js` compares serialized snapshots and uses optimistic versions against a small Express/file-backed service. Conflicts go through validation and a human review step instead of being silently overwritten.

## The five-minute technical story

Use this sequence while sharing the repository:

1. **Lead with the operator problem.** Show the README problem statement. Explain that transaction systems can record events without creating a complete responsibility map.
2. **Show the evidence.** Point to the screenshots and `config.json`: 17 departments and 262 real starter responsibilities, not a blank task-board demo.
3. **Open the composition root.** In [`js/app.js`](../../js/app.js), show configuration bootstrap, initialization order, and `window` handler binding.
4. **Explain state and persistence.** In [`js/state.js`](../../js/state.js) and [`js/storage.js`](../../js/storage.js), describe shared objects, local-first saves, stable `_configName` matching, backups, and the mutate/persist/rerender pattern.
5. **Explain one algorithm well.** In [`runAutoAssign`](../../js/views/team.js), trace affinity filtering, least-loaded selection, immediate workload increments, fallback, backup, undo, audit, and refresh.
6. **Show product depth without listing everything.** Use Tracking, Work Orders, and Portfolio as three connected examples: responsibility, execution, and operating context.
7. **Explain sync honestly.** Show [`js/sync.js`](../../js/sync.js) and [`server/src/store.js`](../../server/src/store.js). Call it optimistic whole-snapshot sync for trusted teams, not real-time enterprise collaboration.
8. **Close with verification and limitations.** Point to Vitest coverage, server API/store tests, CI build/audit steps, and the production-readiness gaps in the README.

## Strong answers to common questions

### “What problem were you solving?”

**Strong answer:**

> Property-management teams often have good systems for transactions but weak visibility into operating ownership. The same responsibility can live in a spreadsheet, an inbox, and someone’s memory. I built a configurable responsibility map that makes unowned work, blocked work, workload concentration, maintenance gaps, and portfolio risks visible in one place. The output is also portable: the team can export the workspace or generate an operating handbook, so the product creates documentation from live operating state.

Why this works: it names the user, pain, workflow, and proof instead of saying “I built a task manager.”

### “Why vanilla JavaScript instead of React?”

**Strong answer:**

> Static-first delivery was a product constraint. I wanted the default app to run without an account, backend, or runtime dependency, and to be easy to host on GitHub Pages or distribute as a built folder. ES modules gave the code clear feature boundaries without adding a framework. The tradeoff is manual state coordination: after a mutation, the responsible module must persist and rerender the surfaces that depend on it. For the current scale that is understandable and cheap; if view complexity or team size grew significantly, I would introduce typed domain models and a more formal reactive state layer.

### “Walk me through application startup.”

**Strong answer:**

> `index.html` loads `js/app.js`. On DOM ready, source/hosted builds fetch `config.json`; production builds can use config injected by Webpack so the downloaded build works over `file://`. `bootstrapWithConfig` sets shared configuration and gives each task a stable `_configName`. `initApp` loads team, work orders, portfolio, audit log, and saved task edits before rendering. Then it initializes guidance, stats, filters, preferences, notifications, and optional sync. The order prevents a first render with stale defaults followed by a visible state jump.

### “How does auto-assignment work?”

**Strong answer:**

> It only touches tasks still marked `UNOWNED`. For each one, it first chooses employees with an affinity for that department. If nobody matches, it falls back to the full team and reports that gap. It sorts candidates by their current assigned-task count, chooses the least loaded, and increments that person’s count immediately before moving to the next task. The run creates both a backup and undo snapshot, then persists, audits, and rerenders. It is deliberately explainable, but it balances counts rather than effort, capacity, or calendars.

### “What data model did you use?”

**Strong answer:**

> The client uses plain domain objects in a shared ES-module state layer: departments contain tasks; team data contains employees and affinities; work orders are a separate lifecycle collection; portfolio contains properties, tenants, and vendors; audit entries are append-only events. Browser persistence uses separate localStorage keys so each area can load and save independently. Portable JSON has a named, versioned schema and validation report. The optional server stores one complete workspace snapshot per file with authentication metadata and an optimistic version.

### “How do renamed tasks survive a reload?”

**Strong answer:**

> During bootstrap, each configured task gets `_configName` equal to its original starter name. The displayed `name` can change, but persistence and import matching use `_configName` to reconnect saved fields to the current configured task. It solves the immediate rename problem. A stronger future design would add explicit immutable task IDs to `config.json`, because an original name is still a derived identity.

### “How do you avoid losing data?”

**Strong answer:**

> Normal edits save immediately to localStorage. Riskier bulk operations create recovery points: imports, auto-assignment, and remote sync updates save rolling backup snapshots, and the import layer also supports a one-level undo snapshot. Imported or remote data is validated and reviewed before replacement. This is good browser-level recovery, but it is not a substitute for server backups, retention policy, or transactional storage in a production deployment.

### “How does Team Sync prevent overwrites?”

**Strong answer:**

> The client remembers the last synchronized snapshot and version. If local state changed, it pushes with `expectedVersion`. The server only accepts that write if the version still matches; otherwise it returns `409` with current remote state. The client validates the remote snapshot and opens a human review flow. If local state is clean, the client first checks the remote version and pulls only when needed. The server also serializes concurrent writes per workspace inside one process. This detects conflicts but does not merge individual fields.

### “What security choices did you make?”

**Strong answer:**

> The default architecture minimizes exposure because data remains in the browser unless the user enables sync. Generated HTML escapes user text, document links are limited to HTTP/HTTPS, imports are validated, request bodies and state payloads are capped, sync passphrases are stored server-side as scrypt hashes, comparisons are timing-safe, and API traffic is rate-limited. The main limitation is the trust model: there are no individual accounts or roles, and the client stores the shared passphrase locally. I present Team Sync as a small trusted-team option, not an enterprise security model.

### “What did you test?”

**Strong answer:**

> Client Vitest tests (which import the same ES modules the browser loads) cover the starter data contract, date/escaping/CSV/domain utilities, import schema compatibility, and template/demo generation. Server tests cover both the store and HTTP API, including authentication failures, invalid inputs, payload limits, stale-version conflicts, and concurrent pushes. CI runs client tests, an audit, and the production build, then runs the independent server tests and audit. The largest remaining quality gap is browser end-to-end testing for the inline DOM workflows.

### “What would you change for production?”

**Strong answer:**

> I would first add immutable IDs and typed/runtime-validated domain models. For collaboration, I would add authenticated users, workspace roles, encrypted transport guidance, transactional database storage, durable backups, and field-level or event-based conflict handling. For the operator product, I would add email/SMS notifications, real document storage, owner-ready financial reports, and import mappings for common PM systems. I would also add end-to-end accessibility and browser tests before calling it production-ready.

### “What was the hardest design tradeoff?”

**Strong answer:**

> The main tradeoff was preserving zero-setup local use while still allowing collaboration. Making a backend mandatory would weaken the product’s privacy and deployment story; avoiding collaboration entirely would limit real team use. I separated the modes: localStorage is the complete default product, while Team Sync is an optional snapshot service using the same validated import contract. That kept the core simple, though it means sync conflicts are reviewed at whole-workspace level rather than merged automatically.

## Questions you should practice aloud

Answer each in 60–90 seconds without reading the sample answers.

1. Who is the primary user, and what moment makes them reach for this product?
2. Why is this more than a generic task board?
3. What is the source of truth for configured tasks versus user edits?
4. What invariants does auto-assignment preserve?
5. How does a task edit travel from a click to durable storage and back to the screen?
6. Why do the tests import the shipped modules directly instead of keeping test-only copies?
7. What happens if two teammates push at the same time?
8. What failure does `_configName` prevent, and what weakness remains?
9. Which user inputs are security-sensitive at render time?
10. What would break first if the app grew to hundreds of simultaneous users?
11. Which claims can you prove from tests or screenshots?
12. What would you prioritize in the next two weeks, and why?

## Whiteboard prompts

### Prompt 1: Redesign assignment for real capacity

Start from the current algorithm, then introduce:

- estimated effort per task;
- employee weekly capacity;
- required skills or certifications;
- availability and existing work;
- hard eligibility constraints versus soft preferences; and
- deterministic tie-breaking with an explanation payload.

Explain whether you would use greedy scoring, min-cost flow, constraint programming, or another approach—and what operational data you would need before the extra sophistication is justified.

### Prompt 2: Make sync production-grade

Sketch a path from whole-snapshot files to:

- authenticated users and memberships;
- database-backed workspaces;
- record IDs and revision numbers;
- an append-only change log;
- field-level conflict detection;
- audit retention and backups; and
- WebSocket/SSE updates or efficient polling.

Be explicit about migration compatibility for existing exported schema version 2 data.

### Prompt 3: Add a new main view

Describe every place you would inspect or change:

1. panel and navigation markup in `index.html`;
2. feature module under `js/views/`;
3. imports, `switchView`, and any global handler bindings in `js/app.js`;
4. persistence/state additions if the view owns data;
5. global stats/beacons or handbook/export effects;
6. CSS and responsive behavior; and
7. tests and documentation.

## Honest limitation language

Use precise phrases like these:

- “The default app is local-first and static-hostable; it is not a hosted SaaS.”
- “Team Sync supports trusted shared workspaces, not individual accounts or roles.”
- “The assignment heuristic balances responsibility counts, not estimated effort.”
- “Conflict detection is version-based and human-reviewed; it is not field-level merge.”
- “Portfolio payments are operating records, not payment processing or accounting.”
- “Browser notifications are session-level reminders, not a durable email/SMS system.”
- “The repository has unit and server integration coverage; browser end-to-end coverage is a next step.”
- “The screenshots are repository evidence; the README does not currently identify a live production deployment.”

Avoid saying “fully production-ready,” “real-time collaboration,” “secure for enterprise use,” “AI-powered assignment,” or “complete property-management platform.” The code does not support those claims.

## Demo checklist

Before an interview or recruiter call:

1. Run `npm test` and `npm run build`.
2. Run the server tests separately from `server/`.
3. Start the client with `npm start` or a simple HTTP server.
4. Use fictional demo data; do not expose real tenant or owner details.
5. Practice the flow: onboarding/demo → Launch Plan → Tracking → auto-assign → Map → Work Orders → Portfolio → handbook export.
6. Keep [`problem-algorithm-pseudocode-flowchart.md`](problem-algorithm-pseudocode-flowchart.md) ready for an algorithm question.
7. End by naming one shipped strength, one honest limitation, and the next production-hardening step.

## A strong closing statement

> The part I am proudest of is that the architecture follows the product promise. A small operator can use the full core without creating an account or running infrastructure, the assignment logic is understandable rather than magical, risky replacements have recovery and review paths, and the code is modular enough to show exactly where each workflow lives. I am equally clear about the boundary: the optional sync service proves the collaboration model for a trusted team, but production multi-tenant use would require a stronger identity, storage, and conflict architecture.
