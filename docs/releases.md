# Delivery and release specification

## Current availability

As checked on 2026-11-19, the repository has no published GitHub releases or downloadable production ZIP assets.

- [Open the hosted app](https://hypnoticdata777.github.io/pm-ops-map/): primary entry for real browser-local workspaces.
- [Try the isolated demo](https://hypnoticdata777.github.io/pm-ops-map/?demo=1): fictional data; Team Sync disabled.
- Developer-built local copy: `npm ci` then `npm run build`; open `dist/index.html` in a compatible desktop browser with its assets intact.

GitHub's source archive is not a ready-to-open production package. Source code should be served over HTTP or built first. Browser data does not automatically transfer between the hosted site, another browser, or a local file. Use JSON export/import with the existing review flow, or explicitly configured Team Sync. On iPhone, the hosted URL is the intended entry; local app use through Files is unverified.

## Next implementation: tested release packaging

The following is a specification, not existing automation. This documentation change does not create a ZIP, publish a release, add reminders, or change runtime behavior.

### Proposed files and commands

- `scripts/package-release.mjs`: build/package a versioned production artifact.
- `.github/workflows/release.yml`: validate a version tag and prepare a draft release.
- A package script for release packaging, to be added with its implementation.
- Browser checks against the ZIP after extraction, not only against `dist/`.

Do not advertise these files or commands as available until implemented.

### Artifact contract

The proposed `pm-ops-map-vX.Y.Z.zip` contains the production `index.html` and required assets, license, version/commit metadata, concise start instructions, and browser-storage/backup guidance. Keep relative asset paths intact. Ship a checksum beside the ZIP. Do not include workspace data, node_modules, secrets, or development caches.

Choose the first published version explicitly; the current package version does not establish that a corresponding release exists. Version metadata, tag, release notes, and artifact naming must agree.

### Validation and publication gates

1. Validate the tagged commit, version agreement, generated glossary, strict type checking, unit tests, and browser tests.
2. Build once, package that output, extract the resulting ZIP into a clean temporary directory, and test the extracted application over desktop `file://`.
3. Verify startup, setup, glossary, responsibilities, work orders, reload, and JSON export/import recovery. Confirm required assets exist and offline paths do not require HTTP requests.
4. Create a draft GitHub release with the tested ZIP, checksum, source commit, release notes, and honest browser evidence.
5. Review the concrete artifacts and test report before publishing. Reruns must not silently overwrite an already published artifact.
6. After publication, verify the release asset can be downloaded and extracted. Then enable the README download link and record the version.

Hosted Pages deployment remains a separate path. Verify its deployed version and core startup behavior independently; a successful hosted deployment does not prove the downloadable artifact works.

## Recovery and feature boundaries

Automatic backups are five best-effort browser-local snapshots, not independent disaster recovery. Instructions should recommend exporting JSON to a separate location, locating the saved file, and verifying recovery through import review. Initiating a download is not proof that a durable backup was stored.

Recurring templates are manually applied batches, not a scheduler. Workload balancing counts responsibilities, not staff capacity. Recorded balances are operating context, not an accounting ledger. Assigning a vendor does not notify or dispatch them.

## Remaining work after documentation accuracy

- Implement packaging, extracted-ZIP tests, and draft-release automation.
- Add in-app backup explanation and a dismissible independent-export reminder without falsely claiming a successful backup.
- Complete physical iPhone Safari and broader browser validation; update [browser support](browser-support.md) from recorded evidence.
- Review and publish the first tested artifact before advertising a ZIP download.
