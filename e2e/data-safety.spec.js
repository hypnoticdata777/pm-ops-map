// Data-safety journeys in a real browser: nothing the user typed is silently lost
// by export/import or backup restore, and "reset" removes what it says it removes.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepare, importWorkspace, call, writeTemp } from './helpers/security.js';

const NOTE = 'Call the owner before listing — gate code 4471';
const SENTINEL = 'SENTINEL-TENANT-PII-9f3a';

test.beforeEach(async ({ page }, testInfo) => {
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  page.on('dialog', d => d.accept()); // confirm() prompts (reset, restore, import) are all accepted
  await prepare(page);
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
});

const storageDump = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

async function addNoteAndField(page) {
  await call(page, 'openTaskNotes', 'leasing', 0);
  await page.fill('#task-notes-textarea', NOTE);
  await page.click('#task-notes-save-btn');
  await call(page, 'openCustomFields', 'leasing', 0);
  await page.fill('#cf-key-input', 'Gate code');
  await page.fill('#cf-val-input', '4471');
  await call(page, 'addCustomField', 'leasing', 0);
  await call(page, 'closeCustomFields');
}

async function expectNoteAndField(page) {
  await call(page, 'toggleExpandAllDepartments');
  const row = page.locator('.department[data-id="leasing"] .task-item').first();
  await expect(row.locator('.task-notes-btn--has-notes')).toHaveCount(1);
  await expect(row.locator('.task-fields-btn--has-fields')).toHaveCount(1);
  await call(page, 'openTaskNotes', 'leasing', 0);
  await expect(page.locator('#task-notes-textarea')).toHaveValue(NOTE);
  await call(page, 'closeTaskNotes');
}

test('notes and custom fields survive export -> reset -> import', async ({ page }, testInfo) => {
  await addNoteAndField(page);

  // Export through the real button path and inspect the file itself.
  const [download] = await Promise.all([page.waitForEvent('download'), call(page, 'exportJSON')]);
  const exported = writeTemp('export.json', fs.readFileSync(await download.path()));
  const file = JSON.parse(fs.readFileSync(exported, 'utf8'));
  expect(file.schemaVersion).toBe(4);
  const first = file.departments.find(d => d.id === 'leasing').tasks[0];
  expect(first.notes).toBe(NOTE);
  expect(first.customFields).toEqual({ 'Gate code': '4471' });

  // Wipe the device, then bring the file back.
  await Promise.all([page.waitForEvent('load'), call(page, 'confirmResetStorage', '4')]);
  await page.waitForSelector('#departments .department');
  const wiped = JSON.parse((await storageDump(page))['pm-ops-data-v1'] || '[]');
  expect(JSON.stringify(wiped)).not.toContain(NOTE);

  await page.setInputFiles('#import-file-input', exported);
  await page.waitForSelector('#import-review-modal.visible');
  await page.click('#import-confirm-btn');
  await page.waitForSelector('#import-review-modal.visible', { state: 'hidden' });
  await expectNoteAndField(page);
});

test('an older export without notes keys does not wipe notes on this device', async ({ page }, testInfo) => {
  await addNoteAndField(page);
  const v2 = {
    schema: 'pm-ops-map-state', schemaVersion: 2, app: 'PM Ops Map', company: 'Old Export Co',
    departments: [{ id: 'leasing', tasks: [{ _configName: await page.evaluate(() => document.querySelector('.department[data-id="leasing"] .task-name').textContent), name: 'Renamed in old export', owner: 'UNOWNED' }] }],
  };
  await importWorkspace(page, v2);
  await call(page, 'toggleExpandAllDepartments');
  await expect(page.locator('.department[data-id="leasing"] .task-name').first()).toHaveText('Renamed in old export');
  await expect(page.locator('.department[data-id="leasing"] .task-item').first().locator('.task-notes-btn--has-notes')).toHaveCount(1);
});

test('restoring an automatic backup brings notes and custom fields back', async ({ page }) => {
  await addNoteAndField(page);
  await call(page, 'applyRoleTemplate', 'solo', true); // auto-assign needs a roster

  // Auto-assign takes an automatic "Before auto-assign" backup (it contains the notes).
  await call(page, 'runAutoAssign');
  const backups = JSON.parse((await storageDump(page))['pm-ops-backups-v1']);
  expect(backups[0].label).toBe('Before auto-assign');
  expect(backups[0].state).toContain(NOTE);

  // Lose the notes, then restore from the Backups dialog.
  await call(page, 'openTaskNotes', 'leasing', 0);
  await page.fill('#task-notes-textarea', '');
  await page.click('#task-notes-save-btn');
  await call(page, 'openBackupsModal');
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('#backups-body .backup-row button').first().click(),
  ]);
  await page.waitForSelector('#departments .department');
  await expectNoteAndField(page);
});

test('"Everything" leaves no trace of the workspace, backups included', async ({ page }, testInfo) => {
  const ws = {
    schema: 'pm-ops-map-state', schemaVersion: 3, app: 'PM Ops Map', company: 'Reset Test Co',
    departments: [], team: { employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] },
    workOrders: [], portfolio: { properties: [], vendors: [], tenants: [{ id: 't-1', name: SENTINEL, unit: '1A' }] },
  };
  ws.departments = [{ id: 'leasing', tasks: [{ _configName: await page.evaluate(() => document.querySelector('.department[data-id="leasing"] .task-name').textContent), name: 'x', owner: 'UNOWNED' }] }];
  await importWorkspace(page, ws);
  await call(page, 'runAutoAssign'); // backup taken now includes the tenant

  let dump = await storageDump(page);
  expect(JSON.stringify(dump)).toContain(SENTINEL);
  expect(dump['pm-ops-backups-v1']).toContain(SENTINEL); // precondition: a backup really holds the PII

  await Promise.all([page.waitForEvent('load'), call(page, 'confirmResetStorage', '4')]);
  await page.waitForSelector('#departments .department');

  dump = await storageDump(page);
  expect(JSON.stringify(dump), 'tenant data must not survive "Everything"').not.toContain(SENTINEL);
  expect(dump['pm-ops-backups-v1']).toBeUndefined();
});

test('"Operating workspace" also clears backups; "Tasks only" keeps them', async ({ page }, testInfo) => {
  const ws = {
    schema: 'pm-ops-map-state', schemaVersion: 3, app: 'PM Ops Map',
    departments: [], team: { employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] },
    workOrders: [], portfolio: { properties: [], vendors: [], tenants: [{ id: 't-1', name: SENTINEL }] },
  };
  ws.departments = [{ id: 'leasing', tasks: [{ _configName: await page.evaluate(() => document.querySelector('.department[data-id="leasing"] .task-name').textContent), name: 'x', owner: 'UNOWNED' }] }];
  await importWorkspace(page, ws);
  await call(page, 'runAutoAssign');

  await Promise.all([page.waitForEvent('load'), call(page, 'confirmResetStorage', '1')]);
  await page.waitForSelector('#departments .department');
  expect((await storageDump(page))['pm-ops-backups-v1']).toContain(SENTINEL);

  await Promise.all([page.waitForEvent('load'), call(page, 'confirmResetStorage', '2')]);
  await page.waitForSelector('#departments .department');
  expect(JSON.stringify(await storageDump(page))).not.toContain(SENTINEL);
});
