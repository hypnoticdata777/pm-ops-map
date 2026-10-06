// The three data-loss bugs found in review, each pinned with a failing-first test:
//   1. notes + customFields were missing from JSON export, clipboard copy and Team Sync
//   2. restoring a backup silently dropped notes + customFields
//   3. "Reset everything" left the automatic backups (full workspace copies) behind
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { _applyImportedState, _saveUndoSnapshot, undoLastAction } from '../io.js';
import { buildStatePayload, validateImportedState, STATE_SCHEMA_VERSION } from '../stateSchema.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const dept = () => state.orgData.departments[0];
const task = () => dept().tasks[0];
const roundTrip = payload => JSON.parse(JSON.stringify(payload)); // what actually travels in a file / over sync

function payloadFromState() {
  return buildStatePayload({
    company: 'Test Co', departments: state.orgData.departments, team: state.teamData,
    workOrders: state.workOrders, portfolio: state.portfolio,
  });
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
  const orgData = structuredClone(config.orgData);
  orgData.departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [{ name: 'Maria', hex: '#336699', affinities: [dept().id] }] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  state.setAuditLog([]);
});

afterEach(() => vi.restoreAllMocks());

describe('1. notes and custom fields travel with the workspace', () => {
  test('the payload carries notes and customFields, at schema v3', () => {
    task().notes = 'Call the owner before listing';
    task().customFields = { 'PO #': '4471', Unit: '2B' };
    const payload = payloadFromState();
    expect(STATE_SCHEMA_VERSION).toBe(3);
    expect(payload.schemaVersion).toBe(3);
    expect(payload.departments[0].tasks[0]).toMatchObject({
      notes: 'Call the owner before listing',
      customFields: { 'PO #': '4471', Unit: '2B' },
    });
  });

  test('tasks without notes export explicit nulls (so "cleared" can be told from "unknown")', () => {
    expect(payloadFromState().departments[0].tasks[0]).toMatchObject({ notes: null, customFields: null });
  });

  test('the payload holds a copy — later edits do not leak into an already-built export', () => {
    task().customFields = { a: '1' };
    const payload = payloadFromState();
    task().customFields.a = 'changed';
    expect(payload.departments[0].tasks[0].customFields.a).toBe('1');
  });

  test('export -> import on a fresh device restores notes and custom fields', () => {
    task().notes = 'remember this';
    task().customFields = { 'PO #': '77' };
    const file = roundTrip(payloadFromState());

    task().notes = null;
    task().customFields = null;
    _applyImportedState(file);

    expect(task().notes).toBe('remember this');
    expect(task().customFields).toEqual({ 'PO #': '77' });
    expect(JSON.parse(localStorage.getItem(storage.STORAGE_KEY))[0].tasks[0].notes).toBe('remember this');
  });

  test('a note cleared on another device clears here too (null is an explicit clear)', () => {
    task().notes = 'stale';
    task().customFields = { x: 'y' };
    const file = roundTrip(payloadFromState());
    file.departments[0].tasks[0].notes = null;
    file.departments[0].tasks[0].customFields = null;
    _applyImportedState(file);
    expect(task().notes).toBeNull();
    expect(task().customFields).toBeNull();
  });

  test('an older (v2) file that has no notes key leaves local notes alone', () => {
    task().notes = 'keep me';
    task().customFields = { keep: 'me' };
    const file = roundTrip(payloadFromState());
    file.schemaVersion = 2;
    delete file.departments[0].tasks[0].notes;
    delete file.departments[0].tasks[0].customFields;
    expect(validateImportedState(file, state.orgData).ok).toBe(true);
    _applyImportedState(file);
    expect(task().notes).toBe('keep me');
    expect(task().customFields).toEqual({ keep: 'me' });
  });

  test('hostile notes and custom fields are capped and cleaned on the way in', () => {
    const file = roundTrip(payloadFromState());
    file.departments[0].tasks[0].notes = `${'n'.repeat(5000)}\u0000`;
    file.departments[0].tasks[0].customFields = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'v'.repeat(900)]));
    _applyImportedState(file);
    expect(task().notes).toHaveLength(1000);
    expect(Object.keys(task().customFields)).toHaveLength(10);
    expect(Object.values(task().customFields)[0]).toHaveLength(200);
  });

  test('undo after an import puts the previous notes and custom fields back', () => {
    task().notes = 'before';
    task().customFields = { was: 'here' };
    _saveUndoSnapshot();
    const file = roundTrip(payloadFromState());
    file.departments[0].tasks[0].notes = 'after import';
    file.departments[0].tasks[0].customFields = { now: 'different' };
    _applyImportedState(file);
    expect(task().notes).toBe('after import');
    undoLastAction();
    expect(task().notes).toBe('before');
    expect(task().customFields).toEqual({ was: 'here' });
  });

  test('undo restores "no notes" too', () => {
    task().notes = null;
    _saveUndoSnapshot();
    task().notes = 'added later';
    undoLastAction();
    expect(task().notes).toBeNull();
  });
});

