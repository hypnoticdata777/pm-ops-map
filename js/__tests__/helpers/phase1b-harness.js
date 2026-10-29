// Shared harness for the Phase 1B characterization tests (domain layer + commit path).
//
// The idea: record what the CURRENT code does, in golden files, BEFORE refactoring, then prove the
// refactor leaves every recorded output byte-for-byte identical. Nothing here knows how the code is
// organised internally: it drives the same public functions the UI calls and reads the DOM.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../../../config.json';
import * as state from '../../state.js';
import { stampTaskIdentity } from '../../taskIdentity.js';
import { ROLE_TEMPLATES } from '../../templates.js';
import { buildShowcase, applyShowcaseTasks } from '../../showcase.js';
import { updateStats } from '../../ui.js';
import { buildOperationsHandbookMarkdown } from '../../handbook.js';
import { renderTrackingView, populateOwnerFilter } from '../../views/tracking.js';
import { renderTeamView, renderLegend } from '../../views/team.js';
import { renderMapControls, renderFlowMap } from '../../views/map.js';
import { renderPortfolioView } from '../../views/portfolio.js';
import { renderWorkOrdersView } from '../../views/workorders.js';
import * as storage from '../../storage.js';

export const NOW = new Date('2026-10-06T12:00:00.000Z');
const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

export const sha = text => crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
const squash = text => String(text).replace(/\s+/g, ' ').trim();

// ── Golden files ──────────────────────────────────────────────────────────────
// A golden file records what the code did BEFORE a refactor; the refactor must reproduce it exactly.
//   UPDATE_GOLDEN=1 npx vitest run <file>   rewrites the file. Do that only on the pre-refactor code, or
//   when a behavior change is intended and reviewed: the whole point is that it otherwise stays untouched.
export function goldenFile(name) {
  const file = path.join(process.cwd(), 'js/__tests__/golden', `${name}.json`);
  const updating = process.env.UPDATE_GOLDEN === '1';
  const recorded = {};
  const expected = updating ? {} : JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    updating,
    // Returns { expected, actual } for one entry (JSON round-tripped so undefined/NaN compare like the file does).
    entry(group, key, actual) {
      const normalized = JSON.parse(JSON.stringify(actual));
      (recorded[group] ||= {})[key] = normalized;
      return { expected: updating ? normalized : expected[group]?.[key], actual: normalized };
    },
    flush() {
      if (!updating) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(recorded, null, 2)}\n`);
    },
  };
}

// ── Fresh app + deterministic fixtures ────────────────────────────────────────
export function freshApp() {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
  const orgData = structuredClone(config.orgData);
  stampTaskIdentity(orgData.departments);
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  state.setAuditLog([]);
  state.setUndoSnapshot(null);
  state.setCurrentView('tracking');
}

const allTasks = () => state.orgData.departments.flatMap(d => d.tasks.map((task, index) => ({ dept: d, task, index })));
const allDeptIds = () => state.orgData.departments.map(d => d.id);
const team = employees => state.setTeamData({ employees: structuredClone(employees) });

export const FIXTURES = {
  'template-solo': () => team(ROLE_TEMPLATES.solo.employees),
  'template-twoPerson': () => team(ROLE_TEMPLATES.twoPerson.employees),
  'template-maintenanceHeavy': () => team(ROLE_TEMPLATES.maintenanceHeavy.employees),
  'template-leasingHeavy': () => team(ROLE_TEMPLATES.leasingHeavy.employees),

  // The hosted demo's workspace, with every third task handed back so there is something to assign.
  'showcase-partial': () => {
    const showcase = buildShowcase(NOW);
    state.setTeamData(showcase.team);
    state.setPortfolio(showcase.portfolio);
    state.setWorkOrders(showcase.workOrders);
    applyShowcaseTasks(state.orgData.departments, showcase.team.employees, NOW);
    allTasks().forEach(({ task }, i) => { if (i % 3 === 0) task.owner = 'UNOWNED'; });
  },

  // Nobody has an affinity, so every department takes the "no affinity match" fallback.
  'no-affinity': () => team([
    { name: 'Rae', hex: '#336699', affinities: [] },
    { name: 'Sol', hex: '#996633', affinities: [] },
    { name: 'Tia', hex: '#669933', affinities: [] },
  ]),

  // Some affinities, some departments nobody covers, and existing owners (one not on the roster at all).
  'partial-affinity-preowned': () => {
    team([
      { name: 'Ann', hex: '#336699', affinities: ['leasing', 'applications'] },
      { name: 'Bob', hex: '#996633', affinities: ['maintenance', 'vendors'] },
      { name: 'Cy', hex: '#669933', affinities: [] },
    ]);
    const byDept = id => state.orgData.departments.find(d => d.id === id);
    byDept('leasing').tasks.slice(0, 4).forEach(t => { t.owner = 'Ghost Person'; });
    byDept('maintenance').tasks.slice(0, 5).forEach(t => { t.owner = 'Bob'; });
    byDept('applications').tasks.slice(0, 2).forEach(t => { t.owner = 'Ann'; });
  },

  // Equal workloads everywhere: the only thing deciding the winner is roster order.
  'tie-order': () => team([
    { name: 'Zed', hex: '#336699', affinities: allDeptIds() },
    { name: 'Amy', hex: '#996633', affinities: allDeptIds() },
    { name: 'Mia', hex: '#669933', affinities: allDeptIds() },
  ]),

  // One person starts far ahead, so the algorithm should feed the others (and the bars flag overload).
  overloaded: () => {
    team([
      { name: 'Heavy', hex: '#336699', affinities: allDeptIds() },
      { name: 'Light', hex: '#996633', affinities: allDeptIds() },
    ]);
    allTasks().forEach(({ task }, i) => { if (i < 130) task.owner = 'Heavy'; });
  },

  'nothing-unowned': () => {
    team(ROLE_TEMPLATES.solo.employees);
    allTasks().forEach(({ task }) => { task.owner = 'Owner Operator'; });
  },

  'empty-roster': () => team([]),
};

export const FIXTURE_NAMES = Object.keys(FIXTURES);

export function load(name) {
  freshApp();
  FIXTURES[name]();
}

// ── What the app shows ────────────────────────────────────────────────────────
export function ownersOf() {
  return allTasks().map(({ dept, task, index }) => `${dept.id}#${index}=${task.owner}`);
}

