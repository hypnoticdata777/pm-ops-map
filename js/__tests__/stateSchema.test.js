import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import {
  STATE_SCHEMA_VERSION,
  buildStatePayload,
  validateImportedState,
  formatImportReport,
} from '../stateSchema.js';

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
