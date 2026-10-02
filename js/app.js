// Entry point for the browser app.
//
// This is the best file to read first when editing the project because it
// shows how the separate feature files fit together:
// - state.js stores shared app data.
// - storage.js loads and saves the user's customized workspace.
// - ui.js manages app-wide UI like the welcome guide, stats, and company name.
// - views/* render each main tab.
// - launchPlan.js and handbook.js add beginner setup/export tools.
//
// Most product changes should happen in the feature files above. Edit this
// file when adding a new screen, adding a new button handler from index.html,
// or changing the app startup order.
import {
  setOrgData, setDefaultAffinities, setOwnerColors, setCurrentView,
} from './state.js';
// Maintainer note:
// index.html calls many functions through inline onclick/onchange/oninput
// attributes. ES modules do not expose imports to window automatically, so
// every HTML-called handler must be imported here and added to
// Object.assign(window, ...) below. If you rename, remove, or move a handler,
// update index.html and this window binding together or the GitHub Pages app
// can render while clicks silently fail.
import {
  loadFromStorage, loadTeamData, loadWorkOrders, loadAuditLog,
  loadPortfolio,
  applyOpsProfile, applyNavCompactState, applyCompanyName,
  resetStorage, closeResetModal, confirmResetStorage,
  toggleNavCompact, COMPANY_KEY,
  openBackupsModal, closeBackupsModal, restoreBackupSnapshot,
} from './storage.js';
import {
  updateStats, updateBeacons,
  showOnboardingModal, submitCompanyName,
  initWelcomeGuide, dismissWelcomeGuide,
  requestNotificationPermission, initNotifications,
} from './ui.js';
import {
  renderTrackingView, toggleDepartment, toggleExpandAllDepartments,
  startTaskEdit, showOwnerPicker, closeOwnerPicker, setTaskOwner,
  populateOwnerFilter, applyFilter, clearFilter, debounceApplyFilter,
  cycleTaskStatus, cycleTaskPriority,
  openDueDatePicker, setTaskDueDate,
  openDependencyPicker, setTaskDependency, clearTaskDependency,
  toggleBulkMode, cancelBulkMode, toggleTaskCheck,
  selectAllVisibleTasks, applyBulkAction,
  openTaskNotes, closeTaskNotes,
  openCustomFields, closeCustomFields, addCustomField, deleteCustomField,
} from './views/tracking.js';
import {
  renderMapControls, renderFlowMap,
  showDeptPanel, closeDeptPanel,
} from './views/map.js';
import {
  renderTeamView, selectPaletteColor,
  commitAddEmployee, removeEmployee, toggleAffinity,
  openRoleTemplatePreview, closeRoleTemplatePreview, applyPreviewedRoleTemplate,
  applyRoleTemplate, runAutoAssign, renderLegend,
  openRolePlaybook, closeRolePlaybook, downloadOpenRolePlaybook,
  openAuditLog, closeAuditLog, clearAuditLog,
} from './views/team.js';
import {
  renderWorkOrdersView,
  showNewWorkOrderModal, closeWorkOrderModal, commitNewWorkOrder,
  advanceWorkOrder, deleteWorkOrder, showEditWorkOrderModal,
} from './views/workorders.js';
import {
  renderPortfolioView, commitAddProperty, commitAddTenant, commitAddVendor,
  deleteProperty, deleteTenant, deleteVendor, addStarterExample,
  startEditProperty, startEditTenant, startEditVendor, cancelPortfolioEdit,
  recordTenantPayment,
  importPropertiesCSV, importTenantsCSV, importVendorsCSV,
} from './views/portfolio.js';
import {
  exportJSON, exportCSV, exportPropertiesCSV, exportTenantsCSV,
  exportVendorsCSV, exportWorkOrdersCSV, importJSON,
  copyStateToClipboard, pasteStateFromClipboard,
  cancelPendingImport, confirmPendingImport,
  _saveUndoSnapshot, undoLastAction,
} from './io.js';
import {
  renderLaunchPlan, toggleLaunchChecklistItem, resetLaunchChecklist,
  focusLaunchDepartment, downloadLaunchPlan,
  startTeamSetup, showUnownedTasks, startWorkOrderSetup, downloadLaunchHandbook,
  focusCoverageArea, loadDemoCompany, startWithDemoCompany, printLaunchPlan,
} from './launchPlan.js';
import { downloadOperationsHandbook, downloadOperationsHandbookHTML, printOperationsHandbook } from './handbook.js';
import {
  openRecurringModal, closeRecurringModal,
  previewRecurringTemplate, applyPendingRecurringTemplate,
} from './views/recurring.js';
import {
  initSync, openSyncModal, closeSyncModal, connectSync, disconnectSync, syncNow,
} from './sync.js';

