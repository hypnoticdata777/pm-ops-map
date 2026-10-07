import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { assignTaskIds, findTasksMissingIds, TASK_ID_PATTERN } from '../../scripts/assign-task-ids.mjs';

const FIXTURE = `{
  "orgData": {
    "departments": [
      {
        "id": "leasing",
        "tasks": [
          { "name": "List units", "owner": "UNOWNED" },
          { "name": "Show units", "owner": "UNOWNED" }
        ]
      },
      {
        "id": "vendors",
        "tasks": [
          { "id": "vendors-007", "name": "Pay vendors", "owner": "UNOWNED" },
          { "name": "Review insurance", "owner": "UNOWNED" }
        ]
      }
    ]
  }
}
`;

const tasksOf = text => JSON.parse(text).orgData.departments.flatMap(d => d.tasks);

describe('config.json task ids', () => {
  const tasks = config.orgData.departments.flatMap(d => d.tasks.map(t => ({ dept: d.id, ...t })));

  test('every starter task has a well-formed permanent id', () => {
    expect(tasks.length).toBe(262);
    tasks.forEach(t => expect(t.id, `${t.dept}: ${t.name}`).toMatch(TASK_ID_PATTERN));
  });

  test('ids are unique across the whole config', () => {
    const ids = tasks.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('ids are not derived from the visible name (renaming must not require a new id)', () => {
    tasks.forEach(t => expect(t.id).toMatch(new RegExp(`^${t.dept}-\\d{3}$`)));
  });

  test('the assign script has nothing left to do', () => {
    expect(findTasksMissingIds(config)).toEqual([]);
  });
});

describe('assignTaskIds', () => {
  test('adds ids to tasks that lack one and numbers them per department', () => {
    const { text, added } = assignTaskIds(FIXTURE);
    const ids = tasksOf(text).map(t => t.id);
    expect(added).toBe(3);
    expect(ids).toEqual(['leasing-001', 'leasing-002', 'vendors-007', 'vendors-008']);
  });

  test('never changes an id that already exists', () => {
    const { text } = assignTaskIds(FIXTURE);
    expect(tasksOf(text).find(t => t.name === 'Pay vendors').id).toBe('vendors-007');
  });

  test('is idempotent: a second run changes nothing', () => {
    const first = assignTaskIds(FIXTURE);
    const second = assignTaskIds(first.text);
    expect(second.added).toBe(0);
    expect(second.text).toBe(first.text);
  });

  test('only inserts ids: names, owners, order and formatting are untouched', () => {
    const { text } = assignTaskIds(FIXTURE);
    expect(text.replace(/"id": "[a-z0-9-]+", /g, '').replace('"id": "vendors-007", ', '')).toBe(FIXTURE.replace('"id": "vendors-007", ', ''));
    expect(tasksOf(text).map(t => [t.name, t.owner])).toEqual(tasksOf(FIXTURE).map(t => [t.name, t.owner]));
  });

  test('new tasks added later get the next free number, never a reused one', () => {
    const first = assignTaskIds(FIXTURE).text;
    const grown = first.replace('{ "id": "vendors-008", "name": "Review insurance"', '{ "name": "Brand new task", "owner": "UNOWNED" },\n          { "id": "vendors-008", "name": "Review insurance"');
    const ids = tasksOf(assignTaskIds(grown).text).map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tasksOf(assignTaskIds(grown).text).find(t => t.name === 'Brand new task').id).toBe('vendors-009');
  });

  test('refuses duplicate existing ids', () => {
    const dup = FIXTURE.replace('{ "name": "Show units"', '{ "id": "vendors-007", "name": "Show units"');
    expect(() => assignTaskIds(dup)).toThrow(/Duplicate task id/);
  });

  test('refuses a layout it cannot edit safely instead of guessing', () => {
    const multiline = FIXTURE.replace('{ "name": "List units", "owner": "UNOWNED" }', '{\n"name": "List units", "owner": "UNOWNED" }');
    expect(() => assignTaskIds(multiline)).toThrow(/one-line task entries/);
  });
});
