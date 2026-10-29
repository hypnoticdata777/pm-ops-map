// How well the critical responsibility lanes are covered. Pure: the departments come in as an argument.
// "Covered" currently means exactly "not UNOWNED" (see workload.js); backup owners and review dates
// will refine it later, here, in one place.
import { isUnowned } from './workload.js';
/** @import { Department, CoverageAreaDefinition, CoverageArea } from '../types.js' */

/** An area under this percentage counts as weak (risk queue, setup gaps, readiness check). */
export const WEAK_COVERAGE_PCT = 70;

/** @type {CoverageAreaDefinition[]} */
export const CRITICAL_COVERAGE_AREAS = [
  {
    id: 'leasing',
    label: 'Leasing',
    detail: 'Listings, showings, applications, and move-in handoff.',
    departments: ['leasing', 'applications', 'move-ins'],
  },
  {
    id: 'rent',
    label: 'Rent Collection',
    detail: 'Delinquencies, ledgers, notices, and payment follow-up.',
    departments: ['delinquency', 'accounting'],
  },
  {
    id: 'inspections',
    label: 'Inspections',
    detail: 'Move-ins, move-outs, turns, field visits, and condition reports.',
    departments: ['move-ins', 'move-outs', 'unit-turns', 'field-services'],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    detail: 'Intake, triage, vendors, emergency dispatch, and closeout.',
    departments: ['maintenance', 'vendors'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    detail: 'Fair housing, notices, insurance, records, and risk controls.',
    departments: ['compliance', 'reporting'],
  },
  {
    id: 'renewals',
    label: 'Renewals',
    detail: 'Rent increases, lease questions, move-outs, and owner alignment.',
    departments: ['tenant-comms', 'owner-relations', 'leasing'],
  },
  {
    id: 'emergencies',
    label: 'Emergencies',
    detail: 'After-hours repair response, access, vendors, and tenant updates.',
    departments: ['maintenance', 'vendors', 'field-services', 'tenant-comms'],
  },
];

/**
 * Numbers for each lane: how many tasks it spans, how many are unowned, who carries most of it.
 * Departments an area names but the workspace lacks are skipped. `primaryOwners` is the three busiest
 * named owners (ties in order of first appearance), or "No named owner".
 * @param {Department[]} departments
 * @param {CoverageAreaDefinition[]} [areas]
 * @returns {CoverageArea[]}
 */
export function summarizeCoverage(departments, areas = CRITICAL_COVERAGE_AREAS) {
  return areas.map(area => {
    const depts = /** @type {Department[]} */ (
      area.departments.map(id => departments.find(dept => dept.id === id)).filter(Boolean)
    );
    const tasks = depts.flatMap(dept => dept.tasks);
    const unownedCount = tasks.filter(isUnowned).length;

    /** @type {Map<string, number>} */
    const ownerCounts = new Map();
    tasks.forEach(task => {
      if (!isUnowned(task)) ownerCounts.set(task.owner, (ownerCounts.get(task.owner) || 0) + 1);
    });
    const primaryOwners = [...ownerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join(', ') || 'No named owner';

    return {
      ...area,
      departmentNames: depts.map(dept => dept.name),
      taskCount: tasks.length,
      unownedCount,
      primaryOwners,
      coveragePct: tasks.length ? Math.round(((tasks.length - unownedCount) / tasks.length) * 100) : 0,
    };
  });
}
