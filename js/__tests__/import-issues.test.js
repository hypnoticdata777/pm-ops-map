// The import review must say WHICH field of WHICH record was repaired.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import { sanitizeWorkspace, normalizeTeam, normalizeSavedTask } from '../normalize.js';
import { validateImportedState, formatImportReport } from '../stateSchema.js';
import { openImportReview, cancelPendingImport } from '../io.js';
import { stampTaskIdentity } from '../taskIdentity.js';
import { shorten } from '../schema.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const EVIL = '"><img data-pwn=1 src=x onerror=alert(1)>';
const DEPT_IDS = config.orgData.departments.map(d => d.id);

function liveOrg() {
  return { departments: stampTaskIdentity(structuredClone(config.orgData.departments)) };
}

describe('sanitizeWorkspace reports field-level errors', () => {
  const dirty = () => ({
    team: { employees: [
      { name: 'Maria', hex: '#336699', affinities: ['leasing'] },
      { name: 'Maria', hex: '#000000', affinities: [] },
      { name: 'Sam', hex: 'purple', affinities: ['leasing', 'not-a-dept'] },
      { name: 'UNOWNED', hex: '#000000', affinities: [] },
    ] },
    workOrders: [
      { id: 'w1', title: 'Fix sink', priority: 'urgent!!', status: 'submitted' },
      { id: 'w2', priority: 'high' },
      { id: 'w3', title: 'Paint', dueDate: '2026-02-30', cost: 'lots' },
    ],
    portfolio: {
      properties: [{ id: 'p1', name: 'Oak Duplex', units: 2, documentUrl: 'javascript:alert(1)' }],
      tenants: [{ id: 't1', name: 'Lee', propertyId: 'ghost-property', status: 'banished' }],
      vendors: [{ id: 'v1', name: 'Ace', trade: 'plumbing' }],
    },
  });

  test('every repair names its path and record', () => {
    const { errors } = sanitizeWorkspace(dirty(), { knownDeptIds: DEPT_IDS });
    const byPath = Object.fromEntries(errors.map(e => [e.path, e]));
    expect(byPath['workOrders[0].priority'].message).toBe('Work order 1 ("Fix sink") — priority: "urgent!!" is not allowed; reset to "medium".');
    expect(byPath['workOrders[1].title'].code).toBe('missing_required');
    expect(byPath['workOrders[2].dueDate'].message).toMatch(/Work order 3 \("Paint"\) — dueDate: "2026-02-30"/);
    expect(byPath['workOrders[2].cost'].message).toMatch(/cost: "lots" is not allowed; reset to 0/);
    expect(byPath['portfolio.properties[0].documentUrl'].message).toMatch(/Property 1 \("Oak Duplex"\) — documentUrl: "javascript:alert\(1\)" is not allowed/);
    expect(byPath['portfolio.tenants[0].propertyId'].code).toBe('unknown_reference');
    expect(byPath['portfolio.tenants[0].status'].code).toBe('invalid_value');
    expect(byPath['team.employees[1].name'].message).toMatch(/Team member 2 \("Maria"\)/);
    expect(byPath['team.employees[2].hex'].message).toMatch(/hex: "purple" is not a valid color; reset to "#607d8b"/);
    expect(byPath['team.employees[2].affinities[1]'].message).toMatch(/"not-a-dept" is not a department in this app; removed/);
    expect(byPath['team.employees[3].name'].message).toMatch(/reserved/);
  });

  test('the data that survives is unchanged by adding the error list', () => {
    const r = sanitizeWorkspace(dirty(), { knownDeptIds: DEPT_IDS });
    expect(r.workOrders.map(w => w.title)).toEqual(['Fix sink', 'Paint']);
    expect(r.team.employees.map(e => e.name)).toEqual(['Maria', 'Sam']);
    expect(r.stats.workOrders).toEqual({ kept: 2, dropped: 1, repaired: 2 });
  });

  test('a clean workspace has no errors', () => {
    const clean = { team: { employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] }, workOrders: [{ id: 'w1', title: 'Fix', priority: 'low', status: 'submitted', assignee: 'Maria', createdAt: '2026-01-01T00:00:00Z' }] };
    expect(sanitizeWorkspace(clean, { knownDeptIds: DEPT_IDS }).errors).toEqual([]);
  });

  test('normalizeTeam on its own reports too (used by storage load)', () => {
    expect(normalizeTeam({ employees: [{ name: 'A', hex: 'nope', affinities: [] }] }).errors.map(e => e.path)).toEqual(['team.employees[0].hex']);
  });
});

