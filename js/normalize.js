// Boundary sanitizers: turn untrusted data into records the rest of the app can trust.
//
// Data enters PM Ops Map from places the UI forms never see — an imported JSON
// file, pasted clipboard text, a Team Sync server, a restored backup, and
// whatever is sitting in localStorage. Everything from those paths is passed
// through the functions below BEFORE it reaches shared state, so views can rely
// on: known enums, #rrggbb colors, safe ids, valid dates, finite numbers,
// http(s)-only links, and length-capped text.
//
// This is a safety net, not a replacement for escaping: free text (names,
// notes) legitimately contains characters like < and ", so views must still
// escape it at render time. Pure functions only — no DOM, no shared state.
import { STATUS_CYCLE, PRIORITY_CYCLE, WO_STATUS_CYCLE } from './state.js';
import { isValidISODate, normalizeUrl } from './utils.js';

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

// Letters, digits and . _ : - only — safe in an attribute, a selector, or a URL fragment.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DEPT_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// C0 controls except \t \n \r, DEL, and the Unicode line/paragraph separators.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g;

// ── Primitive cleaners (return undefined when the input is unusable) ──────────

function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function cleanText(value, max, { multiline = false } = {}) {
  let s = asString(value).replace(CONTROL_CHARS, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.trim().slice(0, max);
}

export function cleanId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : undefined;
}

export function isHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function cleanTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

export function cleanNumber(value, { min = 0, max = 1e9, integer = false } = {}) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return integer ? Math.trunc(n) : Math.round(n * 100) / 100;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// ── Declarative field specs ───────────────────────────────────────────────────
// Each field: { clean(input) -> value | undefined, fallback, required? }

const line = (max, fallback = '') => ({ clean: v => cleanText(v, max), fallback });
const text = (max, fallback = '') => ({ clean: v => cleanText(v, max, { multiline: true }), fallback });
const choice = (list, fallback) => ({ clean: v => (list.includes(v) ? v : undefined), fallback });
const date = (fallback = null) => ({ clean: v => (isValidISODate(v) ? v : undefined), fallback });
// Optional fields stay absent when the input is absent or unusable (no empty-string placeholders).
const stamp = () => ({ clean: cleanTimestamp, optional: true });
const optionalDate = () => ({ clean: v => (isValidISODate(v) ? v : undefined), optional: true });
// A valid link counts as unchanged even when the parser canonicalizes it
// (https://example.com -> https://example.com/); only invalid links are "repairs".
const url = (fallback = '') => ({ clean: v => normalizeUrl(v) || undefined, fallback, sameAs: () => true });
const money = (fallback = 0) => ({ clean: v => cleanNumber(v), fallback, numeric: true });
const count = (fallback = 0) => ({ clean: v => cleanNumber(v, { max: 1e6, integer: true }), fallback, numeric: true });

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

function wasProvided(input) {
  return !(input === undefined || input === null || input === '');
}

function unchanged(input, cleaned, field) {
  if (field.sameAs) return field.sameAs(input, cleaned);
  if (field.numeric) return Number(input) === cleaned;
  return typeof input === 'string' ? input.trim() === cleaned : input === cleaned;
}

// Applies a spec to one raw record. Returns { value, repaired } or null when a
// required field is unusable (the record should be dropped).
function normalizeRecord(raw, spec) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = {};
  let repaired = false;
  for (const [key, field] of Object.entries(spec)) {
    const input = raw[key];
    const cleaned = field.clean(input);
    if (cleaned === undefined || (field.required && cleaned === '')) {
      if (field.required) return null;
      if (wasProvided(input)) repaired = true;
      if (!field.optional) value[key] = field.fallback;
    } else {
      value[key] = cleaned;
      if (wasProvided(input) && !unchanged(input, cleaned, field)) repaired = true;
    }
  }
  return { value, repaired };
}

// Normalizes a list of records, assigning safe unique ids. `finish(record, raw)`
// runs cross-reference checks and returns { value, repaired } (or null to drop).
function normalizeCollection(rawList, spec, { idPrefix, max, finish } = {}) {
  const stats = { kept: 0, dropped: 0, repaired: 0 };
  const items = [];
  if (!Array.isArray(rawList)) return { items, stats };
  const seen = new Set();
  rawList.forEach((raw, index) => {
    if (items.length >= max) { stats.dropped++; return; }
    const result = normalizeRecord(raw, spec);
    if (!result) { stats.dropped++; return; }
    let { value, repaired } = result;
    let id = cleanId(raw.id);
    if (!id || seen.has(id)) {
      id = generateId(`${idPrefix}-${index}`);
      repaired = true;
    }
    seen.add(id);
    value = { id, ...value };
    if (finish) {
      const finished = finish(value, raw);
      if (!finished) { stats.dropped++; return; }
      value = finished.value;
      repaired = repaired || finished.repaired;
    }
    if (repaired) stats.repaired++;
    stats.kept++;
    items.push(value);
  });
  return { items, stats };
}

// ── Work orders and portfolio ─────────────────────────────────────────────────

export function normalizeWorkOrders(rawList) {
  return normalizeCollection(rawList, WORK_ORDER_SPEC, { idPrefix: 'wo', max: LIMITS.records.workOrders });
}

