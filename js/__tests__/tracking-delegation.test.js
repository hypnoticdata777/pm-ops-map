// Phase 1C, tracking screen: the Map & Review screen is wired with data-action (js/actions.js), not inline
// handlers. These tests state the end condition for this screen in code, so it cannot drift back:
//  - nothing the screen renders carries an on* attribute, whatever the data looks like;
//  - every action name used in its markup is one the screen registers;
//  - its functions are no longer global.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as state from '../state.js';
import {
  renderTrackingView, toggleBulkMode, toggleTaskCheck, openCustomFields, addCustomField, setTaskDueDate,
  trackingActions, populateOwnerFilter,
} from '../views/tracking.js';
import { showUnownedTasks } from '../launchPlan.js';
import { load, NOW } from './helpers/phase1b-harness.js';

const html = name => fs.readFileSync(path.join(process.cwd(), name), 'utf8');

// Every inline-handler attribute (onclick, ondblclick, onchange, oninput, ...) under a root.
function inlineHandlers(root) {
  const found = [];
  root.querySelectorAll('*').forEach(el => {
    [...el.attributes].filter(a => /^on/i.test(a.name)).forEach(a => found.push(`<${el.localName}> ${a.name}="${a.value}"`));
  });
  return found;
}
const actionNames = root => [...root.querySelectorAll('*')].flatMap(el => [...el.attributes]
  .filter(a => /^data-action(-[a-z]+)?$/.test(a.name)).map(a => a.value));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('alert', () => {});
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has no layout
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// Data that would have broken out of an inline handler: quotes, markup, and an entity.
const HOSTILE = `x" onclick="window.__pwned=1" data-x='&quot;<img src=x onerror=window.__pwned=1>`;
// Custom field names are capped at 40 characters, so the one used there has to fit.
const HOSTILE_KEY = `k" onclick="__pwned=1" x='&quot;<b>`;
if (HOSTILE_KEY.length > 40) throw new Error('keep the hostile key under the 40 character field-name cap');

describe('what the tracking screen renders', () => {
  test('has no inline handlers, in any state: normal, bulk mode, rebuilt row, custom fields', () => {
    load('showcase-partial');
    const dept = state.orgData.departments[0];
    dept.tasks[0].name = HOSTILE;
    dept.tasks[0].owner = HOSTILE;
    dept.tasks[0].blockedBy = { deptId: dept.id, name: HOSTILE };
    dept.tasks[1].dueDate = '2026-10-20';
    renderTrackingView();
    const departments = document.getElementById('departments');
    expect(inlineHandlers(departments)).toEqual([]);

    // The row that is rebuilt in place when a due date changes.
    setTaskDueDate(dept.id, 0, '2026-11-01');
    expect(inlineHandlers(departments)).toEqual([]);

    // Bulk mode: checkboxes on every row, and the bar that appears once something is ticked.
    toggleBulkMode();
    toggleTaskCheck(dept.id, 0);
    expect(inlineHandlers(document.getElementById('departments'))).toEqual([]);
    expect(inlineHandlers(document.getElementById('bulk-action-bar'))).toEqual([]);
    expect(document.querySelectorAll('#bulk-action-bar [data-action]')).toHaveLength(3);

    // Custom fields, including a field whose name tries to close the attribute.
    openCustomFields(dept.id, 0);
    document.getElementById('cf-key-input').value = HOSTILE_KEY;
    document.getElementById('cf-val-input').value = 'v';
    addCustomField(dept.id, 0);
    const body = document.getElementById('custom-fields-body');
    expect(inlineHandlers(body)).toEqual([]);
    expect(body.querySelector('.custom-field-delete').dataset.key).toBe(HOSTILE_KEY); // carried as data, verbatim
    expect(window.__pwned).toBeUndefined();
  });

  test('the filter bar and the empty state in index.html have no inline handlers', () => {
    document.body.innerHTML = html('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
    // The auto-assign button sits in this bar too, but it belongs to the Team screen's conversion.
    const bar = document.getElementById('filter-bar').cloneNode(true);
    bar.querySelector('#auto-assign-btn').remove();
    expect(inlineHandlers(bar)).toEqual([]);
    expect(inlineHandlers(document.getElementById('no-results'))).toEqual([]);
  });

  test('every action name used by the screen is one it registers', () => {
    load('showcase-partial');
    renderTrackingView();
    toggleBulkMode();
    toggleTaskCheck(state.orgData.departments[0].id, 0);
    openCustomFields(state.orgData.departments[0].id, 0);
    document.getElementById('cf-key-input').value = 'k';
    addCustomField(state.orgData.departments[0].id, 0);
    const used = new Set([
      ...actionNames(document.getElementById('departments')),
      ...actionNames(document.getElementById('bulk-action-bar')),
      ...actionNames(document.getElementById('custom-fields-body')),
      ...actionNames(document.getElementById('filter-bar')),
      ...actionNames(document.getElementById('no-results')),
    ]);
    expect(used.size).toBeGreaterThan(10);
    const missing = [...used].filter(name => !(name in trackingActions));
    expect(missing).toEqual([]);
  });

  test('every registered action is used somewhere, so dead entries do not pile up', () => {
    const sources = html('index.html') + fs.readFileSync(path.join(process.cwd(), 'js/views/tracking.js'), 'utf8');
    const unused = Object.keys(trackingActions).filter(name => !sources.includes(`"${name}"`));
    expect(unused).toEqual([]);
  });
});

describe('the functions this screen used to put on window', () => {
  test('are not listed in the window block of app.js any more', () => {
    const app = html('js/app.js');
    const block = app.slice(app.indexOf('Object.assign(window, {'), app.indexOf('\n});', app.indexOf('Object.assign(window, {')));
    const gone = ['renderTrackingView', 'toggleDepartment', 'toggleExpandAllDepartments', 'startTaskEdit', 'showOwnerPicker', 'closeOwnerPicker',
      'setTaskOwner', 'applyFilter', 'clearFilter', 'debounceApplyFilter', 'cycleTaskStatus', 'cycleTaskPriority', 'openDueDatePicker', 'setTaskDueDate',
      'openDependencyPicker', 'setTaskDependency', 'clearTaskDependency', 'toggleBulkMode', 'cancelBulkMode', 'toggleTaskCheck', 'selectAllVisibleTasks',
      'applyBulkAction', 'openTaskNotes', 'openCustomFields', 'addCustomField', 'deleteCustomField'];
    expect(gone.filter(name => new RegExp(`^\\s+${name},`, 'm').test(block))).toEqual([]);
  });

  test('showing unowned tasks from the launch plan still filters, without a global applyFilter', () => {
    load('showcase-partial');
    renderTrackingView();
    populateOwnerFilter();
    expect(window.applyFilter).toBeUndefined();
    const unowned = state.orgData.departments.flatMap(d => d.tasks).filter(t => t.owner === 'UNOWNED').length;
    expect(unowned).toBeGreaterThan(0);

    showUnownedTasks();

    const shown = [...document.querySelectorAll('.task-item')].filter(el => el.style.display !== 'none');
    expect(shown).toHaveLength(unowned);
    expect(shown.every(el => el.dataset.owner === 'UNOWNED')).toBe(true);
  });
});
