// Keeps the automation around the code honest: dependency updates, CI gates, and the
// server image. These checks fail when someone adds a package or Dockerfile that
// Dependabot would not see, removes an audit gate, or lets a base image go end-of-life.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { parse } from 'yaml';

const root = process.cwd(); // Vitest runs from the repo root
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const yaml = rel => parse(read(rel));

// Every directory (outside node_modules/.git) that has a file with this name.
function dirsContaining(fileName, accept = () => true) {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', 'coverage', 'test-results', 'playwright-report'].includes(entry.name)) continue;
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name === fileName && accept(rel)) found.push(`/${dir === '.' ? '' : dir}`.replace(/\/$/, '') || '/');
    }
  };
  walk('.');
  return found;
}

const dependabot = yaml('.github/dependabot.yml');
const covered = ecosystem => dependabot.updates.filter(u => u['package-ecosystem'] === ecosystem).map(u => u.directory);

describe('Dependabot', () => {
  test('is a version 2 config with a schedule on every entry', () => {
    expect(dependabot.version).toBe(2);
    dependabot.updates.forEach(update => expect(update.schedule?.interval, update['package-ecosystem']).toBeTruthy());
  });

  test('covers every npm package that has dependencies', () => {
    const withDeps = dirsContaining('package.json', rel => {
      const pkg = JSON.parse(read(rel));
      return Boolean(Object.keys(pkg.dependencies || {}).length || Object.keys(pkg.devDependencies || {}).length);
    });
    expect(withDeps.length).toBeGreaterThanOrEqual(2); // root + server
    withDeps.forEach(dir => expect(covered('npm'), `npm package at ${dir}`).toContain(dir));
  });

  test('covers GitHub Actions and every Dockerfile', () => {
    expect(covered('github-actions')).toContain('/');
    dirsContaining('Dockerfile').forEach(dir => expect(covered('docker'), `Dockerfile at ${dir}`).toContain(dir));
  });

  test('keeps the sync server\'s production dependencies in their own group', () => {
    const server = dependabot.updates.find(u => u['package-ecosystem'] === 'npm' && u.directory === '/server');
    const groups = Object.values(server.groups);
    expect(groups.some(g => g['dependency-type'] === 'production')).toBe(true);
    expect(groups.some(g => g['dependency-type'] === 'development')).toBe(true);
  });

  test('major updates are not grouped (each gets its own PR)', () => {
    dependabot.updates.forEach(update => {
      Object.values(update.groups || {}).forEach(group => {
        expect(group['update-types'], JSON.stringify(group)).not.toContain('major');
      });
    });
  });
});

describe('CI gates', () => {
  const ci = yaml('.github/workflows/ci.yml');
  const runs = job => (ci.jobs[job].steps || []).map(s => s.run).filter(Boolean);

  test('has app, browser, and sync-server jobs', () => {
    expect(Object.keys(ci.jobs)).toEqual(expect.arrayContaining(['test', 'e2e', 'test-sync-server']));
  });

  test('audits production dependencies of both packages', () => {
    expect(runs('test').join('\n')).toMatch(/npm audit .*--omit=dev/);
    expect(runs('test-sync-server').join('\n')).toMatch(/npm audit .*--omit=dev/);
  });

  test('runs the unit tests, build, and browser suite', () => {
    expect(runs('test')).toEqual(expect.arrayContaining(['npm test', 'npm run build']));
    expect(runs('e2e').join('\n')).toMatch(/npm run test:e2e/);
  });

  test('grants only read access by default', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
  });
});

describe('scheduled audit', () => {
  const audit = yaml('.github/workflows/audit.yml');

  test('runs weekly and on demand, with read-only permissions', () => {
    expect(audit.on.schedule[0].cron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
    expect(audit.on).toHaveProperty('workflow_dispatch');
    expect(audit.permissions).toEqual({ contents: 'read' });
  });

  test('audits production dependencies of the app and the server', () => {
    expect(audit.jobs.audit.strategy.matrix.dir).toEqual(['.', 'server']);
    expect(audit.jobs.audit.steps.map(s => s.run).filter(Boolean).join('\n')).toMatch(/npm audit .*--omit=dev/);
  });
});

describe('sync server image', () => {
  test('builds from a supported Node LTS (22 or newer; Node 20 is end-of-life)', () => {
    const from = read('server/Dockerfile').match(/^FROM\s+node:(\d+)/m);
    expect(from, 'Dockerfile should start from an official node image').not.toBeNull();
    expect(Number(from[1])).toBeGreaterThanOrEqual(22);
  });
});

describe('toolchain declarations agree', () => {
  test('CI uses the same Node major the root package requires or newer', () => {
    const ci = yaml('.github/workflows/ci.yml');
    const required = Number(JSON.parse(read('package.json')).engines.node.match(/(\d+)/)[1]);
    Object.values(ci.jobs).forEach(job => {
      (job.steps || []).filter(s => s.uses?.startsWith('actions/setup-node')).forEach(step => {
        expect(Number(step.with['node-version'])).toBeGreaterThanOrEqual(required);
      });
    });
  });
});
