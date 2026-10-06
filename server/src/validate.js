// Minimal shape checks for what the sync server accepts. The server stores the
// workspace as an opaque blob and never interprets it, so this does NOT try to
// validate every field — the client does that, record by record, before applying
// anything (js/normalize.js). What it refuses is data that is clearly not a PM Ops
// Map workspace, or that is built to be expensive or hostile to store and re-serve:
// the wrong top-level types, absurd list sizes, prototype-pollution keys, and
// extreme nesting. Everything is permissive about unknown keys so newer clients
// keep working against an older server.
const SCHEMA_NAME = 'pm-ops-map-state';
const MAX_DEPTH = 20;
const MAX_PASSPHRASE_LENGTH = 200;
const MAX_REPORTED_ERRORS = 5;

// Roughly twice what the client itself will keep (see LIMITS in js/normalize.js).
const MAX = {
  departments: 100,
  tasksPerDepartment: 2000,
  employees: 500,
  workOrders: 10000,
  properties: 10000,
  tenants: 10000,
  vendors: 10000,
  text: 200,
};

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Walks the whole value iteratively (no recursion, so a deeply nested payload can't
// overflow the stack). Returns an error string or null.
function checkStructure(root) {
  const stack = [[root, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > MAX_DEPTH) return `data is nested too deeply (more than ${MAX_DEPTH} levels).`;
    if (Array.isArray(node)) {
      for (const item of node) if (item && typeof item === 'object') stack.push([item, depth + 1]);
    } else if (isObject(node)) {
      for (const key of Object.keys(node)) {
        if (key === '__proto__') return 'data contains a "__proto__" key.';
        const value = node[key];
        if (value && typeof value === 'object') stack.push([value, depth + 1]);
      }
    }
  }
  return null;
}

// Returns a list of problems (empty when the state is acceptable), at most MAX_REPORTED_ERRORS.
function validateState(state) {
  if (!isObject(state)) return ['state must be a JSON object.'];
  const errors = [];
  const add = message => { if (errors.length < MAX_REPORTED_ERRORS) errors.push(message); };

  const structure = checkStructure(state);
  if (structure) return [structure];

  if (state.schema !== undefined && state.schema !== SCHEMA_NAME) add(`schema must be "${SCHEMA_NAME}" when present.`);
  if (state.schemaVersion !== undefined && !(Number.isInteger(state.schemaVersion) && state.schemaVersion >= 1 && state.schemaVersion <= 1000)) {
    add('schemaVersion must be a whole number between 1 and 1000.');
  }
  if (state.company !== undefined && (typeof state.company !== 'string' || state.company.length > MAX.text)) {
    add(`company must be text of at most ${MAX.text} characters.`);
  }

  const list = (value, name, limit) => {
    if (value === undefined) return false;
    if (!Array.isArray(value)) { add(`${name} must be a list.`); return false; }
    if (value.length > limit) { add(`${name} has too many entries (limit ${limit}).`); return false; }
    return true;
  };

  if (list(state.departments, 'departments', MAX.departments)) {
    state.departments.forEach((dept, i) => {
      if (!isObject(dept)) return add(`departments[${i}] must be an object.`);
      if (dept.id !== undefined && (typeof dept.id !== 'string' || dept.id.length > 80)) add(`departments[${i}].id must be short text.`);
      list(dept.tasks, `departments[${i}].tasks`, MAX.tasksPerDepartment);
    });
  }

  if (state.team !== undefined) {
    if (!isObject(state.team)) add('team must be an object.');
    else list(state.team.employees, 'team.employees', MAX.employees);
  }
  list(state.workOrders, 'workOrders', MAX.workOrders);

  if (state.portfolio !== undefined) {
    if (!isObject(state.portfolio)) add('portfolio must be an object.');
    else {
      list(state.portfolio.properties, 'portfolio.properties', MAX.properties);
      list(state.portfolio.tenants, 'portfolio.tenants', MAX.tenants);
      list(state.portfolio.vendors, 'portfolio.vendors', MAX.vendors);
    }
  }
  return errors;
}

// The minimum length stays in store.js; this only caps the top end so a multi-megabyte
// "passphrase" can't be fed to the key-derivation function.
function validatePassphrase(passphrase) {
  return typeof passphrase === 'string' && passphrase.length > MAX_PASSPHRASE_LENGTH
    ? `Passphrase is too long (limit ${MAX_PASSPHRASE_LENGTH} characters).`
    : null;
}

function validateExpectedVersion(value) {
  if (value === undefined) return null;
  return Number.isSafeInteger(value) && value >= 0 ? null : 'expectedVersion must be a whole number of 0 or more.';
}

module.exports = { validateState, validatePassphrase, validateExpectedVersion, MAX_PASSPHRASE_LENGTH };
