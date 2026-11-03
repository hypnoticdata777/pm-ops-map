// A decision we made in Nov 2026: when an action replaces the workspace (importing a file, loading the demo
// company), the screen you are looking at has to show the new data straight away. Before this, the map and the
// team view kept drawing the OLD roster until you clicked to another tab and back, which looked like the import
// had half-worked. The golden file (phase1b-characterization) records exactly which parts of the page each action
// refreshes; this test states the user-visible promise in plain words so nobody "optimizes" it away later.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as state from '../state.js';
import { _applyImportedState } from '../io.js';
import { loadDemoCompany } from '../launchPlan.js';
import { buildStatePayload } from '../stateSchema.js';
import { NOW, load, renderEverything } from './helpers/phase1b-harness.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('alert', () => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const text = id => document.getElementById(id).textContent;
function goTo(view) {
  state.setCurrentView(view);
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `${view}-view`));
}

// A workspace file whose team nobody on the starting screen has ever heard of.
function importableWorkspace() {
  load('showcase-partial'); // Dana Whitfield, Marcus Reyes, Priya Raman
  return JSON.parse(JSON.stringify(buildStatePayload({
    company: 'Imported Co', departments: state.orgData.departments, team: state.teamData,
    workOrders: state.workOrders, portfolio: state.portfolio,
  })));
}

describe('importing a workspace', () => {
  test.each(['team', 'map'])('the %s screen you are on shows the imported people immediately', view => {
    const file = importableWorkspace();
    load('template-solo'); // starts with just "Owner Operator"
    renderEverything();
    goTo(view);
    const screen = view === 'team' ? 'team-view-inner' : 'map-view';
    // The map only draws people who own something, and the starting workspace has nobody owning anything,
    // so "the old roster is still showing" can only be checked on the team screen.
    if (view === 'team') expect(text(screen)).toContain('Owner Operator');
    expect(text(screen)).not.toContain('Dana Whitfield');

    _applyImportedState(file);

    expect(text(screen)).toContain('Dana Whitfield');
    if (view === 'team') expect(text(screen)).not.toContain('Owner Operator');
  });
});

describe('loading the demo company', () => {
  test('the team screen you are on shows the demo team immediately', () => {
    load('template-solo');
    renderEverything();
    goTo('team');
    expect(text('team-view-inner')).toContain('Owner Operator');

    loadDemoCompany();

    expect(text('team-view-inner')).toContain('Maintenance Coordinator');
    expect(text('team-view-inner')).not.toContain('Owner Operator');
  });
});
