#!/usr/bin/env bash
# Called by the "report" job of .github/workflows/canary.yml when the weekly CI canary fails. The canary
# runs the browser suite on the unpinned runner, so a failure here means "pull requests are fine today, but
# the next runner or tooling change will break them". A red scheduled run is easy to miss, so this opens a
# GitHub issue (or adds a comment to the one already open).
#
# Inputs (environment): REPO (owner/name), RUN_URL (link to the failed run),
#                       FAILED_STEPS (optional, e.g. "npx playwright install --with-deps chromium"), GH_TOKEN (for gh).
set -euo pipefail

: "${REPO:?REPO is required (owner/name)}"
: "${RUN_URL:?RUN_URL is required (link to the failed run)}"
FAILED_STEPS="${FAILED_STEPS:-see the run for details}"
LABEL="ci-canary"

# The label may already exist; that is fine.
gh label create "$LABEL" --repo "$REPO" --color FBCA04 \
  --description "The weekly CI canary (unpinned runner) failed" >/dev/null 2>&1 || true

existing="$(gh issue list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[0].number // empty')"

if [ -n "$existing" ]; then
  gh issue comment "$existing" --repo "$REPO" \
    --body "The CI canary failed again: ${RUN_URL} (${FAILED_STEPS})."
  exit 0
fi

body="The weekly CI canary failed. It runs the browser suite on the **unpinned** runner (\`ubuntu-latest\`), so this does **not** mean pull requests are failing today: \`ci.yml\` and \`pages.yml\` run their browser jobs on a pinned image. It means the next change to \`ubuntu-latest\` (or to the tooling) will break them, and this is the time to deal with it.

- Failed step: ${FAILED_STEPS}
- Run: ${RUN_URL}

**Usual causes**

- The runner image moved and the pinned Playwright cannot install a browser on it (the Nov 2026 failure: \`Playwright does not support chromium on ubuntu26.04-x64\`). Upgrade Playwright in its own change, run the browser suites, then move the pin in \`.github/workflows/ci.yml\` and \`pages.yml\`.
- An action runtime is being retired (the run's annotations say so). Check the open Dependabot pull requests for the action named in the annotation.
- A test failed on the new image. Read the log: if it is a real difference in the browser, fix or record it before the pin moves.

**Before closing:** run this workflow again by hand (Actions > CI canary > Run workflow) and confirm it is green. Tick \`simulate_failure\` instead to check that this issue is still created.

Close this issue once the canary is green again."

gh issue create --repo "$REPO" --label "$LABEL" \
  --title "CI canary failed: the unpinned runner no longer works with our tooling" --body "$body"
