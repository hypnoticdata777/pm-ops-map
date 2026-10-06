// The hosted demo (?demo=1): opens straight into a populated, fictional workspace,
// says so permanently, can be reset in one click, and never touches a real workspace.
import { test, expect } from '@playwright/test';

const DEMO = 'index.html?demo=1';
const dump = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const demoKeys = obj => Object.keys(obj).filter(k => k.startsWith('pm-ops-demo-'));
const realKeys = obj => Object.keys(obj).filter(k => k.startsWith('pm-ops-') && !k.startsWith('pm-ops-demo-'));

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
});

test.describe('opening the demo', () => {
  test('goes straight to a populated workspace — no onboarding, no empty first frame', async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.locator('#onboarding-modal')).not.toHaveClass(/visible/);
    await expect(page.locator('#company-heading')).toHaveText('DEMO DOOR PROPERTY MANAGEMENT');
    await expect(page.locator('#stat-total')).toHaveText('262');
    await expect(page.locator('#stat-unowned')).toHaveText('32');
    await expect(page).toHaveTitle(/Demo/);
  });

  test('says it is fictional, permanently, with exactly two actions and no dismiss', async ({ page }) => {
    await page.goto(DEMO);
    const banner = page.locator('#demo-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Fictional data only');
    await expect(banner).toContainText('nothing leaves your browser');
    await expect(banner.getByRole('button')).toHaveText(['Reset demo']);
    await expect(banner.getByRole('link')).toHaveText([/Use your own workspace/]);
    // Still there after navigating around the app.
    await page.locator('#portfolio-tab').click();
    await expect(banner).toBeVisible();
    await page.locator('#wo-tab').click();
    await expect(banner).toBeVisible();
  });

  test('the banner stays pinned while scrolling', async ({ page }) => {
    await page.goto(DEMO);
    await call(page, 'toggleExpandAllDepartments');
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(150);
    const box = await page.locator('#demo-banner').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeLessThan(5);
  });

  test('Team Sync is not offered', async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.locator('#sync-status-pill')).toBeHidden();
  });
});

test.describe('the demo shows what the tool is for', () => {
  test('gaps: three departments nobody covers', async ({ page }) => {
    await page.goto(DEMO);
    const coverage = page.locator('.launch-coverage-card', { hasText: 'Compliance' });
    await expect(coverage).toContainText('0%');
    await expect(page.locator('.launch-coverage-card', { hasText: 'Maintenance' })).toContainText('100%');
  });

  test('overload: one teammate carries clearly more, and it is flagged', async ({ page }) => {
    await page.goto(DEMO);
    await page.locator('#team-tab').click();
    await expect(page.locator('.employee-card')).toHaveCount(3);
    await expect(page.locator('.workload-bar-row.overloaded')).toHaveCount(1);
    await expect(page.locator('.workload-bar-row.overloaded .wl-name')).toHaveText('Dana Whitfield');
  });

  test('work orders fill every column, with an unassigned one needing attention', async ({ page }) => {
    await page.goto(DEMO);
    await page.locator('#wo-tab').click();
    const counts = await page.locator('.wo-column .wo-col-count').allInnerTexts();
    expect(counts).toEqual(['2', '2', '1', '1']);
    await expect(page.locator('.wo-stat-warn')).toContainText('1 unassigned');
    await expect(page.locator('.wo-card--overdue')).toHaveCount(1);
  });

  test('portfolio: tenants in different lease and rent situations', async ({ page }) => {
    await page.goto(DEMO);
    await page.locator('#portfolio-tab').click();
    await expect(page.locator('.portfolio-card', { hasText: 'Maya Chen' })).toBeVisible();
    await expect(page.locator('.lease-chip--danger').first()).toBeVisible();
    await expect(page.locator('.lease-chip--warn').first()).toBeVisible();
    await expect(page.locator('.lease-chip', { hasText: 'Lease expired' })).toHaveCount(1);
  });

  test('tracking: blocked work, overdue work, and a dependency chain', async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.locator('#stat-blocked')).not.toHaveText('0');
    await expect(page.locator('#stat-overdue')).not.toHaveText('0');
    await expect(page.locator('.dep-chip--blocking').first()).toBeAttached();
  });

  test('the map renders the fictional org', async ({ page }) => {
    await page.goto(DEMO);
    await page.locator('.nav-tab').nth(1).click();
    await expect(page.locator('#map-view svg')).toBeVisible();
  });
});