export function ownerCounts() {
  const counts = {};
  allTasks().forEach(({ task }) => { counts[task.owner] = (counts[task.owner] || 0) + 1; });
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

const text = selector => squash(document.querySelector(selector)?.textContent ?? '');

// Everything that is a pure function of state, with the renderers called explicitly. This is what
// coverage, workload and unowned counts look like to a user and to the handbook export.
export function captureModel() {
  updateStats();      // also renders the launch plan
  renderTeamView();
  const handbook = buildOperationsHandbookMarkdown();
  const section = (from, to) => {
    const start = handbook.indexOf(from);
    const end = to ? handbook.indexOf(to) : handbook.length;
    return handbook.slice(start, end).trim();
  };
  const fromSnapshot = handbook.slice(handbook.indexOf('## Operating Snapshot'));
  return {
    stats: Object.fromEntries(['total', 'assigned', 'done', 'in-progress', 'blocked', 'overdue', 'unowned', 'departments']
      .map(id => [id, text(`#stat-${id}`)])),
    badge: { text: text('#auto-assign-badge'), display: document.getElementById('auto-assign-badge').style.display },
    autoAssignButton: { disabled: document.getElementById('auto-assign-btn').disabled, title: document.getElementById('auto-assign-btn').title },
    tabBeaconHidden: document.getElementById('tab-beacon').hidden,
    team: {
      alert: text('.team-unowned-alert, .team-all-assigned'),
      bars: [...document.querySelectorAll('#team-view-inner .workload-bar-row')].map(row => squash(row.textContent) + (row.classList.contains('overloaded') ? ' [overloaded]' : '')),
    },
    launch: {
      coverageCards: [...document.querySelectorAll('.launch-coverage-card')].map(card => squash(card.textContent)),
      allText: sha(squash(document.getElementById('launch-plan').textContent)),
      allHtml: sha(document.getElementById('launch-plan').innerHTML),
    },
    handbook: {
      coverage: section('## Critical Coverage', '## First-Week Operating Rhythm'),
      gaps: section('## Setup Gaps To Close', '## Team Roster And Workload'),
      team: section('## Team Roster And Workload', '## Maintenance Intake SOP'),
      wholeFromSnapshot: sha(fromSnapshot),
    },
  };
}

// ── The page exactly as an action left it ─────────────────────────────────────
export function renderEverything() {
  renderTrackingView();
  updateStats();
  populateOwnerFilter();
  renderLegend();
  renderTeamView();
  renderMapControls();
  renderFlowMap();
  renderPortfolioView();
  renderWorkOrdersView();
}

// Raw DOM and storage after an action, WITHOUT calling any renderer: this is what tells us which parts
// of the page each save-and-refresh site actually updates.
export function captureDom() {
  const html = id => sha(document.getElementById(id)?.innerHTML ?? '<missing>');
  const storageHash = key => sha(localStorage.getItem(key) ?? '<none>');
  return {
    view: state.currentView,
    departments: html('departments'),
    expandedDepartments: document.querySelectorAll('.department.expanded').length,
    legend: html('owner-legend'),
    ownerFilter: [...document.querySelectorAll('#owner-filter option')].map(o => o.value),
    teamView: html('team-view-inner'),
    mapControls: html('map-controls'),
    mapSvg: sha(document.querySelector('#map-view svg')?.outerHTML ?? '<none>'),
    portfolioView: html('portfolio-view-inner'),
    workOrdersView: html('workorders-view-inner'),
    launchPlan: html('launch-plan'),
    stats: Object.fromEntries(['total', 'assigned', 'unowned'].map(id => [id, text(`#stat-${id}`)])),
    beacons: { tab: document.getElementById('tab-beacon').hidden, workOrders: document.getElementById('wo-tab-beacon').hidden },
    badge: text('#auto-assign-badge'),
    toast: text('#save-toast'),
    stored: {
      tasks: storageHash(storage.STORAGE_KEY),
      team: storageHash(storage.TEAM_KEY),
      workOrders: storageHash(storage.WORKORDERS_KEY),
      portfolio: storageHash(storage.PORTFOLIO_KEY),
    },
    audit: state.auditLog.map(({ action, count, title }) => ({ action, count, title })),
  };
}
