import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { stampTaskIdentity, findConfigTask, findBlockerTask } from '../taskIdentity.js';
import { applySavedTasks, normalizeBlockedBy, normalizeSavedTask } from '../normalize.js';

const clone = v => JSON.parse(JSON.stringify(v));
const EVIL = '"><img src=x onerror=alert(1)>';

function depts() {
  return stampTaskIdentity(clone([
    { id: 'leasing', tasks: [
      { id: 'leasing-001', name: 'List units', owner: 'UNOWNED' },
      { id: 'leasing-002', name: 'Show units', owner: 'UNOWNED' },
    ] },
    { id: 'vendors', tasks: [{ id: 'vendors-001', name: 'Review owner billable expenses', owner: 'UNOWNED' }] },
    { id: 'accounting', tasks: [{ id: 'accounting-001', name: 'Review owner billable expenses', owner: 'UNOWNED' }] },
  ]));
}

describe('stampTaskIdentity', () => {
  test('records the config name as _configName and keeps config ids', () => {
    const d = depts();
    expect(d[0].tasks[0]).toMatchObject({ id: 'leasing-001', _configName: 'List units' });
  });

  test('gives a deterministic, unique fallback id to tasks from a config without ids', () => {
    const make = () => stampTaskIdentity([{ id: 'leasing', tasks: [
      { name: 'List units', owner: 'U' }, { name: 'List units!', owner: 'U' }, { name: 'Show units', owner: 'U' },
    ] }]);
    const ids = make()[0].tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach(id => expect(id).toMatch(/^leasing-[a-z0-9-]+$/));
    expect(make()[0].tasks.map(t => t.id)).toEqual(ids); // same input -> same ids
  });

  test('repairs unsafe or duplicated ids instead of trusting them', () => {
    const d = stampTaskIdentity([{ id: 'leasing', tasks: [
      { id: 'leasing-001', name: 'A', owner: 'U' }, { id: 'leasing-001', name: 'B', owner: 'U' }, { id: EVIL, name: 'C', owner: 'U' },
    ] }]);
    const ids = d[0].tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('leasing-001');
    ids.forEach(id => expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/));
  });

  test('is idempotent', () => {
    const d = depts();
    const before = JSON.stringify(d);
    stampTaskIdentity(d);
    expect(JSON.stringify(d)).toBe(before);
  });

  test('stamps every task of the real config with a unique id', () => {
    const real = stampTaskIdentity(clone(config.orgData.departments));
    const ids = real.flatMap(d => d.tasks.map(t => t.id));
    expect(ids).toHaveLength(262);
    expect(new Set(ids).size).toBe(262);
    expect(real.flatMap(d => d.tasks).every(t => t._configName === t.name)).toBe(true);
  });
});

describe('findConfigTask', () => {
  test('matches by id first, even when the saved name and _configName are stale', () => {
    const d = depts();
    const t = findConfigTask(d, { id: 'leasing-002', _configName: 'Old name', name: 'Whatever' }, { deptId: 'leasing' });
    expect(t).toBe(d[0].tasks[1]);
  });

  test('an id match works across departments (a task moved in config keeps its progress)', () => {
    const d = depts();
    expect(findConfigTask(d, { id: 'leasing-001', name: 'x' }, { deptId: 'accounting' })).toBe(d[0].tasks[0]);
  });

  test('falls back to _configName, then to name, inside the saved department', () => {
    const d = depts();
    expect(findConfigTask(d, { _configName: 'Show units' }, { deptId: 'leasing' })).toBe(d[0].tasks[1]);
    expect(findConfigTask(d, { name: 'Show units' }, { deptId: 'leasing' })).toBe(d[0].tasks[1]);
    expect(findConfigTask(d, { _configName: 'Show units' }, { deptId: 'vendors' })).toBeNull();
  });

  test('falls back to a task\'s aliases (former config names) for data saved before ids existed', () => {
    const d = depts();
    d[0].tasks[0].aliases = ['List all units'];
    expect(findConfigTask(d, { _configName: 'List all units' }, { deptId: 'leasing' })).toBe(d[0].tasks[0]);
  });

  test('same-named tasks in two departments never collide', () => {
    const d = depts();
    expect(findConfigTask(d, { id: 'vendors-001' }, { deptId: 'vendors' })).toBe(d[1].tasks[0]);
    expect(findConfigTask(d, { id: 'accounting-001' }, { deptId: 'accounting' })).toBe(d[2].tasks[0]);
    expect(findConfigTask(d, { _configName: 'Review owner billable expenses' }, { deptId: 'accounting' })).toBe(d[2].tasks[0]);
  });

  test('an unknown id with no usable legacy key matches nothing; hostile input never throws', () => {
    const d = depts();
    expect(findConfigTask(d, { id: 'nope-999' }, { deptId: 'leasing' })).toBeNull();
    expect(findConfigTask(d, { id: EVIL, _configName: EVIL }, { deptId: 'leasing' })).toBeNull();
    expect(findConfigTask(d, null, { deptId: 'leasing' })).toBeNull();
    expect(findConfigTask(d, { id: { toString: 1 } }, { deptId: 'leasing' })).toBeNull();
  });
});

