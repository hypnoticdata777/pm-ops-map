// Export / Import / Clipboard sync / Undo stack.
import {
  orgData, teamData, setTeamData, workOrders, setWorkOrders,
  portfolio, setPortfolio, _undoSnapshot, setUndoSnapshot, currentView,
} from './state.js';
import {
  saveToStorage, saveTeamData, saveWorkOrders, savePortfolio, logAudit,
  getCompanyName, applyCompanyName, COMPANY_KEY,
  _showActionToast, _fileSlug, saveBackupSnapshot,
} from './storage.js';
import { escapeHtml, isValidISODate, _downloadBlob, toCSV, MAX_IMPORT_BYTES } from './utils.js';
import { buildStatePayload, validateImportedState, formatImportReport } from './stateSchema.js';
import { applySavedTasks, sanitizeWorkspace } from './normalize.js';
import { updateStats } from './ui.js';
import { renderTrackingView, populateOwnerFilter } from './views/tracking.js';
import { renderMapControls, renderFlowMap } from './views/map.js';
import { renderTeamView, renderLegend } from './views/team.js';
import { renderPortfolioView } from './views/portfolio.js';

let pendingImport = null;

// ── Undo stack (single-level, before bulk ops) ────────────────────────────────
export function _saveUndoSnapshot() {
  setUndoSnapshot(orgData.departments.map(dept => ({
    id: dept.id,
    tasks: dept.tasks.map(t => ({
      _configName: t._configName,
      name:        t.name,
      owner:       t.owner,
      status:      t.status   || 'todo',
      priority:    t.priority || 'medium',
      dueDate:     t.dueDate  || null,
      blockedBy:   t.blockedBy || null
    }))
  })));
}

export function undoLastAction() {
  if (!_undoSnapshot) return;
  _undoSnapshot.forEach(snap => {
    const dept = orgData.departments.find(d => d.id === snap.id);
    if (!dept) return;
    snap.tasks.forEach(snapTask => {
      const task = dept.tasks.find(t => t._configName === snapTask._configName);
      if (!task) return;
      task.name     = snapTask.name;
      task.owner    = snapTask.owner;
      task.status   = snapTask.status;
      task.priority = snapTask.priority;
      task.dueDate  = snapTask.dueDate;
      task.blockedBy = snapTask.blockedBy || null;
    });
  });
  setUndoSnapshot(null);
  saveToStorage();
  renderTrackingView();
  updateStats();
  populateOwnerFilter();
  renderLegend();
  if (currentView === 'map') { renderMapControls(); renderFlowMap(); }
  if (currentView === 'team') renderTeamView();
}

// ── Shared import logic ───────────────────────────────────────────────────────
// Exported so sync.js can apply a pulled/conflicting remote workspace through
// the same path as a file/clipboard import.
export function _applyImportedState(data) {
  // Nothing from the file reaches shared state unvalidated: tasks are matched to
  // config by _configName and field-checked, everything else goes through
  // sanitizeWorkspace (enums, colors, ids, dates, numbers, links, lengths).
  applySavedTasks(orgData.departments, data.departments);

  const clean = sanitizeWorkspace(data, { knownDeptIds: orgData.departments.map(d => d.id) });

  if (clean.company) {
    try { localStorage.setItem(COMPANY_KEY, clean.company); } catch (_) {}
    applyCompanyName(clean.company);
  }

  if (clean.team) {
    setTeamData(clean.team);
    saveTeamData();
  }

  if (clean.workOrders) {
    setWorkOrders(clean.workOrders);
    saveWorkOrders();
  }

  if (clean.portfolio) {
    setPortfolio(clean.portfolio);
    savePortfolio();
  }

  saveToStorage();
  renderTrackingView();
  updateStats();
  document.querySelectorAll('.department').forEach(d => d.classList.add('expanded'));
  populateOwnerFilter();
  renderLegend();
  renderPortfolioView();
}

// ── Export ────────────────────────────────────────────────────────────────────
export function exportJSON() {
  const payload = buildStatePayload({
    company:    getCompanyName(),
    departments: orgData.departments,
    team:       teamData,
    workOrders: workOrders,
    portfolio:  portfolio
  });
  _downloadBlob(
    JSON.stringify(payload, null, 2),
    'application/json',
    `pm-ops-${_fileSlug()}.json`
  );
}

