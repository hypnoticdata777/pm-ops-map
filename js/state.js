/** @import { OrgData, Team, WorkOrder, AuditEntry, Portfolio, PayloadDepartment } from './types.js' */
// Shared mutable application state and constants.
// All modules import state variables from here.
// Use the setter functions to reassign top-level lets — ES module importers
// get live bindings for reading but cannot reassign across module boundaries.

// ── Config (populated once from config.json fetch in app.js) ─────────────────
/** @type {OrgData | null} */
export let orgData           = null;
/** @type {Record<string, string[]> | null} */
export let defaultAffinities = null;
/** @type {Record<string, { hex: string }> | null} */
export let ownerColors       = null;

/** @param {OrgData | null} v */
export function setOrgData(v)           { orgData           = v; }
/** @param {Record<string, string[]> | null} v */
export function setDefaultAffinities(v) { defaultAffinities = v; }
/** @param {Record<string, { hex: string }> | null} v */
export function setOwnerColors(v)       { ownerColors       = v; }

// ── View state ────────────────────────────────────────────────────────────────
/** @type {string} */
export let currentView = 'tracking';
/** @param {string} v */
export function setCurrentView(v) { currentView = v; }

// ── Team & task state ─────────────────────────────────────────────────────────
/** @type {Team} */
export let teamData   = { employees: [] };
/** @type {WorkOrder[]} */
export let workOrders = [];
/** @type {AuditEntry[]} */
export let auditLog   = [];
/** @type {Portfolio} */
export let portfolio  = { properties: [], vendors: [], tenants: [] };

/** @param {Team} v */
export function setTeamData(v)   { teamData   = v; }
/** @param {WorkOrder[]} v */
export function setWorkOrders(v) { workOrders = v; }
/** @param {AuditEntry[]} v */
export function setAuditLog(v)   { auditLog   = v; }
/** @param {Portfolio} v */
export function setPortfolio(v)  { portfolio  = v; }

// ── Map interaction state ─────────────────────────────────────────────────────
/** @type {{ hiddenOwners: Set<string>, focusedOwner: string | null, focusedDept: string | null }} */
export const mapState = {
  hiddenOwners: new Set(),
  focusedOwner: null,
  focusedDept:  null,
};

// ── Undo & UI transient state ─────────────────────────────────────────────────
/** @type {PayloadDepartment[] | null} */
export let _undoSnapshot  = null;
/** @type {string} */
export let _selectedColor = '#e53935'; // default to first palette entry

/** @param {PayloadDepartment[] | null} v */
export function setUndoSnapshot(v)  { _undoSnapshot  = v; }
/** @param {string} v */
export function setSelectedColor(v) { _selectedColor = v; }

// ── Constants ─────────────────────────────────────────────────────────────────
export const COLOR_PALETTE = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
  '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047',
  '#7cb342', '#fb8c00', '#f4511e', '#ff6f00', '#1976d2',
  '#c62828', '#263238', '#6d4c41', '#546e7a', '#00695c'
];

export const STATUS_LABELS = {
  'todo':        'To Do',
  'in-progress': 'In Progress',
  'blocked':     '⚠ Blocked',
  'done':        '✓ Done'
};

export const PRIORITY_LABELS = {
  'high':   'High',
  'medium': 'Medium',
  'low':    'Low'
};

/** @type {ReadonlyArray<string>} */
export const STATUS_CYCLE   = ['todo', 'in-progress', 'blocked', 'done'];
/** @type {ReadonlyArray<string>} */
export const PRIORITY_CYCLE = ['high', 'medium', 'low'];

// Views interpolate status/priority into class names and data-* attributes, so
// they always go through these guards — an unknown value can never reach markup.
/** @param {unknown} v @returns {string} */
export const asStatus   = v => (STATUS_CYCLE.includes(/** @type {string} */ (v))   ? /** @type {string} */ (v) : 'todo');
/** @param {unknown} v @returns {string} */
export const asPriority = v => (PRIORITY_CYCLE.includes(/** @type {string} */ (v)) ? /** @type {string} */ (v) : 'medium');

