// Boundary sanitizers: turn untrusted data into records the rest of the app can trust.
//
// Data enters PM Ops Map from places the UI forms never see — an imported JSON
// file, pasted clipboard text, a Team Sync server, a restored backup, and
// whatever is sitting in localStorage. Everything from those paths is passed
// through the functions below BEFORE it reaches shared state, so views can rely
// on: known enums, #rrggbb colors, safe ids, valid dates, finite numbers,
// http(s)-only links, and length-capped text.
//
// The generic machinery (field helpers, record/collection validation, error
// objects with field paths) lives in schema.js; this file says what a work order,
// property, tenant, vendor, employee and task look like. Every validator returns
// its sanitized data plus `errors`: what was repaired or dropped, by field path.
//
// This is a safety net, not a replacement for escaping: free text (names,
// notes) legitimately contains characters like < and ", so views must still
// escape it at render time. Pure functions only — no DOM, no shared state.
import { STATUS_CYCLE, PRIORITY_CYCLE, WO_STATUS_CYCLE } from './state.js';
import { isValidISODate } from './utils.js';
import { findConfigTask } from './taskIdentity.js';
import {
  cleanText, cleanId, isHexColor, cleanTimestamp, cleanNumber,
  line, text, choice, date, optionalDate, stamp, url, money, count,
  validateCollection, makeIssue, shorten, wasProvided,
} from './schema.js';

export { cleanText, cleanId, isHexColor, cleanTimestamp, cleanNumber };

export const TENANT_STATUSES = ['active', 'applicant', 'notice', 'past'];
export const DEFAULT_EMPLOYEE_HEX = '#607d8b';

export const LIMITS = {
  company: 60,
  employeeName: 60,
  ownerName: 60,
  taskName: 200,
  taskNotes: 1000,
  customFieldKey: 40,
  customFieldValue: 200,
  customFieldCount: 10,
  affinities: 50,
  records: { employees: 200, workOrders: 5000, properties: 2000, tenants: 5000, vendors: 2000 },
  workOrder: { property: 200, unit: 50, tenant: 200, title: 300, notes: 2000, vendor: 200, assignee: 60 },
  property: { name: 200, owner: 200, notes: 2000 },
  tenant: { name: 200, unit: 50, phone: 50, email: 200 },
  vendor: { name: 200, trade: 100, phone: 50, email: 200 },
};

const DEPT_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// ── Record specs ──────────────────────────────────────────────────────────────

const WORK_ORDER_SPEC = {
  property: line(LIMITS.workOrder.property),
  unit: line(LIMITS.workOrder.unit),
  tenant: line(LIMITS.workOrder.tenant),
  title: { ...line(LIMITS.workOrder.title), required: true },
  notes: text(LIMITS.workOrder.notes),
  priority: choice(PRIORITY_CYCLE, 'medium'),
  status: choice(WO_STATUS_CYCLE, 'submitted'),
  assignee: line(LIMITS.workOrder.assignee, 'UNASSIGNED'),
  vendor: line(LIMITS.workOrder.vendor),
  dueDate: date(null),
  cost: money(0),
  createdAt: stamp(),
  updatedAt: stamp(),
};

const PROPERTY_SPEC = {
  name: { ...line(LIMITS.property.name), required: true },
  units: count(0),
  owner: line(LIMITS.property.owner),
  notes: text(LIMITS.property.notes),
  documentUrl: url(),
  createdAt: stamp(),
  updatedAt: stamp(),
};

const TENANT_SPEC = {
  name: { ...line(LIMITS.tenant.name), required: true },
  unit: line(LIMITS.tenant.unit),
  status: choice(TENANT_STATUSES, 'active'),
  phone: line(LIMITS.tenant.phone),
  email: line(LIMITS.tenant.email),
  rent: money(0),
  leaseStart: date(''),
  leaseEnd: date(''),
  balanceDue: money(0),
  lastPaymentDate: optionalDate(),
  documentUrl: url(),
  createdAt: stamp(),
  updatedAt: stamp(),
};

const VENDOR_SPEC = {
  name: { ...line(LIMITS.vendor.name), required: true },
  trade: line(LIMITS.vendor.trade),
  phone: line(LIMITS.vendor.phone),
  email: line(LIMITS.vendor.email),
  documentUrl: url(),
  createdAt: stamp(),
  updatedAt: stamp(),
};

// ── Work orders and portfolio ─────────────────────────────────────────────────

export function normalizeWorkOrders(rawList) {
  return validateCollection(rawList, WORK_ORDER_SPEC, {
    path: 'workOrders', noun: 'Work order', titleKey: 'title', idPrefix: 'wo', max: LIMITS.records.workOrders,
  });
}

