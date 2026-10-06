// Defense in depth: these tests put hostile values DIRECTLY into shared state
// (bypassing normalize.js on purpose) and render the real views. Even if a
// sanitizer ever had a gap, rendering must stay inert.
import { describe, test, expect, beforeEach } from 'vitest';
import {
  setOrgData, setTeamData, setWorkOrders, setPortfolio, setOwnerColors, setDefaultAffinities,
} from '../state.js';
import { renderTrackingView } from '../views/tracking.js';
import { renderWorkOrdersView } from '../views/workorders.js';
import { renderPortfolioView } from '../views/portfolio.js';
import { buildEmployeeCard, buildWorkloadBars } from '../views/team.js';
import { renderLaunchPlan } from '../launchPlan.js';

const EVIL = `"'><img data-pwn=x src=x>&quot;);__pwn=1;//`;

// Fails if hostile text became markup, or any inline handler stopped being a
// plain call (parse failure) or mentions the canary.
function assertInert(root, where) {
  expect(root.querySelector('[data-pwn]'), `${where}: markup was injected`).toBeNull();
  root.querySelectorAll('*').forEach(el => {
    [...el.attributes].filter(a => /^on/i.test(a.name)).forEach(a => {
      expect(() => new Function(a.value), `${where}: ${a.name}="${a.value}" must still parse`).not.toThrow();
      expect(a.value, `${where}: handler contains the canary`).not.toContain('__pwn');
    });
  });
  expect(globalThis.__pwn, `${where}: payload executed`).toBeUndefined();
}

const hostileTask = () => ({
  _configName: 'Task A', name: EVIL, owner: EVIL, status: EVIL, priority: EVIL, dueDate: EVIL,
  blockedBy: { deptId: 'leasing', configName: 'Task A', name: EVIL }, notes: EVIL, customFields: { [EVIL]: EVIL },
});

beforeEach(() => {
  document.body.innerHTML = '';
  delete globalThis.__pwn;
  localStorage.clear();
  setOwnerColors({});
  setDefaultAffinities({});
  setOrgData({ departments: [{ id: 'leasing', name: 'Leasing', color: '#1976d2', tasks: [hostileTask()] }] });
  setTeamData({ employees: [{ name: EVIL, hex: EVIL, affinities: [EVIL, 'leasing'] }] });
  setWorkOrders([]);
  setPortfolio({ properties: [], tenants: [], vendors: [] });
});