/** @type {ReadonlyArray<string>} */
export const WO_STATUS_CYCLE  = ['submitted', 'scheduled', 'in-progress', 'completed'];
export const WO_STATUS_LABELS = {
  'submitted':   'Submitted',
  'scheduled':   'Scheduled',
  'in-progress': 'In Progress',
  'completed':   '✓ Completed',
};
export const WO_STATUS_COLORS = {
  'submitted':   '#ef6c00',
  'scheduled':   '#1976d2',
  'in-progress': '#7b1fa2',
  'completed':   '#2e7d32',
};

export const AUDIT_LABELS = {
  owner_changed:      'Owner Changed',
  status_changed:     'Status Changed',
  priority_changed:   'Priority Changed',
  name_changed:       'Task Renamed',
  auto_assign:        'Auto-Assign Run',
  import_file:        'Imported from File',
  import_clipboard:   'Imported from Clipboard',
  import_sync:        'Synced from Team Server',
  sync_connected:      'Team Sync Connected',
  sync_disconnected:   'Team Sync Disconnected',
  wo_advanced:        'Work Order Advanced',
  wo_deleted:         'Work Order Deleted',
  wo_updated:         'Work Order Updated',
  portfolio_property_added:   'Property Added',
  portfolio_property_deleted: 'Property Deleted',
  portfolio_property_updated: 'Property Updated',
  portfolio_tenant_added:     'Tenant Added',
  portfolio_tenant_deleted:   'Tenant Deleted',
  portfolio_tenant_updated:   'Tenant Updated',
  portfolio_vendor_added:     'Vendor Added',
  portfolio_vendor_deleted:   'Vendor Deleted',
  portfolio_vendor_updated:   'Vendor Updated',
  portfolio_payment_recorded: 'Payment Recorded',
  wo_recurring:               'Recurring Template Applied',
  starter_example_added:      'Starter Example Added',
  demo_company_loaded:        'Demo Company Loaded',
  dependency_set:     'Dependency Set',
  dependency_cleared: 'Dependency Cleared',
};

// ── Employee helpers (read teamData + ownerColors) ────────────────────────────

// Returns the hex color for any owner name.
// Checks the live teamData roster first; falls back to ownerColors, then neutral gray.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_HEX = '#607d8b';

// Always a plain #rrggbb value: views put colors straight into style attributes.
/** @param {unknown} v @returns {string} */
export const asHex = v => (typeof v === 'string' && HEX_COLOR.test(v) ? v : FALLBACK_HEX);

/** @param {string} name @returns {string} */
export function getEmployeeHex(name) {
  if (name === 'UNOWNED') return '#d32f2f';
  const emp = teamData.employees.find(e => e.name === name);
  return asHex(emp ? emp.hex : ownerColors?.[name]?.hex);
}

// Returns an array of all employee names in the current roster.
export function getEmployeeNames() {
  return teamData.employees.map(e => e.name);
}

// Tallies tasks per employee. Returns Map<name, taskCount>.
/** @returns {Map<string, number>} */
export function buildWorkloadMap() {
  /** @type {Map<string, number>} */
  const counts = new Map();
  getEmployeeNames().forEach(name => counts.set(name, 0));
  /** @type {OrgData} */ (orgData).departments.forEach(dept => { // loaded at boot, before any view calls this
    dept.tasks.forEach(task => {
      if (task.owner !== 'UNOWNED') {
        counts.set(task.owner, (counts.get(task.owner) || 0) + 1);
      }
    });
  });
  return counts;
}

// Returns the total number of UNOWNED tasks across all departments.
/** @returns {number} */
export function countUnowned() {
  return /** @type {OrgData} */ (orgData).departments.reduce(
    (sum, dept) => sum + dept.tasks.filter(t => t.owner === 'UNOWNED').length,
    0
  );
}