async function call(page, fn, ...args) {
  await page.evaluate(([name, a]) => window[name](...a), [fn, args]);
}

test.describe('editing and resetting', () => {
  const firstRowStatus = page => page.locator('.department[data-id="leasing"] .task-item').first().getAttribute('data-status');

  test('edits survive a reload', async ({ page }) => {
    await page.goto(DEMO);
    const before = await firstRowStatus(page);
    await call(page, 'cycleTaskStatus', 'leasing', 0);
    const after = await firstRowStatus(page);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await firstRowStatus(page)).toBe(after);
  });

  test('"Reset demo" restores the pristine workspace in one click', async ({ page }) => {
    await page.goto(DEMO);
    const pristine = await firstRowStatus(page);
    await call(page, 'cycleTaskStatus', 'leasing', 0);
    await call(page, 'cycleTaskPriority', 'leasing', 0);
    expect(await firstRowStatus(page)).not.toBe(pristine);
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reset demo' }).click()]);
    await page.waitForSelector('#departments .department');
    expect(await firstRowStatus(page)).toBe(pristine);
    await expect(page.locator('#company-heading')).toHaveText('DEMO DOOR PROPERTY MANAGEMENT');
  });

  test('cancelling the reset confirmation keeps the edits', async ({ page }) => {
    page.removeAllListeners('dialog');
    page.on('dialog', d => d.dismiss());
    await page.goto(DEMO);
    await call(page, 'cycleTaskStatus', 'leasing', 0);
    const edited = await firstRowStatus(page);
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.waitForTimeout(300);
    expect(await firstRowStatus(page)).toBe(edited);
  });
});

test.describe('isolation from a real workspace on the same origin', () => {
  test('visiting, editing and resetting the demo never touches real data', async ({ page }) => {
    // A real workspace first.
    await page.goto('index.html');
    await page.fill('#company-input', 'Real Company LLC');
    await page.getByRole('button', { name: /Start Mapping/ }).click();
    await call(page, 'cycleTaskStatus', 'leasing', 0);
    const realBefore = await dump(page);
    expect(realBefore['pm-ops-company-name']).toBe('Real Company LLC');
    expect(demoKeys(realBefore)).toEqual([]);

    // The demo, same origin, same browser profile.
    await page.goto(DEMO);
    await expect(page.locator('#company-heading')).toHaveText('DEMO DOOR PROPERTY MANAGEMENT');
    await call(page, 'cycleTaskStatus', 'leasing', 1);
    let both = await dump(page);
    expect(demoKeys(both).length).toBeGreaterThanOrEqual(5);
    realKeys(realBefore).forEach(key => expect(both[key], key).toBe(realBefore[key]));

    // Reset only removes demo keys.
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Reset demo' }).click()]);
    await page.waitForSelector('#departments .department');
    both = await dump(page);
    realKeys(realBefore).forEach(key => expect(both[key], key).toBe(realBefore[key]));

    // And the real workspace is exactly as it was left.
    await page.goto('index.html');
    await expect(page.locator('#company-heading')).toHaveText('REAL COMPANY LLC');
    await expect(page.locator('#demo-banner')).toBeHidden();
  });

  test('"Use your own workspace" leaves demo mode', async ({ page }) => {
    await page.goto(DEMO);
    await page.getByRole('link', { name: /Use your own workspace/ }).click();
    await expect(page).not.toHaveURL(/demo=/);
    await expect(page.locator('#demo-banner')).toBeHidden();
    await expect(page.locator('#onboarding-modal')).toHaveClass(/visible/); // a brand-new, empty workspace
  });
});