export function normalizePortfolio(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const properties = validateCollection(source.properties, PROPERTY_SPEC, {
    path: 'portfolio.properties', noun: 'Property', titleKey: 'name', idPrefix: 'property', max: LIMITS.records.properties,
  });
  const propertyIds = new Set(properties.items.map(p => p.id));
  const tenants = validateCollection(source.tenants, TENANT_SPEC, {
    path: 'portfolio.tenants', noun: 'Tenant', titleKey: 'name', idPrefix: 'tenant', max: LIMITS.records.tenants,
    // A tenant only keeps its propertyId if that property exists in this workspace.
    finish: (record, rawTenant, ctx) => {
      const candidate = cleanId(rawTenant.propertyId);
      const linked = candidate && propertyIds.has(candidate) ? candidate : '';
      const broken = wasProvided(rawTenant.propertyId) && !linked;
      return {
        value: { ...record, propertyId: linked },
        repaired: broken,
        errors: broken ? [makeIssue({
          path: `${ctx.path}.propertyId`, label: ctx.label, field: 'propertyId', code: 'unknown_reference',
          detail: `${shorten(rawTenant.propertyId)} is not a property in this workspace; link cleared.`,
        })] : [],
      };
    },
  });
  const vendors = validateCollection(source.vendors, VENDOR_SPEC, {
    path: 'portfolio.vendors', noun: 'Vendor', titleKey: 'name', idPrefix: 'vendor', max: LIMITS.records.vendors,
  });
  return {
    portfolio: { properties: properties.items, tenants: tenants.items, vendors: vendors.items },
    stats: { properties: properties.stats, tenants: tenants.stats, vendors: vendors.stats },
    errors: [...properties.errors, ...tenants.errors, ...vendors.errors],
    omitted: properties.omitted + tenants.omitted + vendors.omitted,
  };
}

// ── Team ──────────────────────────────────────────────────────────────────────

// Returns { employee, errors, repaired }; `employee` is null when the row is unusable.
function checkEmployee(raw, { knownDeptIds, path = 'team.employees[0]', label = 'Team member' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { employee: null, repaired: false, errors: [makeIssue({ path, label, code: 'not_an_object', detail: 'is not an object, so it is skipped.' })] };
  }
  const name = cleanText(raw.name, LIMITS.employeeName);
  const named = name ? `${label} (${shorten(name)})` : label;
  if (!name) {
    return { employee: null, repaired: false, errors: [makeIssue({ path: `${path}.name`, label, field: 'name', code: 'missing_required', detail: 'required, so the member is skipped.' })] };
  }
  if (name.toUpperCase() === 'UNOWNED' || name.toUpperCase() === 'UNASSIGNED') {
    return { employee: null, repaired: false, errors: [makeIssue({ path: `${path}.name`, label: named, field: 'name', code: 'reserved_name', detail: `${shorten(name)} is a reserved name, so the member is skipped.` })] };
  }
  const errors = [];
  if (raw.name !== name) {
    errors.push(makeIssue({ path: `${path}.name`, label: named, field: 'name', code: 'adjusted', detail: 'was cleaned up (extra spaces or characters removed, or shortened).' }));
  }
  let hex = DEFAULT_EMPLOYEE_HEX;
  if (isHexColor(raw.hex)) hex = raw.hex;
  else {
    errors.push(makeIssue({
      path: `${path}.hex`, label: named, field: 'hex', code: 'invalid_value',
      detail: wasProvided(raw.hex) ? `${shorten(raw.hex)} is not a valid color; reset to ${shorten(DEFAULT_EMPLOYEE_HEX)}.` : `missing; using the default color ${shorten(DEFAULT_EMPLOYEE_HEX)}.`,
    }));
  }
  const known = knownDeptIds ? new Set(knownDeptIds) : null;
  const affinities = [];
  if (Array.isArray(raw.affinities)) {
    raw.affinities.forEach((a, i) => {
      const where = { path: `${path}.affinities[${i}]`, label: named, field: `affinities[${i}]` };
      if (typeof a !== 'string' || !DEPT_ID_RE.test(a)) {
        errors.push(makeIssue({ ...where, code: 'invalid_value', detail: `${shorten(a)} is not a valid department id; removed.` }));
      } else if (known && !known.has(a)) {
        errors.push(makeIssue({ ...where, code: 'unknown_reference', detail: `${shorten(a)} is not a department in this app; removed.` }));
      } else if (affinities.includes(a)) {
        errors.push(makeIssue({ ...where, code: 'adjusted', detail: `${shorten(a)} is listed twice; duplicate removed.` }));
      } else if (affinities.length >= LIMITS.affinities) {
        errors.push(makeIssue({ ...where, code: 'over_limit', detail: `over the limit of ${LIMITS.affinities} departments; removed.` }));
      } else {
        affinities.push(a);
      }
    });
  }
  return { employee: { name, hex, affinities }, errors, repaired: errors.length > 0 };
}

