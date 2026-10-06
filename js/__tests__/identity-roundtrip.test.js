// "Renaming a task in config.json no longer orphans anyone's progress."
// Each test saves progress under one version of config.json, rewords a starter
// task (what a future release might do), boots the NEW config, and checks the
// progress is still attached — through every path that persists or moves data.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { _applyImportedState, _saveUndoSnapshot, undoLastAction } from '../io.js';
import { buildStatePayload } from '../stateSchema.js';
import { stampTaskIdentity } from '../taskIdentity.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const REWORDED = 'Create listings and syndicate them to every platform';
const OLD_NAME = config.orgData.departments[0].tasks[0].name;

function bootConfig({ rename = false, alias = false } = {}) {
  const orgData = structuredClone(config.orgData);
  if (rename) {
    orgData.departments[0].tasks[0].name = REWORDED;
    if (alias) orgData.departments[0].tasks[0].aliases = [OLD_NAME];
  }
  stampTaskIdentity(orgData.departments);
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  state.setAuditLog([]);
  return orgData.departments[0].tasks[0];
}

const progress = t => ({ owner: t.owner, status: t.status, priority: t.priority, notes: t.notes });
const MADE = { owner: 'Maria', status: 'in-progress', priority: 'high', notes: 'waiting on photos' };

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('progress survives a reworded starter task', () => {
  test('localStorage: saved by this version, loaded by a config that reworded the task', () => {
    Object.assign(bootConfig(), MADE);
    storage.saveToStorage();
    expect(JSON.parse(localStorage.getItem(storage.STORAGE_KEY))[0].tasks[0].id).toBe('leasing-001');

    const reloaded = bootConfig({ rename: true });
    storage.loadFromStorage();
    expect(progress(reloaded)).toEqual(MADE);
    expect(reloaded.name).toBe(REWORDED); // never edited by the user, so it shows the new wording
  });

  test('localStorage written BEFORE ids existed loads through the alias table', () => {
    // Exactly what v1.0 wrote: no id field.
    localStorage.setItem(storage.STORAGE_KEY, JSON.stringify([{
      id: 'leasing', tasks: [{ _configName: OLD_NAME, name: OLD_NAME, owner: 'Maria', status: 'in-progress', priority: 'high', notes: 'waiting on photos' }],
    }]));
    const reloaded = bootConfig({ rename: true, alias: true });
    storage.loadFromStorage();
    expect(progress(reloaded)).toEqual(MADE);
  });

  test('JSON export from this version, imported after the reword', () => {
    Object.assign(bootConfig(), MADE);
    const file = JSON.parse(JSON.stringify(buildStatePayload({
      company: 'Co', departments: state.orgData.departments, team: state.teamData,
      workOrders: [], portfolio: { properties: [], tenants: [], vendors: [] },
    })));
    const reloaded = bootConfig({ rename: true });
    _applyImportedState(file);
    expect(progress(reloaded)).toEqual(MADE);
  });

  test('automatic backup, restored after the reword', () => {
    vi.useFakeTimers();
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    vi.stubGlobal('confirm', () => true);
    Object.assign(bootConfig(), MADE);
    storage.saveBackupSnapshot('before reword');
    const reloaded = bootConfig({ rename: true });
    storage.restoreBackupSnapshot(0);
    vi.useRealTimers();
    expect(progress(reloaded)).toEqual(MADE);
  });

  test('undo snapshot restores onto the same task', () => {
    const t = bootConfig();
    Object.assign(t, MADE);
    _saveUndoSnapshot();
    t.owner = 'UNOWNED'; t.status = 'todo'; t.notes = null;
    undoLastAction();
    expect(progress(t)).toEqual(MADE);
  });

  test('control: without ids or an alias, the reword would orphan the data (this is the bug ids fix)', () => {
    localStorage.setItem(storage.STORAGE_KEY, JSON.stringify([{
      id: 'leasing', tasks: [{ _configName: OLD_NAME, name: OLD_NAME, owner: 'Maria', status: 'done' }],
    }]));
    const reloaded = bootConfig({ rename: true });
    storage.loadFromStorage();
    expect(reloaded.owner).toBe('UNOWNED');
  });
});
