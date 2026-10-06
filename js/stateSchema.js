import { normalizeSavedTask, sanitizeWorkspace } from './normalize.js';

export const STATE_SCHEMA_VERSION = 2;
export const STATE_SCHEMA_NAME = 'pm-ops-map-state';

export function buildStatePayload({
  company,
  departments,
  team,
  workOrders,
  portfolio,
  exportedAt = new Date().toISOString(),
}) {
  return {
    schema: STATE_SCHEMA_NAME,
    schemaVersion: STATE_SCHEMA_VERSION,
    app: 'PM Ops Map',
    company,
    exported: exportedAt,
    departments: departments.map(dept => ({
      id: dept.id,
      name: dept.name,
      tasks: dept.tasks.map(task => ({
        _configName: task._configName || task.name,
        name: task.name,
        owner: task.owner,
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        dueDate: task.dueDate || null,
        blockedBy: task.blockedBy || null,
      })),
    })),
    team,
    workOrders,
    portfolio,
  };
}

export function validateImportedState(data, orgData) {
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    schemaVersion: data?.schemaVersion || 1,
    company: data?.company || '',
    matchedDepartments: 0,
    matchedTasks: 0,
    skippedDepartments: 0,
    skippedTasks: 0,
    invalidDueDates: 0,
    invalidTasks: 0,
    repairedRecords: 0,
    droppedRecords: 0,
    teamMembers: Array.isArray(data?.team?.employees) ? data.team.employees.length : 0,
    workOrders: Array.isArray(data?.workOrders) ? data.workOrders.length : 0,
    properties: Array.isArray(data?.portfolio?.properties) ? data.portfolio.properties.length : 0,
    tenants: Array.isArray(data?.portfolio?.tenants) ? data.portfolio.tenants.length : 0,
    vendors: Array.isArray(data?.portfolio?.vendors) ? data.portfolio.vendors.length : 0,
  };

  if (!data || typeof data !== 'object') {
    report.errors.push('File is not a JSON object.');
  }
  if (!Array.isArray(data?.departments)) {
    report.errors.push('Missing departments array.');
  }
  if (data?.schema && data.schema !== STATE_SCHEMA_NAME) {
    report.warnings.push(`Unexpected schema "${data.schema}". PM Ops Map will import compatible department data only.`);
  }
  if (Number(data?.schemaVersion || 1) > STATE_SCHEMA_VERSION) {
    report.warnings.push(`This file was exported by a newer schema version (${data.schemaVersion}). Unknown fields will be ignored.`);
  }

  if (report.errors.length) {
    report.ok = false;
    return report;
  }

  data.departments.forEach(savedDept => {
    const dept = orgData.departments.find(item => item.id === savedDept.id);
    if (!dept) {
      report.skippedDepartments++;
      return;
    }
    report.matchedDepartments++;
    if (!Array.isArray(savedDept.tasks)) {
      report.warnings.push(`Department "${savedDept.id}" has no task array.`);
      return;
    }
    savedDept.tasks.forEach(savedTask => {
      if (!normalizeSavedTask(savedTask)) {
        report.invalidTasks++;
        return;
      }
      const key = savedTask?._configName || savedTask?.name;
      const task = dept.tasks.find(item => item._configName === key || item.name === key);
      if (!task) {
        report.skippedTasks++;
        return;
      }
      report.matchedTasks++;
      if (savedTask.dueDate && !isValidISODateValue(savedTask.dueDate)) {
        report.invalidDueDates++;
      }
    });
  });

  // Dry-run the same sanitizer the import will use, so the review screen can say
  // exactly how much of the file is unusable BEFORE anything is applied.
  const clean = sanitizeWorkspace(data, { knownDeptIds: orgData.departments.map(d => d.id) });
  Object.values(clean.stats).forEach(stat => {
    report.repairedRecords += stat.repaired;
    report.droppedRecords += stat.dropped;
  });
  if (report.invalidTasks) {
    report.warnings.push(`${report.invalidTasks} task row${report.invalidTasks === 1 ? ' is' : 's are'} missing a name or owner and will be ignored.`);
  }
  if (report.droppedRecords) {
    report.warnings.push(`${report.droppedRecords} team, work order, or portfolio record${report.droppedRecords === 1 ? ' is' : 's are'} unusable (missing a required name/title, duplicated, or over the size limit) and will be skipped.`);
  }
  if (report.repairedRecords) {
    report.warnings.push(`${report.repairedRecords} record${report.repairedRecords === 1 ? ' has' : 's have'} values that are not allowed (unknown status/priority/color, bad dates or numbers, unsafe links or ids) — those fields will be reset to safe defaults.`);
  }

  if (report.invalidDueDates) {
    report.warnings.push(`${report.invalidDueDates} invalid due date value${report.invalidDueDates === 1 ? '' : 's'} will be cleared.`);
  }
  if (report.skippedDepartments || report.skippedTasks) {
    report.warnings.push(`${report.skippedDepartments} department${report.skippedDepartments === 1 ? '' : 's'} and ${report.skippedTasks} task${report.skippedTasks === 1 ? '' : 's'} do not match this app version.`);
  }
  if (report.matchedTasks === 0) {
    report.errors.push('No matching tasks were found for this app version.');
  }

  report.ok = report.errors.length === 0;
  return report;
}

export function formatImportReport(report) {
  const lines = [
    'Import validation report',
    '',
    `Schema version: ${report.schemaVersion}`,
    `Company: ${report.company || 'Not specified'}`,
    `Matched departments: ${report.matchedDepartments}`,
    `Matched tasks: ${report.matchedTasks}`,
    `Team members: ${report.teamMembers}`,
    `Work orders: ${report.workOrders}`,
    `Portfolio: ${report.properties} properties / ${report.tenants} tenants / ${report.vendors} vendors`,
  ];
  if (report.warnings.length) {
    lines.push('', 'Warnings:', ...report.warnings.map(item => `- ${item}`));
  }
  if (report.errors.length) {
    lines.push('', 'Errors:', ...report.errors.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

function isValidISODateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
