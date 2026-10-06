// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
// Recurring task templates — generate common PM work-order checklists on demand.
import { workOrders, setWorkOrders } from '../state.js';
import { saveWorkOrders, logAudit, _showActionToast } from '../storage.js';
import { escapeHtml } from '../utils.js';
import { renderWorkOrdersView } from './workorders.js';

const RECURRING_TEMPLATES = {
  weekly_ops: {
    label: 'Weekly Operations Checklist',
    icon: '📋',
    description: 'Core weekly checks every PM team should run every Monday morning.',
    frequency: 'weekly',
    tasks: [
      { title: 'Rent roll review — flag delinquent accounts',   priority: 'high'   },
      { title: 'New maintenance requests triage',               priority: 'high'   },
      { title: 'Open work orders status check',                 priority: 'medium' },
      { title: 'Vendor follow-up on active work orders',        priority: 'medium' },
      { title: 'Tenant communications inbox review',            priority: 'medium' },
      { title: 'Move-in / Move-out schedule review',            priority: 'low'    },
      { title: 'Team huddle — review blockers and priorities',  priority: 'low'    },
    ],
  },
  monthly_finance: {
    label: 'Monthly Finance Review',
    icon: '💰',
    description: 'Month-end accounting tasks and owner statement generation.',
    frequency: 'monthly',
    tasks: [
      { title: 'Reconcile rent collected vs. expected',         priority: 'high'   },
      { title: 'Generate and send owner statements',            priority: 'high'   },
      { title: 'Review and approve vendor invoices',            priority: 'high'   },
      { title: 'Security deposit reconciliation',               priority: 'medium' },
      { title: 'Budget vs. actual expense review',              priority: 'medium' },
      { title: 'Late fee assessment and collection',            priority: 'medium' },
      { title: 'Bank account reconciliation',                   priority: 'low'    },
    ],
  },
  monthly_compliance: {
    label: 'Monthly Compliance Check',
    icon: '⚖️',
    description: 'Regulatory and safety compliance items to stay ahead of risk.',
    frequency: 'monthly',
    tasks: [
      { title: 'License and permit renewal status check',       priority: 'high'   },
      { title: 'Fair housing policy review',                    priority: 'high'   },
      { title: 'Safety inspection scheduling',                  priority: 'medium' },
      { title: 'Document retention audit',                      priority: 'medium' },
      { title: 'Insurance certificates expiry review',          priority: 'low'    },
    ],
  },
  quarterly_inspections: {
    label: 'Quarterly Property Inspections',
    icon: '🔍',
    description: 'Systematic property condition review to catch issues early.',
    frequency: 'quarterly',
    tasks: [
      { title: 'Interior unit inspection scheduling',           priority: 'high'   },
      { title: 'Common area safety walkthrough',                priority: 'high'   },
      { title: 'HVAC filter replacement coordination',          priority: 'medium' },
      { title: 'Exterior condition and curb appeal assessment', priority: 'medium' },
      { title: 'Pest control check and treatment coordination', priority: 'medium' },
      { title: 'Inspection report generation for owners',       priority: 'low'    },
    ],
  },
  move_cycle: {
    label: 'Move-In / Move-Out Cycle',
    icon: '🏠',
    description: 'Full checklist for a clean unit turn between tenants.',
    frequency: 'as needed',
    tasks: [
      { title: 'Move-out inspection and damage assessment',     priority: 'high'   },
      { title: 'Security deposit disposition letter',           priority: 'high'   },
      { title: 'Deep clean scheduling',                         priority: 'high'   },
      { title: 'Repair work orders from inspection notes',      priority: 'high'   },
      { title: 'Carpet / flooring assessment',                  priority: 'medium' },
      { title: 'Paint touch-up or full repaint scheduling',     priority: 'medium' },
      { title: 'Utility transfer coordination',                 priority: 'medium' },
      { title: 'New tenant welcome package preparation',        priority: 'low'    },
      { title: 'Move-in inspection walkthrough with tenant',    priority: 'low'    },
    ],
  },
};

