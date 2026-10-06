#!/usr/bin/env node
// Gives every task in config.json a permanent id such as "maintenance-014".
//
// Ids are what let saved progress, imports and backups find a task even after
// its visible name in config.json is reworded. This script only ever ADDS
// missing ids: an id that already exists is never changed, and numbering
// continues after the highest number already used in each department.
//
//   node scripts/assign-task-ids.mjs           add missing ids to config.json
//   node scripts/assign-task-ids.mjs --check   exit 1 if any task has no id
//
// config.json is edited as text (one inserted `"id": "…",` per task line) so
// the diff stays reviewable; the result is re-parsed and compared with the
// original before anything is written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TASK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{3,}$/;
const TASK_LINE = /^(\s*)\{ "(id|name)":/;

function listTasks(config) {
  return config.orgData.departments.flatMap(dept => dept.tasks.map(task => ({ dept, task })));
}

export function findTasksMissingIds(config) {
  return listTasks(config).filter(({ task }) => !task.id).map(({ dept, task }) => `${dept.id}: ${task.name}`);
}

// Returns { text, added } — `text` is the new config.json contents.
export function assignTaskIds(configText) {
  const config = JSON.parse(configText);
  const all = listTasks(config);

  const used = new Set();
  const nextNumber = new Map();
  all.forEach(({ dept, task }) => {
    if (!task.id) return;
    if (used.has(task.id)) throw new Error(`Duplicate task id "${task.id}" in config.json`);
    used.add(task.id);
    const m = /^(.*)-(\d+)$/.exec(task.id);
    if (m && m[1] === dept.id) nextNumber.set(dept.id, Math.max(nextNumber.get(dept.id) || 0, Number(m[2])));
  });

  const assigned = new Map(); // task object -> new id
  all.forEach(({ dept, task }) => {
    if (task.id) return;
    let n = nextNumber.get(dept.id) || 0;
    let id;
    do { n++; id = `${dept.id}-${String(n).padStart(3, '0')}`; } while (used.has(id));
    nextNumber.set(dept.id, n);
    used.add(id);
    assigned.set(task, id);
  });

  const lines = configText.split('\n');
  const taskLineIdx = lines.map((l, i) => (TASK_LINE.test(l) ? i : -1)).filter(i => i >= 0);
  if (taskLineIdx.length !== all.length) {
    throw new Error(
      `config.json has ${all.length} tasks but ${taskLineIdx.length} one-line task entries; ` +
      'keep each task on its own line ({ "name": …, "owner": … }) so ids can be inserted safely.'
    );
  }
  all.forEach(({ task }, i) => {
    const id = assigned.get(task);
    if (!id) return;
    const idx = taskLineIdx[i];
    lines[idx] = lines[idx].replace('{ "name":', `{ "id": "${id}", "name":`);
  });
  const text = lines.join('\n');

  // Safety net: the new file must equal the old one plus the added ids, nothing else.
  const after = JSON.parse(text);
  listTasks(after).forEach(({ task }, i) => {
    const before = all[i].task;
    const expected = assigned.get(before) ? { id: assigned.get(before), ...before } : before;
    if (JSON.stringify(task) !== JSON.stringify(expected)) {
      throw new Error(`Refusing to write: task ${i} (${before.name}) would change in ways other than its id.`);
    }
  });
  return { text, added: assigned.size };
}

function main() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'config.json');
  const original = fs.readFileSync(file, 'utf8');
  if (process.argv.includes('--check')) {
    const missing = findTasksMissingIds(JSON.parse(original));
    if (missing.length) {
      console.error(`${missing.length} task(s) have no id. Run: npm run ids:assign\n  ${missing.slice(0, 10).join('\n  ')}`);
      process.exit(1);
    }
    console.log('All tasks have ids.');
    return;
  }
  const { text, added } = assignTaskIds(original);
  if (added) fs.writeFileSync(file, text);
  console.log(added ? `Added ${added} task id(s) to config.json.` : 'Nothing to do: every task already has an id.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