describe('applySavedTasks — renaming a starter task no longer orphans progress', () => {
  function liveConfigAfterRename() {
    const renamed = clone(config.orgData.departments);
    renamed[0].tasks[0].name = 'Create listings and syndicate them to every platform'; // reworded in config.json
    return stampTaskIdentity(renamed);
  }
  const savedFromOldVersion = () => {
    const before = stampTaskIdentity(clone(config.orgData.departments));
    const t = before[0].tasks[0];
    return [{ id: before[0].id, tasks: [{ id: t.id, _configName: t._configName, name: t.name, owner: 'Maria', status: 'done', priority: 'high' }] }];
  };

  test('data saved with an id follows the task through a rename', () => {
    const live = liveConfigAfterRename();
    const result = applySavedTasks(live, savedFromOldVersion());
    expect(result).toEqual({ matched: 1, skipped: 0 });
    expect(live[0].tasks[0]).toMatchObject({ owner: 'Maria', status: 'done', priority: 'high' });
  });

  test('data saved BEFORE ids existed survives a rename when the old name is listed as an alias', () => {
    const legacy = savedFromOldVersion();
    delete legacy[0].tasks[0].id;
    const withAlias = clone(config.orgData.departments);
    withAlias[0].tasks[0].name = 'Create listings and syndicate them to every platform';
    withAlias[0].tasks[0].aliases = [config.orgData.departments[0].tasks[0].name];
    const live = stampTaskIdentity(withAlias);
    expect(applySavedTasks(live, legacy)).toEqual({ matched: 1, skipped: 0 });
    expect(live[0].tasks[0].owner).toBe('Maria');
  });

  test('data saved BEFORE ids existed, with no alias, is reported as skipped rather than misapplied', () => {
    const legacy = savedFromOldVersion();
    delete legacy[0].tasks[0].id;
    const live = liveConfigAfterRename();
    expect(applySavedTasks(live, legacy)).toEqual({ matched: 0, skipped: 1 });
    expect(live[0].tasks[0].owner).toBe('UNOWNED');
  });

  test('legacy data (no ids at all) still matches the current config by _configName', () => {
    const live = stampTaskIdentity(clone(config.orgData.departments));
    const legacy = savedFromOldVersion();
    delete legacy[0].tasks[0].id;
    expect(applySavedTasks(live, legacy)).toEqual({ matched: 1, skipped: 0 });
  });

  describe('names: unedited rows follow config.json, edited rows keep the user\'s wording', () => {
    const liveWith = (name, extra = {}) => stampTaskIdentity([{ id: 'leasing', tasks: [{ id: 'leasing-001', name, owner: 'UNOWNED', ...extra }] }]);
    const rowFor = row => [{ id: 'leasing', tasks: [{ id: 'leasing-001', owner: 'Maria', ...row }] }];

    test('a task whose name was never edited adopts the reworded starter name', () => {
      const live = liveWith('Reworded starter name');
      applySavedTasks(live, rowFor({ _configName: 'Old starter name', name: 'Old starter name' }));
      expect(live[0].tasks[0]).toMatchObject({ name: 'Reworded starter name', owner: 'Maria' });
    });

    test('a task the user renamed keeps the user\'s name through a config reword', () => {
      const live = liveWith('Reworded starter name');
      applySavedTasks(live, rowFor({ _configName: 'Old starter name', name: 'My own wording' }));
      expect(live[0].tasks[0].name).toBe('My own wording');
    });

    test('restoring an unedited row puts the starter name back over a later custom rename (undo / backup restore)', () => {
      const live = liveWith('Starter name');
      live[0].tasks[0].name = 'Renamed after the backup was taken';
      applySavedTasks(live, rowFor({ _configName: 'Starter name', name: 'Starter name' }), { fill: true });
      expect(live[0].tasks[0].name).toBe('Starter name');
    });

    test('a row with no _configName (very old files) still applies its name as before', () => {
      const live = liveWith('Starter name');
      applySavedTasks(live, rowFor({ name: 'Starter name' }));
      expect(live[0].tasks[0].name).toBe('Starter name');
    });
  });

  test('normalizeSavedTask never lets a saved row overwrite the id', () => {
    expect(normalizeSavedTask({ id: 'leasing-001', name: 'x', owner: 'y' })).not.toHaveProperty('id');
  });
});

