import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const entry=()=>process.env.PM_RELEASE_ENTRY;
const errors=new WeakMap();
test.beforeEach(async({page})=>{
  const problems=[]; errors.set(page,problems);
  page.on('pageerror',error=>problems.push(error.message));
  page.on('requestfailed',request=>problems.push(`Failed asset: ${request.url()} (${request.failure()?.errorText})`));
  page.on('request',request=>{if(/^https?:/.test(request.url()))problems.push(`Unexpected network: ${request.url()}`);});
  await page.goto(entry());
  await page.waitForSelector('#departments .department');
});
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
async function start(page) {
  await page.fill('#company-input','Release Verification Co');
  await page.getByRole('button',{name:'Start setup →'}).click();
  await expect(page.locator('#onboarding-modal')).not.toHaveClass(/visible/);
}
test('the extracted ZIP has its metadata, instructions, license and production assets',async({page})=>{
  const dir=path.dirname(fileURLToPath(entry()));
  expect(dir).not.toBe(path.resolve('dist'));
  const metadata=JSON.parse(fs.readFileSync(path.join(dir,'release.json'),'utf8'));
  expect(metadata.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
  expect(fs.readFileSync(path.join(dir,'START-HERE.txt'),'utf8')).toContain('Export JSON');
  expect(fs.readFileSync(path.join(dir,'LICENSE.txt'),'utf8')).toContain('MIT');
  await expect(page.locator('#departments .task-item')).toHaveCount(262);
});
test('company setup and guide progress survive a reload from the extracted file',async({page})=>{
  await start(page);
  await expect(page.locator('#operation-setup')).toContainText('1 of 7 steps complete');
  await page.reload();
  await expect(page.locator('#company-heading')).toHaveText('RELEASE VERIFICATION CO');
  await expect(page.locator('#operation-setup')).toContainText('1 of 7 steps complete');
});
test('glossary opens and finds aliases without a server',async({page})=>{
  await start(page);await page.locator('#glossary-open').click();
  await page.fill('#glossary-search','tenant');
  await expect(page.locator('#glossary-term-resident p')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#glossary-open')).toBeFocused();
});
test('responsibility edits persist across reload',async({page})=>{
  await start(page);
  const dept=page.locator('.department[data-id="leasing"]');
  await dept.locator('.department-header').click();
  const task=dept.locator('.task-item').first();
  await task.locator('.status-pill').click();
  const changed=await task.locator('.status-pill').textContent();
  await page.reload();
  await expect(page.locator('.department[data-id="leasing"] .task-item').first().locator('.status-pill')).toHaveText(changed);
});
test('a work order can be created, advanced and restored on reload',async({page})=>{
  await start(page);await page.locator('[data-view="workorders"]').click();
  await page.getByRole('button',{name:/New Work Order/}).click();
  await page.fill('#wo-property','Release Test Property');await page.fill('#wo-title','Verify repair workflow');
  await page.locator('#wo-submit-btn').click();
  await expect(page.locator('.wo-card',{hasText:'Verify repair workflow'})).toBeVisible();
  await page.locator('.wo-card',{hasText:'Verify repair workflow'}).getByRole('button',{name:/Scheduled/}).click();
  await page.reload();await page.locator('[data-view="workorders"]').click();
  await expect(page.locator('.wo-card',{hasText:'Verify repair workflow'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pm-ops-workorders-v1'))[0].status)).toBe('scheduled');
});
test('portfolio and team records persist in the extracted application',async({page})=>{
  await start(page);await page.locator('[data-view="portfolio"]').click();
  await page.fill('#property-name','Release Registry Property');await page.fill('#property-units','2');await page.fill('#property-owner','Example Owner');
  await page.getByRole('button',{name:'Add Property',exact:true}).click();
  await page.fill('#vendor-name','Release Repair Vendor');await page.fill('#vendor-trade','General repairs');
  await page.getByRole('button',{name:'Add Vendor',exact:true}).click();
  await page.locator('[data-view="team"]').click();await page.fill('#new-emp-name','Release Operator');
  await page.getByRole('button',{name:'+ Add Employee',exact:true}).click();
  await page.reload();await page.locator('[data-view="portfolio"]').click();
  await expect(page.locator('#portfolio-view-inner')).toContainText('Release Registry Property');
  await expect(page.locator('#portfolio-view-inner')).toContainText('Release Repair Vendor');
  await page.locator('[data-view="team"]').click();await expect(page.locator('#team-view-inner')).toContainText('Release Operator');
});
test('JSON export and import recover the saved operating data after a reset',async({page},testInfo)=>{
  page.on('dialog',d=>d.accept());await start(page);
  const dept=page.locator('.department[data-id="leasing"]');await dept.locator('.department-header').click();
  await dept.locator('.task-item').first().locator('.status-pill').click();
  const changed=await dept.locator('.task-item').first().locator('.status-pill').textContent();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export JSON/}).click();
  const file=testInfo.outputPath('workspace.json');await (await downloadPromise).saveAs(file);
  await page.evaluate(()=>{localStorage.removeItem('pm-ops-data-v1');});await page.reload();
  await page.setInputFiles('#import-file-input',file);
  await page.locator('#import-confirm-btn').click();
  await expect(page.locator('.department[data-id="leasing"] .task-item').first().locator('.status-pill')).toHaveText(changed);
});
