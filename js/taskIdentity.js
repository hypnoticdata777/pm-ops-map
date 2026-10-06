// Task identity: how a saved/imported/backed-up task row finds its starter task.
//
// Every starter task in config.json has a permanent `id` (e.g. "maintenance-014").
// Its visible name can be reworded in config.json — or edited by the user — without
// orphaning anyone's progress, because rows are matched in this order:
//   1. `id`           permanent, and valid even if the task moved departments
//   2. `_configName`  the starter name an older export/save was written with
//   3. `aliases`      former starter names, listed on the task in config.json
//                     when it is reworded (so data saved before ids existed still lands)
// Steps 2 and 3 only look inside the saved department, because two departments can
// legitimately contain tasks with the same name. Pure functions; no DOM, no shared state.

// Same character set as the other ids that reach attributes and selectors (see normalize.js).
const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export function isTaskId(value) {
  return typeof value === 'string' && TASK_ID_RE.test(value);
}

function slugify(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
  return slug || 'task';
}

// Called once at boot, after config.json is loaded. Records each task's starter name
// as `_configName` and makes sure every task has a unique, safe `id`. Tasks from a
// custom config without ids get a deterministic fallback derived from their starter
// name, so the same config always produces the same ids.
export function stampTaskIdentity(departments) {
  const used = new Set();
  departments.forEach(dept => dept.tasks.forEach(task => {
    if (isTaskId(task.id) && !used.has(task.id)) used.add(task.id);
    else task.id = undefined; // missing, unsafe, or a duplicate: assigned below
  }));
  departments.forEach(dept => dept.tasks.forEach(task => {
    task._configName = task.name;
    if (task.id !== undefined) return;
    const base = `${dept.id}-${slugify(task.name)}`.slice(0, 74);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    task.id = id;
  }));
  return departments;
}

function nameMatches(task, key) {
  return task._configName === key || (Array.isArray(task.aliases) && task.aliases.includes(key));
}

// Finds the live config task a saved row refers to, or null.
// `saved` may carry { id, _configName, name }; `deptId` is the department it was saved under.
export function findConfigTask(departments, saved, { deptId } = {}) {
  if (!saved || typeof saved !== 'object') return null;
  if (isTaskId(saved.id)) {
    for (const dept of departments) {
      const hit = dept.tasks.find(t => t.id === saved.id);
      if (hit) return hit;
    }
  }
  const key = saved._configName || saved.name;
  if (typeof key !== 'string' || !key) return null;
  const dept = departments.find(d => d.id === deptId);
  return (dept && dept.tasks.find(t => nameMatches(t, key))) || null;
}

// Resolves a task's `blockedBy` reference ({ deptId, taskId?, configName?, name }) to the blocking task.
export function findBlockerTask(departments, blockedBy) {
  if (!blockedBy || typeof blockedBy !== 'object') return null;
  return findConfigTask(departments, { id: blockedBy.taskId, _configName: blockedBy.configName }, { deptId: blockedBy.deptId });
}