describe('blockedBy accepts the new taskId shape and the old shape', () => {
  test('old shape (configName only) is still accepted', () => {
    expect(normalizeBlockedBy({ deptId: 'leasing', configName: 'List units', name: 'List units' }))
      .toEqual({ deptId: 'leasing', configName: 'List units', name: 'List units' });
  });
  test('new shape (taskId) is accepted with or without configName', () => {
    expect(normalizeBlockedBy({ deptId: 'leasing', taskId: 'leasing-001', configName: 'List units', name: 'List units' }))
      .toEqual({ deptId: 'leasing', taskId: 'leasing-001', configName: 'List units', name: 'List units' });
    expect(normalizeBlockedBy({ deptId: 'leasing', taskId: 'leasing-001', name: 'List units' }))
      .toEqual({ deptId: 'leasing', taskId: 'leasing-001', name: 'List units' });
  });
  test('needs a department and at least one usable key; unsafe ids are dropped', () => {
    expect(normalizeBlockedBy({ deptId: 'leasing', name: 'x' })).toBeNull();
    expect(normalizeBlockedBy({ taskId: 'leasing-001', name: 'x' })).toBeNull();
    expect(normalizeBlockedBy({ deptId: 'leasing', taskId: EVIL, configName: 'List units' })).toEqual({ deptId: 'leasing', configName: 'List units', name: 'List units' });
    expect(normalizeBlockedBy({ deptId: 'leasing', taskId: EVIL })).toBeNull();
  });
});

describe('findBlockerTask', () => {
  test('resolves by taskId even after the blocker was renamed or moved', () => {
    const d = depts();
    d[0].tasks[0].name = 'Renamed since';
    expect(findBlockerTask(d, { deptId: 'accounting', taskId: 'leasing-001', configName: 'List units', name: 'List units' })).toBe(d[0].tasks[0]);
  });
  test('resolves old-shape references by configName in their own department', () => {
    const d = depts();
    expect(findBlockerTask(d, { deptId: 'accounting', configName: 'Review owner billable expenses', name: 'x' })).toBe(d[2].tasks[0]);
    expect(findBlockerTask(d, { deptId: 'vendors', configName: 'Review owner billable expenses', name: 'x' })).toBe(d[1].tasks[0]);
  });
  test('returns null for a missing blocker or no reference', () => {
    const d = depts();
    expect(findBlockerTask(d, { deptId: 'leasing', configName: 'Gone', name: 'Gone' })).toBeNull();
    expect(findBlockerTask(d, null)).toBeNull();
  });
});
