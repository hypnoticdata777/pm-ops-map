# Code Glossary

This glossary explains the repository in practical terms. Read [`site-walkthrough.md`](site-walkthrough.md) first if you want a narrative tour; use this page when you need to find the owner of a behavior.

## Repository-level files

| File | Practical responsibility | Watch for |
|---|---|---|
| [`index.html`](../../index.html) | The single-page shell: navigation, persistent containers, forms, and modals. | Inline handler names must be exported to `window` in `js/app.js`. |
| [`config.json`](../../config.json) | Product seed data: company placeholder, 17 departments, 262 starter tasks, affinities, and owner colors. | Task names become initial stable identity keys; duplicate/unstable names make persistence ambiguous. |
| [`css/style.css`](../../css/style.css) | Entire visual system, responsive layout, view styling, states, and animations. | There is no component-scoped CSS or preprocessor. |
| [`package.json`](../../package.json) | Frontend development, Vitest tests, and Webpack build commands. | Dependencies are development-only; the browser bundle has no framework runtime. |
| [`webpack.common.js`](../../webpack.common.js) | Defines `js/app.js` as the bundle entry and `dist/` as output. | Production and development settings extend it. |
| [`webpack.config.dev.js`](../../webpack.config.dev.js) | Local dev server with live reload and source maps. | Raw `config.json` is fetched over HTTP. |
| [`webpack.config.prod.js`](../../webpack.config.prod.js) | Produces the distributable static build and copies assets. | Injects config into built HTML so opening `dist/index.html` over `file://` works. |
| [`docker-compose.yml`](../../docker-compose.yml) | Runs the optional sync server with durable storage. | Not needed for the default local-only app. |
| [`render.yaml`](../../render.yaml) | Render deployment blueprint for the optional sync server. | A deployment recipe is not evidence of a currently running production service. |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | Tests/audits/builds client and tests/audits server on pushes and PRs to `master`. | Client and server have separate package locks and commands. |

## Client composition and state

### `js/app.js`

The composition root and browser entry point.

| Symbol | Meaning |
|---|---|
| `switchView(view, tabEl)` | Activates one view panel, updates the tab state, clears tracking-only UI when leaving it, and renders the destination view. |
| `initApp()` | Hydrates every persisted collection, renders initial screens, applies preferences, starts sync/notifications, and decides whether to show onboarding. |
| `bootstrapWithConfig(config)` | Loads configuration into shared state and stamps task `_configName` values before initialization. |
| `Object.assign(window, {...})` | Adapter between ES modules and inline/generated HTML handlers. Missing entries cause otherwise-visible controls to fail at click time. |

### `js/state.js`

The shared in-memory store and domain constants.

| Symbol | Meaning |
|---|---|
| `orgData` | Configured departments and their mutable task objects. |
| `teamData` | `{ employees: [...] }`, where employees have `name`, `hex`, and `affinities`. |
| `workOrders` | Array of maintenance work-order records. |
| `portfolio` | `{ properties, vendors, tenants }`. |
| `auditLog` | Newest-first append-only activity list, capped by persistence logic at 500. |
| `mapState` | Current map filters/highlights. |
| `STATUS_CYCLE` / `PRIORITY_CYCLE` | Valid task transition values. |
| `WO_STATUS_CYCLE` | Fixed maintenance lifecycle. |
| `getEmployeeHex(name)` | Resolves live team colors, then configured colors, then a fallback. |
| `buildWorkloadMap()` | Counts assigned responsibilities by employee name. |
| `countUnowned()` | Counts tasks still owned by `UNOWNED`. |

## Persistence, transfer, and safety

### `js/storage.js`

Owns browser persistence.

| Symbol | Meaning |
|---|---|
| `STORAGE_KEY` and sibling constants | Namespaces for task, company, profile, team, work-order, portfolio, audit, backup, and sync records. |
| `saveToStorage()` | Saves editable task fields, excluding presentation-only configuration where possible. |
| `loadFromStorage()` | Reconciles saved task edits with configured tasks using `_configName`; bounds and validates restored values. |
| `saveTeamData()` / `loadTeamData()` | Persists the roster or seeds it from configuration. |
| `saveWorkOrders()` / `loadWorkOrders()` | Persists the maintenance collection. |
| `savePortfolio()` / `loadPortfolio()` | Persists properties, tenants, and vendors with safe empty-array fallback. |
| `logAudit(action, details)` | Prepends a timestamped event and enforces the 500-entry limit. |
| `saveBackupSnapshot(label)` | Captures task/team/work-order/portfolio state and retains the five newest snapshots. |
| `restoreBackupSnapshot(index)` | Reconciles a selected snapshot into current configuration and reloads the page. |

