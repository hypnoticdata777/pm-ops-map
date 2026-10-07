// Saved data that had to be repaired on load is no longer repaired silently: each
// loader records what it changed (with field paths) and warns once in the console.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { stampTaskIdentity } from '../taskIdentity.js';

beforeEach(() => {
  localStorage.clear();
  const orgData = structuredClone(config.orgData);
  stampTaskIdentity(orgData.departments);
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  storage.clearLoadIssues();
});
afterEach(() => vi.restoreAllMocks());

const put = (key, value) => localStorage.setItem(key, JSON.stringify(value));

describe('load issues', () => {
  test('clean saved data records nothing and does not warn', () => {
    put(storage.WORKORDERS_KEY, [{ id: 'w1', title: 'Fix', priority: 'low', status: 'submitted', assignee: 'Maria' }]);
    put(storage.TEAM_KEY, { employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] });
    storage.loadWorkOrders();
    storage.loadTeamData();
    expect(storage.getLoadIssues()).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('work orders: each repair is recorded with source and path, and warned about once', () => {
    put(storage.WORKORDERS_KEY, [{ id: 'w1', title: 'Fix sink', priority: 'urgent!!', status: 'submitted', assignee: 'Maria' }, { id: 'w2' }]);
    storage.loadWorkOrders();
    expect(state.workOrders.map(w => w.title)).toEqual(['Fix sink']);
    const issues = storage.getLoadIssues();
    expect(issues.map(i => [i.source, i.path])).toEqual([['workOrders', 'workOrders[0].priority'], ['workOrders', 'workOrders[1].title']]);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(console.warn.mock.calls[0][0])).toMatch(/2 saved values.*work orders/i);
  });

  test('team, portfolio and tasks are recorded under their own source', () => {
    put(storage.TEAM_KEY, { employees: [{ name: 'Sam', hex: 'purple', affinities: [] }] });
    put(storage.PORTFOLIO_KEY, { properties: [{ id: 'p1', name: 'Oak', documentUrl: 'javascript:alert(1)' }], tenants: [], vendors: [] });
    const first = state.orgData.departments[0].tasks[0];
    put(storage.STORAGE_KEY, [{ id: 'leasing', tasks: [{ id: first.id, _configName: first.name, name: first.name, owner: 'Maria', dueDate: '2026-02-30' }] }]);
    storage.loadTeamData();
    storage.loadPortfolio();
    storage.loadFromStorage();
    const bySource = Object.fromEntries(storage.getLoadIssues().map(i => [i.source, i.path]));
    expect(bySource).toEqual({
      team: 'team.employees[0].hex',
      portfolio: 'portfolio.properties[0].documentUrl',
      tasks: 'departments[0].tasks[0].dueDate',
    });
  });

  test('reloading a source replaces its earlier issues instead of piling up', () => {
    put(storage.WORKORDERS_KEY, [{ id: 'w1', title: 'A', priority: 'nope' }]);
    storage.loadWorkOrders();
    storage.loadWorkOrders();
    expect(storage.getLoadIssues()).toHaveLength(1);
    put(storage.WORKORDERS_KEY, [{ id: 'w1', title: 'A', priority: 'low' }]);
    storage.loadWorkOrders();
    expect(storage.getLoadIssues()).toEqual([]);
  });

  test('what the loaders do with the data is unchanged', () => {
    put(storage.WORKORDERS_KEY, [{ id: 'w1', title: 'Fix', priority: 'nope', status: 'bogus', assignee: { x: 1 } }]);
    storage.loadWorkOrders();
    expect(state.workOrders[0]).toMatchObject({ id: 'w1', title: 'Fix', priority: 'medium', status: 'submitted' });
  });
});
