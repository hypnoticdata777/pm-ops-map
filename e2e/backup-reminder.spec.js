import fs from 'node:fs';
import { test, expect } from '@playwright/test';
const KEY='pm-ops-backup-reminder-v1';
async function start(page,{sensitive=false}={}) {
  await page.addInitScript(({sensitive})=>{
    if(!localStorage.getItem('pm-ops-company-name'))localStorage.setItem('pm-ops-company-name','Backup Test Co');
    if(sensitive && !localStorage.getItem('pm-ops-portfolio-v1'))localStorage.setItem('pm-ops-portfolio-v1',JSON.stringify({properties:[{id:'p1',name:'Fictional House',units:1,owner:'Example Owner'}],tenants:[{id:'t1',name:'Fictional Resident',propertyId:'p1',unit:'1',phone:'5550100',rent:100}],vendors:[]}));
  },{sensitive});
  await page.goto('index.html');await page.waitForSelector('#departments .department');
}
test('phone: seven-day dismissal survives reload, expires, and restores focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.clock.install({time:new Date('2026-11-24T12:00:00Z')});
  await start(page);
  const notice=page.locator('#backup-reminder');await expect(notice).toBeVisible();
  await expect(notice).toContainText('Clearing site data');
  await page.locator('#backup-reminder-dismiss').click();await expect(notice).toBeHidden();
  await expect(page.locator('#backups-open')).toBeFocused();
  const remaining=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).until-Date.now(),KEY);
  expect(remaining).toBeGreaterThan(7*24*60*60*1000-5000);
  expect(remaining).toBeLessThanOrEqual(7*24*60*60*1000);
  await page.reload();await expect(notice).toBeHidden();
  await page.clock.fastForward(7*24*60*60*1000+1);await expect(notice).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('cancel and export request preserve honest state; a full import reopens the reminder',async({page},testInfo)=>{
  await start(page,{sensitive:true});
  let downloaded=0;page.on('download',()=>downloaded++);
  page.on('dialog',d=>d.dismiss());
  const notice=page.locator('#backup-reminder');
  await notice.getByRole('button',{name:'Export JSON copy',exact:true}).click();
  expect(downloaded).toBe(0);await expect(page.locator('#backup-reminder-feedback')).toHaveText('');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  const pending=page.waitForEvent('download');
  await notice.getByRole('button',{name:'Export JSON copy',exact:true}).click();
  const file=testInfo.outputPath('backup.json');await (await pending).saveAs(file);
  expect(JSON.parse(fs.readFileSync(file,'utf8')).portfolio.tenants[0].name).toBe('Fictional Resident');
  await expect(notice).toBeVisible();await expect(notice).toContainText('cannot confirm that a usable backup was saved');
  await expect(page.locator('#save-toast')).toContainText('saving has not been verified');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
  await page.locator('#backup-reminder-dismiss').click();
  await page.setInputFiles('#import-file-input',file);await page.locator('#import-confirm-btn').click();
  await expect(notice).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBeNull();
});
test('Backups explains local snapshots and requests JSON without claiming a saved file',async({page})=>{
  await start(page);await page.locator('#backups-open').click();
  const modal=page.locator('#backups-modal');
  await expect(modal).toContainText('not off-device backups');
  await expect(modal).toContainText('before imports');
  const pending=page.waitForEvent('download');
  await modal.getByRole('button',{name:'Export JSON copy',exact:true}).click();await pending;
  await expect(modal.locator('#backup-modal-export-feedback')).toContainText('cannot confirm');
  await expect(page.locator('#backup-reminder')).toBeVisible();
});
test('hosted demo never shows the reminder or changes a real dismissal',async({page})=>{
  await start(page);await page.locator('#backup-reminder-dismiss').click();
  const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
  await page.goto('index.html?demo=1');await expect(page.locator('#demo-banner')).toBeVisible();
  await expect(page.locator('#backup-reminder')).toBeHidden();
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(before);
  expect(await page.evaluate(()=>localStorage.getItem('pm-ops-demo-backup-reminder-v1'))).toBeNull();
});