### `js/io.js`

Owns movement of state into and out of the app.

| Symbol | Meaning |
|---|---|
| `_saveUndoSnapshot()` / `undoLastAction()` | One-level recovery for bulk replacement operations. |
| `_applyImportedState(data)` | Applies already-reviewed compatible state and refreshes the UI. |
| `exportJSON()` | Downloads a versioned full-workspace payload. |
| `exportCSV()` and portfolio/work-order variants | Downloads focused spreadsheet-friendly views. |
| `importJSON(inputEl)` | Reads a file, validates it, and opens review rather than overwriting immediately. |
| `copyStateToClipboard()` / `pasteStateFromClipboard()` | Manual device-to-device transfer using the same schema and review path. |
| `openImportReview(...)` | Shared human checkpoint for file, clipboard, and sync conflicts. |

### `js/normalize.js`

The trust boundary. Everything that enters from outside the UI forms — an imported file, pasted clipboard text, a Team Sync snapshot, a restored backup, or `localStorage` — is converted here into records the rest of the app can rely on: known enums, `#rrggbb` colors, safe ids, valid dates, finite numbers, http(s)-only links, and length-capped text.

| Symbol | Meaning |
|---|---|
| `sanitizeWorkspace(data, { knownDeptIds })` | Cleans the team, work orders, portfolio, and company name of an imported payload and reports `kept` / `dropped` / `repaired` counts per section. |
| `applySavedTasks(departments, saved, { fill })` | The single place saved task fields are merged onto config tasks (storage load, backup restore, and import all use it). |
| `normalizeWorkOrders`, `normalizePortfolio`, `normalizeTeam` | Per-collection sanitizers built from small declarative field specs. |
| `normalizeSavedTask`, `normalizeBlockedBy`, `normalizeCustomFields` | Task-level validation. |
| `normalizeAuditLog` | Validates stored audit entries. |

Free text (names, notes) legitimately contains characters like `<` and `"`, so normalizing is a safety net and **not** a substitute for escaping at render time. Views still escape every dynamic value and pass ids through `data-*` attributes; see the Security Conventions in `CONTRIBUTING.md`.

### `js/stateSchema.js`

The portable workspace contract. The browser and the Vitest suite import this same ES module.

| Symbol | Meaning |
|---|---|
| `STATE_SCHEMA_NAME` / `STATE_SCHEMA_VERSION` | Identifies compatible PM Ops Map payloads. |
| `buildStatePayload(...)` | Serializes supported task, team, work-order, and portfolio fields. |
| `validateImportedState(data, orgData)` | Reports matched/skipped departments and tasks, bad dates, and incompatible structure before application. |
| `formatImportReport(report)` | Converts validation results to readable text. |

### `js/utils.js`

Pure helpers for HTML escaping, JSON-in-attribute safety, date validation, due-date display, slugs/downloads, currency, lease and delinquency signals, safe external URLs, and CSV parsing/header mapping. The Vitest suite imports this file directly.

Security-relevant helpers include:

- `escapeHtml`: prevents user-controlled text from becoming markup;
- `jsonAttr`: safely embeds JSON values in generated attributes; and
- `isSafeUrl`: accepts only `http:` and `https:` external document links.

## Product and view modules

### `js/ui.js`

Cross-screen presentation and onboarding.

| Symbol | Meaning |
|---|---|
| `updateStats()` | Recalculates task totals, completion, ownership, overdue counts, and related global UI. |
| `updateBeacons()` / `updateWorkOrderBeacon()` | Shows navigation warnings for unowned responsibilities or unassigned open work. |
| `showOnboardingModal()` / `submitCompanyName()` | Captures and applies the initial company/profile setup. |
| `requestNotificationPermission()` / `checkOverdueNotifications()` | Provides same-browser-session overdue notifications after explicit permission. |

