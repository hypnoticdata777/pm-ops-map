# PM Ops Map Roadmap

The single source of truth for what has shipped, what is in progress, and what comes next. The README's [Roadmap](../README.md#roadmap) section is the short version; this is the detail. Update this file in the same PR that finishes (or re-scopes) a step.

**Last updated:** 2026-10-28 · **Current focus:** Phase 1B

## Status at a glance

| Phase | Theme | Status |
|---|---|---|
| 0 | Trust: security, data safety, privacy, demo, dependency hygiene | ✅ Done |
| 1A | Foundations: stable task IDs, runtime schemas, JSDoc types (steps 1–3) | ✅ Done |
| 1B | Foundations: pure domain layer, one commit path (steps 4–5) | ⏭ Next |
| 1C | Foundations: event delegation, E2E expansion (steps 6–7) | ⏳ After 1B |
| 2 | Positioning: Map → Assign → Review → Share | ✅ Done |
| 3 | Responsibility intelligence | 📋 Planned |
| 4 | Onboarding and responsibilities import | 📋 Planned |
| 5 | Sync and deployment hardening, threat model | 📋 Planned |

## Principles that apply to every phase

- **Zero runtime npm dependencies in the client**, and it must keep working from `file://`. Tooling (tests, build, types) can have dependencies; the shipped app cannot.
- **Behavior stays identical unless a step says otherwise or it is fixing a bug.** Foundation work should be invisible to users.
- **Characterization or failing test first, then change the code.** After each fix, *mutation-check* it: temporarily re-introduce the bug and confirm the tests fail. A passing test you have never seen fail proves little.
- **Every change is verified, not just written.** Before every push run the gates below. For any UI change, look at screenshots at desktop and about 390px width.
- **Security conventions are mandatory** ([CONTRIBUTING](../CONTRIBUTING.md#security-conventions)). Anything new that can be imported (a field or a view) is added to the canary fuzz suite in `e2e/helpers/security.js`.
- **One reviewable chunk at a time.** Work ships as small PRs; later groups depend on earlier ones being merged.

### The gate list (all must pass before a push)

```bash
npm run typecheck
npx vitest run
npx playwright test
npm run test:e2e:pages          # production build, under /pm-ops-map/ and file://
(cd server && npm test)
npm audit --omit=dev            # and the same inside server/
npm run build
```

## Phase 0: Trust (done)

Shipped-module tests (Vitest + jsdom importing the real ES modules), XSS and CSV-injection fixes, import and sync validation, data-loss fixes (notes and custom fields in exports and backups, reset deleting backups), in-product privacy messaging, a hosted demo with isolated storage (`?demo=1`), Dependabot and a weekly audit, and GitHub Pages deployment. See the CHANGELOG.

## Phase 1: Foundations

**Why:** make the codebase cheap and safe to extend *before* building the Phase 3 features. Keep behavior identical unless fixing a bug.

### 1A: done

1. **Stable task IDs.** Every starter task has a permanent id (`maintenance-014`), assigned once by `npm run ids:assign`. Saved data, imports, backups, undo and dependencies match by id first, then starter name, then `aliases`. Export schema is v4 (v2/v3 still import). *Result:* rewording a task in `config.json` no longer orphans anyone's progress.
2. **Runtime schemas.** A small hand-rolled schema layer (`js/schema.js`) returning `{ value, errors[] }` with field paths. The import review names the field and record it repairs; sync replies are checked; storage load records its repairs; the sync server validates pushes.
3. **Types without a migration.** JSDoc types with `npm run typecheck` (strict) in CI. The data and boundary modules are fully checked; the rest carry `// @ts-nocheck — TODO(types)` until converted.

### 1B: next

4. **Pure domain layer** (`js/domain/`: no DOM, no shared-state imports).
   - **Coverage:** de-duplicate the near-identical copies in `launchPlan.js` and `handbook.js`. Today "covered" only means "not UNOWNED".
   - **Workload:** move `buildWorkloadMap` / `countUnowned` out of `state.js`.
   - **Assignment:** extract `planAssignments(state, options)` from `runAutoAssign` in `views/team.js`, returning a *reason per assignment*. Same algorithm, no preview UI yet.
   - Write **characterization tests of the current outputs first**, then move the code; views call the domain functions.
   - *Done when:* the domain modules import nothing from the DOM or shared state, views call them, and the characterization tests passed before and after the move.
5. **One commit path.** The "save + re-render" block (`saveToStorage`, `renderTrackingView`, `updateStats`, `populateOwnerFilter`, `renderLegend`, map/team refresh) is copy-pasted in `runAutoAssign`, `undoLastAction`, `_applyImportedState`, `setTaskOwner` and others. Replace it with one `commit()` helper (persist, re-render affected views, update beacons and stats), starting with the duplicated sites.
   - *Done when:* those sites use `commit()` with no behavior change.

### 1C: after 1B

6. **Event delegation.** Replace the ~139 inline `on*=` handlers and the `Object.assign(window, …)` block in `app.js` with `data-action` attributes and one delegated listener per view, **incrementally, one view at a time** (tracking → team → work orders → portfolio → map/launch plan → modals). Update `render-escaping.test.js` (it asserts exact `onclick` strings), CONTRIBUTING and the e2e scanner.
   - *Done when:* a test proves rendered HTML contains no `on*=` attributes, the `window` bindings are gone, and the XSS suite is still green.
7. **E2E expansion** (woven in as the other steps land): onboarding → edit → export → reset → import; auto-assign and undo; backup restore; a **Team Sync conflict against the real server**, spawned by Playwright with a temporary `DATA_DIR`. Wire into CI, keep total run time reasonable, and report `npm run test:coverage` before and after.

### Phase 1 PR split

| PR | Steps | Status |
|---|---|---|
| A | 1–3 | Merged (#64) |
| B | 4–5 | Next |
| C | 6–7 | After B |

## Phase 2: Positioning (done)

Reposition the product around **Map → Assign → Review → Share**: the README and navigation, explicit "context" views (Work Orders, Portfolio), and documented non-goals. See `docs/field-notes/` and the README's [Non-goals](../README.md#non-goals).

## Phase 3: Responsibility intelligence (planned)

Deepen the Map → Assign → Review → Share loop rather than widening the product. Candidate scope (to be refined when Phase 1B lands, since it builds directly on the domain layer):

- **Backup owners** for each responsibility
- **Review dates and cadence**
- **Criticality** of a responsibility
- **Coverage and readiness diagnostics** (beyond "is it unowned?")
- **Explainable auto-assign:** a preview showing the reason for each proposed assignment before anything is applied (builds on `planAssignments`)
- **Reports**

## Phase 4: Onboarding and responsibilities import (planned)

- Guided onboarding / audit
- **Responsibilities CSV import with column mapping**
- Documented sample paths

## Phase 5: Sync and deployment hardening (planned)

Make the optional, self-hosted **trusted-team** sync server safe to deploy, and write a **threat model**. Known issues to address (documented, not yet fixed):

- The in-memory rate limiter never evicts IPs and ignores `trust proxy`.
- `scryptSync` blocks the event loop on every poll.
- `writeFileSync` is not atomic.
- The passphrase minimum is only 4 characters.
- The passphrase is stored in plaintext in browser storage.
- The Docker image runs as root, and `ALLOWED_ORIGINS=*` is the default.

## Housekeeping and ongoing work

- **Type conversion backlog:** files marked `// @ts-nocheck — TODO(types)` (`grep -rn "ts-nocheck" js/`). A guard test (`js/__tests__/typecheck-guard.test.js`) lists them; delete a name when you convert the file.
- **Dependabot:** 14 PRs were open at the last review. Several are real major upgrades (for example Express 5, which needs a careful look at `req.ip`, body parsing and routing). They are not part of any phase above.
- **CI guardrails in place:** branch protection on `master`, Dependabot alerts and security updates, a weekly audit that opens an issue when it fails, and tests that find nav tabs by `data-view` rather than label text.

## Out of scope for now

Anything that turns the map into a system of record, and any feature that requires an account to use the client app. Per the README's [Non-goals](../README.md#non-goals), PM Ops Map is not an accounting, rent-collection or payment platform; a tenant-facing portal or resident communications system; a maintenance dispatch or vendor marketplace; a document-storage system; or a full property-management system of record. The Portfolio and Work Orders views stay deliberately lightweight context around the responsibility map.
