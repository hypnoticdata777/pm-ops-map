/** Shared, pure setup rules. Operational facts never come from manual checkboxes. */
export const STARTER_TASK_IDS = Object.freeze([
  'tenant-comms-001', 'delinquency-001', 'delinquency-009',
  'maintenance-001', 'maintenance-002', 'maintenance-004', 'maintenance-006',
  'maintenance-007', 'maintenance-008', 'vendors-008',
  'owner-relations-001', 'owner-relations-003',
]);
export const SETUP_STEPS = Object.freeze([
  { id: 'company', title: 'Your operation' }, { id: 'property', title: 'First property' },
  { id: 'contacts', title: 'Relevant contacts' }, { id: 'people', title: 'Your people' },
  { id: 'responsibilities', title: 'Essential responsibilities' },
  { id: 'maintenance', title: 'Maintenance workflow' }, { id: 'review', title: 'Review and share' },
]);
/** @param {{name: string, affinities?: string[]}[]} employees */
export function rosterSignature(employees) {
  return JSON.stringify(employees.map(e => e.name).sort());
}
/**
 * @param {{company: string, profile: object, properties: {id:string, name?:string}[], tenants: {propertyId:string}[], vendors: object[], employees: {name:string}[], tasks: {id?:string, name:string, owner:string}[]}} facts
 * @param {{propertyId?:string, vacantPropertyId?:string, roster?:string, maintenanceReviewed?:boolean, reviewSaved?:boolean, deferred?:string[]}} prefs
 */
export function deriveSetup(facts, prefs = {}) {
  const property = facts.properties.find(p => p.id === prefs.propertyId) || facts.properties[0];
  const resident = !!property && facts.tenants.some(t => t.propertyId === property.id);
  const vacant = !!property && !resident && prefs.vacantPropertyId === property.id;
  const names = new Set(facts.employees.map(e => e.name));
  const starter = STARTER_TASK_IDS.map(id => {
    const task = facts.tasks.find(t => t.id === id);
    return { id, task, covered: !!task && task.owner !== 'UNOWNED' && names.has(task.owner) };
  });
  /** @type {Record<string, boolean>} */
  const complete = {
    company: !!facts.company.trim() && Object.keys(facts.profile).length > 0,
    property: !!property,
    contacts: !!property && (resident || vacant) && facts.vendors.length > 0,
    people: names.size > 0 && prefs.roster === rosterSignature(facts.employees),
    responsibilities: starter.every(t => t.covered) && prefs.roster === rosterSignature(facts.employees),
    maintenance: prefs.maintenanceReviewed === true,
    review: prefs.reviewSaved === true,
  };
  const steps = SETUP_STEPS.map(step => ({ ...step,
    status: complete[step.id] ? 'complete' : prefs.deferred?.includes(step.id) ? 'deferred' : 'incomplete',
  }));
  return { property, vacant, resident, starter, steps,
    completeCount: steps.filter(s => s.status === 'complete').length,
    deferredCount: steps.filter(s => s.status === 'deferred').length,
    next: steps.find(s => s.status === 'incomplete') || steps.find(s => s.status === 'deferred') || steps[6],
  };
}
