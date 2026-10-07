import { describe, test, expect, beforeEach } from 'vitest';
import { setOrgData, setOwnerColors, setDefaultAffinities, orgData } from '../state.js';
import { setTaskDependency, isDependencyBlocking } from '../views/tracking.js';
import { stampTaskIdentity } from '../taskIdentity.js';

function load() {
  document.body.innerHTML = '';
  localStorage.clear();
  setOwnerColors({});
  setDefaultAffinities({});
  setOrgData({ departments: stampTaskIdentity([
    { id: 'leasing', name: 'Leasing', color: '#1976d2', tasks: [
      { id: 'leasing-001', name: 'List units', owner: 'Maria', status: 'in-progress' },
      { id: 'leasing-002', name: 'Show units', owner: 'Maria', status: 'todo' },
    ] },
    { id: 'accounting', name: 'Accounting', color: '#2e7d32', tasks: [{ id: 'accounting-001', name: 'Reconcile', owner: 'Sam', status: 'todo' }] },
  ]) });
}

beforeEach(load);

describe('task dependencies', () => {
  test('a new dependency records the blocker\'s permanent id and still writes the legacy configName', () => {
    const [leasing] = orgData.departments;
    setTaskDependency('leasing', 1, 'leasing', leasing.tasks[0], null);
    expect(leasing.tasks[1].blockedBy).toEqual({ deptId: 'leasing', taskId: 'leasing-001', configName: 'List units', name: 'List units' });
  });

  test('a dependency keeps blocking after the blocker is renamed or moved to another department', () => {
    const [leasing, accounting] = orgData.departments;
    setTaskDependency('accounting', 0, 'leasing', leasing.tasks[0], null);
    const blocked = accounting.tasks[0];
    expect(isDependencyBlocking(blocked)).toBe(true);

    leasing.tasks[0].name = 'Renamed in config'; leasing.tasks[0]._configName = 'Renamed in config';
    expect(isDependencyBlocking(blocked)).toBe(true);

    accounting.tasks.push(leasing.tasks.shift()); // blocker moved departments; blockedBy.deptId is now stale
    expect(isDependencyBlocking(blocked)).toBe(true);
    accounting.tasks.find(t => t.id === 'leasing-001').status = 'done';
    expect(isDependencyBlocking(blocked)).toBe(false);
  });

  test('a dependency saved by an older version (configName only) still resolves', () => {
    const [leasing] = orgData.departments;
    leasing.tasks[1].blockedBy = { deptId: 'leasing', configName: 'List units', name: 'List units' };
    expect(isDependencyBlocking(leasing.tasks[1])).toBe(true);
    leasing.tasks[0].status = 'done';
    expect(isDependencyBlocking(leasing.tasks[1])).toBe(false);
  });
});
