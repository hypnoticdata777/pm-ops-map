// The weekly Dependency audit used to fail silently (a red run nobody opened). On failure it now
// opens - or updates - a GitHub issue. The logic is a shell script so it can be tested here with
// a stubbed `gh`; the workflow only wires it up, and the second half of this file pins that wiring.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, test, expect, beforeEach } from 'vitest';
import YAML from 'yaml';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, '.github/scripts/report-audit-failure.sh');
const WORKFLOW = YAML.parse(fs.readFileSync(path.join(ROOT, '.github/workflows/audit.yml'), 'utf8'));

let dir;
let log;

// A fake `gh` that records every call and answers `issue list` from STUB_OPEN_ISSUE.
function installStubGh(options = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-report-'));
  log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash
echo "$*" | tr '\n' ' ' >> "${log}"; echo >> "${log}"
if [ "$1 $2" = "issue list" ]; then echo "$STUB_OPEN_ISSUE"; fi
if [ "$1 $2" = "label create" ] && [ -n "$STUB_LABEL_FAILS" ]; then echo "already exists" >&2; exit 1; fi
${options.failOnCreate ? 'if [ "$1 $2" = "issue create" ]; then exit 1; fi' : ''}
exit 0
`, { mode: 0o755 });
}

function run(env = {}) {
  return execFileSync('bash', [SCRIPT], {
    env: {
      PATH: `${dir}:${process.env.PATH}`, HOME: dir,
      REPO: 'acme/pm-ops-map', RUN_URL: 'https://github.com/acme/pm-ops-map/actions/runs/123', FAILED_JOBS: 'audit (.), audit (server)',
      ...env,
    },
    encoding: 'utf8',
  });
}
const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n');

describe('report-audit-failure.sh', () => {
  beforeEach(() => installStubGh());

  test('opens a new labelled issue that links to the failed run when none is open', () => {
    run({ STUB_OPEN_ISSUE: '' });
    const all = calls();
    expect(all.some(c => c.startsWith('label create dependency-audit'))).toBe(true);
    const create = all.find(c => c.startsWith('issue create'));
    expect(create).toBeTruthy();
    expect(create).toContain('--label dependency-audit');
    expect(create).toContain('--repo acme/pm-ops-map');
    expect(create).toContain('https://github.com/acme/pm-ops-map/actions/runs/123');
    expect(all.some(c => c.startsWith('issue comment'))).toBe(false);
  });

  test('comments on the existing open issue instead of opening a duplicate', () => {
    run({ STUB_OPEN_ISSUE: '42' });
    const all = calls();
    expect(all.some(c => c.startsWith('issue create'))).toBe(false);
    const comment = all.find(c => c.startsWith('issue comment 42'));
    expect(comment).toBeTruthy();
    expect(comment).toContain('https://github.com/acme/pm-ops-map/actions/runs/123');
  });

  test('the issue body names which audit jobs failed and how to reproduce it', () => {
    run({ STUB_OPEN_ISSUE: '', FAILED_JOBS: 'audit (server)' });
    const create = calls().find(c => c.startsWith('issue create'));
    expect(create).toContain('audit (server)');
    expect(create).toContain('npm audit --package-lock-only --omit=dev --audit-level=moderate');
  });

  test('an already-existing label is not an error', () => {
    installStubGh();
    expect(() => run({ STUB_OPEN_ISSUE: '', STUB_LABEL_FAILS: '1' })).not.toThrow();
    expect(calls().some(c => c.startsWith('issue create'))).toBe(true);
  });

  test('if the issue cannot be created the script fails loudly (the run stays red)', () => {
    installStubGh({ failOnCreate: true });
    expect(() => run({ STUB_OPEN_ISSUE: '' })).toThrow();
  });

  test('missing inputs are an error, not a silent no-op', () => {
    expect(() => run({ RUN_URL: '' })).toThrow();
    expect(() => run({ REPO: '' })).toThrow();
  });
});

describe('audit workflow wiring', () => {
  test('the audit job keeps read-only permissions', () => {
    expect(WORKFLOW.permissions).toEqual({ contents: 'read' });
  });

  test('a separate report job runs only when an audit job failed, with just enough permission', () => {
    const report = WORKFLOW.jobs.report;
    expect(report).toBeTruthy();
    expect(report.needs).toBe('audit');
    expect(String(report.if)).toMatch(/failure/);
    expect(report.permissions).toEqual({ contents: 'read', issues: 'write', actions: 'read' }); // actions: read lets it name the failed jobs
    const steps = JSON.stringify(report.steps);
    expect(steps).toContain('report-audit-failure.sh');
  });

  test('the report job tells the script which jobs failed, from the audit job results', () => {
    const run = JSON.stringify(WORKFLOW.jobs.report.steps);
    expect(run).toContain('RUN_URL');
    expect(run).toContain('FAILED_JOBS');
  });

  test('the audit can be triggered by hand with a simulated failure to prove the reporting works', () => {
    const input = WORKFLOW.on.workflow_dispatch.inputs.simulate_failure;
    expect(input.type).toBe('boolean');
    expect(JSON.stringify(WORKFLOW.jobs.audit.steps)).toContain('simulate_failure');
  });
});
