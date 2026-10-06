# Contributing to PM Ops Map

Thanks for your interest in contributing. PM Ops Map is built to be simple — the goal is to keep it that way while making it more useful for real property management companies.

## Ways to Contribute

### 1. Share Your Department Templates
If you've customized `config.json` for your company and built something useful — a new department, a better task breakdown, or a department specific to HOA or commercial PM — open a PR. Other companies benefit directly.

### 2. Report Issues
Found a bug or something that doesn't work in your browser? [Open an issue](https://github.com/hypnoticdata777/pm-ops-map/issues) with:
- What you expected to happen
- What actually happened
- Browser and OS

### 3. Submit a Feature
Before building something large, open an issue first to discuss it. The core app is intentionally simple — features that require an account/login to use the app itself, or break the "open index.html and it works" zero-setup experience, won't be merged into the client.

The one exception is `server/` — an optional, self-hosted sync server (see `server/README.md`) that lets a team share one workspace live instead of copy/pasting state between devices. It's a separate, independently deployable package with its own `package.json`, tests, and Docker setup. The main app must keep working with zero backend if you never touch it; changes to `server/` should keep that same "no accounts, just a workspace name and a passphrase" simplicity rather than growing into full user management.

Features that are welcome:
- New visualization options that work with the existing SVG engine
- Better mobile UX
- Drag-and-drop reordering
- Undo/redo
- Due dates and priority levels on tasks
- Audit trail / change log
- Improvements to the optional sync server (conflict handling, storage backends, deployment docs) that don't compromise its zero-account simplicity

## Getting Started Locally

```bash
git clone https://github.com/hypnoticdata777/pm-ops-map.git
cd pm-ops-map

# Option A — no build step (quickest)
python -m http.server 8000

# then open http://localhost:8000

# Option B — dev server with live reload
# Requires Node.js 22.12 or newer
npm install
npm start       # runs at localhost:8080
```

To work on the optional sync server:

```bash
cd server
npm install
npm start       # listens on :4000 — see server/README.md
```

## Project Structure

```
pm-ops-map/
├── config.json         Starter departments, tasks, owners, colors, and affinities
├── index.html          Main layout, modals, navigation, and inline handlers
├── css/style.css       Application styles
├── js/
│   ├── app.js          Browser entry point and window handler registration
│   ├── state.js        Shared in-memory state and constants
│   ├── storage.js      localStorage, profile, audit, and reset helpers
│   ├── io.js           JSON/CSV export, import, clipboard sync, and undo
│   ├── sync.js         Optional team sync client — talks to server/
│   ├── launchPlan.js   Beginner setup dashboard and readiness checks
│   ├── handbook.js     Markdown handbook export
│   ├── normalize.js    Sanitizers for every path that loads outside data
│   ├── taskIdentity.js Permanent task ids: stamping at boot and matching saved rows to tasks
│   ├── privacy.js      Data-handling guidance and export confirmations
│   ├── demoMode.js     ?demo=1 detection and storage-key namespacing
│   ├── demo.js         Hosted demo: seeding, banner, reset
│   ├── showcase.js     The fictional workspace the demo loads
│   ├── views/          Tracking, map, team, portfolio, and work order screens
│   └── __tests__/      Vitest unit tests — they import the shipped ES modules directly
├── scripts/            Maintenance scripts (assign-task-ids.mjs)
├── e2e/                Playwright browser tests (security regression suite)
└── server/             Optional sync server — separate package.json, own deps, own tests
```

Starter operating data lives in `config.json`. Runtime state is loaded by `app.js`, kept in `state.js`, and persisted by `storage.js`. Feature rendering lives in the relevant `js/views/` module.

## Editing `config.json` tasks

Every task has a permanent `id` (`<department>-<NNN>`, e.g. `maintenance-014`). Saved data, imports and backups find a task by that id, so its visible `name` is free to change.

- **Adding a task:** write `{ "name": "…", "owner": "UNOWNED" }` on its own line, then run `npm run ids:assign`. It adds ids to tasks that lack one and never changes an existing id. A test fails if any task has no id or two share one.
- **Rewording a task:** change `name` only — never the `id`. Also list the old wording in `"aliases": ["old name"]` so data saved *before ids existed* (and old exports) still finds the task. Data saved since ids shipped follows the id on its own.
- **Moving a task to another department:** keep its `id`; progress follows it.
- **Removing a task:** delete the line. Do not reuse its id for a different task.
- Keep each task on a single line; the id script refuses a layout it can't edit safely.

