// Permanent task ids in a real browser: rewording a starter task in config.json
// must not orphan anyone's saved progress. The app fetches config.json at boot, so
// the "new release" is simulated by intercepting that request.
import { test, expect } from '@playwright/test';
import { prepare, call, config } from './helpers/security.js';

const REWORDED = 'Create listings and syndicate them to every platform';
const first = config.orgData.departments[0].tasks[0];

const firstLeasingRow = page => page.locator('.department[data-id="leasing"] .task-item').first();

async function serveConfig(page, mutate) {
  const modified = structuredClone(config);
  mutate(modified.orgData.departments[0].tasks[0]);
  await page.route('**/config.json', route => route.fulfill({ json: modified }));
}

test.beforeEach(async ({ page }) => {
  await prepare(page);
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
});

test('config ships ids and the app persists them with saved progress', async ({ page }) => {
  expect(first.id).toBe('leasing-001');
  await call(page, 'setTaskOwner', 'leasing', 0, 'Maria');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pm-ops-data-v1')));
  expect(saved.find(d => d.id === 'leasing').tasks[0]).toMatchObject({ id: 'leasing-001', owner: 'Maria', _configName: first.name });
});

test('progress survives the starter task being reworded in config.json', async ({ page }) => {
  await call(page, 'setTaskOwner', 'leasing', 0, 'Maria');
  await call(page, 'cycleTaskStatus', 'leasing', 0);
  await expect(firstLeasingRow(page).locator('.task-owner')).toContainText('Maria');

  await serveConfig(page, t => { t.name = REWORDED; });
  await page.reload();
  await page.waitForSelector('#departments .department');

  const row = firstLeasingRow(page);
  await expect(row.locator('.task-name')).toHaveText(REWORDED);
  await expect(row.locator('.task-owner')).toContainText('Maria');
  await expect(row).not.toHaveAttribute('data-status', 'todo');
});

test('data saved before ids existed follows the task through a reword when the old name is an alias', async ({ page }) => {
  const legacy = [{ id: 'leasing', tasks: [{ _configName: first.name, name: first.name, owner: 'Maria', status: 'done', priority: 'high' }] }];
  await page.evaluate(v => localStorage.setItem('pm-ops-data-v1', JSON.stringify(v)), legacy);

  await serveConfig(page, t => { t.name = REWORDED; t.aliases = [first.name]; });
  await page.reload();
  await page.waitForSelector('#departments .department');

  const row = firstLeasingRow(page);
  await expect(row.locator('.task-name')).toHaveText(REWORDED);
  await expect(row.locator('.task-owner')).toContainText('Maria');
  await expect(row).toHaveAttribute('data-status', 'done');
});

test('without an alias, old-format data for a reworded task is left alone rather than misapplied', async ({ page }) => {
  const legacy = [{ id: 'leasing', tasks: [{ _configName: first.name, name: first.name, owner: 'Maria', status: 'done' }] }];
  await page.evaluate(v => localStorage.setItem('pm-ops-data-v1', JSON.stringify(v)), legacy);
  await serveConfig(page, t => { t.name = REWORDED; });
  await page.reload();
  await page.waitForSelector('#departments .department');
  await expect(firstLeasingRow(page).locator('.task-owner')).not.toContainText('Maria');
});

test('an export from this version carries ids (schema v4) and re-imports onto the same tasks', async ({ page }) => {
  await call(page, 'setTaskOwner', 'leasing', 0, 'Maria');
  const [download] = await Promise.all([page.waitForEvent('download'), call(page, 'exportJSON')]);
  const fs = await import('node:fs');
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(file.schemaVersion).toBe(4);
  const rows = file.departments.flatMap(d => d.tasks);
  expect(rows).toHaveLength(262);
  expect(new Set(rows.map(r => r.id)).size).toBe(262);
  expect(file.departments.find(d => d.id === 'leasing').tasks[0]).toMatchObject({ id: 'leasing-001', owner: 'Maria' });
});
