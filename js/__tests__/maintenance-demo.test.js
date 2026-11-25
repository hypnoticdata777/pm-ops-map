import { beforeEach, test, expect } from 'vitest';
import { setWorkOrders, setTeamData, workOrders } from '../state.js';
import { checkMaintenanceCondition, maintenanceIssue, maintenanceSummary } from '../maintenanceDemo.js';
beforeEach(()=>{setTeamData({employees:[{name:'Marcus Reyes',hex:'#112233',affinities:[]}]});setWorkOrders([{id:'demo-wo-1',title:'Example repair',status:'submitted',assignee:'UNASSIGNED'}]);});
test('only an existing record and current roster owner satisfy assignment',()=>{
 expect(checkMaintenanceCondition('repair-exists')).toBe(true);expect(checkMaintenanceCondition('repair-assigned')).toBe(false);
 workOrders[0].assignee='Removed person';expect(checkMaintenanceCondition('repair-assigned')).toBe(false);
 workOrders[0].assignee='Marcus Reyes';expect(checkMaintenanceCondition('repair-assigned')).toBe(true);
 expect(checkMaintenanceCondition('repair-scheduled')).toBe(false);
});
test('later stages count without requiring closure; reversal invalidates dependent steps',()=>{
 workOrders[0].assignee='Marcus Reyes';for(const status of ['scheduled','in-progress','completed']){workOrders[0].status=status;expect(checkMaintenanceCondition('repair-scheduled')).toBe(true);}
 workOrders[0].assignee='UNASSIGNED';expect(checkMaintenanceCondition('repair-scheduled')).toBe(false);
 expect(maintenanceIssue('repair-scheduled')).toContain('Return to assignment');
});
test('missing records and empty rosters explain recovery without reseeding',()=>{
 setTeamData({employees:[]});expect(maintenanceIssue('repair-assigned')).toContain('roster is empty');
 setWorkOrders([]);expect(checkMaintenanceCondition('repair-exists')).toBe(false);expect(maintenanceIssue('repair-exists')).toContain('Reset discards');
 expect(maintenanceSummary()).toContain('no longer present');expect(workOrders).toEqual([]);
});
test('completion history validates only available scenario IDs',async()=>{
 const {sanitizeTourPreferences}=await import('../demoTourPreferences.js');
 expect(sanitizeTourPreferences({version:1,completed:['maintenance','unknown','ownership','maintenance']} ).completed).toEqual(['maintenance']);
});