## Security Conventions

PM Ops Map renders data it did not create — imported JSON, pasted clipboard text, Team Sync snapshots, restored backups — so every contribution follows these rules:

1. **Never put user data inside JavaScript source in an inline handler.** Pass it through a `data-*` attribute and read it from the element:
   ```js
   // Good
   `<button data-id="${escapeHtml(wo.id)}" onclick="deleteWorkOrder(this.dataset.id)">`
   // Bad — an id containing a quote runs attacker-controlled script
   `<button onclick="deleteWorkOrder('${wo.id}')">`
   ```
2. **Escape every dynamic value** that goes into HTML with `escapeHtml()` — text, attributes, and `title`/`aria-label` alike. Numbers should go through `Number()`.
3. **Class names and `data-*` values must come from a known list.** Use `asStatus()` / `asPriority()` / `asHex()` from `js/state.js` rather than interpolating the raw value.
4. **Links:** only store and render `normalizeUrl(url)` (http/https only).
5. **Anything that loads outside data goes through `js/normalize.js`** (`sanitizeWorkspace`, `applySavedTasks`, `normalizeAuditLog`, …). Don't assign imported objects straight into shared state.
6. **Exported CSV cells** must go through the CSV helpers so spreadsheet formulas are neutralized.
7. **Storage keys** are defined once, in `js/storage.js`, through `namespacedKey()` (see `js/demoMode.js`). Never write a literal `'pm-ops-…'` key anywhere else: the hosted demo relies on every key being namespaced so it can't touch a real workspace, and a test fails if a literal key appears outside those two files.
8. **Exports** should call `confirmSensitiveExport()` before writing a file that can contain tenant information and `announceExport()` afterwards (see `js/privacy.js`); don't add a new export path that skips them.

`npm run test:e2e:pages` builds `dist/` and runs the smoke and demo suites against the production bundle served under a `/pm-ops-map/` sub-path and from `file://` — run it when you change the build, asset paths, or `index.html`'s script tags.

`npm run test:e2e` runs a browser suite (`e2e/security-xss.spec.js`) that injects a canary payload into every importable field and fails if any view turns it into markup or script. If you add a field or a view, extend `e2e/helpers/security.js`.

## Dependency Updates

Dependabot opens weekly update PRs (`.github/dependabot.yml`): minor and patch bumps are grouped, every major bump is its own PR, and the sync server's production dependencies (Express, cors) are grouped apart from test tooling. CI audits production dependencies of both packages on every push, and `.github/workflows/audit.yml` repeats that weekly so a newly published advisory fails loudly even when nobody is pushing. When a Dependabot PR is green, merge it; when it is a major bump, read the changelog first.

The client (`index.html`, `js/`, `css/`) has no runtime npm dependencies and should keep it — everything in the root `package.json` is test or build tooling.

## Pull Request Guidelines

- Keep PRs focused — one change per PR
- If you're editing `config.json`, make sure the data structure matches the existing schema exactly
- If you're editing an HTML-called handler, update both `index.html` and the `Object.assign(window, ...)` block in `js/app.js`
- If you're editing a view, keep changes in the relevant `js/views/` module when possible
- No new runtime dependencies in the client app (`index.html`, `js/`, `css/`) — it should keep working as browser-native HTML, CSS, and JavaScript with zero installs. `server/` is a separate package and may have its own minimal dependencies.
- Run `npm test` before submitting — tests must pass. If you touched rendering, import/export, or storage code, also run `npm run test:e2e` (one-time setup: `npx playwright install chromium`). If you touched `server/`, also run `npm test` inside `server/`.
- Test the real modules: import from `js/*.js` in your tests. Don't add `.cjs` mirrors or test-only copies of browser code.

## Code Style

- Vanilla JS only — no frameworks, no build-time dependencies in runtime code
- 2-space indentation
- Descriptive variable names over comments
- Functions should do one thing

## License

By contributing, you agree your changes will be licensed under the [MIT License](LICENSE.txt).