// ── View switcher ─────────────────────────────────────────────────────────────
function switchView(view, tabEl) {
  // The nav tabs are simple HTML buttons. When someone clicks a tab, this
  // function updates the shared current view, swaps the visible panel, and then
  // asks that feature's renderer to redraw itself from the latest state.
  setCurrentView(view);

  // Hide every major panel before showing the selected one. The panel ids in
  // index.html must follow the pattern "{view}-view" for this to work.
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`${view}-view`).classList.add('active');

  // Keep the nav highlight in sync with the visible panel.
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  tabEl.classList.add('active');

  // The filter bar only belongs to the Tracking view. Clearing filters when
  // leaving Tracking prevents hidden filters from confusing a new editor/user.
  const filterBar = document.getElementById('filter-bar');
  if (view === 'tracking') {
    filterBar.style.display = 'flex';
  } else {
    filterBar.style.display = 'none';
    clearFilter();
    cancelBulkMode();
  }

  closeOwnerPicker();

  // Non-tracking views render on demand so they always reflect the latest
  // edits made in Tracking, Team Manager, or Work Orders.
  if (view === 'map') {
    renderMapControls();
    renderFlowMap();
  } else if (view === 'team') {
    renderTeamView();
  } else if (view === 'workorders') {
    renderWorkOrdersView();
  } else if (view === 'portfolio') {
    renderPortfolioView();
  }
}

// ── App init ──────────────────────────────────────────────────────────────────
function initApp() {
  // Order matters:
  // 1. Load team/work order/audit/task state from localStorage.
  // 2. Render Tracking, Launch Plan, stats, filters, and legend from that state.
  // 3. Apply company/profile UI after the data-backed panels exist.
  // launchPlan.js, ui.js, tracking.js, and team.js all depend on this sequence.
  //
  // If a future change adds a new saved data type, load it before rendering.
  // If it adds a new visible panel, render it after loadFromStorage().
  loadTeamData();
  loadWorkOrders();
  loadPortfolio();
  loadAuditLog();
  loadFromStorage();
  renderTrackingView();
  renderLaunchPlan();
  updateStats();
  populateOwnerFilter();
  renderLegend();
  renderPortfolioView();
  initWelcomeGuide();
  applyOpsProfile();
  renderLaunchPlan();
  applyNavCompactState();
  initSync();

  // Departments start collapsed — a brand-new company otherwise lands on a
  // wall of 260+ UNOWNED tasks across 17 open departments, which is the
  // opposite of the "start here" guidance the Launch Plan is trying to give.
  // Collapsed headers still show task count and done/blocked totals, and
  // "Expand All" in the filter bar is one click away.

  // A saved company name means the user has already onboarded. Otherwise we
  // show the lightweight setup prompt that personalizes exports and headings.
  const savedName = localStorage.getItem(COMPANY_KEY);
  if (savedName) {
    applyCompanyName(savedName);
  } else {
    showOnboardingModal();
  }

  initNotifications();
}

// ── Undo keyboard shortcut (Ctrl+Z / Cmd+Z) ──────────────────────────────────
document.addEventListener('keydown', e => {
  // Undo should feel natural, but it must not steal Ctrl+Z while the user is
  // typing in an input, textarea, or editable field.
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (!isTyping) {
      e.preventDefault();
      undoLastAction();
    }
  }
});

// PROJECT BEACON: Bootstrap is the client composition boundary. Keep config
// loading, stable task identity, and persistence hydration in this order.
// ── Bootstrap: load config.json, then start ───────────────────────────────────
function bootstrapWithConfig(config) {
  setOrgData(config.orgData);
  setDefaultAffinities(config.defaultAffinities);
  setOwnerColors(config.ownerColors);
  // Stamp each task with its original config name as a stable identity key.
  // User edits can rename tasks later, so this hidden key lets storage.js
  // reconnect saved progress to the correct starter task on reload.
  config.orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => { task._configName = task.name; });
  });
  initApp();
}

document.addEventListener('DOMContentLoaded', () => {
  // The production build (npm run build) inlines config.json into the page as
  // window.__PM_OPS_CONFIG__ so the downloaded dist/ folder works by double-
  // clicking index.html — fetch() of a local file is blocked by every modern
  // browser's file:// CORS policy, so a runtime fetch can never work there.
  // The raw source (GitHub Pages, npm start, python -m http.server) has no
  // such global and falls through to the original fetch, unchanged.
  if (window.__PM_OPS_CONFIG__) {
    bootstrapWithConfig(window.__PM_OPS_CONFIG__);
    return;
  }

  fetch('config.json')
    .then(r => {
      if (!r.ok) throw new Error(`config.json fetch failed: ${r.status}`);
      return r.json();
    })
    .then(bootstrapWithConfig)
    .catch(err => {
      console.error('PM Ops Map: could not load config.json —', err);
      document.getElementById('departments').innerHTML =
        '<p style="padding:2rem;color:#d32f2f">⚠ Could not load config.json. ' +
        'Make sure you are serving this app over HTTP (e.g. <code>npm start</code>).</p>';
    });
});