export function exportCSV() {
  const rows = [['Department', 'Task', 'Owner', 'Status', 'Priority', 'Due Date']];
  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      rows.push([
        dept.name,
        task.name,
        task.owner,
        task.status   || 'todo',
        task.priority || 'medium',
        task.dueDate  || ''
      ]);
    });
  });
  downloadCSV(rows, `pm-ops-${_fileSlug()}.csv`);
}

export function exportPropertiesCSV() {
  const rows = [['Property', 'Units', 'Owner / Client', 'Notes', 'Document Link', 'Created At']];
  portfolio.properties.forEach(property => {
    rows.push([
      property.name,
      Number(property.units || 0),
      property.owner || '',
      property.notes || '',
      property.documentUrl || '',
      property.createdAt || '',
    ]);
  });
  downloadCSV(rows, `pm-ops-${_fileSlug()}-properties.csv`);
}

export function exportTenantsCSV() {
  const rows = [[
    'Tenant', 'Property', 'Unit', 'Status', 'Phone', 'Email',
    'Monthly Rent', 'Lease Start', 'Lease End', 'Balance Due', 'Document Link', 'Created At',
  ]];
  portfolio.tenants.forEach(tenant => {
    rows.push([
      tenant.name,
      getPortfolioPropertyName(tenant.propertyId),
      tenant.unit || '',
      tenant.status || 'active',
      tenant.phone || '',
      tenant.email || '',
      Number(tenant.rent || 0),
      tenant.leaseStart || '',
      tenant.leaseEnd || '',
      Number(tenant.balanceDue || 0),
      tenant.documentUrl || '',
      tenant.createdAt || '',
    ]);
  });
  downloadCSV(rows, `pm-ops-${_fileSlug()}-tenants.csv`);
}

export function exportVendorsCSV() {
  const rows = [['Vendor', 'Trade', 'Phone', 'Email', 'Document Link', 'Created At']];
  portfolio.vendors.forEach(vendor => {
    rows.push([
      vendor.name,
      vendor.trade || '',
      vendor.phone || '',
      vendor.email || '',
      vendor.documentUrl || '',
      vendor.createdAt || '',
    ]);
  });
  downloadCSV(rows, `pm-ops-${_fileSlug()}-vendors.csv`);
}

export function exportWorkOrdersCSV() {
  const rows = [[
    'Property', 'Unit', 'Tenant', 'Issue', 'Status', 'Priority', 'Assignee',
    'Vendor', 'Target Date', 'Estimated Cost', 'Notes', 'Created At', 'Updated At'
  ]];
  workOrders.forEach(wo => {
    rows.push([
      wo.property || '',
      wo.unit || '',
      wo.tenant || '',
      wo.title || '',
      wo.status || 'submitted',
      wo.priority || 'medium',
      wo.assignee || 'UNASSIGNED',
      wo.vendor || '',
      wo.dueDate || '',
      Number(wo.cost || 0),
      wo.notes || '',
      wo.createdAt || '',
      wo.updatedAt || '',
    ]);
  });
  downloadCSV(rows, `pm-ops-${_fileSlug()}-work-orders.csv`);
}

function getPortfolioPropertyName(propertyId) {
  if (!propertyId) return '';
  return portfolio.properties.find(property => property.id === propertyId)?.name || '';
}

function downloadCSV(rows, filename) {
  // toCSV quotes every cell and neutralizes spreadsheet formulas (see utils.js).
  _downloadBlob(toCSV(rows), 'text/csv', filename);
}

// ── Import ────────────────────────────────────────────────────────────────────
export function importJSON(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    alert(`Import failed: that file is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is ${MAX_IMPORT_BYTES / 1048576} MB.`);
    inputEl.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const report = validateImportedState(data, orgData);
      openImportReview(data, report, 'file');
    } catch (e) {
      alert('Import failed: invalid or incompatible file.');
    } finally {
      inputEl.value = '';
    }
  };
  reader.readAsText(file);
}

// ── Clipboard sync ────────────────────────────────────────────────────────────
export function copyStateToClipboard() {
  const payload = JSON.stringify(buildStatePayload({
    company:    getCompanyName(),
    departments: orgData.departments,
    team:       teamData,
    workOrders: workOrders,
    portfolio:  portfolio
  }), null, 2);

  if (!navigator.clipboard) {
    alert('Clipboard API not available. Use Export JSON instead.');
    return;
  }
  navigator.clipboard.writeText(payload)
    .then(() => _showActionToast('✓ State copied — paste on another device', 'save-toast--success'))
    .catch(() => _showActionToast('⚠ Clipboard access denied', 'save-toast--error'));
}

