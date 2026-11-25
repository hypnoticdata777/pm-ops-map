import { workOrders, teamData } from './state.js';
/** Read-only adapters: the tour never changes operational records. */
export const MAINTENANCE_DEMO_ID = 'demo-wo-1';
const repair = () => workOrders.find(w=>w.id===MAINTENANCE_DEMO_ID);
export function maintenanceAssigned() {
  const order=repair();
  return !!order && order.assignee!=='UNASSIGNED' && teamData.employees.some(p=>p.name===order.assignee);
}
/** @param {string} condition */
export function checkMaintenanceCondition(condition) {
  if(condition==='repair-exists')return !!repair();
  if(condition==='repair-assigned')return maintenanceAssigned();
  if(condition==='repair-scheduled')return maintenanceAssigned() && ['scheduled','in-progress','completed'].includes(repair()?.status||'');
  return false;
}
/** @param {string} condition */
export function maintenanceIssue(condition) {
  if(!repair())return 'The example repair is missing. Explore freely, try another demo, or use Reset demo to restore the examples. Reset discards all demo edits.';
  if(condition!=='repair-exists'&&!teamData.employees.length)return 'The demo roster is empty. Add a person in Assign Owners while exploring freely, or confirm Reset demo to restore the examples.';
  if(condition==='repair-scheduled'&&!maintenanceAssigned())return 'This repair needs a current roster owner. Return to assignment before continuing.';
  if(condition==='repair-assigned'&&!maintenanceAssigned())return 'Choose a current roster member and save the work order. An unsaved selection does not count.';
  if(condition==='repair-scheduled'&&!checkMaintenanceCondition(condition))return 'Move this example to Scheduled before continuing. Later stages also satisfy this step; no repair needs to be closed.';
  return '';
}
export function maintenanceSummary() {
  const order=repair();
  if(!order)return 'The example repair is no longer present.';
/** @type {Record<string,string>} */
  const labels={'submitted':'Submitted','scheduled':'Scheduled','in-progress':'In Progress','completed':'Completed'};
  return `Current example: ${order.title}. Owner: ${order.assignee==='UNASSIGNED'?'Unassigned':order.assignee}. Status: ${labels[order.status]||order.status}.`;
}
/** @param {import('./demoScenarios.js').DemoStep} step */
export function maintenanceTarget(step) {
  const card=document.getElementById(`wo-card-${MAINTENANCE_DEMO_ID}`);
  const modal=document.getElementById('wo-modal');
  if(step.id==='assign-repair') {
    if(modal?.classList.contains('visible')&&modal.dataset.workOrderId===MAINTENANCE_DEMO_ID)return document.getElementById('wo-assignee');
    return card?.querySelector('.wo-edit-btn')||null;
  }
  if(step.id==='schedule-repair')return card?.querySelector('.wo-advance-btn')||card;
  return card;
}