// ── Expose globals for inline HTML onclick handlers ───────────────────────────
// Dependency map for editors:
// - index.html calls these names from onclick/onchange/oninput attributes.
// - launchPlan.js calls some through window.* for guided next-step buttons.
// - team.js calls window._saveUndoSnapshot before bulk auto-assign.
// Add new UI handlers here when adding inline HTML actions.
Object.assign(window, {
  // View
  switchView,
  // Tracking tab: departments, tasks, ownership, status, priority, due dates,
  // dependencies, and filters.
  renderTrackingView,
  toggleDepartment,
  toggleExpandAllDepartments,
  startTaskEdit,
  showOwnerPicker,
  closeOwnerPicker,
  setTaskOwner,
  applyFilter,
  clearFilter,
  debounceApplyFilter,
  cycleTaskStatus,
  cycleTaskPriority,
  openDueDatePicker,
  setTaskDueDate,
  openDependencyPicker,
  setTaskDependency,
  clearTaskDependency,
  toggleBulkMode,
  cancelBulkMode,
  toggleTaskCheck,
  selectAllVisibleTasks,
  applyBulkAction,
  openTaskNotes,
  closeTaskNotes,
  openCustomFields,
  closeCustomFields,
  addCustomField,
  deleteCustomField,
  // Map tab: visual operational flow and department detail panels.
  renderMapControls,
  renderFlowMap,
  showDeptPanel,
  closeDeptPanel,
  // Team tab: employees, role fit, auto-assignment, legend, playbooks, and audit.
  renderTeamView,
  selectPaletteColor,
  commitAddEmployee,
  removeEmployee,
  toggleAffinity,
  openRoleTemplatePreview,
  closeRoleTemplatePreview,
  applyPreviewedRoleTemplate,
  applyRoleTemplate,
  runAutoAssign,
  renderLegend,
  openRolePlaybook,
  closeRolePlaybook,
  downloadOpenRolePlaybook,
  openAuditLog,
  closeAuditLog,
  clearAuditLog,
  // Work Orders tab: intake modal and work order lifecycle actions.
  renderWorkOrdersView,
  showNewWorkOrderModal,
  showEditWorkOrderModal,
  closeWorkOrderModal,
  commitNewWorkOrder,
  advanceWorkOrder,
  deleteWorkOrder,
  // Portfolio tab: starter property and vendor registry.
  renderPortfolioView,
  commitAddProperty,
  commitAddTenant,
  commitAddVendor,
  deleteProperty,
  deleteTenant,
  deleteVendor,
  addStarterExample,
  startEditProperty,
  startEditTenant,
  startEditVendor,
  cancelPortfolioEdit,
  recordTenantPayment,
  importPropertiesCSV,
  importTenantsCSV,
  importVendorsCSV,
  // Import/export tools: let users keep ownership of their data with plain files
  // or clipboard transfer instead of needing a hosted database.
  exportJSON,
  exportCSV,
  exportPropertiesCSV,
  exportTenantsCSV,
  exportVendorsCSV,
  exportWorkOrdersCSV,
  importJSON,
  copyStateToClipboard,
  pasteStateFromClipboard,
  cancelPendingImport,
  confirmPendingImport,
  undoLastAction,
  // Undo snapshot (called from team.js runAutoAssign via window)
  _saveUndoSnapshot,
  // Storage
  resetStorage,
  closeResetModal,
  confirmResetStorage,
  toggleNavCompact,
  openBackupsModal,
  closeBackupsModal,
  restoreBackupSnapshot,
  // App-wide UI: onboarding, guide, notifications, counters, filters, and
  // beginner launch-plan actions.
  showOnboardingModal,
  submitCompanyName,
  dismissWelcomeGuide,
  requestNotificationPermission,
  updateBeacons,
  updateStats,
  populateOwnerFilter,
  renderLaunchPlan,
  toggleLaunchChecklistItem,
  resetLaunchChecklist,
  focusLaunchDepartment,
  focusCoverageArea,
  downloadLaunchPlan,
  printLaunchPlan,
  loadDemoCompany,
  startWithDemoCompany,
  startTeamSetup,
  showUnownedTasks,
  startWorkOrderSetup,
  downloadLaunchHandbook,
  downloadOperationsHandbook,
  downloadOperationsHandbookHTML,
  printOperationsHandbook,
  openRecurringModal,
  closeRecurringModal,
  previewRecurringTemplate,
  applyPendingRecurringTemplate,
  // Team Sync tab: optional self-hosted live sync across devices.
  openSyncModal,
  closeSyncModal,
  connectSync,
  disconnectSync,
  syncNow,
});
