// One path for "I changed the workspace: save it, and bring the page up to date".
//
// This used to be copy-pasted (saveToStorage(); renderTrackingView(); updateStats(); ...) in auto-assign,
// undo, import, removing a person, applying a role template and loading the demo company, each with a
// slightly different set and order. commit() runs the steps it is given, in the order it is given them,
// so every site states exactly what it saves and refreshes, and the choice lives in one place:
//
//   commit({ persist: ['team', 'tasks'], refresh: REFRESH_AFTER_ROSTER_CHANGE });
//
// Step names are checked BEFORE anything runs, so a typo fails loudly instead of silently skipping a refresh.
// Steps that depend on the screen the user is on (the map, the team view) end in "IfCurrent".
import { currentView } from './state.js';
import { saveToStorage, saveTeamData, saveWorkOrders, savePortfolio } from './storage.js';
import { updateStats, updateWorkOrderBeacon } from './ui.js';
import { renderTrackingView, populateOwnerFilter } from './views/tracking.js';
import { renderTeamView, renderLegend } from './views/team.js';
import { renderMapControls, renderFlowMap } from './views/map.js';
import { renderPortfolioView } from './views/portfolio.js';
import { renderWorkOrdersView } from './views/workorders.js';
import { renderLaunchPlan } from './launchPlan.js';

/** @typedef {'tasks' | 'team' | 'workOrders' | 'portfolio'} PersistTarget */
/** @typedef {'tracking' | 'stats' | 'ownerFilter' | 'legend' | 'team' | 'portfolio' | 'launchPlan' | 'workOrderBeacon' | 'expandDepartments' | 'mapIfCurrent' | 'teamIfCurrent' | 'workOrdersIfCurrent'} RefreshStep */
/** @typedef {{ persist?: PersistTarget[], refresh?: RefreshStep[] }} Change */

/**
 * Wraps a step so it only runs while the user is on `view` (checked when it runs, not when it is built).
 * @param {() => string} getView
 * @param {string} view
 * @param {() => void} step
 * @returns {() => void}
 */
export function whenViewIs(getView, view, step) {
  return () => { if (getView() === view) step(); };
}

/**
 * Builds a commit function over a table of savers and refreshers. The app uses the real tables (below);
 * tests pass spies.
 * @param {{ savers: Record<string, () => void>, refreshers: Record<string, () => void> }} tables
 * @returns {(change?: { persist?: string[], refresh?: string[] }) => void}
 */
export function createCommit({ savers, refreshers }) {
  /** @param {string} kind @param {Record<string, () => void>} table @param {string[]} names */
  const check = (kind, table, names) => names.forEach(name => {
    if (!Object.hasOwn(table, name)) {
      throw new Error(`commit(): unknown ${kind} "${name}". Choose from: ${Object.keys(table).join(', ')}.`);
    }
  });
  return function commitChange({ persist = [], refresh = [] } = {}) {
    check('persist target', savers, persist);   // all names are validated before anything is saved or drawn
    check('refresh step', refreshers, refresh);
    persist.forEach(name => savers[name]());
    refresh.forEach(name => refreshers[name]());
  };
}

const getCurrentView = () => currentView; // live binding: read when a step runs

/** @type {Record<PersistTarget, () => void>} */
const SAVERS = {
  tasks: saveToStorage,
  team: saveTeamData,
  workOrders: saveWorkOrders,
  portfolio: savePortfolio,
};

/** @type {Record<RefreshStep, () => void>} */
const REFRESHERS = {
  tracking: renderTrackingView,
  stats: updateStats,                 // also redraws the launch plan and the beacons
  ownerFilter: populateOwnerFilter,
  legend: renderLegend,
  team: renderTeamView,
  portfolio: renderPortfolioView,
  launchPlan: renderLaunchPlan,
  workOrderBeacon: updateWorkOrderBeacon,
  expandDepartments: () => document.querySelectorAll('.department').forEach(dept => dept.classList.add('expanded')),
  mapIfCurrent: whenViewIs(getCurrentView, 'map', () => { renderMapControls(); renderFlowMap(); }),
  teamIfCurrent: whenViewIs(getCurrentView, 'team', renderTeamView),
  workOrdersIfCurrent: whenViewIs(getCurrentView, 'workorders', renderWorkOrdersView),
};

export const PERSIST_TARGETS = /** @type {PersistTarget[]} */ (Object.keys(SAVERS));
export const REFRESH_STEPS = /** @type {RefreshStep[]} */ (Object.keys(REFRESHERS));

// The refresh lists the old copy-pasted blocks used, in the order they used them.
/** @type {RefreshStep[]} Auto-assign, undo: task owners changed. */
export const REFRESH_AFTER_TASK_CHANGE = ['tracking', 'stats', 'ownerFilter', 'legend', 'mapIfCurrent', 'teamIfCurrent'];
/** @type {RefreshStep[]} A file, clipboard or sync workspace was applied. */
export const REFRESH_AFTER_IMPORT = ['tracking', 'stats', 'expandDepartments', 'ownerFilter', 'legend', 'portfolio'];
/** @type {RefreshStep[]} Someone was removed from the roster. */
export const REFRESH_AFTER_ROSTER_CHANGE = ['team', 'tracking', 'stats', 'legend', 'ownerFilter', 'workOrdersIfCurrent', 'workOrderBeacon', 'mapIfCurrent'];
/** @type {RefreshStep[]} A role template replaced the roster. */
export const REFRESH_AFTER_TEMPLATE = ['team', 'tracking', 'stats', 'legend', 'ownerFilter', 'workOrderBeacon'];
/** @type {RefreshStep[]} The demo company was loaded. */
export const REFRESH_AFTER_DEMO_COMPANY = ['launchPlan', 'tracking', 'ownerFilter', 'legend', 'stats'];

/** @type {(change?: Change) => void} */
export const commit = createCommit({ savers: SAVERS, refreshers: REFRESHERS });
