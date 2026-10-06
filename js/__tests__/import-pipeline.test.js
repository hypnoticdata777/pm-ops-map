// Integration tests for every path that lets outside data into the app:
// file/clipboard/sync import (_applyImportedState) and the localStorage loaders.
// Uses the real index.html DOM so the renderers the importer calls have somewhere to draw.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import { _applyImportedState } from '../io.js';
import {
  loadTeamData, loadWorkOrders, loadPortfolio, loadAuditLog, loadFromStorage,
  TEAM_KEY, WORKORDERS_KEY, PORTFOLIO_KEY, AUDIT_KEY, STORAGE_KEY, COMPANY_KEY,
} from '../storage.js';
import { validateImportedState } from '../stateSchema.js';

const EVIL = `"'><img data-pwn=x src=x>&quot;);__pwn=1;//`;
// Vitest runs from the repo root (vitest.config.mjs lives there).
const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

function freshOrgData() {
  const orgData = structuredClone(config.orgData);
  orgData.departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  return orgData;
}

const firstTask = () => state.orgData.departments[0].tasks[0];

function hostileWorkspace() {
  const dept = config.orgData.departments[0];
  return {
    schema: 'pm-ops-map-state', schemaVersion: 2, company: EVIL.repeat(5),
    departments: [{ id: dept.id, tasks: [{
      _configName: dept.tasks[0].name, name: EVIL, owner: EVIL, status: EVIL, priority: EVIL, dueDate: EVIL,
      blockedBy: { deptId: EVIL, configName: EVIL, name: EVIL },
    }] }],
    team: { employees: [{ name: EVIL, hex: EVIL, affinities: [EVIL, dept.id] }] },
    workOrders: [{ id: EVIL, property: EVIL, title: EVIL, status: EVIL, priority: EVIL, assignee: EVIL, dueDate: EVIL, cost: EVIL }],
    portfolio: {
      properties: [{ id: EVIL, name: EVIL, documentUrl: 'javascript:alert(1)' }],
      tenants: [{ id: EVIL, name: EVIL, propertyId: EVIL, status: EVIL, rent: EVIL }],
      vendors: [{ id: EVIL, name: EVIL }],
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
  state.setOrgData(freshOrgData());
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  state.setAuditLog([]);
});

describe('_applyImportedState (file / clipboard / Team Sync)', () => {
  test('hostile task fields are rejected, valid ones are applied', () => {
    _applyImportedState(hostileWorkspace());
    const task = firstTask();
    expect(task.name).toBe(EVIL);                // free text is kept (and escaped at render)
    expect(task.status).toBeUndefined();          // enums never take unknown values
    expect(task.priority).toBeUndefined();
    expect(task.dueDate).toBeNull();
    expect(task.blockedBy).toBeNull();
  });

  test('team, work orders and portfolio are fully sanitized before reaching shared state', () => {
    _applyImportedState(hostileWorkspace());
    expect(state.teamData.employees).toHaveLength(1);
    expect(state.teamData.employees[0].hex).toBe('#607d8b');
    expect(state.teamData.employees[0].affinities).toEqual([config.orgData.departments[0].id]);

    const [wo] = state.workOrders;
    expect(wo).toMatchObject({ status: 'submitted', priority: 'medium', dueDate: null, cost: 0 });
    expect(wo.id).toMatch(/^[A-Za-z0-9._:-]+$/);

    const { properties, tenants, vendors } = state.portfolio;
    [properties[0], tenants[0], vendors[0]].forEach(r => expect(r.id).toMatch(/^[A-Za-z0-9._:-]+$/));
    expect(properties[0].documentUrl).toBe('');
    expect(tenants[0]).toMatchObject({ propertyId: '', status: 'active', rent: 0 });
  });

  test('the company name is cleaned and capped before it is stored', () => {
    _applyImportedState(hostileWorkspace());
    expect(localStorage.getItem(COMPANY_KEY)).toHaveLength(60);
  });

  test('what gets persisted is the sanitized data, not the raw file', () => {
    _applyImportedState(hostileWorkspace());
    const stored = JSON.parse(localStorage.getItem(WORKORDERS_KEY));
    expect(stored[0].status).toBe('submitted');
    expect(JSON.parse(localStorage.getItem(PORTFOLIO_KEY)).properties[0].documentUrl).toBe('');
  });

  test('sections missing from the file leave existing data untouched', () => {
    state.setWorkOrders([{ id: 'wo-keep', title: 'Keep me', property: 'P', status: 'submitted', priority: 'low', assignee: 'UNASSIGNED' }]);
    _applyImportedState({ schema: 'pm-ops-map-state', departments: [] });
    expect(state.workOrders).toHaveLength(1);
    expect(state.workOrders[0].id).toBe('wo-keep');
  });
});

describe('validateImportedState reports what the import will clean', () => {
  test('counts unusable tasks and repaired/dropped records for the review screen', () => {
    const data = hostileWorkspace();
    data.departments[0].tasks.push({ _configName: 'x', name: '', owner: '' });
    data.workOrders.push({ id: 'wo-no-title', title: '' });
    const report = validateImportedState(data, state.orgData);
    expect(report.ok).toBe(true);
    expect(report.invalidTasks).toBe(1);
    expect(report.droppedRecords).toBeGreaterThanOrEqual(1);
    expect(report.repairedRecords).toBeGreaterThanOrEqual(4);
    expect(report.warnings.join('\n')).toMatch(/not allowed/i);
  });

  test('a clean export reports nothing repaired or dropped', () => {
    const report = validateImportedState({
      schema: 'pm-ops-map-state', schemaVersion: 2,
      departments: [{ id: config.orgData.departments[0].id, tasks: [{ _configName: config.orgData.departments[0].tasks[0].name, name: 'Renamed', owner: 'Maria', status: 'done', priority: 'low' }] }],
      team: { employees: [{ name: 'Maria', hex: '#336699', affinities: [] }] },
      workOrders: [{ id: 'wo-1', property: 'P', title: 'T', status: 'scheduled', priority: 'high', assignee: 'Maria' }],
      portfolio: { properties: [], tenants: [], vendors: [] },
    }, state.orgData);
    expect(report).toMatchObject({ ok: true, invalidTasks: 0, repairedRecords: 0, droppedRecords: 0 });
  });
});

describe('localStorage loaders sanitize what they read', () => {
  test('team roster', () => {
    localStorage.setItem(TEAM_KEY, JSON.stringify({ employees: [{ name: EVIL, hex: EVIL, affinities: [EVIL] }, { name: 'UNOWNED' }] }));
    loadTeamData();
    expect(state.teamData.employees).toEqual([{ name: EVIL, hex: '#607d8b', affinities: [] }]);
  });

  test('work orders — including a non-array value', () => {
    localStorage.setItem(WORKORDERS_KEY, JSON.stringify([{ id: EVIL, title: 'T', status: EVIL, priority: EVIL }]));
    loadWorkOrders();
    expect(state.workOrders[0]).toMatchObject({ status: 'submitted', priority: 'medium' });
    localStorage.setItem(WORKORDERS_KEY, JSON.stringify({ not: 'an array' }));
    loadWorkOrders();
    expect(state.workOrders).toEqual([]);
  });

  test('portfolio', () => {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ properties: [{ id: EVIL, name: 'P', documentUrl: EVIL }], tenants: 'x', vendors: null }));
    loadPortfolio();
    expect(state.portfolio.properties[0].documentUrl).toBe('');
    expect(state.portfolio.tenants).toEqual([]);
    expect(state.portfolio.vendors).toEqual([]);
  });

  test('audit log drops malformed entries and non-numeric counts', () => {
    localStorage.setItem(AUDIT_KEY, JSON.stringify([
      { ts: '2026-10-06T10:00:00.000Z', action: 'auto_assign', count: EVIL },
      { ts: EVIL, action: 'owner_changed' },
      'junk',
    ]));
    loadAuditLog();
    expect(state.auditLog).toEqual([{ ts: '2026-10-06T10:00:00.000Z', action: 'auto_assign' }]);
  });

  test('saved tasks (including notes and custom fields) go through the same validator', () => {
    const dept = config.orgData.departments[0];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: dept.id, tasks: [{
      _configName: dept.tasks[0].name, name: 'Edited', owner: 'Maria', status: 'blocked', priority: EVIL,
      dueDate: EVIL, notes: 'remember this', customFields: { 'PO #': '77' },
    }] }]));
    loadFromStorage();
    expect(firstTask()).toMatchObject({ name: 'Edited', owner: 'Maria', status: 'blocked', notes: 'remember this', customFields: { 'PO #': '77' } });
    expect(firstTask().priority).toBeUndefined();
    expect(firstTask().dueDate).toBeNull();
  });
});