let _pendingTemplateId = null;

export function openRecurringModal() {
  const modal = document.getElementById('recurring-modal');
  const body  = document.getElementById('recurring-body');
  if (!modal || !body) return;

  body.innerHTML = Object.entries(RECURRING_TEMPLATES).map(([id, tpl]) => `
    <div class="recurring-card">
      <div class="recurring-card-header">
        <span class="recurring-icon">${tpl.icon}</span>
        <div>
          <strong class="recurring-label">${escapeHtml(tpl.label)}</strong>
          <span class="recurring-freq">${escapeHtml(tpl.frequency)}</span>
        </div>
      </div>
      <p class="recurring-desc">${escapeHtml(tpl.description)}</p>
      <div class="recurring-task-list">
        ${tpl.tasks.map(t => `
          <span class="recurring-task-chip recurring-task-chip--${t.priority}">${escapeHtml(t.title)}</span>
        `).join('')}
      </div>
      <button class="btn btn-primary recurring-apply-btn" onclick="previewRecurringTemplate(${escapeHtml(JSON.stringify(id))})">
        Use this template &rarr;
      </button>
    </div>
  `).join('');

  modal.classList.add('visible');
}

export function closeRecurringModal() {
  document.getElementById('recurring-modal')?.classList.remove('visible');
  document.getElementById('recurring-confirm-modal')?.classList.remove('visible');
  _pendingTemplateId = null;
}

export function previewRecurringTemplate(id) {
  const tpl = RECURRING_TEMPLATES[id];
  if (!tpl) return;
  _pendingTemplateId = id;

  const confirmModal = document.getElementById('recurring-confirm-modal');
  const title  = document.getElementById('recurring-confirm-title');
  const body   = document.getElementById('recurring-confirm-body');
  if (!confirmModal || !title || !body) {
    applyRecurringTemplate(id);
    return;
  }

  title.textContent = tpl.label;
  const today = new Date();
  const defaultDue = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  body.innerHTML = `
    <p class="recurring-confirm-intro">This will create <strong>${tpl.tasks.length} work orders</strong> in the <em>Submitted</em> column. Assign them as needed.</p>
    <div class="recurring-confirm-field">
      <label for="recurring-property">Property (optional — applied to all)</label>
      <input id="recurring-property" type="text" class="wo-form-input" placeholder="e.g. All Properties" maxlength="200">
    </div>
    <div class="recurring-confirm-field">
      <label for="recurring-duedate">Due date for all tasks</label>
      <input id="recurring-duedate" type="date" class="wo-form-input" value="${defaultDue}">
    </div>
  `;

  document.getElementById('recurring-modal')?.classList.remove('visible');
  confirmModal.classList.add('visible');
}

export function applyPendingRecurringTemplate() {
  if (!_pendingTemplateId) return;
  const tpl      = RECURRING_TEMPLATES[_pendingTemplateId];
  if (!tpl) return;

  const property = (document.getElementById('recurring-property')?.value || '').trim() || 'All Properties';
  const dueDate  = document.getElementById('recurring-duedate')?.value || null;
  const now      = new Date().toISOString();

  const newOrders = tpl.tasks.map(t => ({
    id:        `wo-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    property,
    unit:      '',
    tenant:    '',
    title:     t.title,
    notes:     `Recurring: ${tpl.label}`,
    priority:  t.priority,
    status:    'submitted',
    assignee:  'UNASSIGNED',
    vendor:    '',
    dueDate:   dueDate || null,
    cost:      0,
    createdAt: now,
    updatedAt: now,
  }));

  setWorkOrders([...workOrders, ...newOrders]);
  saveWorkOrders();
  logAudit('wo_recurring', { label: tpl.label, count: newOrders.length });
  closeRecurringModal();
  renderWorkOrdersView();
  _showActionToast(`✓ ${newOrders.length} work orders created from template`, 'save-toast--success');
}
