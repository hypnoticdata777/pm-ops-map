// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
// Work Orders kanban: 4-column pipeline (Submitted → Scheduled → In Progress → Completed).
import {
  workOrders, setWorkOrders, portfolio,
  WO_STATUS_CYCLE, WO_STATUS_LABELS, WO_STATUS_COLORS,
  PRIORITY_LABELS, asPriority, getEmployeeHex, getEmployeeNames,
} from '../state.js';
import { saveWorkOrders, logAudit } from '../storage.js';
import { escapeHtml, formatDueChip, formatWODate, isValidISODate, formatCurrency } from '../utils.js';
import { updateWorkOrderBeacon } from '../ui.js';

// ── Beacon ────────────────────────────────────────────────────────────────────
export { updateWorkOrderBeacon };

let editingWorkOrderId = null;

function setDatalistOptions(id, values) {
  const list = document.getElementById(id);
  if (!list) return;
  const unique = [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
  list.innerHTML = unique.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
}

// ── Card builder ──────────────────────────────────────────────────────────────
function buildWorkOrderCard(wo) {
  const isUnassigned = wo.assignee === 'UNASSIGNED';
  const priority     = asPriority(wo.priority);
  const statusIdx    = WO_STATUS_CYCLE.indexOf(wo.status);
  const canAdvance   = statusIdx < WO_STATUS_CYCLE.length - 1;
  const nextLabel    = canAdvance ? WO_STATUS_LABELS[WO_STATUS_CYCLE[statusIdx + 1]] : '';
  const assigneeBg   = isUnassigned ? '#d32f2f' : getEmployeeHex(wo.assignee);
  const todayISO     = new Date().toISOString().slice(0, 10);
  const woOverdue    = wo.dueDate && wo.dueDate < todayISO && wo.status !== 'completed';

  return `
    <div class="wo-card priority-border-${priority}${woOverdue ? ' wo-card--overdue' : ''}">
      <div class="wo-card-top">
        <div class="wo-card-location">
          <span class="wo-property">${escapeHtml(wo.property)}</span>
          ${wo.unit ? `<span class="wo-unit">Unit ${escapeHtml(wo.unit)}</span>` : ''}
        </div>
        <span class="priority-dot priority-${priority}"
              title="Priority: ${PRIORITY_LABELS[priority]}"></span>
      </div>
      <div class="wo-card-title">${escapeHtml(wo.title)}</div>
      ${wo.notes  ? `<div class="wo-card-notes">${escapeHtml(wo.notes)}</div>` : ''}
      ${wo.tenant ? `<div class="wo-resident-label">Resident: <strong>${escapeHtml(wo.tenant)}</strong></div>` : ''}
      ${wo.vendor ? `<div class="wo-vendor-label">&#128295; <strong>${escapeHtml(wo.vendor)}</strong></div>` : ''}
      <div class="wo-card-footer">
        <span class="wo-assignee-badge${isUnassigned ? ' owner-unowned' : ''}"
              style="${isUnassigned ? '' : `background:${escapeHtml(assigneeBg)}`}">
          ${isUnassigned ? '&#9888; Unassigned' : escapeHtml(wo.assignee)}
        </span>
        ${wo.cost > 0 ? `<span class="wo-cost">${escapeHtml(formatCurrency(wo.cost))}</span>` : ''}
        <div class="wo-card-actions">
          <button class="wo-edit-btn"
                  data-id="${escapeHtml(wo.id)}"
                  onclick="showEditWorkOrderModal(this.dataset.id)"
                  title="Edit work order">Edit</button>
          ${canAdvance
            ? `<button class="wo-advance-btn"
                       data-id="${escapeHtml(wo.id)}"
                       onclick="advanceWorkOrder(this.dataset.id)"
                       title="Advance to ${escapeHtml(nextLabel)}">&#8594; ${escapeHtml(nextLabel)}</button>`
            : ''}
          <button class="wo-delete-btn"
                  data-id="${escapeHtml(wo.id)}"
                  onclick="deleteWorkOrder(this.dataset.id)"
                  title="Delete work order">&#x2715;</button>
        </div>
      </div>
      <div class="wo-card-date">
        ${wo.dueDate ? `<span class="due-date-chip${woOverdue ? ' due-date-overdue' : ''}"
          title="Target: ${escapeHtml(wo.dueDate)}">${woOverdue ? '⚠ ' : '📅 '}${escapeHtml(formatDueChip(wo.dueDate))}</span>` : ''}
        ${escapeHtml(formatWODate(wo.createdAt))}
      </div>
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderWorkOrdersView() {
  const inner = document.getElementById('workorders-view-inner');
  if (!inner) return;

  const openCount       = workOrders.filter(w => w.status !== 'completed').length;
  const unassignedCount = workOrders.filter(w => w.assignee === 'UNASSIGNED' && w.status !== 'completed').length;
  const completedCount  = workOrders.filter(w => w.status === 'completed').length;

  inner.innerHTML = `
    <div class="wo-toolbar">
      <div class="wo-toolbar-left">
        <h2 class="wo-heading">&#128295; Work Orders</h2>
        <div class="wo-stats-pills">
          <span class="wo-stat-pill wo-stat-open">${openCount} open</span>
          ${unassignedCount > 0
            ? `<span class="wo-stat-pill wo-stat-warn">${unassignedCount} unassigned</span>`
            : ''}
          <span class="wo-stat-pill wo-stat-done">${completedCount} completed</span>
        </div>
      </div>
      <button class="btn btn-secondary" onclick="openRecurringModal()" title="Create a batch of work orders from a recurring PM checklist template">&#128197; Recurring Templates</button>
      <button class="btn btn-primary" onclick="showNewWorkOrderModal()">+ New Work Order</button>
    </div>

    <div class="wo-board">
      ${WO_STATUS_CYCLE.map(status => {
        const cards = workOrders.filter(w => w.status === status);
        return `
          <div class="wo-column">
            <div class="wo-col-header" style="border-top-color:${WO_STATUS_COLORS[status]}">
              <span class="wo-col-title">${WO_STATUS_LABELS[status]}</span>
              <span class="wo-col-count">${cards.length}</span>
            </div>
            <div class="wo-col-body">
              ${cards.length === 0
                ? '<div class="wo-col-empty">No work orders</div>'
                : cards.map(wo => buildWorkOrderCard(wo)).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── Modal — open / close / submit ─────────────────────────────────────────────
export function showNewWorkOrderModal() {
  editingWorkOrderId = null;
  openWorkOrderModal();
}

export function showEditWorkOrderModal(id) {
  const wo = workOrders.find(w => w.id === id);
  if (!wo) return;
  editingWorkOrderId = id;
  openWorkOrderModal(wo);
}

function openWorkOrderModal(wo = null) {
  const modal = document.getElementById('wo-modal');
  if (!modal) return;
  const isEditing = Boolean(wo);

  document.getElementById('wo-modal-title').textContent = isEditing ? 'Edit Work Order' : 'New Work Order';
  const submitBtn = document.getElementById('wo-submit-btn');
  if (submitBtn) submitBtn.textContent = isEditing ? 'Update Work Order \u2192' : 'Create Work Order \u2192';

  const sel = document.getElementById('wo-assignee');
  sel.innerHTML = '<option value="UNASSIGNED">&#8212; Unassigned &#8212;</option>';
  getEmployeeNames().forEach(name => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = name;
    sel.appendChild(opt);
  });

  setDatalistOptions('wo-property-options', portfolio.properties.map(property => property.name));
  setDatalistOptions('wo-tenant-options', portfolio.tenants.map(tenant => tenant.name));
  setDatalistOptions('wo-unit-options', portfolio.tenants.map(tenant => tenant.unit));
  setDatalistOptions('wo-vendor-options', portfolio.vendors.map(vendor => vendor.name));

  ['wo-property','wo-unit','wo-tenant','wo-title','wo-notes','wo-duedate','wo-vendor','wo-cost'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = getWorkOrderFieldValue(wo, id);
    if (el.tagName !== 'TEXTAREA') {
      el.onkeydown = e => {
        if (e.key === 'Enter')  commitNewWorkOrder();
        if (e.key === 'Escape') closeWorkOrderModal();
      };
    }
  });
  document.getElementById('wo-priority').value = wo?.priority || 'medium';
  document.getElementById('wo-assignee').value = wo?.assignee || 'UNASSIGNED';

  modal.classList.add('visible');
  setTimeout(() => document.getElementById('wo-property').focus(), 50);
}

export function closeWorkOrderModal() {
  const modal = document.getElementById('wo-modal');
  if (modal) modal.classList.remove('visible');
  editingWorkOrderId = null;
}

const WO_FIELD_LIMITS = { property: 200, unit: 50, tenant: 200, title: 300, notes: 2000, vendor: 200 };

function _shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
  el.focus();
}

export function commitNewWorkOrder() {
  const property = document.getElementById('wo-property').value.trim().slice(0, WO_FIELD_LIMITS.property);
  const title    = document.getElementById('wo-title').value.trim().slice(0, WO_FIELD_LIMITS.title);

  if (!property) { _shakeField('wo-property'); return; }
  if (!title)    { _shakeField('wo-title');    return; }

  const rawPriority = document.getElementById('wo-priority').value;
  const validPriorities = Object.keys(PRIORITY_LABELS);
  const priority = validPriorities.includes(rawPriority) ? rawPriority : 'medium';

  const rawDate  = document.getElementById('wo-duedate')?.value || '';
  const dueDate  = rawDate && isValidISODate(rawDate) ? rawDate : null;

  const rawCost  = parseFloat(document.getElementById('wo-cost').value);
  const existing = workOrders.find(w => w.id === editingWorkOrderId);
  const payload = {
    property,
    unit:      document.getElementById('wo-unit').value.trim().slice(0, WO_FIELD_LIMITS.unit),
    tenant:    (document.getElementById('wo-tenant')?.value.trim() || '').slice(0, WO_FIELD_LIMITS.tenant),
    title,
    notes:     document.getElementById('wo-notes').value.trim().slice(0, WO_FIELD_LIMITS.notes),
    priority,
    status:    existing?.status || 'submitted',
    assignee:  document.getElementById('wo-assignee').value,
    vendor:    document.getElementById('wo-vendor').value.trim().slice(0, WO_FIELD_LIMITS.vendor),
    dueDate,
    cost:      isNaN(rawCost) || rawCost < 0 ? 0 : rawCost,
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, payload);
    logAudit('wo_updated', { title });
  } else {
    workOrders.push({
      id:        `wo-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...payload,
      createdAt: new Date().toISOString(),
    });
  }

  saveWorkOrders();
  closeWorkOrderModal();
  renderWorkOrdersView();
  updateWorkOrderBeacon();
}

function getWorkOrderFieldValue(wo, id) {
  if (!wo) return '';
  const fieldMap = {
    'wo-property': 'property',
    'wo-unit': 'unit',
    'wo-tenant': 'tenant',
    'wo-title': 'title',
    'wo-notes': 'notes',
    'wo-duedate': 'dueDate',
    'wo-vendor': 'vendor',
    'wo-cost': 'cost',
  };
  const value = wo[fieldMap[id]];
  return value == null ? '' : value;
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
export function advanceWorkOrder(id) {
  const wo = workOrders.find(w => w.id === id);
  if (!wo) return;
  const idx = WO_STATUS_CYCLE.indexOf(wo.status);
  if (idx < WO_STATUS_CYCLE.length - 1) {
    logAudit('wo_advanced', { title: wo.title, from: WO_STATUS_LABELS[wo.status], to: WO_STATUS_LABELS[WO_STATUS_CYCLE[idx + 1]] });
    wo.status    = WO_STATUS_CYCLE[idx + 1];
    wo.updatedAt = new Date().toISOString();
    saveWorkOrders();
    renderWorkOrdersView();
    updateWorkOrderBeacon();
  }
}

export function deleteWorkOrder(id) {
  const wo = workOrders.find(w => w.id === id);
  if (!wo) return;
  if (!confirm(`Delete this work order?\n\n"${wo.title}"\n${wo.property}${wo.unit ? ` · Unit ${wo.unit}` : ''}`)) return;
  if (editingWorkOrderId === id) editingWorkOrderId = null;
  logAudit('wo_deleted', { title: wo.title });
  setWorkOrders(workOrders.filter(w => w.id !== id));
  saveWorkOrders();
  renderWorkOrdersView();
  updateWorkOrderBeacon();
}
