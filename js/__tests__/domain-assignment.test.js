import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { planAssignments } from '../domain/assignment.js';
import { buildWorkloadMap, countUnowned } from '../domain/workload.js';

const dept = (id, owners, name = id.toUpperCase()) => ({
  id, name, color: '#000000',
  tasks: owners.map((owner, i) => ({ id: `${id}-${String(i).padStart(3, '0')}`, name: `${name} task ${i}`, owner })),
});
const person = (name, affinities = []) => ({ name, hex: '#336699', affinities });
const plan = (departments, employees, options) => planAssignments({ departments, employees }, options);
const owners = p => p.assignments.map(a => `${a.deptId}#${a.taskIndex}=${a.owner}`);

describe('which tasks and who', () => {
  test('only UNOWNED tasks get an assignment; owned tasks are left alone', () => {
    const p = plan([dept('a', ['Ann', 'UNOWNED', 'UNOWNED', 'Bob'])], [person('Ann', ['a']), person('Bob', ['a'])]);
    expect(p.assignments.map(a => a.taskIndex)).toEqual([1, 2]);
  });

  test('a person with the department affinity wins over one without', () => {
    const p = plan([dept('a', ['UNOWNED']), dept('b', ['UNOWNED'])], [person('Ann', ['a']), person('Bob', ['b'])]);
    expect(owners(p)).toEqual(['a#0=Ann', 'b#0=Bob']);
  });

  test('the lightest workload wins, counting tasks they already own', () => {
    const p = plan([dept('a', ['UNOWNED']), dept('z', ['Ann', 'Ann', 'Bob'])], [person('Ann', ['a']), person('Bob', ['a'])]);
    expect(owners(p)).toEqual(['a#0=Bob']); // Ann has 2, Bob has 1
  });

  test('workload grows as tasks are handed out, so equal people alternate in roster order', () => {
    const p = plan([dept('a', ['UNOWNED', 'UNOWNED', 'UNOWNED', 'UNOWNED', 'UNOWNED'])], ['Zed', 'Amy', 'Mia'].map(n => person(n, ['a'])));
    expect(p.assignments.map(a => a.owner)).toEqual(['Zed', 'Amy', 'Mia', 'Zed', 'Amy']);
  });

  test('departments and tasks are visited in their listed order', () => {
    const p = plan([dept('b', ['UNOWNED']), dept('a', ['UNOWNED', 'UNOWNED'])], [person('Ann', ['a', 'b'])]);
    expect(owners(p)).toEqual(['b#0=Ann', 'a#0=Ann', 'a#1=Ann']);
  });

  test('an owner who is not on the roster still counts toward workload but is never chosen', () => {
    const p = plan([dept('a', ['UNOWNED']), dept('z', ['Ghost', 'Ghost', 'Ghost'])], [person('Ann', ['a'])]);
    expect(owners(p)).toEqual(['a#0=Ann']);
    expect(p.workloadAfter.get('Ghost')).toBe(3);
  });

  test('assigns exactly as many tasks as are unowned when there is a roster', () => {
    const departments = config.orgData.departments.map(d => ({ ...d, tasks: d.tasks.map(t => ({ ...t, owner: 'UNOWNED' })) }));
    const p = plan(departments, [person('Ann', ['leasing']), person('Bob')]);
    expect(p.assignments).toHaveLength(countUnowned(departments));
    expect(p.assignments).toHaveLength(262);
  });
});

describe('when nobody has the affinity', () => {
  test('everyone on the roster is considered, and the department is reported once, by name', () => {
    const p = plan([dept('a', ['UNOWNED', 'UNOWNED'], 'Alpha'), dept('b', ['UNOWNED'], 'Beta')], [person('Ann'), person('Bob')]);
    expect(p.assignments.map(a => a.owner)).toEqual(['Ann', 'Bob', 'Ann']);
    expect(p.fallbackDepartments).toEqual(['Alpha', 'Beta']);
    expect(p.assignments.every(a => a.reason.basis === 'no-affinity')).toBe(true);
  });

  test('a department with an affinity match is not reported as a fallback', () => {
    const p = plan([dept('a', ['UNOWNED']), dept('b', ['UNOWNED'], 'Beta')], [person('Ann', ['a'])]);
    expect(p.fallbackDepartments).toEqual(['Beta']);
  });

  test('a department with nothing to assign is not reported', () => {
    expect(plan([dept('a', ['Ann'])], [person('Ann')]).fallbackDepartments).toEqual([]);
  });
});

describe('degenerate input', () => {
  test('an empty roster plans nothing and reports no fallback', () => {
    const p = plan([dept('a', ['UNOWNED'])], []);
    expect(p).toMatchObject({ assignments: [], fallbackDepartments: [] });
  });
  test('nothing unowned, or no departments, plans nothing', () => {
    expect(plan([dept('a', ['Ann'])], [person('Ann', ['a'])]).assignments).toEqual([]);
    expect(plan([], [person('Ann')]).assignments).toEqual([]);
  });
});