describe('2. restoring a backup brings back everything it captured', () => {
  beforeEach(() => {
    vi.useFakeTimers();            // restoreBackupSnapshot reloads the page 800 ms later
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('alert', () => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  test('notes, custom fields, team, work orders and portfolio all come back', () => {
    task().name = 'Renamed task';
    task().owner = 'Maria';
    task().status = 'blocked';
    task().notes = 'backed-up note';
    task().customFields = { 'PO #': '9' };
    state.setWorkOrders([{ id: 'wo-1', property: 'Maple', title: 'Leak', status: 'scheduled', priority: 'high', assignee: 'Maria' }]);
    state.setPortfolio({ properties: [{ id: 'p1', name: 'Oak Duplex', units: 2 }], tenants: [], vendors: [] });
    storage.saveBackupSnapshot('test');

    // Lose everything...
    task().notes = null;
    task().customFields = null;
    task().status = 'todo';
    state.setWorkOrders([]);
    state.setPortfolio({ properties: [], tenants: [], vendors: [] });
    state.setTeamData({ employees: [] });

    storage.restoreBackupSnapshot(0);
    expect(storage.pageControl.reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(storage.pageControl.reload).toHaveBeenCalledTimes(1); // views redraw from the restored state

    expect(task()).toMatchObject({ name: 'Renamed task', owner: 'Maria', status: 'blocked', notes: 'backed-up note', customFields: { 'PO #': '9' } });
    expect(state.workOrders.map(w => w.id)).toEqual(['wo-1']);
    expect(state.portfolio.properties.map(p => p.name)).toEqual(['Oak Duplex']);
    expect(state.teamData.employees.map(e => e.name)).toEqual(['Maria']);
  });

  test('a task that had no notes when the backup was taken has none after restore', () => {
    storage.saveBackupSnapshot('clean');
    task().notes = 'added after the backup';
    task().customFields = { late: 'add' };
    storage.restoreBackupSnapshot(0);
    expect(task().notes).toBeNull();
    expect(task().customFields).toBeNull();
  });

  test('a tampered backup cannot inject unvalidated data', () => {
    storage.saveBackupSnapshot('tampered');
    const backups = JSON.parse(localStorage.getItem(storage.BACKUP_KEY));
    const snapshot = JSON.parse(backups[0].state);
    snapshot.workOrders = [{ id: `"><img src=x>`, title: 'T', status: 'bogus', priority: 'bogus' }];
    snapshot.team = { employees: [{ name: 'Eve', hex: 'url(javascript:1)', affinities: ['nope'] }] };
    backups[0].state = JSON.stringify(snapshot);
    localStorage.setItem(storage.BACKUP_KEY, JSON.stringify(backups));

    storage.restoreBackupSnapshot(0);
    expect(state.workOrders[0]).toMatchObject({ status: 'submitted', priority: 'medium' });
    expect(state.workOrders[0].id).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(state.teamData.employees[0]).toMatchObject({ name: 'Eve', hex: '#607d8b', affinities: [] });
  });
});

// The persisted key names are a compatibility contract with data already sitting in
// users' browsers, so they are spelled out literally here — independent of the lists
// under test — and renaming any of them must be a deliberate, test-updating act.
const KEYS = {
  tasks: 'pm-ops-data-v1', company: 'pm-ops-company-name', profile: 'pm-ops-profile-v1',
  nav: 'pm-ops-nav-compact', team: 'pm-ops-team-v1', workOrders: 'pm-ops-workorders-v1',
  portfolio: 'pm-ops-portfolio-v1', audit: 'pm-ops-audit-v1', guide: 'pm-ops-guide-dismissed',
  notif: 'pm-ops-notif-date', launch: 'pm-ops-launch-checklist-v1', backups: 'pm-ops-backups-v1',
  sync: 'pm-ops-sync-config-v1',
};
const EVERY_KEY = Object.values(KEYS);

describe('3. "Reset" really removes what it says it removes', () => {
  beforeEach(() => {
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('alert', () => {});
    EVERY_KEY.forEach(key => localStorage.setItem(key, JSON.stringify({ sentinel: 'tenant-pii' })));
  });
  afterEach(() => vi.unstubAllGlobals());

  const remaining = () => EVERY_KEY.filter(key => localStorage.getItem(key) !== null);

  test('the key names are the ones already stored in users\' browsers', () => {
    expect([...storage.ALL_STORAGE_KEYS].sort()).toEqual([...EVERY_KEY].sort());
    expect(storage.BACKUP_KEY).toBe(KEYS.backups);
    expect(storage.SYNC_CONFIG_KEY).toBe(KEYS.sync);
  });

  test('every *_KEY constant storage.js exports is covered by "Everything"', () => {
    const exportedKeys = Object.entries(storage).filter(([name, value]) => name.endsWith('_KEY') && typeof value === 'string').map(([, value]) => value);
    expect(exportedKeys.length).toBeGreaterThanOrEqual(13);
    exportedKeys.forEach(key => expect(storage.ALL_STORAGE_KEYS, key).toContain(key));
    expect(new Set(storage.ALL_STORAGE_KEYS).size).toBe(storage.ALL_STORAGE_KEYS.length);
  });

  test('"Everything" leaves no PM Ops Map key behind — automatic backups included', () => {
    storage.confirmResetStorage('4');
    expect(storage.pageControl.reload).toHaveBeenCalledTimes(1);
    expect(remaining()).toEqual([]);
    expect(localStorage.getItem(KEYS.backups)).toBeNull();
    expect(localStorage.getItem(KEYS.sync)).toBeNull();
  });

  test('"Operating workspace" also removes the automatic backups', () => {
    storage.confirmResetStorage('2');
    expect(localStorage.getItem(KEYS.backups)).toBeNull();
    expect(localStorage.getItem(KEYS.portfolio)).toBeNull();
    expect(localStorage.getItem(KEYS.company)).not.toBeNull(); // company setup is a different scope
    expect(localStorage.getItem(KEYS.sync)).not.toBeNull();
  });

  test('"Tasks only" keeps backups, and says so in its confirmation', () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    storage.confirmResetStorage('1');
    expect(localStorage.getItem(KEYS.tasks)).toBeNull();
    expect(localStorage.getItem(KEYS.backups)).not.toBeNull();
    expect(confirmSpy.mock.calls[0][0]).toMatch(/automatic backups are kept/i);
  });

  test('"Company setup" removes the saved Team Sync passphrase', () => {
    storage.confirmResetStorage('3');
    expect(localStorage.getItem(KEYS.sync)).toBeNull();
    expect(localStorage.getItem(KEYS.tasks)).not.toBeNull();
  });

  test('the confirmation says what a reset does NOT touch', () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    storage.confirmResetStorage('4');
    expect(confirmSpy.mock.calls[0][0]).toMatch(/exported earlier/i);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Team Sync server/i);
  });

  test('declining the confirmation removes nothing', () => {
    vi.stubGlobal('confirm', () => false);
    storage.confirmResetStorage('4');
    expect(remaining()).toHaveLength(EVERY_KEY.length);
    expect(storage.pageControl.reload).not.toHaveBeenCalled();
  });

  test('an unknown choice removes nothing', () => {
    storage.confirmResetStorage('9');
    expect(remaining()).toHaveLength(EVERY_KEY.length);
  });

  test('announces the reset so Team Sync can stop writing', () => {
    const listener = vi.fn();
    window.addEventListener(storage.RESET_EVENT, listener);
    storage.confirmResetStorage('4');
    window.removeEventListener(storage.RESET_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('the reset modal text no longer overpromises', () => {
    const modal = document.getElementById('reset-modal').textContent;
    expect(modal).toMatch(/automatic backups/i);
    expect(modal).toMatch(/not affected/i);
  });
});
