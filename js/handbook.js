import {
  orgData, teamData, workOrders, portfolio,
  STATUS_LABELS, PRIORITY_LABELS, WO_STATUS_LABELS,
  buildWorkloadMap, countUnowned,
} from './state.js';
import {
  getCompanyName, getOpsProfile, _fileSlug,
} from './storage.js';
import { _downloadBlob, isTaskOverdue } from './utils.js';
import { SOP_TEMPLATES } from './templates.js';
import { confirmSensitiveExport, announceExport } from './privacy.js';

// Maintainer note:
// This module is read-only against app state. It generates the Markdown
// Operations Handbook from state.js and storage.js, then downloads it through
// utils._downloadBlob. The stats button in index.html calls
// downloadOperationsHandbook through app.js -> window, so keep that export name
// stable or update app.js and index.html together.

const PROFILE_LABELS = {
  small: 'Under 100 doors',
  mid: '100-500 doors',
  large: '500+ doors',
  stability: 'Stabilize ownership',
  maintenance: 'Tighten maintenance flow',
  growth: 'Scale team capacity',
  compliance: 'Reduce compliance risk',
};

const CRITICAL_COVERAGE_AREAS = [
  { label: 'Leasing', departments: ['leasing', 'applications', 'move-ins'] },
  { label: 'Rent Collection', departments: ['delinquency', 'accounting'] },
  { label: 'Inspections', departments: ['move-ins', 'move-outs', 'unit-turns', 'field-services'] },
  { label: 'Maintenance', departments: ['maintenance', 'vendors'] },
  { label: 'Compliance', departments: ['compliance', 'reporting'] },
  { label: 'Renewals', departments: ['tenant-comms', 'owner-relations', 'leasing'] },
  { label: 'Emergencies', departments: ['maintenance', 'vendors', 'field-services', 'tenant-comms'] },
];

const SEVEN_DAY_PLAN = [
  ['Build the source of truth', 'Add properties, units, tenants, owners/clients, and vendor bench.'],
  ['Replace sample roles with real people', 'Add the team, choose department affinities, and confirm who owns each operating lane.'],
  ['Close ownership gaps', 'Assign UNOWNED work, starting with tenant communication, rent, maintenance, compliance, and owner updates.'],
  ['Test maintenance intake', 'Create one realistic work order with property, tenant, vendor, assignee, priority, due date, cost, and notes.'],
  ['Review critical coverage', 'Check leasing, rent collection, inspections, maintenance, compliance, renewals, and emergencies.'],
  ['Set the weekly operating rhythm', 'Decide what gets reviewed daily, weekly, and monthly so the map stays alive.'],
  ['Export the operating manual', 'Review this handbook with the team and treat it as the first SOP draft.'],
];

export function downloadOperationsHandbook() {
  if (!confirmSensitiveExport('The handbook')) return;
  const filename = `pm-ops-${_fileSlug()}-operations-handbook.md`;
  _downloadBlob(buildOperationsHandbookMarkdown(), 'text/markdown', filename);
  announceExport(filename);
}

export function downloadOperationsHandbookHTML() {
  if (!confirmSensitiveExport('The handbook')) return;
  const company  = getCompanyName();
  const markdown = buildOperationsHandbookMarkdown();
  const html     = markdownToPrintHtml(markdown, `${company} Operations Handbook`);
  const filename = `pm-ops-${_fileSlug()}-operations-handbook.html`;
  _downloadBlob(html, 'text/html', filename);
  announceExport(filename);
}