export function normalizePortfolio(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const properties = normalizeCollection(source.properties, PROPERTY_SPEC, { idPrefix: 'property', max: LIMITS.records.properties });
  const propertyIds = new Set(properties.items.map(p => p.id));
  const tenants = normalizeCollection(source.tenants, TENANT_SPEC, {
    idPrefix: 'tenant',
    max: LIMITS.records.tenants,
    // A tenant only keeps its propertyId if that property exists in this workspace.
    finish: (record, rawTenant) => {
      const candidate = cleanId(rawTenant.propertyId);
      const linked = candidate && propertyIds.has(candidate) ? candidate : '';
      return { value: { ...record, propertyId: linked }, repaired: wasProvided(rawTenant.propertyId) && !linked };
    },
  });
  const vendors = normalizeCollection(source.vendors, VENDOR_SPEC, { idPrefix: 'vendor', max: LIMITS.records.vendors });
  return {
    portfolio: { properties: properties.items, tenants: tenants.items, vendors: vendors.items },
    stats: { properties: properties.stats, tenants: tenants.stats, vendors: vendors.stats },
  };
}

// ── Team ──────────────────────────────────────────────────────────────────────

export function normalizeEmployee(raw, { knownDeptIds } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = cleanText(raw.name, LIMITS.employeeName);
  if (!name || name.toUpperCase() === 'UNOWNED' || name.toUpperCase() === 'UNASSIGNED') return null;
  const known = knownDeptIds ? new Set(knownDeptIds) : null;
  const affinities = [];
  if (Array.isArray(raw.affinities)) {
    raw.affinities.forEach(a => {
      if (typeof a !== 'string' || !DEPT_ID_RE.test(a)) return;
      if (known && !known.has(a)) return;
      if (!affinities.includes(a) && affinities.length < LIMITS.affinities) affinities.push(a);
    });
  }
  return { name, hex: isHexColor(raw.hex) ? raw.hex : DEFAULT_EMPLOYEE_HEX, affinities };
}

export function normalizeTeam(raw, options = {}) {
  const stats = { kept: 0, dropped: 0, repaired: 0 };
  const employees = [];
  const list = raw && Array.isArray(raw.employees) ? raw.employees : [];
  const seen = new Set();
  list.forEach(item => {
    const employee = normalizeEmployee(item, options);
    const key = employee?.name.toLowerCase();
    if (!employee || seen.has(key) || employees.length >= LIMITS.records.employees) { stats.dropped++; return; }
    seen.add(key);
    if (item.name !== employee.name || item.hex !== employee.hex || (item.affinities || []).length !== employee.affinities.length) stats.repaired++;
    stats.kept++;
    employees.push(employee);
  });
  return { team: { employees }, stats };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function normalizeBlockedBy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const deptId = typeof raw.deptId === 'string' && DEPT_ID_RE.test(raw.deptId) ? raw.deptId : '';
  const configName = cleanText(raw.configName, LIMITS.taskName);
  const name = cleanText(raw.name, LIMITS.taskName);
  if (!deptId || !configName) return null;
  return { deptId, configName, name: name || configName };
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
export function normalizeSavedTask(saved, { fill = false } = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const name = cleanText(saved.name, LIMITS.taskName);
  const owner = cleanText(saved.owner, LIMITS.ownerName);
  if (!name || !owner) return null;

  const patch = { name, owner };

  if (STATUS_CYCLE.includes(saved.status)) patch.status = saved.status;
  else if (fill) patch.status = 'todo';

  if (PRIORITY_CYCLE.includes(saved.priority)) patch.priority = saved.priority;
  else if (fill) patch.priority = 'medium';

  if (saved.dueDate !== undefined || fill) patch.dueDate = isValidISODate(saved.dueDate) ? saved.dueDate : null;
  if (saved.blockedBy !== undefined || fill) patch.blockedBy = normalizeBlockedBy(saved.blockedBy);
  // null means "no notes" (a note cleared on another device); undefined means "this file predates notes" — leave alone.
  if (typeof saved.notes === 'string' || saved.notes === null || fill) patch.notes = cleanText(saved.notes, LIMITS.taskNotes, { multiline: true }) || null;
  if (saved.customFields !== undefined || fill) patch.customFields = normalizeCustomFields(saved.customFields);

  return patch;
}

// Merges saved/imported department data onto the live config departments. This
// is the ONE place saved task fields are applied — storage load, backup restore
// and file/clipboard/sync import all call it, so they can never disagree about
// which fields survive. Rows are matched to config tasks by their stable
// _configName key. Returns { matched, skipped } counts.
export function applySavedTasks(departments, savedDepartments, options = {}) {
  const result = { matched: 0, skipped: 0 };
  if (!Array.isArray(savedDepartments)) return result;
  savedDepartments.forEach(savedDept => {
    if (!savedDept || typeof savedDept.id !== 'string') return;
    const dept = departments.find(d => d.id === savedDept.id);
    if (!dept || !Array.isArray(savedDept.tasks)) return;
    savedDept.tasks.forEach(savedTask => {
      const patch = normalizeSavedTask(savedTask, options);
      const key = savedTask && (savedTask._configName || savedTask.name);
      const task = patch && dept.tasks.find(t => t._configName === key);
      if (!task) { result.skipped++; return; }
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
  const result = { company: normalizeCompany(src.company), team: null, workOrders: null, portfolio: null, stats: {} };
  if (src.team && Array.isArray(src.team.employees)) {
    const t = normalizeTeam(src.team, { knownDeptIds });
    result.team = t.team;
    result.stats.employees = t.stats;
  }
  if (Array.isArray(src.workOrders)) {
    const w = normalizeWorkOrders(src.workOrders);
    result.workOrders = w.items;
    result.stats.workOrders = w.stats;
  }
  if (src.portfolio && typeof src.portfolio === 'object') {
    const p = normalizePortfolio(src.portfolio);
    result.portfolio = p.portfolio;
    result.stats.properties = p.stats.properties;
    result.stats.tenants = p.stats.tenants;
    result.stats.vendors = p.stats.vendors;
  }
  return result;
}