export function normalizeEmployee(raw, options = {}) {
  return checkEmployee(raw, options).employee;
}

export function normalizeTeam(raw, options = {}) {
  const stats = { kept: 0, dropped: 0, repaired: 0 };
  const employees = [];
  const errors = [];
  const list = raw && Array.isArray(raw.employees) ? raw.employees : [];
  const seen = new Set();
  list.forEach((item, index) => {
    const path = `team.employees[${index}]`;
    const label = `Team member ${index + 1}`;
    const result = checkEmployee(item, { ...options, path, label });
    const employee = result.employee;
    if (!employee) { stats.dropped++; errors.push(...result.errors); return; }
    const key = employee.name.toLowerCase();
    if (seen.has(key)) {
      stats.dropped++;
      errors.push(makeIssue({ path: `${path}.name`, label: `${label} (${shorten(employee.name)})`, field: 'name', code: 'duplicate', detail: 'repeats an earlier team member, so it is skipped.' }));
      return;
    }
    if (employees.length >= LIMITS.records.employees) {
      stats.dropped++;
      errors.push(makeIssue({ path, label, code: 'over_limit', detail: `over the limit of ${LIMITS.records.employees} team members, so it is skipped.` }));
      return;
    }
    seen.add(key);
    errors.push(...result.errors);
    if (result.repaired) stats.repaired++;
    stats.kept++;
    employees.push(employee);
  });
  return { team: { employees }, stats, errors };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

// A dependency points at its blocker by `taskId` (permanent) and/or `configName` (the
// starter name older versions wrote). Either is enough; both are kept when present so
// a file written by this version still works in an older one.
export function normalizeBlockedBy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const deptId = typeof raw.deptId === 'string' && DEPT_ID_RE.test(raw.deptId) ? raw.deptId : '';
  const taskId = cleanId(raw.taskId);
  const configName = cleanText(raw.configName, LIMITS.taskName);
  const name = cleanText(raw.name, LIMITS.taskName);
  if (!deptId || (!taskId && !configName)) return null;
  const result = { deptId };
  if (taskId) result.taskId = taskId;
  if (configName) result.configName = configName;
  result.name = name || configName || '';
  return result;
}

export function normalizeCustomFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw)
    .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
    .map(([k, v]) => [cleanText(k, LIMITS.customFieldKey), cleanText(v, LIMITS.customFieldValue)])
    .filter(([k]) => k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
    .slice(0, LIMITS.customFieldCount);
  return entries.length ? Object.fromEntries(entries) : null;
}

// Converts one saved/imported task into a patch to merge onto the matching
// config task. Returns null if the row is unusable. With { fill: true } (used by
// backup restore) absent fields are reset to their defaults instead of being left alone.
// With { issues, path, label } every field that had to be dropped or reset is also
// described in `issues` (an array the caller owns).
export function normalizeSavedTask(saved, { fill = false, issues = null, path = '', label = '' } = {}) {
  const note = (field, code, detail) => {
    if (issues) issues.push(makeIssue({ path: path ? `${path}.${field}` : field, label, field, code, detail }));
  };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    if (issues) issues.push(makeIssue({ path, label, code: 'not_an_object', detail: 'is not an object, so it is ignored.' }));
    return null;
  }
  const name = cleanText(saved.name, LIMITS.taskName);
  const owner = cleanText(saved.owner, LIMITS.ownerName);
  if (!name || !owner) {
    if (!name) note('name', 'missing_required', 'required, so the task row is ignored.');
    if (!owner) note('owner', 'missing_required', 'required, so the task row is ignored.');
    return null;
  }

  const patch = { name, owner };

  if (STATUS_CYCLE.includes(saved.status)) patch.status = saved.status;
  else {
    if (wasProvided(saved.status)) note('status', 'invalid_value', `${shorten(saved.status)} is not allowed; ${fill ? 'reset to "todo"' : 'left unchanged'}.`);
    if (fill) patch.status = 'todo';
  }

  if (PRIORITY_CYCLE.includes(saved.priority)) patch.priority = saved.priority;
  else {
    if (wasProvided(saved.priority)) note('priority', 'invalid_value', `${shorten(saved.priority)} is not allowed; ${fill ? 'reset to "medium"' : 'left unchanged'}.`);
    if (fill) patch.priority = 'medium';
  }

  if (saved.dueDate !== undefined || fill) {
    patch.dueDate = isValidISODate(saved.dueDate) ? saved.dueDate : null;
    if (patch.dueDate === null && wasProvided(saved.dueDate)) note('dueDate', 'invalid_value', `${shorten(saved.dueDate)} is not allowed; cleared.`);
  }
  if (saved.blockedBy !== undefined || fill) {
    patch.blockedBy = normalizeBlockedBy(saved.blockedBy);
    if (patch.blockedBy === null && wasProvided(saved.blockedBy)) note('blockedBy', 'invalid_value', `${shorten(saved.blockedBy)} is not a usable dependency; cleared.`);
  }
  // null means "no notes" (a note cleared on another device); undefined means "this file predates notes" — leave alone.
  if (typeof saved.notes === 'string' || saved.notes === null || fill) patch.notes = cleanText(saved.notes, LIMITS.taskNotes, { multiline: true }) || null;
  if (saved.customFields !== undefined || fill) patch.customFields = normalizeCustomFields(saved.customFields);

  return patch;
}