### `js/views/tracking.js`

The primary responsibility editor.

| Area | Important symbols |
|---|---|
| Rendering | `renderTrackingView`, `toggleDepartment`, `toggleExpandAllDepartments` |
| Editing | `startTaskEdit`, `setTaskOwner`, `cycleTaskStatus`, `cycleTaskPriority`, `setTaskDueDate` |
| Filtering | `debounceApplyFilter`, `applyFilter`, `clearFilter`, `populateOwnerFilter` |
| Bulk actions | `toggleBulkMode`, `selectAllVisibleTasks`, `applyBulkAction` |
| Dependencies | `openDependencyPicker`, `setTaskDependency`, `isDependencyBlocking` |
| Supporting detail | `openTaskNotes`, `openCustomFields`, `addCustomField`, `deleteCustomField` |

Task `blockedBy` values carry enough identity to locate another configured task. A dependency is a visual/operating signal; it is not a scheduling engine that automatically changes statuses.

### `js/views/map.js`

The no-library SVG organization map. `renderFlowMap` computes geometry and connections from live ownership. `showDeptPanel` exposes department detail, while `svgGroup`, `svgRect`, `svgText`, `svgCircle`, `svgLine`, and `svgPath` are small DOM construction helpers.

### `js/views/team.js`

The staffing and ownership module.

| Symbol | Meaning |
|---|---|
| `renderTeamView()` | Draws team cards, workload bars, templates, and controls. |
| `commitAddEmployee()` / `removeEmployee()` | Maintains the roster; removing someone returns their responsibilities to `UNOWNED`. |
| `toggleAffinity(empName, deptId)` | Marks an employee as a preferred candidate for a department. |
| `applyRoleTemplate(templateId, ...)` | Seeds common small-team shapes from `js/templates.js`. |
| `runAutoAssign()` | Assigns unowned tasks to affinity-matched, least-loaded employees, with full-team fallback. |
| `openRolePlaybook(ownerName)` | Builds a person-centered workload/status/blocker/work-order view. |
| `openAuditLog()` | Presents the persisted audit trail. |

### `js/views/workorders.js`

The maintenance pipeline. `renderWorkOrdersView` groups cards by status; `commitNewWorkOrder` handles both create and edit form submission; `advanceWorkOrder` follows the fixed status cycle; `deleteWorkOrder` removes after confirmation.

Work orders are operational records, not linked task instances. Advancing a work order does not automatically complete a responsibility in `orgData`.

### `js/views/recurring.js`

Preview-and-apply behavior for five built-in work-order templates. `applyPendingRecurringTemplate` creates normal work-order records tagged with template context.

### `js/views/portfolio.js`

Property, tenant, and vendor CRUD plus CSV import.

| Symbol | Meaning |
|---|---|
| `renderPortfolioView()` | Builds summary metrics, forms, imports, and cards. |
| `commitAddProperty/Tenant/Vendor()` | Creates or updates records after validation. |
| `recordTenantPayment(id)` | Reduces `balanceDue`, stamps the date, and audits the event. |
| `importProperties/Tenants/VendorsCSV()` | Maps tolerant headers, validates rows, and appends accepted records. |
| `renderDocLink(url)` | Renders only URLs accepted by `isSafeUrl`. |

This is a starter registry, not a full property-management database or accounting system.

### `js/launchPlan.js`

The derived operator-guidance layer. `renderLaunchPlan` composes profile-specific onboarding, next action, coverage, risks, a seven-day checklist, and data-quality signals from current state. `loadDemoCompany` applies realistic fictional data from templates. Export/print helpers turn the plan into an artifact.

### `js/templates.js`

Holds:

- `ROLE_TEMPLATES` for common staffing shapes;
- `SOP_TEMPLATES` used in generated handbooks; and
- `buildDemoWorkspace` for a time-relative fictional workspace.

### `js/handbook.js`

Transforms live state into a usable operating manual. `buildOperationsHandbookMarkdown` is the core generator; download and print functions wrap the content as Markdown, self-contained HTML, or a browser print view.

### `js/sync.js`

The optional client collaboration layer.

