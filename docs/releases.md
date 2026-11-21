# Delivery and release packaging

## Current availability

The hosted application is the primary entry point. A public release ZIP is not advertised until a maintainer publishes and verifies an actual release asset. Implementing this pipeline does not create a tag or publish a release.

- [Open the hosted app](https://hypnoticdata777.github.io/pm-ops-map/): browser-local real workspace.
- [Try the isolated demo](https://hypnoticdata777.github.io/pm-ops-map/?demo=1): fictional data; Team Sync disabled.
- Build locally: `npm ci` then `npm run build`; open `dist/index.html` in a current compatible desktop browser with its assets intact.

GitHub's source archive is not the production package. Source should be served over HTTP or built first. Hosted, downloaded, and other-browser workspaces do not transfer automatically: export/import JSON through the review flow, or explicitly configure optional Team Sync. On iPhone, use the hosted URL; local app delivery through Files and physical Safari compatibility remain unverified.

## Prepare and verify a local candidate

Tooling requires Node.js 22.12+ and the `zip` / `unzip` command-line utilities (available on the pinned Ubuntu CI runner; macOS or Windows/WSL users must provide compatible utilities). The packaged application itself only needs a compatible browser.

```bash
npm ci
npm run glossary:check
npm run typecheck
npm test
npm run test:release:unit
npx playwright install chromium
npm run release:package
npm run test:release
```

`release:package` builds once, then packages that production output. `test:release` verifies the checksum, ZIP structure and per-file manifest, extracts to a fresh OS temporary directory, tests THAT copy over `file://`, then records verification bound to the ZIP and browser-report digests. It never tests `dist/` as a substitute for the archive.

Generated files are under ignored `release/`:

- `pm-ops-map-vX.Y.Z.zip` and its `.zip.sha256` sidecar.
- `release.json`: the same version/commit/file manifest included in the archive.
- `test-report.json` and `verification.json`: Chromium results and checksum-bound evidence.
- `RELEASE-NOTES.md`: draft notes and known limitations.

A local working tree may be dirty; its candidate is explicitly labelled `sourceDirty: true` and cannot be turned into a release by the draft script. Repackaging invalidates previous test evidence. Run `test:release` again after each new package.

To verify downloaded ZIP bytes, run from the folder containing the ZIP and checksum:

```bash
sha256sum -c pm-ops-map-vX.Y.Z.zip.sha256
# macOS alternative:
shasum -a 256 -c pm-ops-map-vX.Y.Z.zip.sha256
```

Replace X.Y.Z with the chosen version. A checksum detects mismatch against the sidecar; it is not a digital signature.

## Artifact contract

The ZIP uses an explicit allowlist of production assets and includes `index.html`, its asset folders, public seed configuration, license, `START-HERE.txt`, and `release.json`. Development folders, browser workspace data, caches, and arbitrary extra `dist/` files are not swept into the archive. New production asset paths require an intentional allowlist update.

The metadata records package version, existing release tag (or null for a candidate), source commit, dirty state, build time, and SHA-256 digests of packaged content. The outer checksum covers the entire ZIP, including metadata. Verification rejects unknown/duplicate paths, symlink entries, encrypted or unsupported archives, oversized expansion, checksum mismatch, and file-manifest mismatch before browser tests proceed.

## CI validation and draft preparation

`.github/workflows/release.yml` validates relevant pull requests, pushed `v*` tags, and manual runs naming an existing tag. Ordinary PR validation only uploads reviewable candidate artifacts; it cannot create a GitHub release.

For tag/manual release runs:

1. Require a stable `vMAJOR.MINOR.PATCH` tag that matches `package.json` and both root lockfile versions, resolves to the checked-out commit, and has a clean working tree.
2. Run glossary, type, app unit, release-tool unit, and source browser checks on pinned Ubuntu 24.04.
3. Build and package once; run extracted-ZIP browser checks with no default HTTP requests.
4. Upload the exact tested candidate, manifest, checksum, report, verification, and notes as an Actions artifact. The Actions download is a wrapper ZIP containing the actual application ZIP; extract the inner application ZIP for use.
5. A separate dependent job downloads that artifact by ID and checks its proof. Only this job has release-write permission. It verifies the remote tag still resolves to the tested source commit.
6. Create a **draft** release using `--verify-tag --draft`, attaching the existing tested ZIP, checksum, metadata, and verification. The write job does not rebuild the application.

The script never publishes, edits, deletes, or clobbers an existing release. If the tag already has a draft or published release, reruns stop and leave it untouched. Inspect existing drafts and failed-run evidence manually rather than assuming a rerun replaced their assets.

## Starting a draft after review

First merge the implementation and review the package/lock version. No first release version was selected or tag pushed by this implementation. The current package version alone does not prove that a public release exists.

Once the version and commit are chosen, a maintainer can create and push the matching tag to start validation. Alternatively, when an existing matching tag has no release yet:

```bash
gh workflow run release.yml --repo hypnoticdata777/pm-ops-map -f tag=vX.Y.Z
```

This command is an example: use an actual existing matching tag. Do not create a tag merely to retry an unrelated failed CI run.

## Publication gate

Review the draft assets, version/source identity, checksums, extracted-app test report, release notes, and browser limits. Publication remains an explicit maintainer action after that review. No workflow step marks the release public.

After publication, download and extract the public release asset, verify it again, then enable the README download link and record the version. The current implementation keeps the missing-download notice until that gate is satisfied.

Hosted Pages deployment is independent. Verify its deployed version and startup separately; passing hosted tests does not establish downloadable-artifact correctness.

## Recovery and remaining work

Five best-effort browser-local snapshots are not off-device backup. Export JSON separately, locate the saved file, and verify recovery through import review. Initiating a download is not proof that a durable backup was stored.

Recurring templates remain manual batches; workload counts tasks, not capacity; balances are operating context, not a ledger; assigning a vendor does not dispatch them. This packaging change adds none of those services.

Later steps remain: in-app backup explanation/export reminder; physical iPhone Safari and broader browser checks; and review/publication of a first tested asset. See [browser validation status](browser-support.md).