describe('the reason for each assignment', () => {
  test('an affinity match names who was considered, with their workload at that moment, lightest first', () => {
    const p = plan([dept('a', ['UNOWNED']), dept('z', ['Bob', 'Bob', 'Cy'])], [person('Ann', ['a']), person('Bob', ['a']), person('Cy', ['a'])], {});
    const { reason } = p.assignments[0];
    expect(reason.basis).toBe('affinity');
    expect(reason.candidates).toEqual([{ name: 'Ann', workload: 0 }, { name: 'Cy', workload: 1 }, { name: 'Bob', workload: 2 }]);
    expect(reason.workloadBefore).toBe(0);
  });

  test('the candidate list reflects the workload when THAT task was assigned, not at the start', () => {
    const p = plan([dept('a', ['UNOWNED', 'UNOWNED'])], [person('Ann', ['a']), person('Bob', ['a'])]);
    expect(p.assignments[0].reason.candidates).toEqual([{ name: 'Ann', workload: 0 }, { name: 'Bob', workload: 0 }]);
    expect(p.assignments[1].reason.candidates).toEqual([{ name: 'Bob', workload: 0 }, { name: 'Ann', workload: 1 }]);
  });

  test('plain-language sentences', () => {
    const p = plan([dept('a', ['UNOWNED', 'UNOWNED'], 'Alpha'), dept('b', ['UNOWNED'], 'Beta'), dept('z', ['Bob', 'Bob', 'Bob'])],
      [person('Ann', ['a']), person('Bob', ['a'])]);
    const [first, second, third] = p.assignments;
    expect(first.reason.text).toBe('Ann has the lightest workload (0 tasks) of the 2 people with Alpha affinity.');
    expect(second.reason.text).toBe('Ann has the lightest workload (1 task) of the 2 people with Alpha affinity.');
    expect(third.reason.text).toBe('Nobody has Beta affinity, so all 2 people were considered; Ann has the lightest workload (2 tasks).');
  });

  test('a tie says so and why the winner won', () => {
    const [a] = plan([dept('a', ['UNOWNED'], 'Alpha')], [person('Zed', ['a']), person('Amy', ['a'])]).assignments;
    expect(a.reason.text).toBe('Zed and Amy are tied on workload (0 tasks) for Alpha; Zed is first on the roster.');
  });

  test('a single candidate is described without a comparison', () => {
    const [a] = plan([dept('a', ['UNOWNED'], 'Alpha')], [person('Ann', ['a'])]).assignments;
    expect(a.reason.text).toBe('Ann is the only person with Alpha affinity.');
    const [b] = plan([dept('b', ['UNOWNED'], 'Beta')], [person('Ann')]).assignments;
    expect(b.reason.text).toBe('Nobody has Beta affinity and Ann is the only person on the roster.');
  });

  test('every assignment identifies its task so it can be applied or previewed later', () => {
    const [a] = plan([dept('leasing', ['Ann', 'UNOWNED'], 'Leasing')], [person('Ann', ['leasing'])]).assignments;
    expect(a).toMatchObject({ deptId: 'leasing', deptName: 'Leasing', taskIndex: 1, taskId: 'leasing-001', taskName: 'Leasing task 1', owner: 'Ann' });
  });
});

describe('purity', () => {
  test('never modifies the departments, roster or options it is given', () => {
    const departments = [dept('a', ['UNOWNED', 'Ann', 'UNOWNED'])];
    const employees = [person('Ann', ['a']), person('Bob', ['a'])];
    const options = {};
    const before = JSON.stringify({ departments, employees, options });
    plan(departments, employees, options);
    expect(JSON.stringify({ departments, employees, options })).toBe(before);
  });

  test('the same input gives the same plan every time', () => {
    const departments = [dept('a', ['UNOWNED', 'UNOWNED', 'UNOWNED'])];
    const employees = [person('Ann', ['a']), person('Bob', ['a'])];
    expect(plan(departments, employees)).toEqual(plan(departments, employees));
  });

  test('reports the workload before and after, matching buildWorkloadMap', () => {
    const departments = [dept('a', ['UNOWNED', 'Ann', 'UNOWNED']), dept('b', ['Ghost'])];
    const employees = [person('Ann', ['a']), person('Bob', ['a'])];
    const p = plan(departments, employees);
    expect(Object.fromEntries(p.workloadBefore)).toEqual(Object.fromEntries(buildWorkloadMap(departments, employees)));
    expect(Object.fromEntries(p.workloadAfter)).toEqual({ Ann: 2, Bob: 1, Ghost: 1 });
  });
});