| Symbol | Meaning |
|---|---|
| `initSync()` | Restores a saved connection and starts polling. |
| `connectSync()` | Pulls an existing workspace or offers to create a missing one from local state. |
| `currentPayload()` / `currentSnapshot()` | Produces the canonical serializable workspace and comparison string. |
| `runSyncTick(manual)` | Chooses push vs remote version check based on local dirtiness. |
| `pushTick(...)` | Sends a version-guarded snapshot and handles `409`/`403`. |
| `handlePushConflict(...)` | Sends remote state through validation and human import review. |
| `pullIfNewerTick(...)` | Pulls only when remote version changed and local state remained clean during network calls. |

The passphrase is stored in the browser’s local storage as connection configuration. Treat the model as a trusted-team convenience, not high-assurance credential storage.

## Optional sync server

### `server/index.js`

Process entry point. Reads `PORT`, `DATA_DIR`, and comma-separated `ALLOWED_ORIGINS`, creates the Express app, and starts listening.

### `server/src/app.js`

Express app factory, separated for testability.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness response. |
| `POST /api/workspaces/:slug/pull` | Authenticate and return state, version, and update time. |
| `POST /api/workspaces/:slug/version` | Authenticate and return metadata without the full state. |
| `POST /api/workspaces/:slug/push` | Create or version-update a workspace. |

Global middleware limits JSON bodies to 3 MB, applies configured CORS, and rate-limits in memory. Domain errors are normalized to JSON.

### `server/src/store.js`

File-backed domain store.

| Symbol | Meaning |
|---|---|
| `HttpError` | Carries a safe HTTP status/message and optional conflict payload. |
| `isValidSlug(slug)` | Enforces 2–40 lowercase alphanumeric/hyphen workspace names with alphanumeric ends. |
| `hashPassphrase` / `verifyPassphrase` | Uses Node `scrypt` and timing-safe comparison. |
| `WorkspaceStore._withLock(slug, fn)` | Serializes writes to one workspace inside this process. |
| `pull` / `peekVersion` | Authenticated reads. |
| `push` | Validates payload size and expected version, claims new workspaces, or atomically advances the logical version. |

Writes use `fs.writeFileSync` to one JSON file per workspace. There is no cross-process lock or database transaction.

### `server/src/rateLimit.js`

Small in-memory IP/window rate limiter. Its counters reset when the process restarts and are not shared across instances.

## Data models at a glance

The code uses plain JavaScript objects rather than classes or a database schema.

```text
Department
  id, name, color, tasks[]

Task
  _configName, name, owner, status, priority,
  dueDate, blockedBy, notes, customFields

Employee
  name, hex, affinities[]

WorkOrder
  id, propertyId/property, unit, tenant, title, notes,
  priority, assignee, vendor, targetDate, estimatedCost,
  status, createdAt

Portfolio
  properties[]
  tenants[]
  vendors[]

AuditEntry
  ts, action, ...action-specific details

SyncWorkspaceRecord (server disk)
  salt, hash, state, version, updatedAt
```

The exact portfolio/work-order fields are assembled and normalized in their view modules; the project does not currently enforce them with TypeScript or a runtime schema library.

## Repeated implementation patterns

### Mutate → persist → audit → rerender

Most user actions update a shared object directly, persist its collection, optionally append an audit record, then refresh local and global UI. Missing one step can create stale screens or changes that disappear on reload.

### Escape at render boundaries

View modules construct substantial HTML strings. User-controlled text should pass through `escapeHtml`, attribute values through `jsonAttr`, and document links through `isSafeUrl`.

### Validate before replacement

File import, clipboard paste, and sync conflicts share `validateImportedState` and the import-review modal. Bulk state replacement should continue to use that path.

### Stable config identity

`_configName` preserves the task’s original configured name so visible renames do not break reload/import matching. A future schema would be stronger with explicit immutable task IDs in `config.json`.

### Tests import the shipped modules

Vitest runs native ES modules, so tests import `js/*.js` directly (with jsdom for `document` and `localStorage`). There are no CommonJS mirrors or test-only shims; the browser and the tests execute the same code. (An earlier setup kept hand-maintained `.cjs` copies for Jest; they had already drifted apart, which is why they were removed.)