export async function pasteStateFromClipboard() {
  if (!navigator.clipboard) {
    alert('Clipboard API not available in this context.');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);
    const report = validateImportedState(data, orgData);
    openImportReview(data, report, 'clipboard');
  } catch (e) {
    const detail = e?.message && e.message.includes('Import validation report')
      ? `\n\n${e.message}`
      : '\nMake sure you copied a valid export first.';
    alert(`Could not read PM Ops state from clipboard.${detail}`);
  }
}

// onApplied, if given, runs after a successful confirmPendingImport() — used
// by sync.js to record the new sync version once the user accepts the pull.
export function openImportReview(data, report, source = 'file', onApplied = null) {
  pendingImport = { data, report, source, onApplied };
  const modal = document.getElementById('import-review-modal');
  const body = document.getElementById('import-review-body');
  const confirmBtn = document.getElementById('import-confirm-btn');

  if (!modal || !body || !confirmBtn) {
    if (!report.ok) {
      alert(formatImportReport(report));
      pendingImport = null;
      return;
    }
    if (!confirm(`${formatImportReport(report)}\n\nContinue with import?`)) {
      pendingImport = null;
      return;
    }
    confirmPendingImport();
    return;
  }

  body.innerHTML = buildImportReviewHTML(report, source);
  confirmBtn.disabled = !report.ok;
  confirmBtn.textContent = report.ok ? 'Import Workspace' : 'Cannot Import';
  modal.classList.add('visible');
}

export function cancelPendingImport() {
  pendingImport = null;
  document.getElementById('import-review-modal')?.classList.remove('visible');
}

const IMPORT_AUDIT_ACTIONS = {
  clipboard: 'import_clipboard',
  sync: 'import_sync',
};
const IMPORT_SUCCESS_TOASTS = {
  clipboard: 'State pasted from clipboard',
  sync: 'Synced from team server',
};

export function confirmPendingImport() {
  if (!pendingImport || !pendingImport.report.ok) return;
  const { data, source, onApplied } = pendingImport;
  saveBackupSnapshot('Before import');
  _saveUndoSnapshot();
  _applyImportedState(data);
  logAudit(IMPORT_AUDIT_ACTIONS[source] || 'import_file');
  cancelPendingImport();
  _showActionToast(IMPORT_SUCCESS_TOASTS[source] || 'Workspace imported', 'save-toast--success');
  onApplied?.();
}

function buildImportReviewHTML(report, source) {
  return `
    <p class="import-review-note">
      ${{ clipboard: 'Clipboard state', sync: 'Your team sync server' }[source] || 'JSON file'} will replace matching task assignments, statuses, due dates, dependencies, team data, work orders, and portfolio data on this device.
    </p>
    <div class="import-review-summary">
      ${buildImportMetric('Schema', String(report.schemaVersion))}
      ${buildImportMetric('Company', report.company || 'None')}
      ${buildImportMetric('Tasks', String(report.matchedTasks))}
      ${buildImportMetric('Work orders', String(report.workOrders))}
      ${buildImportMetric('Properties', String(report.properties))}
      ${buildImportMetric('Tenants', String(report.tenants))}
      ${buildImportMetric('Vendors', String(report.vendors))}
      ${buildImportMetric('Team', String(report.teamMembers))}
    </div>
    ${report.warnings.length ? buildImportList('Warnings', report.warnings, 'warn') : ''}
    ${report.errors.length ? buildImportList('Errors', report.errors, 'error') : ''}
    <div class="import-review-section">
      <h3>Matching summary</h3>
      <ul>
        <li>${report.matchedDepartments} departments matched.</li>
        <li>${report.skippedDepartments} departments skipped.</li>
        <li>${report.skippedTasks} tasks skipped.</li>
        <li>${report.invalidDueDates} invalid due dates will be cleared.</li>
        <li>${report.invalidTasks} task rows were unusable and will be ignored.</li>
        <li>${report.repairedRecords} team / work order / portfolio records had invalid fields that will be reset.</li>
        <li>${report.droppedRecords} team / work order / portfolio records are unusable and will be skipped.</li>
      </ul>
    </div>
  `;
}

function buildImportMetric(label, value) {
  return `
    <div class="import-review-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function buildImportList(title, items, tone) {
  return `
    <div class="import-review-section import-review-section--${tone}">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `;
}