describe('normalizeSavedTask reports field-level errors when asked', () => {
  test('lists each unusable field of a task row', () => {
    const issues = [];
    const patch = normalizeSavedTask({ name: 'Show units', owner: 'Maria', status: 'nope', priority: 'urgent', dueDate: '2026-02-30', blockedBy: { deptId: 'x' } },
      { issues, path: 'departments[0].tasks[1]', label: 'Task "Show units" in Leasing' });
    expect(patch).toMatchObject({ name: 'Show units', owner: 'Maria' });
    expect(issues.map(i => i.path)).toEqual([
      'departments[0].tasks[1].status', 'departments[0].tasks[1].priority', 'departments[0].tasks[1].dueDate', 'departments[0].tasks[1].blockedBy',
    ]);
    expect(issues[0].message).toBe('Task "Show units" in Leasing — status: "nope" is not allowed; left unchanged.');
  });

  test('without the option it behaves exactly as before', () => {
    expect(normalizeSavedTask({ name: 'x', owner: 'y', status: 'nope' })).toEqual({ name: 'x', owner: 'y' });
  });
});

describe('the import review', () => {
  const fileWith = org => ({
    schema: 'pm-ops-map-state', schemaVersion: 4, company: 'Co',
    departments: org.departments.slice(0, 2).map(d => ({ id: d.id, name: d.name, tasks: d.tasks.slice(0, 3).map(t => ({ id: t.id, _configName: t.name, name: t.name, owner: 'Maria', status: 'todo', priority: 'medium' })) })),
    workOrders: [{ id: 'w1', title: 'Fix sink', priority: 'urgent!!', status: 'submitted' }],
  });

  test('validateImportedState lists task, work order and unmatched-row problems with paths', () => {
    const org = liveOrg();
    const file = fileWith(org);
    file.departments[0].tasks[1].dueDate = '2026-02-30';
    file.departments[1].tasks[0].status = 'on fire';
    file.departments[1].tasks.push({ _configName: 'A task from another version', name: 'A task from another version', owner: 'Sam' });
    file.departments.push({ id: 'made-up-dept', tasks: [{ name: 'x', owner: 'y' }] });
    const report = validateImportedState(file, org);
    const messages = report.issues.map(i => i.message);
    const lead = org.departments[0].name;
    expect(report.issues.map(i => i.path)).toEqual(expect.arrayContaining([
      'departments[0].tasks[1].dueDate', 'departments[1].tasks[0].status', 'departments[1].tasks[3]', 'departments[2]', 'workOrders[0].priority',
    ]));
    expect(messages).toContain(`Task ${shorten(org.departments[0].tasks[1].name)} in ${lead} — dueDate: "2026-02-30" is not allowed; cleared.`);
    expect(messages.some(m => /A task from another version/.test(m) && /no matching task/.test(m))).toBe(true);
    expect(messages.some(m => /made-up-dept/.test(m) && /not in this version/.test(m))).toBe(true);
    expect(report.issueCount).toBe(report.issues.length);
  });

  test('a clean file has no issues and the old counters are unchanged', () => {
    const org = liveOrg();
    const file = fileWith(org);
    delete file.workOrders;
    const report = validateImportedState(file, org);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.matchedTasks).toBe(6);
  });

  test('the list is capped and says how many more there are', () => {
    const org = liveOrg();
    const file = fileWith(org);
    file.workOrders = Array.from({ length: 150 }, (_, i) => ({ id: `w${i}`, title: `T${i}`, priority: 'nope', status: 'submitted' }));
    const report = validateImportedState(file, org);
    expect(report.issues.length).toBeLessThanOrEqual(100);
    expect(report.issueCount).toBeGreaterThanOrEqual(150);
    expect(formatImportReport(report)).toMatch(/and \d+ more/);
  });

  test('formatImportReport prints the issues in plain text', () => {
    const org = liveOrg();
    const report = validateImportedState(fileWith(org), org);
    expect(formatImportReport(report)).toContain('Work order 1 ("Fix sink") — priority: "urgent!!" is not allowed; reset to "medium".');
  });

  describe('modal', () => {
    beforeEach(() => {
      document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
      state.setOrgData(liveOrg());
    });

    test('shows the repairs as a list, escaped', () => {
      const file = fileWith(state.orgData);
      file.workOrders = [{ id: 'w1', title: EVIL, priority: EVIL, status: 'submitted' }];
      openImportReview(file, validateImportedState(file, state.orgData), 'file');
      const body = document.getElementById('import-review-body');
      expect(body.textContent).toMatch(/What will be repaired/);
      expect(body.textContent).toMatch(/Work order 1/);
      expect(body.textContent).toMatch(/priority:/);
      expect(body.querySelector('[data-pwn]')).toBeNull();
      expect(body.querySelector('img')).toBeNull();
      cancelPendingImport();
    });

    test('a clean file shows no repair section', () => {
      const file = fileWith(state.orgData);
      delete file.workOrders;
      openImportReview(file, validateImportedState(file, state.orgData), 'file');
      expect(document.getElementById('import-review-body').textContent).not.toMatch(/What will be repaired/);
      cancelPendingImport();
    });
  });
});
