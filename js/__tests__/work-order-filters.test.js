import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { load } from './helpers/phase1b-harness.js';
import { renderWorkOrdersView, selectWorkOrderFilter, workOrderActions } from '../views/workorders.js';
import { getWorkOrderFilter, setWorkOrderFilter } from '../workOrderFilters.js';
import { maintenanceFiltered, maintenanceIssue } from '../maintenanceDemo.js';
import { workOrders } from '../state.js';
beforeEach(()=>{load('showcase-partial');setWorkOrderFilter('all');renderWorkOrdersView();});
afterEach(()=>{setWorkOrderFilter('all');vi.restoreAllMocks();});
test('filter actions change only the view, leave workspace storage unchanged and keep totals',()=>{
 const before=JSON.stringify(Object.fromEntries(Object.entries(localStorage)));const data=JSON.stringify(workOrders);
 const button=document.querySelector('[data-filter="unassigned"]');button.focus();workOrderActions['filter-work-orders'](button);
 expect(document.querySelectorAll('.wo-card')).toHaveLength(1);expect(getWorkOrderFilter()).toBe('unassigned');
 expect(document.activeElement.dataset.filter).toBe('unassigned');expect(document.querySelector('[data-filter="all"]').textContent).toContain('6');
 expect(JSON.stringify(Object.fromEntries(Object.entries(localStorage)))).toBe(before);expect(JSON.stringify(workOrders)).toBe(data);
});
test('state changes recompute results without resetting selection',()=>{
 selectWorkOrderFilter('unassigned');workOrders.find(w=>w.id==='demo-wo-1').assignee='Marcus Reyes';renderWorkOrdersView();
 expect(getWorkOrderFilter()).toBe('unassigned');expect(document.querySelectorAll('.wo-card')).toHaveLength(0);
 expect(document.querySelector('.wo-filter-empty').textContent).toContain('Show all work orders');
 selectWorkOrderFilter('all');expect(document.querySelectorAll('.wo-card')).toHaveLength(6);
});
test('a hidden example differs from a deleted one',()=>{
 selectWorkOrderFilter('completed');expect(maintenanceFiltered()).toBe(true);expect(maintenanceIssue('repair-exists')).toContain('hidden by your work-order filter');
 workOrders.splice(workOrders.findIndex(w=>w.id==='demo-wo-1'),1);expect(maintenanceFiltered()).toBe(false);expect(maintenanceIssue('repair-exists')).toContain('missing');
});
