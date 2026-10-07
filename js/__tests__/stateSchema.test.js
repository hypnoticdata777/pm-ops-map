import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import {
  STATE_SCHEMA_VERSION,
  buildStatePayload,
  validateImportedState,
  formatImportReport,
} from '../stateSchema.js';
import { stampTaskIdentity } from '../taskIdentity.js';

const { orgData } = config;

function cloneOrgData() {
  return {
    departments: orgData.departments.map(dept => ({
      ...dept,
      tasks: dept.tasks.map(task => ({ ...task, _configName: task.name })),
    })),
  };
}

describe('state schema', () => {
  test('buildStatePayload includes schema metadata and task dependency fields', () => {
    const data = cloneOrgData();
    data.departments[0].tasks[0].blockedBy = {
      deptId: data.departments[1].id,
      configName: data.departments[1].tasks[0]._configName,
      name: data.departments[1].tasks[0].name,
    };

    const payload = buildStatePayload({
      company: 'Test PM',
      departments: data.departments,
      team: { employees: [] },
      workOrders: [],
      portfolio: { properties: [], tenants: [], vendors: [] },
      exportedAt: '2026-05-19T00:00:00.000Z',
    });

    expect(payload.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(payload.schema).toBe('pm-ops-map-state');
    expect(payload.departments[0].tasks[0]).toHaveProperty('_configName');
    expect(payload.departments[0].tasks[0]).toHaveProperty('blockedBy');
  });

  test('validateImportedState accepts compatible exported state', () => {
    const data = cloneOrgData();
    const payload = buildStatePayload({
      company: 'Test PM',
      departments: data.departments,
      team: { employees: [{ name: 'A', hex: '#000000', affinities: [] }] },
      workOrders: [{ id: 'wo-1' }],
      portfolio: { properties: [{ id: 'p-1' }], tenants: [], vendors: [] },
      exportedAt: '2026-05-19T00:00:00.000Z',
    });

    const report = validateImportedState(payload, data);
    expect(report.ok).toBe(true);
    expect(report.matchedDepartments).toBe(data.departments.length);
    expect(report.matchedTasks).toBeGreaterThan(200);
    expect(report.teamMembers).toBe(1);
    expect(report.workOrders).toBe(1);
  });

  test('validateImportedState reports incompatible files before import', () => {
    const data = cloneOrgData();
    const report = validateImportedState({ company: 'Broken' }, data);
    expect(report.ok).toBe(false);
    expect(report.errors.join(' ')).toContain('Missing departments');
    expect(formatImportReport(report)).toContain('Import validation report');
  });

  test('validateImportedState warns about bad due dates and skipped tasks', () => {
    const data = cloneOrgData();
    const payload = {
      schemaVersion: 99,
      departments: [{
        id: data.departments[0].id,
        tasks: [
          { _configName: data.departments[0].tasks[0]._configName, name: data.departments[0].tasks[0].name, owner: 'A', dueDate: '2026-02-30' },
          { _configName: 'missing-task', name: 'Missing task', owner: 'A' },
        ],
      }],
    };

    const report = validateImportedState(payload, data);
    expect(report.ok).toBe(true);
    expect(report.invalidDueDates).toBe(1);
    expect(report.skippedTasks).toBe(1);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});

describe('schema v4: permanent task ids', () => {
  const stamp = () => stampTaskIdentity(cloneOrgData().departments);
  const payloadOf = departments => buildStatePayload({
    company: 'Test PM', departments, team: { employees: [] }, workOrders: [],
    portfolio: { properties: [], tenants: [], vendors: [] }, exportedAt: '2026-05-19T00:00:00.000Z',
  });

  test('exports are schema v4 and every task row carries its id', () => {
    const payload = payloadOf(stamp());
    expect(payload.schemaVersion).toBe(4);
    const rows = payload.departments.flatMap(d => d.tasks);
    expect(rows).toHaveLength(262);
    rows.forEach(r => expect(r.id).toMatch(/^[a-z0-9-]+-\d{3}$/));
  });

  test('a v4 export still matches after the starter task is reworded in config.json', () => {
    const exported = payloadOf(stamp());
    exported.departments[0].tasks[0].owner = 'Maria';
    const live = stamp();
    live[0].tasks[0].name = 'Reworded starter task';
    live[0].tasks[0]._configName = 'Reworded starter task';
    const report = validateImportedState(exported, { departments: live });
    expect(report.ok).toBe(true);
    expect(report.matchedTasks).toBe(262);
    expect(report.skippedTasks).toBe(0);
  });

  test('v2 and v3 files (no ids) still import against the current config', () => {
    [2, 3].forEach(version => {
      const file = payloadOf(stamp());
      file.schemaVersion = version;
      file.departments.forEach(d => d.tasks.forEach(t => { delete t.id; }));
      const report = validateImportedState(file, { departments: stamp() });
      expect(report.ok, `v${version}`).toBe(true);
      expect(report.matchedTasks, `v${version}`).toBe(262);
    });
  });

  test('a file from a newer schema version warns but the current one does not', () => {
    const file = payloadOf(stamp());
    expect(validateImportedState(file, { departments: stamp() }).warnings.join(' ')).not.toMatch(/newer schema/);
    file.schemaVersion = 5;
    expect(validateImportedState(file, { departments: stamp() }).warnings.join(' ')).toMatch(/newer schema/);
  });
});
