import { test, expect } from '@playwright/test';
const panel=page=>page.locator('#demo-tour');
const card=page=>page.locator('#wo-card-demo-wo-1');
const next=page=>panel(page).getByRole('button',{name:'Next',exact:true});
async function start(page){await page.goto('index.html?demo=1');await panel(page).locator('article').filter({hasText:'Tighten maintenance flow'}).getByRole('button',{name:'Try this demo'}).click();}
async function assign(page,owner='Marcus Reyes') {await card(page).getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#wo-assignee').selectOption(owner);await page.locator('#wo-submit-btn').click();}
test('phone: cancel is not completion, saved assignment and scheduling finish without closing a repair',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pm-ops-company-name','Real Company'));
 await page.setViewportSize({width:390,height:844});await start(page);await expect(panel(page)).toContainText('Step 1 of 5');
 await expect(page.locator('#workorders-view')).toHaveClass(/active/);await next(page).click();await expect(next(page)).toBeDisabled();
 await card(page).getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#wo-assignee').selectOption('Marcus Reyes');
 await expect(page.locator('#demo-wo-guidance')).toBeVisible();await expect(page.locator('#wo-assignee')).toHaveClass(/demo-tour-target/);
 await page.locator('#wo-modal').getByRole('button',{name:'Cancel',exact:true}).click();await expect(next(page)).toBeDisabled();
 await assign(page);await expect(next(page)).toBeEnabled();await next(page).click();await expect(next(page)).toBeDisabled();
 await card(page).getByRole('button',{name:/Scheduled/}).click();await expect(next(page)).toBeEnabled();
 await next(page).click();await next(page).click();await panel(page).getByRole('button',{name:'Finish',exact:true}).click();
 await expect(panel(page)).toContainText('Demo walkthrough complete');await expect(panel(page)).toContainText('Status: Scheduled');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pm-ops-demo-tour-v1')).completed)).toEqual(['maintenance']);
 expect(await page.evaluate(()=>localStorage.getItem('pm-ops-company-name'))).toBe('Real Company');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel(page).getByRole('button',{name:'Try another demo'}).click();await expect(panel(page).getByRole('button',{name:'Review Tighten maintenance flow'})).toBeVisible();
 await panel(page).getByRole('button',{name:'Review Tighten maintenance flow'}).click();
 await panel(page).getByRole('button',{name:'Finish',exact:true}).click();
 await panel(page).getByRole('link',{name:'Set up my operation'}).click();
 await expect(page.locator('#company-heading')).toHaveText('REAL COMPANY');
 await expect(panel(page)).toBeHidden();
});
test('reload and navigation pause preserve progress; reversed assignment blocks finish and recovery works',async({page})=>{
 await start(page);await next(page).click();await assign(page);await next(page).click();
 await page.reload();await panel(page).getByRole('button',{name:'Resume Tighten maintenance flow'}).click();await expect(panel(page)).toContainText('Step 3 of 5');
 await page.locator('#portfolio-tab').click();await expect(panel(page)).toContainText('Paused');await expect(page.locator('.demo-tour-target')).toHaveCount(0);
 await panel(page).getByRole('button',{name:'Return to this step'}).click();await card(page).getByRole('button',{name:/Scheduled/}).click();
 await next(page).click();await next(page).click();await assign(page,'UNASSIGNED');
 await expect(panel(page).getByRole('button',{name:'Finish',exact:true})).toBeDisabled();
 await panel(page).getByRole('button',{name:'Return to give it an owner'}).click();await expect(panel(page)).toContainText('Step 2 of 5');
 await assign(page);await next(page).click();await expect(panel(page)).toContainText('already satisfied');
 await panel(page).locator('summary').click();
 await panel(page).getByRole('button',{name:'Restart guidance (keep demo edits)'}).click();await expect(panel(page)).toContainText('Step 1 of 5');
 await panel(page).locator('summary').click();
 await expect(panel(page)).toContainText('Owner: Marcus Reyes');await expect(panel(page)).toContainText('Status: Scheduled');
});
test('missing example explains recovery; canceled reset preserves data and confirmed reset clears progress',async({page})=>{
 await start(page);await next(page).click();page.on('dialog',d=>d.accept());await card(page).getByRole('button',{name:'✕',exact:true}).click();
 await expect(panel(page)).toContainText('example repair is missing');await expect(next(page)).toBeDisabled();
 page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Reset demo',exact:true}).click();
 await expect(panel(page)).toContainText('Step 2 of 5');
 page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Reset demo',exact:true}).click();
 await expect(panel(page)).toContainText('What would you like to try?');
 expect(await page.evaluate(()=>localStorage.getItem('pm-ops-demo-tour-v1'))).toBeNull();
});
test('a full JSON import clears active guidance and returns to the chooser',async({page},info)=>{
 page.on('dialog',d=>d.accept());await start(page);await next(page).click();await assign(page);
 const pending=page.waitForEvent('download');await page.locator('.stats-actions').getByRole('button',{name:/Export JSON/}).click();
 const file=info.outputPath('demo.json');await (await pending).saveAs(file);
 await page.setInputFiles('#import-file-input',file);await page.locator('#import-confirm-btn').click();
 await expect(panel(page)).toContainText('What would you like to try?');
 expect(await page.evaluate(()=>localStorage.getItem('pm-ops-demo-tour-v1'))).toBeNull();
});