export function printOperationsHandbook() {
  if (!confirmSensitiveExport('The printed handbook')) return;
  const markdown = buildOperationsHandbookMarkdown();
  const html = markdownToPrintHtml(markdown, `${getCompanyName()} Operations Handbook`);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Popup blocked. Allow popups to print the handbook.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export function buildOperationsHandbookMarkdown() {
  const company = getCompanyName();
  const profile = getOpsProfile();
  const generatedAt = new Date();
  const summary = getOperatingSummary();
  const launchGaps = getHandbookGaps();

  const lines = [
    `# ${company} Operations Handbook`,
    '',
    `Generated: ${generatedAt.toLocaleString()}`,
    `Portfolio: ${PROFILE_LABELS[profile.portfolioSize] || PROFILE_LABELS.mid}`,
    `Operating focus: ${PROFILE_LABELS[profile.focus] || PROFILE_LABELS.stability}`,
    '',
    '## Operating Snapshot',
    '',
    `- Total responsibilities: ${summary.totalTasks}`,
    `- Assigned responsibilities: ${summary.assignedTasks}`,
    `- Unowned responsibilities: ${summary.unownedTasks}`,
    `- Blocked responsibilities: ${summary.blockedTasks}`,
    `- Overdue responsibilities: ${summary.overdueTasks}`,
    `- Team members: ${teamData.employees.length}`,
    `- Properties: ${portfolio.properties.length}`,
    `- Units: ${getTotalUnits()}`,
    `- Tenants: ${portfolio.tenants.length}`,
    `- Vendors: ${portfolio.vendors.length}`,
    `- Open work orders: ${summary.openWorkOrders}`,
    '',
    '## Portfolio Registry',
    '',
    buildPortfolioSection(),
    '',
    '## Critical Coverage',
    '',
    buildCriticalCoverageSection(),
    '',
    '## First-Week Operating Rhythm',
    '',
    buildOperatingRhythmSection(profile),
    '',
    '## First 7 Days',
    '',
    buildSevenDaySection(),
    '',
    '## Setup Gaps To Close',
    '',
    launchGaps.length ? launchGaps.map(gap => `- ${gap}`).join('\n') : '- No major setup gaps detected.',
    '',
    '## Team Roster And Workload',
    '',
    buildTeamSection(),
    '',
    '## Maintenance Intake SOP',
    '',
    buildMaintenanceSOPSection(),
    '',
    '## Starter SOP Template Library',
    '',
    buildStarterSOPSection(),
    '',
    '## Department SOPs',
    '',
    orgData.departments.map(buildDepartmentSection).join('\n\n'),
    '',
    '## Maintenance Work Orders',
    '',
    buildWorkOrderSection(),
    '',
    '## Handoff Notes',
    '',
    '- Every UNOWNED responsibility needs a named owner before this handbook is complete.',
    '- Treat blocked and overdue items as the first agenda for the next operating meeting.',
    '- Re-export this handbook after any major team, portfolio, or workflow change.',
    '',
  ];

  return lines.join('\n');
}

function buildStarterSOPSection() {
  return SOP_TEMPLATES.map(template => [
    `### ${template.title}`,
    '',
    `Cadence: ${template.cadence}`,
    '',
    ...template.steps.map(step => `- ${step}`),
  ].join('\n')).join('\n\n');
}

function getOperatingSummary() {
  const tasks = orgData.departments.flatMap(dept => dept.tasks);
  return {
    totalTasks: tasks.length,
    assignedTasks: tasks.filter(task => task.owner !== 'UNOWNED').length,
    unownedTasks: countUnowned(),
    blockedTasks: tasks.filter(task => (task.status || 'todo') === 'blocked').length,
    overdueTasks: tasks.filter(isTaskOverdue).length,
    openWorkOrders: workOrders.filter(wo => wo.status !== 'completed').length,
  };
}

function getTotalUnits() {
  return portfolio.properties.reduce((sum, property) => sum + Number(property.units || 0), 0);
}

function buildPortfolioSection() {
  return [
    '### Properties',
    '',
    buildPropertyList(),
    '',
    '### Tenants',
    '',
    buildTenantList(),
    '',
    '### Vendor Bench',
    '',
    buildVendorList(),
  ].join('\n');
}

function buildPropertyList() {
  if (!portfolio.properties.length) {
    return '- No properties recorded yet. Add at least one managed property, unit count, and owner/client.';
  }
  return portfolio.properties.map(property => {
    const units = Number(property.units || 0);
    const owner = property.owner ? ` | Owner/client: ${property.owner}` : '';
    const notes = property.notes ? ` | Notes: ${property.notes}` : '';
    return `- ${property.name} | Units: ${units}${owner}${notes}`;
  }).join('\n');
}

function buildTenantList() {
  if (!portfolio.tenants.length) {
    return '- No tenants recorded yet. Add at least one tenant so maintenance and communication have unit context.';
  }
  return portfolio.tenants.map(tenant => {
    const property = getPropertyName(tenant.propertyId);
    const unit = tenant.unit ? `, Unit ${tenant.unit}` : '';
    const status = tenant.status || 'active';
    const contact = [tenant.phone, tenant.email].filter(Boolean).join(' / ');
    return `- ${tenant.name} | ${property}${unit} | Status: ${status}${contact ? ` | Contact: ${contact}` : ''}`;
  }).join('\n');
}

function buildVendorList() {
  if (!portfolio.vendors.length) {
    return '- No vendors recorded yet. Add emergency and routine maintenance vendors before real repair volume starts.';
  }
  return portfolio.vendors.map(vendor => {
    const trade = vendor.trade || 'General vendor';
    const contact = [vendor.phone, vendor.email].filter(Boolean).join(' / ');
    return `- ${vendor.name} | Trade: ${trade}${contact ? ` | Contact: ${contact}` : ''}`;
  }).join('\n');
}

function buildCriticalCoverageSection() {
  return getCriticalCoverageAreas().map(area => [
    `### ${area.label}`,
    '',
    `- Coverage: ${area.coveragePct}%`,
    `- Responsibilities: ${area.taskCount}`,
    `- Unowned: ${area.unownedCount}`,
    `- Primary owners: ${area.primaryOwners}`,
    `- Departments: ${area.departmentNames.join(', ')}`,
  ].join('\n')).join('\n\n');
}

function buildOperatingRhythmSection(profile) {
  const focus = profile.focus || 'stability';
  const focusLine = {
    stability: 'Daily: close gaps and review tenant, rent, maintenance, and owner-update risk.',
    maintenance: 'Daily: review open repairs, emergency readiness, vendor follow-up, and aging work orders.',
    growth: 'Daily: review leasing pipeline, applications, make-ready status, and team capacity.',
    compliance: 'Daily: review notices, inspections, records, delinquencies, and documentation risk.',
  }[focus] || 'Daily: review unowned, blocked, overdue, and open maintenance work.';

  return [
    `- ${focusLine}`,
    '- Weekly: review workload balance, critical coverage, open work orders, owner communications, delinquency, and compliance tasks.',
    '- Monthly: update department owners, refresh vendor bench, archive stale work, and export a fresh handbook.',
  ].join('\n');
}

function buildSevenDaySection() {
  return SEVEN_DAY_PLAN
    .map(([title, detail], idx) => `- Day ${idx + 1}: ${title} - ${detail}`)
    .join('\n');
}

function buildTeamSection() {
  if (!teamData.employees.length) return '- No team members have been added yet.';

  const workload = buildWorkloadMap();
  return teamData.employees
    .map(emp => {
      const affinities = emp.affinities
        .map(id => orgData.departments.find(dept => dept.id === id)?.name)
        .filter(Boolean);
      return [
        `### ${emp.name}`,
        '',
        `- Owned responsibilities: ${workload.get(emp.name) || 0}`,
        `- Department affinities: ${affinities.length ? affinities.join(', ') : 'None selected yet'}`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildDepartmentSection(dept) {
  const total = dept.tasks.length;
  const unowned = dept.tasks.filter(task => task.owner === 'UNOWNED').length;
  const blocked = dept.tasks.filter(task => (task.status || 'todo') === 'blocked').length;
  const done = dept.tasks.filter(task => (task.status || 'todo') === 'done').length;
  const primaryOwner = getPrimaryOwner(dept.tasks);

  return [
    `### ${dept.name}`,
    '',
    `Purpose: Own the recurring work for ${dept.name.toLowerCase()} and keep responsibilities visible.`,
    '',
    `- Primary owner: ${primaryOwner}`,
    `- Responsibilities: ${total}`,
    `- Done: ${done}`,
    `- Blocked: ${blocked}`,
    `- Unowned: ${unowned}`,
    '',
    'Standard operating checklist:',
    dept.tasks.map(task => `- ${formatTaskLine(task)}`).join('\n'),
  ].join('\n');
}

function buildWorkOrderSection() {
  if (!workOrders.length) {
    return '- No work orders have been created yet. Add one sample work order to document intake, assignment, vendor, and closeout.';
  }

  return workOrders.map(wo => {
    const status = WO_STATUS_LABELS[wo.status] || wo.status || 'Submitted';
    const priority = PRIORITY_LABELS[wo.priority || 'medium'] || wo.priority || 'Medium';
    const assignee = wo.assignee === 'UNASSIGNED' ? 'Unassigned' : wo.assignee;
    const tenant = wo.tenant ? ` | Tenant: ${wo.tenant}` : '';
    const vendor = wo.vendor ? ` | Vendor: ${wo.vendor}` : '';
    const target = wo.dueDate ? ` | Target: ${wo.dueDate}` : '';
    const unit = wo.unit ? `, Unit ${wo.unit}` : '';
    return `- ${wo.property}${unit}: ${wo.title} | ${status} | ${priority} | Owner: ${assignee}${tenant}${vendor}${target}`;
  }).join('\n');
}

function buildMaintenanceSOPSection() {
  const openOrders = workOrders.filter(wo => wo.status !== 'completed');
  const unassigned = openOrders.filter(wo => wo.assignee === 'UNASSIGNED').length;
  const emergencyCoverage = getCriticalCoverageAreas().find(area => area.label === 'Emergencies');
  const maintenanceCoverage = getCriticalCoverageAreas().find(area => area.label === 'Maintenance');

  return [
    '### Intake Standard',
    '',
    '- Every request should include property, unit, tenant/resident, issue, priority, assignee, vendor, target date, notes, and estimated cost when known.',
    '- High-priority or emergency work should have a named internal owner before vendor dispatch.',
    '- Vendor and tenant communication should be updated before moving a work order forward.',
    '',
    '### Current Flow Health',
    '',
    `- Open work orders: ${openOrders.length}`,
    `- Unassigned open work orders: ${unassigned}`,
    `- Maintenance coverage: ${maintenanceCoverage ? `${maintenanceCoverage.coveragePct}%` : 'Not available'}`,
    `- Emergency coverage: ${emergencyCoverage ? `${emergencyCoverage.coveragePct}%` : 'Not available'}`,
    '',
    '### Closeout Standard',
    '',
    '- Confirm work completed, collect invoice or cost, document notes/photos outside this tool if needed, and move the work order to completed.',
  ].join('\n');
}

function formatTaskLine(task) {
  const status = STATUS_LABELS[task.status || 'todo'] || task.status || 'To Do';
  const priority = PRIORITY_LABELS[task.priority || 'medium'] || task.priority || 'Medium';
  const due = task.dueDate ? ` | Due: ${task.dueDate}` : '';
  const blocker = task.blockedBy ? ` | Blocked by: ${task.blockedBy.name}` : '';
  return `${task.name} | Owner: ${task.owner} | ${status} | ${priority}${due}${blocker}`;
}

function getPrimaryOwner(tasks) {
  const counts = new Map();
  tasks.forEach(task => {
    if (task.owner === 'UNOWNED') return;
    counts.set(task.owner, (counts.get(task.owner) || 0) + 1);
  });
  if (!counts.size) return 'Unassigned';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function getPropertyName(propertyId) {
  return portfolio.properties.find(property => property.id === propertyId)?.name || 'Unassigned property';
}

function getCriticalCoverageAreas() {
  return CRITICAL_COVERAGE_AREAS.map(area => {
    const depts = area.departments
      .map(id => orgData.departments.find(dept => dept.id === id))
      .filter(Boolean);
    const tasks = depts.flatMap(dept => dept.tasks);
    const unownedCount = tasks.filter(task => task.owner === 'UNOWNED').length;
    const ownerCounts = new Map();

    tasks.forEach(task => {
      if (task.owner !== 'UNOWNED') ownerCounts.set(task.owner, (ownerCounts.get(task.owner) || 0) + 1);
    });

    const primaryOwners = [...ownerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join(', ') || 'No named owner';

    return {
      ...area,
      departmentNames: depts.map(dept => dept.name),
      taskCount: tasks.length,
      unownedCount,
      primaryOwners,
      coveragePct: tasks.length ? Math.round(((tasks.length - unownedCount) / tasks.length) * 100) : 0,
    };
  });
}

function getHandbookGaps() {
  const summary = getOperatingSummary();
  const gaps = [];
  if (!portfolio.properties.length) gaps.push('Add managed properties with unit counts and owner/client context.');
  if (!portfolio.tenants.length) gaps.push('Add tenants so maintenance and communication have resident context.');
  if (!portfolio.vendors.length) gaps.push('Add vendors so repair dispatch has a starter bench.');
  if (!teamData.employees.length) gaps.push('Add team members so the handbook can name real owners.');
  if (summary.unownedTasks > 0) gaps.push(`Assign ${summary.unownedTasks} unowned responsibilities.`);
  if (summary.blockedTasks > 0) gaps.push(`Resolve or document ${summary.blockedTasks} blocked responsibilities.`);
  if (summary.overdueTasks > 0) gaps.push(`Review ${summary.overdueTasks} overdue responsibilities.`);
  if (!workOrders.length) gaps.push('Create one starter work order to document maintenance flow.');
  getCriticalCoverageAreas()
    .filter(area => area.coveragePct < 70)
    .forEach(area => gaps.push(`Improve ${area.label} coverage (${area.coveragePct}% covered).`));
  return gaps;
}

function markdownToPrintHtml(markdown, title) {
  const body = markdown
    .split('\n')
    .map(line => {
      if (line.startsWith('# ')) return `<h1>${escapeLine(line.slice(2))}</h1>`;
      if (line.startsWith('## ')) return `<h2>${escapeLine(line.slice(3))}</h2>`;
      if (line.startsWith('### ')) return `<h3>${escapeLine(line.slice(4))}</h3>`;
      if (line.startsWith('- ')) return `<li>${escapeLine(line.slice(2))}</li>`;
      if (!line.trim()) return '';
      return `<p>${escapeLine(line)}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`);

  return `
    <html>
      <head>
        <title>${escapeLine(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #263238; padding: 28px; line-height: 1.45; }
          h1 { font-size: 28px; margin-bottom: 4px; }
          h2 { margin-top: 28px; border-bottom: 1px solid #cfd8dc; padding-bottom: 4px; }
          h3 { margin-top: 18px; }
          ul { padding-left: 22px; }
          li { margin: 4px 0; }
          h2, h3, ul { break-inside: avoid; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
}

function escapeLine(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
