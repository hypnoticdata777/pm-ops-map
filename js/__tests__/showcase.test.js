import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { buildShowcase, applyShowcaseTasks, UNCOVERED_DEPARTMENTS, SHOWCASE_COMPANY } from '../showcase.js';
import { sanitizeWorkspace, normalizeBlockedBy } from '../normalize.js';
import { getLeaseStatus, getDelinquencyStatus, isTaskOverdue } from '../utils.js';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const deptIds = config.orgData.departments.map(d => d.id);
const todayISO = date => date.toISOString().slice(0, 10);

function freshDepartments() {
  const departments = structuredClone(config.orgData.departments);
  departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  return departments;
}

function applied(now = NOW) {
  const showcase = buildShowcase(now);
  const departments = freshDepartments();
  applyShowcaseTasks(departments, showcase.team.employees, now);
  return { showcase, departments, tasks: departments.flatMap(d => d.tasks.map(t => ({ ...t, deptId: d.id }))) };
}

describe('showcase data is entirely fictional', () => {
  const { company, team, portfolio, workOrders } = buildShowcase(NOW);

  test('contact details use reserved fictional ranges only', () => {
    const phones = [...portfolio.tenants, ...portfolio.vendors].map(r => r.phone);
    phones.forEach(phone => expect(phone, phone).toMatch(/^\(555\) 010-\d{4}$/));
    const emails = [...portfolio.tenants, ...portfolio.vendors].map(r => r.email);
    emails.forEach(email => expect(email, email).toMatch(/@([a-z]+\.)?example(\.com)?$/));
    [...portfolio.properties, ...portfolio.tenants, ...portfolio.vendors].forEach(r => {
      if (r.documentUrl) expect(r.documentUrl).toMatch(/^https:\/\/example\.com\//);
    });
  });

  test('has the expected shape and a named company', () => {
    expect(company).toBe(SHOWCASE_COMPANY);
    expect(team.employees).toHaveLength(3);
    expect(portfolio.properties).toHaveLength(2);
    expect(portfolio.tenants).toHaveLength(4);
    expect(portfolio.vendors).toHaveLength(3);
    expect(workOrders).toHaveLength(6);
  });

  test('passes the same sanitizers as every other data source with nothing repaired or dropped', () => {
    const clean = sanitizeWorkspace(buildShowcase(NOW), { knownDeptIds: deptIds });
    Object.entries(clean.stats).forEach(([section, stat]) => expect(stat, section).toMatchObject({ dropped: 0, repaired: 0 }));
    expect(clean.portfolio.tenants.map(t => t.propertyId)).toEqual(['demo-property-oak', 'demo-property-cedar', 'demo-property-cedar', 'demo-property-cedar']);
    expect(clean.team.employees).toEqual(team.employees);
  });

  test('team affinities and uncovered departments only name real departments', () => {
    team.employees.forEach(e => e.affinities.forEach(a => expect(deptIds, a).toContain(a)));
    UNCOVERED_DEPARTMENTS.forEach(d => expect(deptIds, d).toContain(d));
  });

  test('nobody has affinity for the uncovered departments', () => {
    UNCOVERED_DEPARTMENTS.forEach(d => expect(team.employees.some(e => e.affinities.includes(d)), d).toBe(false));
  });

  test('does not share array state between calls (each demo load is independent)', () => {
    const a = buildShowcase(NOW);
    const b = buildShowcase(NOW);
    a.team.employees[0].affinities.push('x');
    expect(b.team.employees[0].affinities).not.toContain('x');
  });
});

describe('tenants and work orders cover the situations the tool surfaces', () => {
  const { portfolio, workOrders } = buildShowcase(NOW);
  const today = todayISO(NOW);

  test('lease situations: expired, expiring soon, and comfortable', () => {
    const tones = portfolio.tenants.map(t => getLeaseStatus(t, today)?.tone);
    expect(tones).toEqual(expect.arrayContaining(['danger', 'warn', 'neutral']));
    expect(getLeaseStatus(portfolio.tenants.find(t => t.name === 'Sam Okafor'), today).label).toBe('Lease expired');
  });

  test('rent situations: current, a partial balance, and a full month or more past due', () => {
    const delinquency = portfolio.tenants.map(t => getDelinquencyStatus(t));
    expect(delinquency.filter(Boolean).map(d => d.tone).sort()).toEqual(['danger', 'warn']);
    expect(delinquency.filter(d => d === null)).toHaveLength(2);
  });

  test('one tenant is on notice', () => {
    expect(portfolio.tenants.filter(t => t.status === 'notice')).toHaveLength(1);
  });

  test('work orders appear in every kanban column', () => {
    expect(new Set(workOrders.map(w => w.status))).toEqual(new Set(['submitted', 'scheduled', 'in-progress', 'completed']));
  });

  test('there is an unassigned open order and an overdue open order', () => {
    expect(workOrders.some(w => w.assignee === 'UNASSIGNED' && w.status !== 'completed')).toBe(true);
    expect(workOrders.some(w => w.dueDate && w.dueDate < today && w.status !== 'completed')).toBe(true);
  });

  test('orders reference tenants and properties that exist', () => {
    const properties = portfolio.properties.map(p => p.name);
    workOrders.forEach(w => expect(properties, w.property).toContain(w.property));
    workOrders.filter(w => w.tenant).forEach(w => expect(portfolio.tenants.map(t => t.name)).toContain(w.tenant));
  });
});

describe('dates are relative to "now", so the demo never goes stale', () => {
  test('shifting now shifts every date by the same amount', () => {
    const a = buildShowcase(NOW);
    const later = new Date(NOW.getTime() + 400 * 86_400_000);
    const b = buildShowcase(later);
    const days = (x, y) => Math.round((new Date(y) - new Date(x)) / 86_400_000);
    a.portfolio.tenants.forEach((t, i) => {
      expect(days(t.leaseEnd, b.portfolio.tenants[i].leaseEnd)).toBe(400);
    });
    expect(days(a.workOrders[0].dueDate, b.workOrders[0].dueDate)).toBe(400);
  });

  test('the lease and overdue situations hold for any visit date', () => {
    [new Date('2027-03-01T00:00:00Z'), new Date('2030-12-31T00:00:00Z')].forEach(now => {
      const { portfolio, workOrders } = buildShowcase(now);
      const today = todayISO(now);
      expect(portfolio.tenants.map(t => getLeaseStatus(t, today).tone)).toEqual(expect.arrayContaining(['danger', 'warn', 'neutral']));
      expect(workOrders.some(w => w.dueDate && w.dueDate < today && w.status !== 'completed')).toBe(true);
    });
  });
});

describe('applyShowcaseTasks', () => {
  test('leaves exactly the uncovered departments unowned', () => {
    const { departments, tasks } = applied();
    const expected = departments.filter(d => UNCOVERED_DEPARTMENTS.includes(d.id)).reduce((n, d) => n + d.tasks.length, 0);
    const unowned = tasks.filter(t => t.owner === 'UNOWNED');
    expect(unowned).toHaveLength(expected);
    expect(unowned.every(t => UNCOVERED_DEPARTMENTS.includes(t.deptId))).toBe(true);
    expect(expected / tasks.length).toBeGreaterThan(0.08);
    expect(expected / tasks.length).toBeLessThan(0.2);
  });

  test('every owned task belongs to a team member', () => {
    const { showcase, tasks } = applied();
    const names = new Set(showcase.team.employees.map(e => e.name));
    tasks.filter(t => t.owner !== 'UNOWNED').forEach(t => expect(names.has(t.owner), t.owner).toBe(true));
  });

  test('one person carries clearly more than the others', () => {
    const { tasks, showcase } = applied();
    const counts = showcase.team.employees.map(e => tasks.filter(t => t.owner === e.name).length);
    const average = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(Math.max(...counts)).toBeGreaterThan(average * 1.35); // the app's own "overloaded" threshold
  });

  test('statuses are varied, with real overdue work', () => {
    const { tasks } = applied();
    const statuses = new Set(tasks.map(t => t.status));
    ['todo', 'in-progress', 'blocked', 'done'].forEach(s => expect(statuses.has(s), s).toBe(true));
    expect(tasks.some(t => isTaskOverdue(t))).toBe(true);
  });

  test('dependencies are real: target exists, is open, and the blocked task is marked blocked', () => {
    const { departments } = applied();
    const withDep = departments.flatMap(d => d.tasks.filter(t => t.blockedBy).map(t => ({ dept: d, task: t })));
    expect(withDep.length).toBeGreaterThanOrEqual(3);
    withDep.forEach(({ task }) => {
      expect(normalizeBlockedBy(task.blockedBy)).toEqual(task.blockedBy);
      const blocker = departments.find(d => d.id === task.blockedBy.deptId).tasks.find(t => t._configName === task.blockedBy.configName);
      expect(blocker, task.blockedBy.name).toBeTruthy();
      expect(blocker.status).not.toBe('done');
      expect(task.status).toBe('blocked');
    });
  });

  test('has notes and custom fields on the storyline responsibilities', () => {
    const { departments } = applied();
    const maintenance = departments.find(d => d.id === 'maintenance').tasks[0];
    expect(maintenance.notes).toMatch(/dispatch tree/);
    expect(maintenance.customFields).toMatchObject({ 'Emergency vendor SLA': '4 hours' });
    expect(departments.find(d => d.id === 'leasing').tasks[0].notes).toMatch(/photos/);
  });

  test('is deterministic', () => {
    expect(applied().departments).toEqual(applied().departments);
  });

  test('keeps task identity intact (names and _configName are never touched)', () => {
    const { departments } = applied();
    departments.forEach((d, i) => d.tasks.forEach((t, j) => {
      expect(t.name).toBe(config.orgData.departments[i].tasks[j].name);
      expect(t._configName).toBe(t.name);
    }));
  });

  test('produces data the sanitizers accept (valid enums and dates)', () => {
    const { tasks } = applied();
    tasks.forEach(t => {
      expect(['todo', 'in-progress', 'blocked', 'done']).toContain(t.status);
      expect(['high', 'medium', 'low']).toContain(t.priority);
      if (t.dueDate) expect(t.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test('tolerates a config that lacks the storyline departments', () => {
    const departments = [{ id: 'leasing', name: 'Leasing', tasks: [{ _configName: 'a', name: 'a', owner: 'UNOWNED' }] }];
    expect(() => applyShowcaseTasks(departments, buildShowcase(NOW).team.employees, NOW)).not.toThrow();
    expect(departments[0].tasks[0].owner).toBe('Priya Raman');
  });
});
