// Team Manager view: roster, auto-assign, workload dashboard, role playbooks, audit log.
import {
  orgData, teamData, setTeamData, workOrders,
  _selectedColor, setSelectedColor, COLOR_PALETTE,
  STATUS_LABELS, PRIORITY_LABELS, WO_STATUS_LABELS,
  currentView, asHex, getEmployeeHex, getEmployeeNames,
  buildWorkloadMap, countUnowned,
  auditLog, setAuditLog, AUDIT_LABELS,
} from '../state.js';
import {
  saveToStorage, saveTeamData, saveWorkOrders, logAudit,
  getCompanyName, _showActionToast, showSaveToast, _fileSlug,
  saveAuditLog, saveBackupSnapshot,
} from '../storage.js';
import {
  escapeHtml, isTaskOverdue, _downloadBlob, _slugify,
} from '../utils.js';
import { ROLE_TEMPLATES } from '../templates.js';
import { updateStats, updateBeacons } from '../ui.js';
import { renderTrackingView, populateOwnerFilter } from './tracking.js';
import { renderFlowMap, renderMapControls } from './map.js';
import { renderWorkOrdersView, updateWorkOrderBeacon } from './workorders.js';

let _previewTemplateId = null;

// ── Team Manager view ─────────────────────────────────────────────────────────
export function renderTeamView() {
  const container = document.getElementById('team-view-inner');
  if (!container) return;

  const workload = buildWorkloadMap();
  const maxTasks = Math.max(...[...workload.values()], 1);
  const unowned  = countUnowned();

  container.innerHTML = `
    <div class="team-header">
      <div>
        <h2 class="team-heading">&#128101; Team Manager</h2>
        <p class="team-subheading">Add employees, set department affinities, then hit Auto-Assign to map tasks automatically.</p>
      </div>
      ${unowned > 0 ? `
        <div class="team-unowned-alert">
          <span class="beacon-dot"></span>
          <strong>${unowned} unowned task${unowned !== 1 ? 's' : ''}</strong> need assignment
          <button class="btn-auto-assign-inline" onclick="runAutoAssign()">&#9889; Auto-Assign Now</button>
        </div>
      ` : `
        <div class="team-all-assigned">&#10003; All tasks are assigned!</div>
      `}
    </div>

    <div class="team-layout">
      <div class="team-roster-panel">
        <h3 class="team-panel-heading">Employee Roster</h3>

        <div class="add-employee-form">
          <input
            type="text"
            id="new-emp-name"
            class="add-emp-input"
            placeholder="Employee name..."
            maxlength="30"
            autocomplete="off"
            onkeydown="if(event.key==='Enter') commitAddEmployee()"
          >
          <div class="color-palette" id="color-palette">
            ${COLOR_PALETTE.map((hex) => `
              <button
                class="color-swatch${hex === _selectedColor ? ' selected' : ''}"
                style="background:${hex}"
                data-color="${hex}"
                title="${hex}"
                onclick="selectPaletteColor(this)"
              ></button>
            `).join('')}
          </div>
          <button class="btn-add-employee" onclick="commitAddEmployee()">+ Add Employee</button>
        </div>

        <div class="role-template-panel">
          <div>
            <strong>Role templates</strong>
            <span>Start with a common beginner team shape, then edit names and affinities.</span>
          </div>
          <div class="role-template-actions">
            ${Object.entries(ROLE_TEMPLATES).map(([id, template]) => `
              <button class="role-template-btn" data-template="${escapeHtml(id)}" onclick="openRoleTemplatePreview(this.dataset.template)" title="${escapeHtml(template.description)}">
                ${escapeHtml(template.label)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="employee-list">
          ${teamData.employees.map(emp =>
            buildEmployeeCard(emp, orgData.departments, workload, maxTasks)
          ).join('')}
        </div>
      </div>

      <div class="workload-panel">
        <h3 class="team-panel-heading">Workload Dashboard</h3>
        <p class="workload-desc">
          Bar width = task share relative to the most-loaded employee.
          Auto-assign always picks the least-loaded eligible candidate.
        </p>
        <div class="workload-chart">
          ${buildWorkloadBars(workload, maxTasks)}
        </div>
      </div>
    </div>
  `;
}

export function buildEmployeeCard(emp, depts, workload, maxTasks) {
  const taskCount = workload.get(emp.name) || 0;
  const hex       = asHex(emp.hex);
  const pct       = maxTasks > 0 ? Math.round((taskCount / maxTasks) * 100) : 0;

  return `
    <div class="employee-card" data-emp="${escapeHtml(emp.name)}">
      <div class="employee-card-header">
        <span class="emp-color-dot" style="background:${hex}"></span>
        <span class="emp-name">${escapeHtml(emp.name)}</span>
        <span class="emp-task-count" style="color:${hex}">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
        <div class="emp-mini-bar-track">
          <div class="emp-mini-bar-fill" style="width:${Math.max(pct, 2)}%;background:${hex}"></div>
        </div>
        <button class="emp-playbook-btn" data-name="${escapeHtml(emp.name)}" onclick="openRolePlaybook(this.dataset.name)" title="Open role playbook for ${escapeHtml(emp.name)}">Playbook</button>
        <button class="emp-remove-btn" data-name="${escapeHtml(emp.name)}" onclick="removeEmployee(this.dataset.name)" title="Remove ${escapeHtml(emp.name)}">&#x2715;</button>
      </div>

      <div class="affinity-tags">
        <span class="affinity-label">Affinities:</span>
        ${depts.map(dept => {
          const active = emp.affinities.includes(dept.id);
          return `
            <button
              class="affinity-tag${active ? ' active' : ''}"
              style="${active
                ? `background:${dept.color};border-color:${dept.color}`
                : `border-color:${dept.color};color:${dept.color}`}"
              data-name="${escapeHtml(emp.name)}"
              data-dept="${escapeHtml(dept.id)}"
              onclick="toggleAffinity(this.dataset.name, this.dataset.dept)"
              title="${active ? 'Remove' : 'Add'} affinity: ${escapeHtml(dept.name)}"
            >${escapeHtml(dept.name)}</button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function buildWorkloadBars(workload, maxTasks) {
  const sorted = [...workload.entries()].sort((a, b) => b[1] - a[1]);
  const total  = [...workload.values()].reduce((a, b) => a + b, 0);
  const avg    = workload.size > 0 ? total / workload.size : 0;

  return sorted.map(([name, count]) => {
    const pct        = maxTasks > 0 ? Math.round((count / maxTasks) * 100) : 0;
    const hex        = getEmployeeHex(name);
    const overloaded = count > avg * 1.35 && count > 5;

    return `
      <div class="workload-bar-row${overloaded ? ' overloaded' : ''}">
        <div class="workload-name-cell">
          <span class="wl-dot" style="background:${escapeHtml(hex)}"></span>
          <span class="wl-name">${escapeHtml(name)}</span>
          ${overloaded
            ? '<span class="wl-beacon" title="Significantly above team average — consider re-balancing">&#9888;</span>'
            : ''}
        </div>
        <div class="workload-bar-track">
          <div class="workload-bar-fill" style="width:${Math.max(pct, 2)}%;background:${escapeHtml(hex)}"></div>
        </div>
        <span class="workload-count">${count}</span>
      </div>
    `;
  }).join('');
}

// ── Employee CRUD ─────────────────────────────────────────────────────────────
export function selectPaletteColor(swatchEl) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatchEl.classList.add('selected');
  setSelectedColor(swatchEl.dataset.color);
}

export function commitAddEmployee() {
  const input = document.getElementById('new-emp-name');
  const name  = (input?.value || '').trim().slice(0, 60);

  if (!name) {
    if (input) {
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
    }
    return;
  }

  if (name.toLowerCase() === 'unowned') {
    alert('"UNOWNED" is a reserved system name — please choose a different name.');
    if (input) { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); }
    return;
  }

  const duplicate = teamData.employees.some(
    e => e.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    alert(`"${name}" is already in the roster.`);
    return;
  }

  teamData.employees.push({ name, hex: _selectedColor, affinities: [] });

  setSelectedColor(COLOR_PALETTE[0]);
  saveTeamData();
  renderTeamView();
  renderLegend();
  populateOwnerFilter();
  updateBeacons();
}

export function removeEmployee(name) {
  if (!confirm(`Remove "${name}" from the roster?\n\nTheir tasks will be marked UNOWNED.`)) return;

  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      if (task.owner === name) task.owner = 'UNOWNED';
    });
  });

  workOrders.forEach(wo => {
    if (wo.assignee === name) wo.assignee = 'UNASSIGNED';
  });

  teamData.employees = teamData.employees.filter(e => e.name !== name);

  saveTeamData();
  saveToStorage();
  saveWorkOrders();
  renderTeamView();
  renderTrackingView();
  updateStats();
  renderLegend();
  populateOwnerFilter();
  if (currentView === 'workorders') renderWorkOrdersView();
  updateWorkOrderBeacon();

  if (currentView === 'map') {
    renderMapControls();
    renderFlowMap();
  }
}

export function toggleAffinity(empName, deptId) {
  const emp = teamData.employees.find(e => e.name === empName);
  if (!emp) return;

  const idx = emp.affinities.indexOf(deptId);
  if (idx === -1) {
    emp.affinities.push(deptId);
  } else {
    emp.affinities.splice(idx, 1);
  }

  saveTeamData();
  renderTeamView();
}

export function openRoleTemplatePreview(templateId) {
  const template = ROLE_TEMPLATES[templateId];
  if (!template) return;

  const modal = document.getElementById('role-template-modal');
  const title = document.getElementById('role-template-title');
  const body = document.getElementById('role-template-preview-body');
  const applyBtn = document.getElementById('role-template-apply-btn');

  if (!modal || !title || !body || !applyBtn) {
    applyRoleTemplate(templateId);
    return;
  }

  _previewTemplateId = templateId;
  title.textContent = template.label;
  applyBtn.textContent = `Apply ${template.label}`;
  body.innerHTML = buildRoleTemplatePreviewHTML(template);
  modal.classList.add('visible');
}

export function closeRoleTemplatePreview() {
  const modal = document.getElementById('role-template-modal');
  if (modal) modal.classList.remove('visible');
  _previewTemplateId = null;
}

export function applyPreviewedRoleTemplate() {
  if (!_previewTemplateId) return;
  const templateId = _previewTemplateId;
  closeRoleTemplatePreview();
  applyRoleTemplate(templateId, true);
}

function buildRoleTemplatePreviewHTML(template) {
  const rosterSize = template.employees.length;

  return `
    <div class="role-template-preview-intro">
      <p>${escapeHtml(template.description)}</p>
      <div class="role-template-preview-metrics">
        <span><strong>${rosterSize}</strong> role${rosterSize !== 1 ? 's' : ''}</span>
        <span>Replaces current roster</span>
        <span>Preserves tasks for matching names</span>
      </div>
    </div>
    <div class="role-template-preview-grid">
      ${template.employees.map(emp => {
        const affinities = emp.affinities
          .map(deptId => orgData.departments.find(dept => dept.id === deptId)?.name || deptId)
          .map(name => `<span>${escapeHtml(name)}</span>`)
          .join('');

        return `
          <div class="role-template-preview-card">
            <div class="role-template-preview-card-header">
              <span class="role-template-preview-dot" style="background:${asHex(emp.hex)}"></span>
              <strong>${escapeHtml(emp.name)}</strong>
            </div>
            <div class="role-template-preview-affinities">
              ${affinities || '<span>No starting affinities</span>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <p class="role-template-preview-note">
      Applying this template marks tasks and work orders assigned to removed people as unowned or unassigned. Run Auto-Assign after reviewing the roster.
    </p>
  `;
}

export function applyRoleTemplate(templateId, skipConfirm = false) {
  const template = ROLE_TEMPLATES[templateId];
  if (!template) return;
  if (!skipConfirm && !confirm(`Apply the "${template.label}" role template?\n\nThis replaces the current roster and marks tasks owned by removed people as UNOWNED. You can run Auto-Assign after reviewing affinities.`)) return;

  const nextEmployees = template.employees.map(emp => ({
    name: emp.name,
    hex: emp.hex,
    affinities: [...emp.affinities],
  }));
  const nextNames = new Set(nextEmployees.map(emp => emp.name));

  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      if (task.owner !== 'UNOWNED' && !nextNames.has(task.owner)) {
        task.owner = 'UNOWNED';
      }
    });
  });

  workOrders.forEach(wo => {
    if (wo.assignee !== 'UNASSIGNED' && !nextNames.has(wo.assignee)) {
      wo.assignee = 'UNASSIGNED';
    }
  });

  setTeamData({ employees: nextEmployees });
  saveTeamData();
  saveToStorage();
  saveWorkOrders();
  renderTeamView();
  renderTrackingView();
  updateStats();
  renderLegend();
  populateOwnerFilter();
  updateWorkOrderBeacon();
  _showActionToast(`${template.label} template applied`, 'save-toast--success');
}

// ── Dynamic legend ────────────────────────────────────────────────────────────
export function renderLegend() {
  const legend = document.getElementById('owner-legend');
  if (!legend) return;

  legend.innerHTML = teamData.employees.map(emp => `
    <div class="legend-item">
      <div class="legend-color" style="background:${escapeHtml(emp.hex)}"></div>
      <span>${escapeHtml(emp.name)}</span>
    </div>
  `).join('') + `
    <div class="legend-item">
      <div class="legend-color" style="background:#d32f2f"></div>
      <span>&#9888;&#65039; UNOWNED</span>
    </div>
  `;
}

// ── Auto-assign engine ────────────────────────────────────────────────────────
export function runAutoAssign() {
  const unownedCount = countUnowned();

  if (unownedCount === 0) {
    showAutoAssignToast(0);
    return;
  }

  if (teamData.employees.length === 0) {
    alert('No employees in your team roster.\nAdd at least one employee in the Team Manager tab first.');
    return;
  }

  saveBackupSnapshot('Before auto-assign');
  window._saveUndoSnapshot && window._saveUndoSnapshot();

  const workload = buildWorkloadMap();
  let assignedCount = 0;
  const fallbackDepts = [];

  orgData.departments.forEach(dept => {
    dept.tasks.forEach((task) => {
      if (task.owner !== 'UNOWNED') return;

      const affinityMatches = teamData.employees.filter(emp =>
        emp.affinities.includes(dept.id)
      );

      let candidates;
      if (affinityMatches.length > 0) {
        candidates = affinityMatches;
      } else {
        candidates = [...teamData.employees];
        if (!fallbackDepts.includes(dept.name)) fallbackDepts.push(dept.name);
      }

      candidates.sort((a, b) =>
        (workload.get(a.name) || 0) - (workload.get(b.name) || 0)
      );

      const winner = candidates[0];
      if (!winner) return;

      task.owner = winner.name;
      workload.set(winner.name, (workload.get(winner.name) || 0) + 1);
      assignedCount++;
    });
  });

  saveToStorage();
  renderTrackingView();
  updateStats();
  populateOwnerFilter();
  renderLegend();

  if (currentView === 'map') {
    renderMapControls();
    renderFlowMap();
  }
  if (currentView === 'team') {
    renderTeamView();
  }

  logAudit('auto_assign', { count: assignedCount });
  showAutoAssignToast(assignedCount, fallbackDepts);
}

export function showAutoAssignToast(count, fallbackDepts = []) {
  let msg;
  if (count === 0) {
    msg = '✓ All tasks already assigned';
  } else if (fallbackDepts.length > 0) {
    const listed = fallbackDepts.slice(0, 2).join(', ') + (fallbackDepts.length > 2 ? ` +${fallbackDepts.length - 2} more` : '');
    msg = `⚡ ${count} task${count !== 1 ? 's' : ''} assigned · ⚠ ${fallbackDepts.length} dept${fallbackDepts.length !== 1 ? 's' : ''} had no affinity match (${listed}) · Ctrl+Z to undo`;
  } else {
    msg = `⚡ ${count} task${count !== 1 ? 's' : ''} auto-assigned · Ctrl+Z to undo`;
  }

  const cls      = fallbackDepts.length > 0 ? 'save-toast--warn' : 'save-toast--success';
  const duration = fallbackDepts.length > 0 ? 7000 : 3500;
  _showActionToast(msg, cls, duration);
}

// ── Role playbooks ────────────────────────────────────────────────────────────
let _currentPlaybook = null;

export function openRolePlaybook(ownerName) {
  const employee = teamData.employees.find(emp => emp.name === ownerName);
  if (!employee) {
    alert('That employee is no longer in the roster.');
    return;
  }

  _currentPlaybook = buildRolePlaybook(employee);
  const modal = document.getElementById('playbook-modal');
  const title = document.getElementById('playbook-title');
  const body  = document.getElementById('playbook-body');
  if (!modal || !title || !body) return;

  title.textContent = `${employee.name} Playbook`;
  body.innerHTML = buildRolePlaybookHTML(_currentPlaybook);
  modal.classList.add('visible');
}

export function closeRolePlaybook() {
  document.getElementById('playbook-modal')?.classList.remove('visible');
}

export function downloadOpenRolePlaybook() {
  if (!_currentPlaybook) return;
  _downloadBlob(
    buildRolePlaybookMarkdown(_currentPlaybook),
    'text/markdown',
    `pm-ops-${_fileSlug()}-${_slugify(_currentPlaybook.employee.name)}-playbook.md`
  );
}

function buildRolePlaybook(employee) {
  const tasks              = collectTasksForOwner(employee.name);
  const assignedWorkOrders = workOrders.filter(wo => wo.assignee === employee.name);
  const activeWorkOrders   = assignedWorkOrders.filter(wo => wo.status !== 'completed');
  const statusCounts       = tasks.reduce((acc, item) => {
    const status = item.task.status || 'todo';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const highPriority  = tasks.filter(item => (item.task.priority || 'medium') === 'high');
  const blocked       = tasks.filter(item => (item.task.status || 'todo') === 'blocked');
  const overdue       = tasks.filter(item => isTaskOverdue(item.task));
  const affinityNames = employee.affinities
    .map(id => orgData.departments.find(dept => dept.id === id)?.name)
    .filter(Boolean);
  const blockerItems  = [...blocked, ...overdue].filter((item, idx, arr) =>
    arr.findIndex(other => other.dept.id === item.dept.id && other.task.name === item.task.name) === idx
  );

  return {
    employee,
    tasks,
    activeWorkOrders,
    statusCounts,
    highPriority,
    blocked,
    overdue,
    affinityNames,
    blockerItems,
    generatedAt: new Date()
  };
}

function buildRolePlaybookMarkdown(playbook) {
  const { employee, tasks, activeWorkOrders, statusCounts, highPriority, blocked, overdue, affinityNames, blockerItems, generatedAt } = playbook;
  const lines = [
    `# ${employee.name} Role Playbook`,
    '',
    `Company: ${getCompanyName()}`,
    `Generated: ${generatedAt.toLocaleString()}`,
    '',
    '## Snapshot',
    '',
    `- Owned tasks: ${tasks.length}`,
    `- High priority tasks: ${highPriority.length}`,
    `- Blocked tasks: ${blocked.length}`,
    `- Overdue tasks: ${overdue.length}`,
    `- Active work orders: ${activeWorkOrders.length}`,
    '',
    '## Status Breakdown',
    '',
    `- To Do: ${statusCounts.todo || 0}`,
    `- In Progress: ${statusCounts['in-progress'] || 0}`,
    `- Blocked: ${statusCounts.blocked || 0}`,
    `- Done: ${statusCounts.done || 0}`,
    '',
    '## Department Affinities',
    '',
    affinityNames.length
      ? affinityNames.map(name => `- ${name}`).join('\n')
      : '- No department affinities selected yet.',
    '',
    '## Priority Focus',
    '',
    _buildPlaybookTaskSection(highPriority.length ? highPriority : tasks.slice(0, 10)),
    '',
    '## Blockers And Overdue',
    '',
    _buildPlaybookTaskSection(blockerItems),
    '',
    '## Active Work Orders',
    '',
    _buildPlaybookWorkOrderSection(activeWorkOrders),
    '',
    '## Full Responsibility List',
    '',
    _buildPlaybookTaskSection(tasks),
    ''
  ];

  return lines.join('\n');
}

function buildRolePlaybookHTML(playbook) {
  const { employee, tasks, activeWorkOrders, statusCounts, highPriority, blocked, overdue, affinityNames, blockerItems, generatedAt } = playbook;
  const priorityFocus = highPriority.length ? highPriority : tasks.slice(0, 8);

  return `
    <div class="playbook-summary">
      ${_buildPlaybookMetric('Owned Tasks', tasks.length)}
      ${_buildPlaybookMetric('High Priority', highPriority.length)}
      ${_buildPlaybookMetric('Blocked', blocked.length)}
      ${_buildPlaybookMetric('Overdue', overdue.length)}
      ${_buildPlaybookMetric('Active WOs', activeWorkOrders.length)}
    </div>
    <div class="playbook-meta">
      <span>${escapeHtml(getCompanyName())}</span>
      <span>Generated ${escapeHtml(generatedAt.toLocaleString())}</span>
    </div>
    <div class="playbook-grid">
      <section class="playbook-section">
        <h3>Status Breakdown</h3>
        <div class="playbook-status-list">
          ${_buildPlaybookStatus('To Do', statusCounts.todo || 0)}
          ${_buildPlaybookStatus('In Progress', statusCounts['in-progress'] || 0)}
          ${_buildPlaybookStatus('Blocked', statusCounts.blocked || 0)}
          ${_buildPlaybookStatus('Done', statusCounts.done || 0)}
        </div>
      </section>
      <section class="playbook-section">
        <h3>Department Affinities</h3>
        ${affinityNames.length
          ? `<div class="playbook-chip-list">${affinityNames.map(name => `<span>${escapeHtml(name)}</span>`).join('')}</div>`
          : '<p class="playbook-empty">No department affinities selected yet.</p>'}
      </section>
    </div>
    <section class="playbook-section">
      <h3>Priority Focus</h3>
      ${_buildPlaybookTaskListHTML(priorityFocus)}
    </section>
    <section class="playbook-section">
      <h3>Blockers And Overdue</h3>
      ${_buildPlaybookTaskListHTML(blockerItems)}
    </section>
    <section class="playbook-section">
      <h3>Active Work Orders</h3>
      ${_buildPlaybookWorkOrderListHTML(activeWorkOrders)}
    </section>
    <section class="playbook-section">
      <h3>Full Responsibility List</h3>
      ${_buildPlaybookTaskListHTML(tasks)}
    </section>
  `;
}

function _buildPlaybookMetric(label, value) {
  return `<div class="playbook-metric"><strong>${value}</strong><span>${label}</span></div>`;
}

function _buildPlaybookStatus(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function _buildPlaybookTaskListHTML(items) {
  if (!items.length) return '<p class="playbook-empty">None right now.</p>';
  return `<div class="playbook-list">${items.map(({ dept, task }) => {
    const status   = STATUS_LABELS[task.status || 'todo'] || task.status || 'To Do';
    const priority = PRIORITY_LABELS[task.priority || 'medium'] || task.priority || 'Medium';
    return `
      <article class="playbook-list-item">
        <strong>${escapeHtml(task.name)}</strong>
        <span>${escapeHtml(dept.name)} · ${escapeHtml(status)} · ${escapeHtml(priority)}${task.dueDate ? ` · Due ${escapeHtml(task.dueDate)}` : ''}</span>
      </article>
    `;
  }).join('')}</div>`;
}

function _buildPlaybookWorkOrderListHTML(items) {
  if (!items.length) return '<p class="playbook-empty">None right now.</p>';
  return `<div class="playbook-list">${items.map(wo => {
    const status   = WO_STATUS_LABELS[wo.status] || wo.status || 'Submitted';
    const priority = PRIORITY_LABELS[wo.priority || 'medium'] || wo.priority || 'Medium';
    return `
      <article class="playbook-list-item">
        <strong>${escapeHtml(wo.title)}</strong>
        <span>${escapeHtml(wo.property)}${wo.unit ? `, Unit ${escapeHtml(wo.unit)}` : ''} · ${escapeHtml(status)} · ${escapeHtml(priority)}${wo.dueDate ? ` · Target ${escapeHtml(wo.dueDate)}` : ''}</span>
      </article>
    `;
  }).join('')}</div>`;
}

function collectTasksForOwner(ownerName) {
  const tasks = [];
  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      if (task.owner === ownerName) tasks.push({ dept, task });
    });
  });
  return tasks;
}

function _buildPlaybookTaskSection(items) {
  if (!items.length) return '- None right now.';
  return items.map(({ dept, task }) => {
    const status   = STATUS_LABELS[task.status || 'todo'] || task.status || 'To Do';
    const priority = PRIORITY_LABELS[task.priority || 'medium'] || task.priority || 'Medium';
    const due      = task.dueDate ? ` | Due: ${task.dueDate}` : '';
    return `- ${dept.name}: ${task.name} | ${status} | ${priority}${due}`;
  }).join('\n');
}

function _buildPlaybookWorkOrderSection(items) {
  if (!items.length) return '- None right now.';
  return items.map(wo => {
    const status   = WO_STATUS_LABELS[wo.status] || wo.status || 'Submitted';
    const priority = PRIORITY_LABELS[wo.priority || 'medium'] || wo.priority || 'Medium';
    const unit     = wo.unit ? `, Unit ${wo.unit}` : '';
    const due      = wo.dueDate ? ` | Target: ${wo.dueDate}` : '';
    return `- ${wo.property}${unit}: ${wo.title} | ${status} | ${priority}${due}`;
  }).join('\n');
}

// ── Audit log modal ───────────────────────────────────────────────────────────
export function openAuditLog() {
  const modal = document.getElementById('audit-modal');
  const body  = document.getElementById('audit-body');
  if (!modal || !body) return;
  body.innerHTML = buildAuditLogHTML();
  modal.classList.add('visible');
}

export function closeAuditLog() {
  const modal = document.getElementById('audit-modal');
  if (modal) modal.classList.remove('visible');
}

export function clearAuditLog() {
  if (!confirm('Clear all audit log entries?')) return;
  setAuditLog([]);
  saveAuditLog();
  const body = document.getElementById('audit-body');
  if (body) body.innerHTML = buildAuditLogHTML();
}

function buildAuditLogHTML() {
  if (auditLog.length === 0) {
    return '<p class="audit-empty">No changes recorded yet.</p>';
  }
  const rows = auditLog.map(entry => {
    const label = AUDIT_LABELS[entry.action] || entry.action;
    const time  = new Date(entry.ts).toLocaleString();
    let detail  = '';
    if (entry.dept && entry.task) {
      detail = `${escapeHtml(entry.dept)}: ${escapeHtml(entry.task)}`;
      if (entry.from !== undefined && entry.to !== undefined) {
        detail += ` — ${escapeHtml(String(entry.from))} → ${escapeHtml(String(entry.to))}`;
      }
    } else if (entry.count !== undefined) {
      detail = `${entry.count} task${entry.count !== 1 ? 's' : ''} assigned`;
    } else if (entry.title) {
      detail = escapeHtml(entry.title);
      if (entry.from !== undefined && entry.to !== undefined) {
        detail += ` — ${escapeHtml(String(entry.from))} → ${escapeHtml(String(entry.to))}`;
      }
    }
    return `
      <div class="audit-row">
        <span class="audit-time">${escapeHtml(time)}</span>
        <span class="audit-action">${escapeHtml(label)}</span>
        ${detail ? `<span class="audit-detail">${detail}</span>` : ''}
      </div>`;
  }).join('');
  return `<div class="audit-list">${rows}</div>`;
}