describe('tracking view', () => {
  test('hostile task fields render as inert text and unknown enums fall back', () => {
    document.body.innerHTML = '<div id="departments"></div>';
    renderTrackingView();
    const root = document.getElementById('departments');
    assertInert(root, 'tracking');
    const row = root.querySelector('.task-item');
    expect(row.dataset.status).toBe('todo');
    expect(row.dataset.priority).toBe('medium');
    expect(root.querySelector('.task-name').textContent).toBe(EVIL);
    expect(root.querySelector('.task-owner').textContent.trim()).toBe(EVIL);
  });

  test('the owner badge color is always a plain hex value', () => {
    document.body.innerHTML = '<div id="departments"></div>';
    renderTrackingView();
    expect(document.querySelector('.task-owner').getAttribute('style')).toMatch(/^background:#[0-9a-f]{6}$/i);
  });
});

describe('work orders view', () => {
  const hostileOrder = () => ({
    id: EVIL, property: EVIL, unit: EVIL, tenant: EVIL, title: EVIL, notes: EVIL, vendor: EVIL,
    status: 'submitted', priority: EVIL, assignee: EVIL, dueDate: EVIL, cost: 12, createdAt: EVIL, updatedAt: EVIL,
  });

  test('hostile ids and fields cannot break out of the card', () => {
    document.body.innerHTML = '<div id="workorders-view-inner"></div>';
    setWorkOrders([hostileOrder()]);
    renderWorkOrdersView();
    const root = document.getElementById('workorders-view-inner');
    assertInert(root, 'work orders');
    expect(root.querySelector('.wo-card-title').textContent).toBe(EVIL);
  });

  test('the id travels in data-id, never inside handler source', () => {
    document.body.innerHTML = '<div id="workorders-view-inner"></div>';
    setWorkOrders([hostileOrder()]);
    renderWorkOrdersView();
    const edit = document.querySelector('.wo-edit-btn');
    expect(edit.getAttribute('onclick')).toBe('showEditWorkOrderModal(this.dataset.id)');
    expect(edit.dataset.id).toBe(EVIL);
  });

  test('priority class names only ever come from the known list', () => {
    document.body.innerHTML = '<div id="workorders-view-inner"></div>';
    setWorkOrders([hostileOrder()]);
    renderWorkOrdersView();
    expect(document.querySelector('.wo-card').className).toMatch(/priority-border-medium/);
  });
});

describe('portfolio view', () => {
  test('hostile property, tenant and vendor records render inertly', () => {
    document.body.innerHTML = '<div id="portfolio-view-inner"></div>';
    setPortfolio({
      properties: [{ id: EVIL, name: EVIL, units: EVIL, owner: EVIL, notes: EVIL, documentUrl: `http://example.com/${EVIL}` }],
      tenants: [{ id: EVIL, name: EVIL, propertyId: EVIL, unit: EVIL, status: EVIL, phone: EVIL, email: EVIL, rent: EVIL, leaseStart: EVIL, leaseEnd: EVIL, balanceDue: EVIL, documentUrl: `javascript:${EVIL}` }],
      vendors: [{ id: EVIL, name: EVIL, trade: EVIL, phone: EVIL, email: EVIL, documentUrl: EVIL }],
    });
    renderPortfolioView();
    assertInert(document.getElementById('portfolio-view-inner'), 'portfolio');
  });

  test('every edit/delete/payment button carries its id in data-id', () => {
    document.body.innerHTML = '<div id="portfolio-view-inner"></div>';
    setPortfolio({
      properties: [{ id: EVIL, name: 'P' }],
      tenants: [{ id: EVIL, name: 'T' }],
      vendors: [{ id: EVIL, name: 'V' }],
    });
    renderPortfolioView();
    const buttons = [...document.querySelectorAll('.portfolio-card-actions button')];
    expect(buttons).toHaveLength(7); // property 2 + vendor 2 + tenant 3
    buttons.forEach(btn => {
      expect(btn.getAttribute('onclick')).toMatch(/^\w+\(this\.dataset\.id\)$/);
      expect(btn.dataset.id).toBe(EVIL);
    });
  });

  test('document links render the parser-normalized href and drop unsafe schemes', () => {
    document.body.innerHTML = '<div id="portfolio-view-inner"></div>';
    setPortfolio({
      properties: [{ id: 'p1', name: 'P', documentUrl: 'https://example.com/a b"c' }],
      tenants: [{ id: 't1', name: 'T', documentUrl: 'javascript:alert(1)' }],
      vendors: [],
    });
    renderPortfolioView();
    const links = [...document.querySelectorAll('a.doc-link')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com/a%20b%22c');
  });
});

describe('team view', () => {
  test('employee card handlers read the name from data-*, not from handler source', () => {
    document.body.innerHTML = `<div id="host">${buildEmployeeCard(
      { name: EVIL, hex: EVIL, affinities: [EVIL, 'leasing'] },
      [{ id: 'leasing', name: 'Leasing', color: '#1976d2' }],
      new Map([[EVIL, 3]]),
      5,
    )}</div>`;
    const host = document.getElementById('host');
    assertInert(host, 'employee card');
    expect(host.querySelector('.emp-playbook-btn').getAttribute('onclick')).toBe('openRolePlaybook(this.dataset.name)');
    expect(host.querySelector('.emp-remove-btn').getAttribute('onclick')).toBe('removeEmployee(this.dataset.name)');
    expect(host.querySelector('.affinity-tag').getAttribute('onclick')).toBe('toggleAffinity(this.dataset.name, this.dataset.dept)');
    expect(host.querySelector('.emp-playbook-btn').dataset.name).toBe(EVIL);
    expect(host.querySelector('.emp-color-dot').getAttribute('style')).toMatch(/^background:#[0-9a-f]{6}$/i);
  });

  test('workload bars escape names and colors', () => {
    document.body.innerHTML = `<div id="host">${buildWorkloadBars(new Map([[EVIL, 9], ['B', 1]]), 9)}</div>`;
    assertInert(document.getElementById('host'), 'workload bars');
  });
});

describe('launch plan dashboard', () => {
  test('hostile workspace data does not leak into the dashboard markup', () => {
    document.body.innerHTML = '<section id="launch-plan"></section><div id="departments"></div>';
    setWorkOrders([{ id: 'wo-1', property: EVIL, title: EVIL, status: 'submitted', priority: 'high', assignee: 'UNASSIGNED', vendor: EVIL, dueDate: null }]);
    setPortfolio({
      properties: [{ id: 'p1', name: EVIL, units: 2, owner: EVIL }],
      tenants: [{ id: 't1', name: EVIL, propertyId: 'p1', unit: EVIL, phone: EVIL, balanceDue: 900, rent: 800 }],
      vendors: [{ id: 'v1', name: EVIL, trade: EVIL }],
    });
    renderLaunchPlan();
    assertInert(document.getElementById('launch-plan'), 'launch plan');
  });
});
