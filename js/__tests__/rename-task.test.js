// Renaming a task: double-click the name, type, then press Enter (save), Escape (cancel) or click away (save).
// Pressing Enter used to do nothing: the Enter handler marked the edit as "already saved" and then blurred the
// box, and the blur handler skips saving once an edit is marked saved, so the new name was lost and the box
// stayed open. Found while recording the Map & Review screen for Phase 1C and fixed on its own.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { renderTrackingView, startTaskEdit } from '../views/tracking.js';
import { load, NOW } from './helpers/phase1b-harness.js';

const DEPT = 'leasing';
const row = () => document.querySelector(`.department[data-id="${DEPT}"] .task-item[data-task-idx="0"]`);
const input = () => row().querySelector('.task-name-input');
const shownName = () => row().querySelector('.task-name').textContent.trim();
const task = () => state.orgData.departments.find(d => d.id === DEPT).tasks[0];
const storedName = () => JSON.parse(localStorage.getItem(storage.STORAGE_KEY) || '[]').find(d => d.id === DEPT)?.tasks[0].name;
const renames = () => state.auditLog.filter(entry => entry.action === 'name_changed');

let original;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  load('template-solo');
  renderTrackingView();
  original = task().name;
  startTaskEdit(DEPT, 0);
});
afterEach(() => vi.useRealTimers());

const type = value => { input().value = value; };
const press = key => input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const clickAway = () => input().blur();

describe('pressing Enter', () => {
  test('saves the new name: in the list, on the row, and in storage', () => {
    type('Renamed by hand');
    press('Enter');
    expect(task().name).toBe('Renamed by hand');
    expect(shownName()).toBe('Renamed by hand');
    expect(row().dataset.name).toBe('renamed by hand'); // search and filters match on this
    expect(storedName()).toBe('Renamed by hand');
    expect(input()).toBeNull(); // the box closes
  });

  test('is recorded once in the audit log, not twice', () => {
    const box = input();
    type('Renamed by hand');
    press('Enter');
    expect(renames()).toHaveLength(1);
    box.dispatchEvent(new Event('blur')); // a late blur from the box that just closed must not commit again
    expect(renames()).toHaveLength(1);
    expect(task().name).toBe('Renamed by hand');
  });

  test('an empty or blank name is refused and the old name comes back', () => {
    type('   ');
    press('Enter');
    expect(task().name).toBe(original);
    expect(shownName()).toBe(original);
    expect(renames()).toHaveLength(0);
  });

  test('an unchanged name is saved without logging a rename', () => {
    press('Enter');
    expect(task().name).toBe(original);
    expect(renames()).toHaveLength(0);
  });

  test('the name can be edited again afterwards', () => {
    type('First');
    press('Enter');
    startTaskEdit(DEPT, 0);
    type('Second');
    press('Enter');
    expect(task().name).toBe('Second');
    expect(renames()).toHaveLength(2);
  });
});

describe('the other two ways out are unchanged', () => {
  test('clicking away saves', () => {
    type('Saved by clicking away');
    clickAway();
    expect(task().name).toBe('Saved by clicking away');
    expect(storedName()).toBe('Saved by clicking away');
    expect(renames()).toHaveLength(1);
  });

  test('Escape cancels: the old name stays and nothing is saved, even though removing the box blurs it', () => {
    type('Never saved');
    press('Escape');
    expect(task().name).toBe(original);
    expect(shownName()).toBe(original);
    expect(storedName()).toBeUndefined();
    expect(renames()).toHaveLength(0);
  });
});
