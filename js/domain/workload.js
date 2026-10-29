// Who owns what, and how busy everyone is. Pure: callers pass the departments and roster in, so this
// can be used by the views, the exports, reports and assignment previews alike, and tested without a page.
/** @import { Department, Employee } from '../types.js' */

/** The marker a task carries while nobody is responsible for it. */
export const UNOWNED = 'UNOWNED';

/**
 * "Covered" currently means exactly "not UNOWNED": a task with any named owner counts as covered.
 * @param {{ owner: string }} task
 * @returns {boolean}
 */
export function isUnowned(task) {
  return task.owner === UNOWNED;
}

/**
 * Tasks owned per person. Everyone on the roster starts at 0; an owner who is not on the roster (removed
 * since, or typed by hand) is still counted, because their work is real. Iteration order is roster order,
 * then first appearance, which the team view and the assignment tie-break rely on.
 * @param {Department[]} departments
 * @param {Employee[]} employees
 * @returns {Map<string, number>}
 */
export function buildWorkloadMap(departments, employees) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  employees.forEach(employee => counts.set(employee.name, 0));
  departments.forEach(dept => {
    dept.tasks.forEach(task => {
      if (!isUnowned(task)) counts.set(task.owner, (counts.get(task.owner) || 0) + 1);
    });
  });
  return counts;
}

/**
 * How many tasks across all departments have no owner.
 * @param {Department[]} departments
 * @returns {number}
 */
export function countUnowned(departments) {
  return departments.reduce((sum, dept) => sum + dept.tasks.filter(isUnowned).length, 0);
}
