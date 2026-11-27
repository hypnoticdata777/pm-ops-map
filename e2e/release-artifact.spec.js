import { openDemoDetails, clickDemoButton } from './helpers/demo.js';
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
  await page.locator('.stats-actions').getByRole('button',{name:/Export JSON/}).click();
  const file=testInfo.outputPath('workspace.json');await (await downloadPromise).saveAs(file);
  await page.evaluate(()=>{localStorage.removeItem('pm-ops-data-v1');});await page.reload();
  await page.setInputFiles('#import-file-input',file);
  await page.locator('#import-confirm-btn').click();
  await expect(page.locator('.department[data-id="leasing"] .task-item').first().locator('.status-pill')).toHaveText(changed);
});

test('the extracted demo opens its chooser and supports exploration without changing real data',async({page})=>{
  await start(page);
  const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  await page.goto(`${entry()}?demo=1`);
  await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
  expect((await page.locator('#demo-banner').boundingBox()).height).toBeLessThanOrEqual(60);
  await expect(page.getByRole('heading',{name:'What would you like to try?'})).toBeVisible();
  await expect(page.locator('#demo-tour').getByText('Coming next',{exact:true})).toHaveCount(4);
  await page.getByRole('button',{name:'Explore freely',exact:true}).click();
  await page.locator('#wo-tab').click();await expect(page.locator('#workorders-view')).toHaveClass(/active/);
  await clickDemoButton(page, 'Demo choices');
  await page.locator('#demo-tour article').filter({hasText:'Tighten maintenance flow'}).getByRole('button',{name:'Try this demo'}).click();
  const guidance=page.locator('#demo-tour');const repair=page.locator('#wo-card-demo-wo-1');
  await guidance.getByRole('button',{name:'Next',exact:true}).click();
  await repair.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#wo-assignee').selectOption('Marcus Reyes');await page.locator('#wo-submit-btn').click();
  await guidance.getByRole('button',{name:'Next',exact:true}).click();
  await repair.getByRole('button',{name:/Scheduled/}).click();
  await guidance.getByRole('button',{name:'Next',exact:true}).click();
  await guidance.getByRole('button',{name:'Next',exact:true}).click();
  await guidance.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(guidance).toContainText('Demo walkthrough complete');
  await expect(guidance).toContainText('Status: Scheduled');
  const after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>!key.startsWith('pm-ops-demo-'))));
  expect(after).toEqual(before);
  await guidance.getByRole('link',{name:'Set up my operation'}).click();
  await expect(page.locator('#company-heading')).toHaveText('RELEASE VERIFICATION CO');
});
