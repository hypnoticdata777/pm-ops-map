#!/usr/bin/env bash
# Called by the "report" job of .github/workflows/audit.yml when the weekly dependency audit
# fails. A red run in the Actions tab is easy to miss, so this opens a GitHub issue (or adds a
# comment to the one that is already open) so the failure reaches the notifications you read.
#
# Inputs (environment): REPO (owner/name), RUN_URL (link to the failed run),
#                       FAILED_JOBS (optional, e.g. "audit (server)"), GH_TOKEN (for gh).
set -euo pipefail

: "${REPO:?REPO is required (owner/name)}"
: "${RUN_URL:?RUN_URL is required (link to the failed run)}"
FAILED_JOBS="${FAILED_JOBS:-see the run for details}"
LABEL="dependency-audit"

# The label may already exist; that is fine.
gh label create "$LABEL" --repo "$REPO" --color B60205 \
  --description "A scheduled dependency audit failed" >/dev/null 2>&1 || true

existing="$(gh issue list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[0].number // empty')"

if [ -n "$existing" ]; then
  gh issue comment "$existing" --repo "$REPO" \
    --body "The dependency audit failed again: ${RUN_URL} (${FAILED_JOBS})."
  exit 0
fi

body="The weekly dependency audit found a known vulnerability in a production dependency.

- Failed: ${FAILED_JOBS}
- Run: ${RUN_URL}

**Reproduce** (in the folder that failed: the repo root or \`server/\`):

\`\`\`
npm audit --package-lock-only --omit=dev --audit-level=moderate
\`\`\`

**Usually fixed by** \`npm audit fix\` in that folder, which only changes the lockfile. If the fix needs a major version bump, review it separately. Dependabot security updates may already have opened a pull request for it.

Close this issue once the audit is green again."

gh issue create --repo "$REPO" --label "$LABEL" \
  --title "Weekly dependency audit failed" --body "$body"
