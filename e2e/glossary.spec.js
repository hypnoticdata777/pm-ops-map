import { test, expect } from '@playwright/test';
const dialog = page => page.locator('#glossary-dialog');
async function start(page) {
  await page.addInitScript(() => localStorage.setItem('pm-ops-company-name','Glossary Test Co'));
  await page.goto('index.html');
  await page.waitForSelector('#departments .department');
}
test('phone: search aliases, filter categories, recover from no results, and close with focus restored', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await start(page);
  const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
  await page.locator('#glossary-open').click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('#glossary-search')).toBeFocused();
  await expect(page.locator('#glossary-count')).toHaveText('40 of 40 terms');
  await page.fill('#glossary-search','tenant');
  await expect(page.locator('#glossary-term-resident')).toContainText('legal occupancy status');
  await page.selectOption('#glossary-category','portfolio');
  await expect(page.locator('#glossary-count')).toHaveText('1 of 40 terms');
  await page.fill('#glossary-search','<img src=x onerror="window.__pwn=1">');
  await expect(page.locator('#glossary-results')).toContainText('No matching terms');
  await expect(dialog(page).locator('img')).toHaveCount(0);
  await page.locator('#glossary-clear').click();
  await expect(page.locator('#glossary-count')).toHaveText('40 of 40 terms');
  await page.locator('#glossary-term-backup summary').click();
  await expect(page.locator('#glossary-term-backup p')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#glossary-close').click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('#glossary-open')).toBeFocused();
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).toBe(before);
  expect(errors).toEqual([]);
});
test('native dialog contains keyboard focus; Escape and backdrop restore the opener', async ({page}) => {
  await start(page); await page.locator('#glossary-open').click();
  await page.evaluate(()=>{window.__glossaryUndoEvents=0;document.addEventListener('keydown',e=>{if(e.ctrlKey && e.key==='z')window.__glossaryUndoEvents++;});});
  await page.locator('#glossary-close').focus();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(()=>window.__glossaryUndoEvents)).toBe(0);
  await page.keyboard.press('Shift+Tab');
  expect(await dialog(page).evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('#glossary-open')).toBeFocused();
  await page.locator('#glossary-open').click();
  await page.mouse.click(2,2);
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('#glossary-open')).toBeFocused();
});
test('all contextual links open their definition and survive view rerenders', async ({page}) => {
  await start(page);
  await page.locator('[data-view="team"]').click();
  for (const id of ['department-affinity','auto-assign','workload']) {
    const opener=page.locator(`[data-glossary="${id}"]`).first();
    await opener.click();
    await expect(page.locator(`#glossary-term-${id} p`)).toBeVisible();
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  }
  await page.locator('[data-view="tracking"]').click();
  await page.locator('#launch-plan > details > summary').click();
  for (const id of ['coverage','readiness-score']) {
    await page.locator(`[data-glossary="${id}"]`).click();
    await expect(page.locator(`#glossary-term-${id} p`)).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.locator('#operation-setup [data-setup="resume"]').click();
  await page.locator('#operation-setup summary').click();
  await page.locator('#operation-setup [data-step="responsibilities"]').click();
  await page.locator('[data-glossary="responsibility-owner"]').click();
  await expect(page.locator('#glossary-term-responsibility-owner p')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#operation-setup [data-setup="hide"]').click();
  await page.locator('[data-view="team"]').click();
  await page.locator('[data-glossary="workload"]').click();
  await expect(page.locator('#glossary-term-workload p')).toBeVisible();
});
test('short landscape viewport keeps close and search reachable',async({page})=>{
  await page.setViewportSize({width:844,height:390});
  await start(page); await page.locator('#glossary-open').click();
  await expect(page.locator('#glossary-close')).toBeInViewport();
  await expect(page.locator('#glossary-search')).toBeInViewport();
  await page.fill('#glossary-search','readiness');
  await expect(page.locator('#glossary-term-readiness-score p')).toBeVisible();
  expect(await dialog(page).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('closing restores the toolbar when a contextual opener was rerendered',async({page})=>{
  await start(page); await page.locator('[data-view="team"]').click();
  await page.locator('[data-glossary="workload"]').click();
  await page.evaluate(()=>document.querySelector('[data-glossary="workload"]').remove());
  await page.locator('#glossary-close').click();
  await expect(page.locator('#glossary-open')).toBeFocused();
});
