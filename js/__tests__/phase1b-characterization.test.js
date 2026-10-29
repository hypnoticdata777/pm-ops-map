// Characterization of today's behavior, recorded BEFORE the Phase 1B refactor (domain layer + commit()).
//
// These tests say nothing about how the code is organised. They run the same public functions the UI
// calls and compare what comes out (owners assigned, toasts, coverage and workload as shown in the
// handbook / launch plan / team view, and which parts of the page each action refreshes) with golden
// files recorded from the pre-refactor code. If a refactor changes any of it, a test here fails.
//
// Re-record only on pre-refactor code or for a reviewed, intended behavior change:
//   UPDATE_GOLDEN=1 npx vitest run js/__tests__/phase1b-characterization.test.js
import { describe, test, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { runAutoAssign, removeEmployee, applyRoleTemplate, renderLegend } from '../views/team.js';
import { renderTrackingView, populateOwnerFilter } from '../views/tracking.js';
import { _applyImportedState, undoLastAction, _saveUndoSnapshot } from '../io.js';
import { buildStatePayload } from '../stateSchema.js';
import { loadDemoCompany } from '../launchPlan.js';
import { updateStats } from '../ui.js';
import {
  NOW, FIXTURE_NAMES, load, sha, goldenFile, ownersOf, ownerCounts, captureModel, captureDom, renderEverything,
} from './helpers/phase1b-harness.js';

const golden = goldenFile('phase1b-characterization');
afterAll(() => golden.flush());

let alerts;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); // lease/overdue logic reads the clock; pin it
  vi.setSystemTime(NOW);
  alerts = [];
  vi.stubGlobal('alert', msg => alerts.push(String(msg)));
  vi.stubGlobal('confirm', () => true);
  // app.js exposes these on window; some code paths call them that way.
  window._saveUndoSnapshot = _saveUndoSnapshot;
  window.renderTrackingView = renderTrackingView;
  window.populateOwnerFilter = populateOwnerFilter;
  window.renderLegend = renderLegend;
  window.updateStats = updateStats;
  window.downloadOperationsHandbook = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.downloadOperationsHandbook;
});

const compare = ({ expected, actual }) => expect(actual).toEqual(expected);

// ── Step 4: what coverage, workload and auto-assign produce ───────────────────
describe('domain behavior: coverage, workload and auto-assign, per fixture', () => {
  test.each(FIXTURE_NAMES)('%s', name => {
    load(name);
    const before = captureModel();
    const ownersBefore = ownersOf();
    const countsBefore = ownerCounts();

    runAutoAssign();

    const owners = ownersOf();
    const run = {
      alerts,
      toast: { text: document.getElementById('save-toast').textContent, className: document.getElementById('save-toast').className.replace(/\s*visible\s*/, ' ').trim() },
      ownersSha: sha(owners.join('\n')),
      firstTwenty: owners.slice(0, 20),
      counts: ownerCounts(),
      audit: state.auditLog.map(({ action, count }) => ({ action, count })),
      backups: JSON.parse(localStorage.getItem(storage.BACKUP_KEY) || '[]').map(b => b.label),
      undoSnapshotTaken: state._undoSnapshot !== null,
      changedTasks: owners.filter((o, i) => o !== ownersBefore[i]).length,
    };
    const after = captureModel();

    undoLastAction();
    const undo = { ownersRestored: sha(ownersOf().join('\n')) === sha(ownersBefore.join('\n')), snapshotConsumed: state._undoSnapshot === null };

    compare(golden.entry('domain', name, { before, countsBefore, run, after, undo }));
  });

  test('the same input always gives the same output (no clock or randomness leaks in)', () => {
    load('showcase-partial');
    const first = captureModel();
    load('showcase-partial');
    expect(captureModel()).toEqual(first);
  });
});

// ── Step 5: which parts of the page each save-and-refresh site updates ────────
function setView(view) {
  state.setCurrentView(view);
}

// Each site: a starting fixture, the view the user is on, and the action. The page is fully rendered first,
// then the action runs, and ONLY then is the DOM read. Nothing here calls a renderer after the action.
const SITES = {};
['tracking', 'map', 'team'].forEach(view => {
  SITES[`auto-assign@${view}`] = {
    fixture: 'showcase-partial', view,
    act: () => runAutoAssign(),
  };
  SITES[`undo@${view}`] = {
    fixture: 'showcase-partial', view,
    prepare: () => { runAutoAssign(); renderEverything(); },
    act: () => undoLastAction(),
  };
});
['tracking', 'map', 'workorders', 'team'].forEach(view => {
  SITES[`remove-employee@${view}`] = {
    fixture: 'showcase-partial', view,
    act: () => removeEmployee('Marcus Reyes'),
  };
});
['tracking', 'team'].forEach(view => {
  SITES[`apply-role-template@${view}`] = {
    fixture: 'showcase-partial', view,
    act: () => applyRoleTemplate('solo', true),
  };
  SITES[`load-demo-company@${view}`] = {
    fixture: 'template-twoPerson', view,
    act: () => loadDemoCompany(),
  };
});
['tracking', 'map', 'team'].forEach(view => {
  SITES[`import@${view}`] = {
    fixture: 'template-twoPerson', view,
    act: ctx => _applyImportedState(ctx.payload),
    makePayload: () => {
      load('showcase-partial');
      return JSON.parse(JSON.stringify(buildStatePayload({
        company: 'Imported Co', departments: state.orgData.departments, team: state.teamData,
        workOrders: state.workOrders, portfolio: state.portfolio,
      })));
    },
  };
});

describe('save-and-refresh sites: what each action leaves on the page', () => {
  test.each(Object.keys(SITES))('%s', siteName => {
    const site = SITES[siteName];
    const ctx = { payload: site.makePayload ? site.makePayload() : null };
    load(site.fixture);
    state.setCurrentView('tracking');
    site.prepare?.();
    renderEverything();
    setView(site.view);
    if (site.view === 'workorders' || site.view === 'map' || site.view === 'team') {
      document.querySelectorAll('.view-panel').forEach(p => p.classList.toggle('active', p.id === `${site.view}-view`));
    }
    const before = captureDom();

    site.act(ctx);

    const result = { before: { ...before, toast: undefined }, after: captureDom(), alerts, handbookDownloads: window.downloadOperationsHandbook.mock.calls.length };
    compare(golden.entry('sites', siteName, result));
  });

  test('every site refreshes something (a sanity check that the capture can see changes)', () => {
    load('showcase-partial');
    renderEverything();
    const before = captureDom();
    runAutoAssign();
    const after = captureDom();
    expect(after.departments).not.toBe(before.departments);
    expect(after.stats.unowned).not.toBe(before.stats.unowned);
  });
});
