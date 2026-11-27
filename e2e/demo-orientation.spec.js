import { test, expect } from '@playwright/test';
import { openDemoDetails, clickDemoButton } from './helpers/demo.js';
const demo='index.html?demo=1';
test('phone starts with a prominent app header and compact collapsed DEMO strip',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(demo);
 await expect(page.locator('#demo-tour')).toBeVisible();await expect(page.locator('#app-header h1')).toHaveText('PM Ops Map');
 await expect(page.locator('#app-header')).toBeVisible();await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
 const box=await page.locator('#demo-banner').boundingBox();expect(box.height).toBeLessThanOrEqual(60);
 await expect(page.locator('#demo-banner .demo-banner-content')).toBeHidden();
 const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
 await openDemoDetails(page);
 await expect(page.locator('.demo-banner-content')).toContainText('Fictional data only');
 await expect(page.getByRole('button',{name:'Reset demo',exact:true})).toBeVisible();
 await page.locator('#demo-details summary').click();
 expect(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))))).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('keyboard disclosure retains actions and collapses before choosing a new demo',async({page})=>{
 await page.goto(demo);const summary=page.locator('#demo-details summary');await summary.focus();await summary.press('Enter');
 await expect(page.locator('#demo-details')).toHaveAttribute('open');await page.keyboard.press('Tab');await expect(page.locator('#demo-choices')).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
 await expect(page.locator('#demo-tour h2')).toBeFocused();
 await summary.focus();await summary.press('Space');await expect(page.locator('#demo-details')).toHaveAttribute('open');
 await summary.press('Space');await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
});
test('tour headings and targets clear both banner sizes and viewport changes',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(demo);await openDemoDetails(page);
 await page.locator('#demo-tour article').filter({hasText:'Tighten maintenance flow'}).getByRole('button',{name:'Try this demo'}).click();
 await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
 const heading=page.locator('#demo-tour h2');await expect(heading).toBeFocused();
 expect((await heading.boundingBox()).y).toBeGreaterThan((await page.locator('#demo-banner').boundingBox()).height);
 await page.locator('#demo-tour').getByRole('button',{name:'Next',exact:true}).click();await openDemoDetails(page);
 await page.locator('#demo-tour').getByRole('button',{name:'Show highlighted control'}).click();
 const target=page.locator('.demo-tour-target');const banner=await page.locator('#demo-banner').boundingBox();
 expect((await target.boundingBox()).y).toBeGreaterThanOrEqual(banner.y+banner.height);
 await page.setViewportSize({width:844,height:390});
 await clickDemoButton(page,'Demo choices');await expect(heading).toBeFocused();
 expect((await heading.boundingBox()).y).toBeGreaterThanOrEqual((await page.locator('#demo-banner').boundingBox()).height);
});
test('expanded details stay usable in a short landscape viewport; reload starts collapsed',async({page})=>{
 await page.setViewportSize({width:844,height:320});await page.goto(demo);await openDemoDetails(page);
 expect((await page.locator('#demo-banner').boundingBox()).height).toBeLessThanOrEqual(320);
 await expect(page.locator('#demo-banner').getByRole('link',{name:/Use your own workspace/})).toBeVisible();
 await page.reload();await expect(page.locator('#demo-tour')).toBeVisible();await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
});
