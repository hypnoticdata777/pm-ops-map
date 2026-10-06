# Changelog

## [Unreleased]

### Security
- **Fixed stored XSS through imported or synced data.** A crafted JSON import, clipboard paste, or Team Sync snapshot could run script: record ids were placed inside inline `onclick` handlers, and `jsonAttr()` did not escape `&`, so an entity such as `&quot;` in an employee name ended the JS string. Ids and names now travel in `data-*` attributes, `jsonAttr()` escapes the whole literal, and every path that loads outside data (import, clipboard, sync, backup restore, `localStorage`) goes through the new `js/normalize.js` sanitizers (known enums, `#rrggbb` colors, safe ids, valid dates and numbers, http(s)-only links, length caps). The import review reports how many records will be repaired or skipped before anything is applied.
- **Fixed CSV formula injection.** Exported cells beginning with `=`, `+`, `-`, or `@` could run as formulas in Excel or Sheets. They now get a leading apostrophe (reversed on import, so the round trip is lossless). CSV and JSON imports are also size-limited (5 MB) and sanitized.
- Team Sync warns before connecting to a plain `http://` server that isn't `localhost`.
- Server: `npm audit fix` clears a critical advisory in `proxy-addr` (a production dependency of Express); the sync server's Docker image moves from Node 20 (end-of-life) to Node 22.

### Fixed
- Per-task **notes and custom fields** are now part of the portable workspace (schema v3): they were missing from JSON export, Copy State, and Team Sync, and were not restored from backups. Version 2 files still import.
- **Reset now deletes automatic backups** (full workspace copies, tenant records included) with "Operating workspace" and "Everything"; its confirmation says what a reset does not touch. Team Sync is stopped first so it cannot re-save the passphrase.
- Risk Queue grammar: "Compliance **needs** clearer ownership" when exactly one lane is weak (was "need"). The demo's team card now says "fictional people" instead of "real people".
- Task rows no longer squeeze the task name under the status pill when a task has a due date, a dependency, and notes.
- Work orders without a timestamp no longer display the text "Invalid Date".

### Added
- **Permanent task ids.** Every starter task in `config.json` now has an id such as `maintenance-014`, assigned once by `npm run ids:assign` (it only adds missing ids, never changes one). Saved progress, imports, backups, undo and task dependencies match by id first, then by starter name, then by a task's `aliases` (former names), so rewording a task in `config.json` no longer orphans anyone's progress. A task whose name you never edited follows the new wording; one you renamed keeps your name. Export schema is now **v4** (adds `id` per task and `taskId` on dependencies); v2 and v3 files still import.
- **Live demo** at `?demo=1`: a fictional company with gaps, an overloaded teammate, blocked work, and work orders in every stage, with a permanent "Fictional data only" banner, one-click reset, isolated storage (`pm-ops-demo-*` keys), and Team Sync disabled. Deployed to GitHub Pages by `.github/workflows/pages.yml` after the production build passes its own browser tests.
- **In-product privacy messaging**: a Portfolio notice, a *Data & Privacy* dialog, a first-run note, a once-per-session confirmation before exporting resident data, and honest *Beta · trusted-team sync* labelling for Team Sync.
- Playwright browser suite (security fuzzing, CSV, data safety, privacy, demo, layout, smoke, and built-site tests) running in CI; Dependabot and a weekly production-dependency audit.

### Changed
- Tests now import the shipped ES modules directly (Vitest + jsdom). The hand-maintained `.cjs` copies, which had already drifted apart, and the `js/data.js` shim are gone.
- Development tooling requires **Node.js 22.12+** (Node 20 reached end-of-life). The app itself still only needs a browser.

## [1.0.0] - 2026-07-17

### Changed
- Renamed the project and repository from `paragon-ops-map` to `pm-ops-map`
- Removed internal references to the original single-company prototype this tool was built from — including real employee names and company branding in the starter config, docs, and git history
- Reframed as a general-purpose, open-source PMC (property management coordination) tool for any property management team, not a specific company's internal tool
