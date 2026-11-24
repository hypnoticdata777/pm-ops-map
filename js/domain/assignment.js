// This is our assignment planning algorithm. It operates on provided data without changing the original objects and returns assignments with explanations.
import { buildWorkloadMap, isUnowned } from './workload.js';
/** @import { Department, Employee, Assignment, AssignmentPlan } from '../types.js' */

/**
 * Reserved for Phase 3 (scoping a preview to some departments, alternative strategies). Nothing is read yet.
 * @typedef {Record<string, never>} PlanOptions
 */

/** @param {number} n @returns {string} */
const tasks = n => `${n} task${n === 1 ? '' : 's'}`;

/** "A", "A and B", "A, B and C". @param {string[]} names @returns {string} */
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * @param {'affinity' | 'no-affinity'} basis
 * @param {string} deptName
 * @param {{ name: string, workload: number }[]} ranked  Lightest first, ties in roster order.
 * @returns {string}
 */
function explain(basis, deptName, ranked) {
  const [winner] = ranked;
  const tied = ranked.filter(candidate => candidate.workload === winner.workload).map(candidate => candidate.name);
  const lead = basis === 'affinity'
    ? ''
    : `Nobody has ${deptName} affinity${ranked.length === 1 ? ' and ' : ', so all '}`;

  if (ranked.length === 1) {
    return basis === 'affinity'
      ? `${winner.name} is the only person with ${deptName} affinity.`
      : `${lead}${winner.name} is the only person on the roster.`;
  }
  if (tied.length > 1) {
    return basis === 'affinity'
      ? `${joinNames(tied)} are tied on workload (${tasks(winner.workload)}) for ${deptName}; ${winner.name} is first on the roster.`
      : `${lead}${ranked.length} people were considered; ${joinNames(tied)} are tied on workload (${tasks(winner.workload)}); ${winner.name} is first on the roster.`;
  }
  return basis === 'affinity'
    ? `${winner.name} has the lightest workload (${tasks(winner.workload)}) of the ${ranked.length} people with ${deptName} affinity.`
    : `${lead}${ranked.length} people were considered; ${winner.name} has the lightest workload (${tasks(winner.workload)}).`;
}

/**
 * Plans an owner for every UNOWNED task, with the reason for each choice.
 * @param {{ departments: Department[], employees: Employee[] }} state
 * @param {PlanOptions} [options]
 * @returns {AssignmentPlan}
 */
export function planAssignments(state, options = {}) {
  const { departments, employees } = state;
  const workloadBefore = buildWorkloadMap(departments, employees);
  const workload = new Map(workloadBefore);
  /** @type {Assignment[]} */
  const assignments = [];
  /** @type {string[]} */
  const fallbackDepartments = [];

  departments.forEach(dept => {
    dept.tasks.forEach((task, taskIndex) => {
      if (!isUnowned(task)) return;

      const matches = employees.filter(employee => employee.affinities.includes(dept.id));
      const basis = matches.length > 0 ? 'affinity' : 'no-affinity';
      const pool = matches.length > 0 ? matches : employees;
      if (pool.length === 0) return;
      if (basis === 'no-affinity' && !fallbackDepartments.includes(dept.name)) fallbackDepartments.push(dept.name);

      // Array.prototype.sort is stable, so equal workloads keep roster order.
      const ranked = pool
        .map(employee => ({ name: employee.name, workload: workload.get(employee.name) || 0 }))
        .sort((a, b) => a.workload - b.workload);
      const winner = ranked[0];

      assignments.push({
        deptId: dept.id,
        deptName: dept.name,
        taskIndex,
        taskId: task.id,
        taskName: task.name,
        owner: winner.name,
        reason: { basis, candidates: ranked, workloadBefore: winner.workload, text: explain(basis, dept.name, ranked) },
      });
      workload.set(winner.name, winner.workload + 1);
    });
  });

  return { assignments, fallbackDepartments, workloadBefore, workloadAfter: workload };
}
