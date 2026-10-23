// Does the app start, render, and stay quiet? Runs against the source tree AND
// against the production build served under a Pages-style sub-path, so it uses
// relative URLs only.
import { test, expect } from '@playwright/test';

// Collects anything a visitor's browser would complain about.
function watch(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', r => problems.push(`request failed: ${r.url()}`));
  return problems;
}

test('first visit: onboarding, then a full 17-department / 262-task map with no errors', async ({ page }) => {
  const problems = watch(page);
  await page.goto('index.html');
  await expect(page.locator('#onboarding-modal')).toHaveClass(/visible/);
  await page.fill('#company-input', 'Smoke Test Co');
  await page.getByRole('button', { name: /Start Mapping/ }).click();
  await expect(page.locator('#onboarding-modal')).not.toHaveClass(/visible/);
  await expect(page.locator('#company-heading')).toHaveText('SMOKE TEST CO');
  await expect(page.locator('#departments .department')).toHaveCount(17);
  await expect(page.locator('#departments .task-item')).toHaveCount(262);
  await expect(page.locator('#stat-total')).toHaveText('262');
  expect(problems).toEqual([]);
});

test('every tab opens without errors', async ({ page }) => {
  const problems = watch(page);
  await page.addInitScript(() => localStorage.setItem('pm-ops-company-name', 'Smoke Test Co'));
  await page.goto('index.html');
  await page.waitForSelector('#departments .department');
  // Tab label -> the view it opens. Labels follow the product's Map -> Assign -> Review -> Share
  // vocabulary (index.html); when a tab is renamed, update this table.
  const views = [
    ['Share Map', '#map-view'], ['Assign Owners', '#team-view'], ['Context: Work Orders', '#workorders-view'],
    ['Context: Portfolio', '#portfolio-view'], ['Map & Review', '#tracking-view'],
  ];
  for (const [label, selector] of views) {
    const tab = page.locator('.nav-tab', { hasText: label });
    await expect(tab, `no nav tab labelled "${label}" (was a tab renamed in index.html?)`).toHaveCount(1);
    await tab.click();
    await expect(page.locator(selector)).toHaveClass(/active/);
  }
  expect(problems).toEqual([]);
});

test('the company name survives a reload and onboarding does not return', async ({ page }) => {
  await page.goto('index.html');
  await page.fill('#company-input', 'Persistent Co');
  await page.getByRole('button', { name: /Start Mapping/ }).click();
  await page.reload();
  await expect(page.locator('#company-heading')).toHaveText('PERSISTENT CO');
  await expect(page.locator('#onboarding-modal')).not.toHaveClass(/visible/);
});

test('"?demo=0" and other values do not switch on demo mode', async ({ page }) => {
  await page.goto('index.html?demo=0');
  await expect(page.locator('#onboarding-modal')).toHaveClass(/visible/);
  await expect(page.locator('#demo-banner')).toBeHidden();
});
