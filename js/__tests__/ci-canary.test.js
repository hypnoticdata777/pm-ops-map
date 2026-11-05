// The Nov 2026 CI outage: `ubuntu-latest` began resolving to Ubuntu 26.04, which the pinned Playwright cannot
// install a browser on, so every browser job went red on pull requests that had changed nothing relevant.
// Two guards came out of it, and this file pins both:
//  1. every job that installs a browser runs on a PINNED runner image, so the runner cannot change under us;
//  2. a weekly CI canary runs the browser suite on the UNPINNED runner and opens an issue when it fails, so the
//     next change is seen coming instead of arriving as a red check.
// The reporting is a shell script, so it is tested here with a stubbed `gh` (same approach as audit-report).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, test, expect, beforeEach } from 'vitest';
import YAML from 'yaml';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, '.github/scripts/report-canary-failure.sh');
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows');
const readWorkflow = file => YAML.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
const CANARY = readWorkflow('canary.yml');

let dir;
let log;

function installStubGh(options = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-report-'));
  log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash
echo "$*" | tr '\\n' ' ' >> "${log}"; echo >> "${log}"
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
      REPO: 'acme/pm-ops-map', RUN_URL: 'https://github.com/acme/pm-ops-map/actions/runs/456', FAILED_STEPS: 'npx playwright install --with-deps chromium',
      ...env,
    },
    encoding: 'utf8',
  });
}
const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n');

describe('report-canary-failure.sh', () => {
  beforeEach(() => installStubGh());

  test('opens a labelled issue that links the run and names the failed step', () => {
    run({ STUB_OPEN_ISSUE: '' });
    const all = calls();
    expect(all.some(c => c.startsWith('label create ci-canary'))).toBe(true);
    const create = all.find(c => c.startsWith('issue create'));
    expect(create).toBeTruthy();
    expect(create).toContain('--label ci-canary');
    expect(create).toContain('--repo acme/pm-ops-map');
    expect(create).toContain('https://github.com/acme/pm-ops-map/actions/runs/456');
    expect(create).toContain('npx playwright install --with-deps chromium');
  });

  test('the issue says what the failure does and does not mean, and how to confirm the fix', () => {
    run({ STUB_OPEN_ISSUE: '' });
    const create = calls().find(c => c.startsWith('issue create'));
    expect(create).toContain('does **not** mean pull requests are failing today');
    expect(create).toContain('Playwright does not support chromium on ubuntu26.04-x64'); // the incident, as the example cause
    expect(create).toContain('simulate_failure');
  });

  test('comments on the open issue instead of opening a duplicate', () => {
    run({ STUB_OPEN_ISSUE: '7' });
    const all = calls();
    expect(all.some(c => c.startsWith('issue create'))).toBe(false);
    expect(all.find(c => c.startsWith('issue comment 7'))).toContain('actions/runs/456');
  });

  test('an already-existing label is not an error', () => {
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

  test('the script is executable and does not touch the audit label', () => {
    expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
    expect(fs.readFileSync(SCRIPT, 'utf8')).not.toContain('dependency-audit');
  });
});

describe('canary workflow wiring', () => {
  test('runs on a schedule and can be started by hand', () => {
    expect(CANARY.on.schedule).toHaveLength(1);
    expect(CANARY.on.workflow_dispatch).toBeTruthy();
  });

  test('runs the real browser suite on the UNPINNED runner, on purpose', () => {
    expect(CANARY.jobs.canary['runs-on']).toBe('ubuntu-latest');
    const steps = JSON.stringify(CANARY.jobs.canary.steps);
    expect(steps).toContain('playwright install --with-deps chromium');
    expect(steps).toContain('npm run test:e2e');
  });

  test('the canary job is read-only; only the report job may write issues', () => {
    expect(CANARY.permissions).toEqual({ contents: 'read' });
    const report = CANARY.jobs.report;
    expect(report.needs).toBe('canary');
    expect(String(report.if)).toMatch(/failure/);
    expect(report.permissions).toEqual({ contents: 'read', issues: 'write', actions: 'read' });
    const text = JSON.stringify(report.steps);
    expect(text).toContain('report-canary-failure.sh');
    expect(text).toContain('RUN_URL');
    expect(text).toContain('FAILED_STEPS');
  });

  test('can be run by hand with a simulated failure to prove the reporting works', () => {
    expect(CANARY.on.workflow_dispatch.inputs.simulate_failure.type).toBe('boolean');
    expect(JSON.stringify(CANARY.jobs.canary.steps)).toContain('simulate_failure');
  });
});

describe('the pin the canary exists to watch', () => {
  const browserJobs = fs.readdirSync(WORKFLOWS_DIR).filter(f => /\.ya?ml$/.test(f)).flatMap(file => {
    const workflow = readWorkflow(file);
    return Object.entries(workflow.jobs || {})
      .filter(([, job]) => JSON.stringify(job.steps || []).includes('playwright install'))
      .map(([name, job]) => ({ file, name, runsOn: job['runs-on'] }));
  });

  test('the repository has browser jobs to check (the scan itself is not empty)', () => {
    expect(browserJobs.map(j => `${j.file}:${j.name}`).sort()).toEqual(['canary.yml:canary', 'ci.yml:e2e', 'pages.yml:build']);
  });

  test.each(browserJobs.filter(j => j.file !== 'canary.yml'))('$file "$name" runs on a pinned runner image, not a moving -latest label', ({ runsOn }) => {
    expect(runsOn).toMatch(/^ubuntu-\d+\.\d+$/);
  });
});