// Merges saved/imported department data onto the live config departments. This
// is the ONE place saved task fields are applied — storage load, backup restore
// and file/clipboard/sync import all call it, so they can never disagree about
// which fields survive. Rows are matched to config tasks by permanent `id`, then by
// the starter name (`_configName`) or one of the task's `aliases` (see taskIdentity.js).
// Returns { matched, skipped } counts.
export function applySavedTasks(departments, savedDepartments, options = {}) {
  const result = { matched: 0, skipped: 0 };
  if (!Array.isArray(savedDepartments)) return result;
  savedDepartments.forEach((savedDept, deptIndex) => {
    if (!savedDept || typeof savedDept.id !== 'string') return;
    const dept = departments.find(d => d.id === savedDept.id);
    if (!dept || !Array.isArray(savedDept.tasks)) return;
    savedDept.tasks.forEach((savedTask, taskIndex) => {
      // With options.issues the caller wants to know what was repaired, so say where each row is.
      const rowOptions = options.issues ? {
        ...options,
        path: `departments[${deptIndex}].tasks[${taskIndex}]`,
        label: `Task ${shorten(savedTask && savedTask.name)} in ${dept.name}`,
      } : options;
      const patch = normalizeSavedTask(savedTask, rowOptions);
      const task = patch && findConfigTask(departments, savedTask, { deptId: dept.id });
      if (!task) { result.skipped++; return; }
      // A name the user never edited (it still equals the starter name the row was saved
      // under) follows config.json's current wording; an edited name is the user's and stays.
      if (task._configName && patch.name === cleanText(savedTask._configName, LIMITS.taskName)) patch.name = task._configName;
      Object.assign(task, patch);
      result.matched++;
    });
  });
  return result;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

const AUDIT_TEXT_KEYS = ['dept', 'task', 'title', 'label'];

export function normalizeAuditEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ts = cleanTimestamp(raw.ts);
  const action = typeof raw.action === 'string' && /^[a-z0-9_]{1,40}$/.test(raw.action) ? raw.action : '';
  if (!ts || !action) return null;
  const entry = { ts, action };
  AUDIT_TEXT_KEYS.forEach(key => {
    if (typeof raw[key] === 'string') entry[key] = cleanText(raw[key], 300);
  });
  ['from', 'to'].forEach(key => {
    if (raw[key] === null) entry[key] = null;
    else if (typeof raw[key] === 'string') entry[key] = cleanText(raw[key], 300);
    else if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) entry[key] = raw[key];
  });
  if (typeof raw.count === 'number' && Number.isFinite(raw.count)) entry.count = raw.count;
  return entry;
}

export function normalizeAuditLog(rawList, max = 500) {
  return (Array.isArray(rawList) ? rawList : []).map(normalizeAuditEntry).filter(Boolean).slice(0, max);
}

// ── Whole-workspace entry point ───────────────────────────────────────────────

export function normalizeCompany(value) {
  return cleanText(value, LIMITS.company);
}

// Sanitizes everything in an imported payload except the tasks (those are
// matched against the live config by the caller via normalizeSavedTask).
// Sections absent from the payload come back as null so callers leave them alone.
export function sanitizeWorkspace(data, { knownDeptIds } = {}) {
  const src = data && typeof data === 'object' ? data : {};
  const result = { company: normalizeCompany(src.company), team: null, workOrders: null, portfolio: null, stats: {}, errors: [], omitted: 0 };
  if (src.team && Array.isArray(src.team.employees)) {
    const t = normalizeTeam(src.team, { knownDeptIds });
    result.team = t.team;
    result.stats.employees = t.stats;
    result.errors.push(...t.errors);
  }
  if (Array.isArray(src.workOrders)) {
    const w = normalizeWorkOrders(src.workOrders);
    result.workOrders = w.items;
    result.stats.workOrders = w.stats;
    result.errors.push(...w.errors);
    result.omitted += w.omitted;
  }
  if (src.portfolio && typeof src.portfolio === 'object') {
    const p = normalizePortfolio(src.portfolio);
    result.portfolio = p.portfolio;
    result.stats.properties = p.stats.properties;
    result.stats.tenants = p.stats.tenants;
    result.stats.vendors = p.stats.vendors;
    result.errors.push(...p.errors);
    result.omitted += p.omitted;
  }
  return result;
}
