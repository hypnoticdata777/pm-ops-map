import { test,expect } from '@playwright/test';
const filter=(p,name)=>p.getByRole('group',{name:'Work-order filters'}).getByRole('button',{name:new RegExp('^'+name+' work orders')});
async function demo(page){await page.goto('index.html?demo=1');await page.getByRole('button',{name:'Explore freely',exact:true}).click();await page.locator('#wo-tab').click();}
const dump=page=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
test('phone: workspace totals stay stable across single filters and reload defaults to All',async({page})=>{
 await page.setViewportSize({width:390,height:844});await demo(page);const before=await dump(page);
 await expect(page.locator('.wo-card')).toHaveCount(6);
 for(const [name,n] of [['Open',5],['Unassigned',1],['Completed',1],['All',6]]){
  await filter(page,name).click();await expect(filter(page,name)).toHaveAttribute('aria-pressed','true');await expect(filter(page,name)).toBeFocused();
  await expect(page.locator('.wo-card')).toHaveCount(n);await expect(filter(page,'All')).toHaveText('All 6');
  await expect(filter(page,'Open')).toHaveText('5 open');await expect(filter(page,'Unassigned')).toHaveText('1 unassigned');
 }
 expect(await dump(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await filter(page,'Completed').click();await page.reload();await page.getByRole('button',{name:'Explore freely',exact:true}).click();await page.locator('#wo-tab').click();
 await expect(filter(page,'All')).toHaveAttribute('aria-pressed','true');
});
test('saving an owner removes the card from Unassigned, with an explicit Show all recovery',async({page})=>{
 await demo(page);await filter(page,'Unassigned').click();await page.locator('#wo-card-demo-wo-1').getByRole('button',{name:'Edit',exact:true}).click();
 await page.locator('#wo-assignee').selectOption('Marcus Reyes');await page.locator('#wo-submit-btn').click();
 await expect(page.locator('.wo-card')).toHaveCount(0);await expect(filter(page,'Unassigned')).toHaveText('0 unassigned');
 await expect(filter(page,'Unassigned')).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Show all work orders'}).click();
 await expect(page.locator('.wo-card')).toHaveCount(6);await expect(page.locator('#wo-card-demo-wo-1')).toContainText('Marcus Reyes');
});
test('tour reveals filtered-out records explicitly and preserves an intentional filter on redraw',async({page})=>{
 await page.goto('index.html?demo=1');await page.locator('#demo-tour article').filter({hasText:'Tighten maintenance flow'}).getByRole('button',{name:'Try this demo'}).click();
 await filter(page,'Completed').click();const guide=page.locator('#demo-tour');await expect(guide).toContainText('hidden by your work-order filter');
 await expect(guide).not.toContainText('The example control is unavailable');await expect(guide.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
 await guide.getByRole('button',{name:'Show example',exact:true}).click();await expect(filter(page,'All')).toHaveAttribute('aria-pressed','true');
 await guide.getByRole('button',{name:'Next',exact:true}).click();await filter(page,'Unassigned').click();
 await page.locator('#wo-card-demo-wo-1').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#wo-assignee').selectOption('Marcus Reyes');await page.locator('#wo-submit-btn').click();
 await expect(filter(page,'Unassigned')).toHaveAttribute('aria-pressed','true');await expect(guide.getByRole('button',{name:'Show example',exact:true})).toBeVisible();
 await guide.getByRole('button',{name:'Show example',exact:true}).click();await expect(page.locator('#wo-card-demo-wo-1')).toBeVisible();
});
test('real app: keyboard filters, live completion and deletion keep an accurate empty view',async({page})=>{
 page.on('dialog',d=>d.accept());await page.goto('index.html');await page.locator('#company-input').fill('Real Filter Co');await page.getByRole('button',{name:/Start setup/}).click();await page.locator('#wo-tab').click();
 await page.getByRole('button',{name:'+ New Work Order',exact:true}).click();await page.locator('#wo-property').fill('Example property');await page.locator('#wo-title').fill('Real filter test');await page.locator('#wo-submit-btn').click();
 await filter(page,'Open').focus();await page.keyboard.press('Enter');await expect(filter(page,'Open')).toBeFocused();
 for(const stage of ['Scheduled','In Progress','Completed'])await page.locator('.wo-card').getByRole('button',{name:new RegExp(stage)}).click();
 await expect(page.locator('.wo-card')).toHaveCount(0);await expect(filter(page,'Open')).toHaveText('0 open');await expect(filter(page,'Completed')).toHaveText('1 completed');
 await filter(page,'Completed').click();await page.locator('.wo-card .wo-delete-btn').click();await expect(page.locator('.wo-filter-empty')).toContainText('No work orders match');
 await expect(filter(page,'All')).toHaveText('All 0');
});
test('exports include hidden records and import refreshes counts without persisting the filter',async({page},info)=>{
 page.on('dialog',d=>d.accept());await demo(page);await filter(page,'Completed').click();
 const download=page.waitForEvent('download');await page.locator('.stats-actions').getByRole('button',{name:/Export JSON/}).click();
 const exported=info.outputPath('full-workspace.json');await (await download).saveAs(exported);
 const fs=await import('node:fs');const payload=JSON.parse(fs.readFileSync(exported,'utf8'));expect(payload.workOrders).toHaveLength(6);
 payload.workOrders=payload.workOrders.filter(order=>order.status!=='completed');
 const incoming=info.outputPath('without-completed.json');fs.writeFileSync(incoming,JSON.stringify(payload));
 await page.setInputFiles('#import-file-input',incoming);await page.locator('#import-confirm-btn').click();
 await page.getByRole('button',{name:'Explore freely',exact:true}).click();await page.locator('#wo-tab').click();
 await expect(filter(page,'Completed')).toHaveAttribute('aria-pressed','true');await expect(filter(page,'All')).toHaveText('All 5');
 await expect(filter(page,'Completed')).toHaveText('0 completed');await expect(page.locator('.wo-card')).toHaveCount(0);
});
