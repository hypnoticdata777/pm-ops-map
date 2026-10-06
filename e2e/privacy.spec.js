// In-product privacy messaging, checked the way a user meets it.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { prepare, importWorkspace, call } from './helpers/security.js';

const tenantWorkspace = () => ({
  schema: 'pm-ops-map-state', schemaVersion: 3, app: 'PM Ops Map', company: 'Privacy Test Co',
  departments: [], team: { employees: [] }, workOrders: [],
  portfolio: { properties: [], vendors: [], tenants: [{ id: 't-1', name: 'Maya Chen', unit: '2B', phone: '555-0100', rent: 1450 }] },
});

async function start(page, { dialogs = 'accept' } = {}) {
  const seen = [];
  page.on('dialog', d => { seen.push(d.message()); return dialogs === 'accept' ? d.accept() : d.dismiss(); });
  await prepare(page);
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
  return seen;
}

test.describe('Portfolio notice and Data & Privacy dialog', () => {
  test('the Portfolio tab leads with "saved in this browser only — not encrypted"', async ({ page }) => {
    await start(page);
    await page.locator('#portfolio-tab').click();
    const notice = page.locator('.privacy-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('not encrypted');
    await expect(notice).toContainText('Exports, backups, and Team Sync each create another copy');
    await expect(page.locator('.portfolio-sensitive-hint')).toContainText('bank or card numbers');
  });

  test('"What should I enter here?" reveals the three tiers', async ({ page }) => {
    await start(page);
    await page.locator('#portfolio-tab').click();
    await expect(page.locator('.privacy-tier')).toHaveCount(3);
    await expect(page.locator('.privacy-tier--ok')).toBeHidden(); // folded away until opened
    await page.locator('.privacy-notice-details summary').click();
    await expect(page.locator('.privacy-tier--ok')).toBeVisible();
    await expect(page.locator('.privacy-tier--careful')).toContainText('Real tenant names');
    await expect(page.locator('.privacy-tier--never')).toContainText('Social Security');
  });

  test('the toolbar and notice both open the full dialog; it closes again', async ({ page }) => {
    await start(page);
    await page.getByRole('button', { name: /Data & Privacy/ }).click();
    const modal = page.locator('#privacy-modal');
    await expect(modal).toHaveClass(/visible/);
    for (const heading of ['Where your data lives', 'What to put in it', 'Copies you create', 'Removing your data']) {
      await expect(modal.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(modal).toContainText('plain, unencrypted text');
    await modal.getByRole('button', { name: 'Close' }).last().click();
    await expect(modal).not.toHaveClass(/visible/);

    await page.locator('#portfolio-tab').click();
    await page.locator('.privacy-notice-details summary').click();
    await page.getByRole('button', { name: 'More about your data' }).first().click();
    await expect(modal).toHaveClass(/visible/);
  });

  test('first-run onboarding says where data lives before anything is typed', async ({ page }) => {
    await page.goto('/index.html'); // no prepare(): this is a brand-new visitor
    await expect(page.locator('#onboarding-modal .onboarding-privacy')).toBeVisible();
    await expect(page.locator('#onboarding-modal .onboarding-privacy')).toContainText('stays in this browser, unencrypted');
  });
});

test.describe('Team Sync is labelled as a trusted-team beta', () => {
  test('toolbar button and dialog say beta, and list the real limitations', async ({ page }) => {
    await start(page);
    await expect(page.locator('#sync-status-pill')).toContainText('beta');
    await page.locator('#sync-status-pill').click();
    const modal = page.locator('#sync-modal');
    await expect(modal.locator('.playbook-kicker')).toContainText('Beta');
    await expect(modal).toContainText('not enterprise collaboration');
    await expect(modal).toContainText('No individual accounts, roles, or way to remove one person');
    await expect(modal).toContainText('passphrase is saved unencrypted in this browser');
  });

  test('a plain http:// server address (not localhost) asks before sending the passphrase', async ({ page }) => {
    const seen = await start(page, { dialogs: 'dismiss' });
    const requests = [];
    await page.route('http://sync.example.com/**', route => { requests.push(route.request().url()); route.abort(); });
    await page.locator('#sync-status-pill').click();
    await page.fill('#sync-server-url', 'http://sync.example.com');
    await page.fill('#sync-workspace', 'privacy-test');
    await page.fill('#sync-passphrase', 'abcd1234');
    await page.click('#sync-connect-btn');
    await expect.poll(() => seen.join('\n')).toMatch(/http:\/\/, not https:\/\//);
    expect(seen.join('\n')).toMatch(/unencrypted/);
    expect(requests, 'declining must not contact the server').toEqual([]);
  });

  test('https and localhost addresses do not trigger the warning', async ({ page }) => {
    const seen = await start(page, { dialogs: 'accept' });
    await page.route('http://localhost:4000/**', route => route.abort());
    await page.route('https://sync.example.com/**', route => route.abort());
    await page.locator('#sync-status-pill').click();
    for (const url of ['http://localhost:4000', 'https://sync.example.com']) {
      await page.fill('#sync-server-url', url);
      await page.fill('#sync-workspace', 'privacy-test');
      await page.fill('#sync-passphrase', 'abcd1234');
      await page.click('#sync-connect-btn');
      await expect.poll(() => seen.join('\n')).toMatch(/Could not reach sync server/);
    }
    expect(seen.join('\n')).not.toMatch(/not https/);
  });
});

test.describe('exports say what they create', () => {
  test('exporting tenant data asks once, can be cancelled, and the toast names the risk', async ({ page }, testInfo) => {
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    const seen = await start(page, { dialogs: 'dismiss' });
    const ws = tenantWorkspace();
    // The import needs at least one task that matches the built-in config, or the review refuses it.
    const configName = await page.evaluate(() => document.querySelector('.department[data-id="leasing"] .task-name').textContent);
    ws.departments = [{ id: 'leasing', tasks: [{ _configName: configName, name: 'x', owner: 'UNOWNED' }] }];
    await importWorkspace(page, ws); // the import review is a modal, not a dialog

    // Cancel: no file.
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await call(page, 'exportJSON');
    await page.waitForTimeout(500);
    expect(downloaded).toBe(false);
    expect(seen.at(-1)).toMatch(/tenant names, contact details, rent, and balances/);

    // Accept: file + toast; the second sensitive export does not ask again.
    page.removeAllListeners('dialog');
    const asked = [];
    page.on('dialog', d => { asked.push(d.message()); d.accept(); });
    const [download] = await Promise.all([page.waitForEvent('download'), call(page, 'exportJSON')]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    await expect(page.locator('#save-toast')).toContainText('unencrypted copy with tenant data');
    expect(asked).toHaveLength(1);

    await Promise.all([page.waitForEvent('download'), call(page, 'exportTenantsCSV')]);
    expect(asked, 'one acknowledgment per session').toHaveLength(1);
  });

  test('exports with no resident data never interrupt', async ({ page }) => {
    const seen = await start(page, { dialogs: 'dismiss' });
    const [download] = await Promise.all([page.waitForEvent('download'), call(page, 'exportCSV')]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await expect(page.locator('#save-toast')).toContainText('unencrypted copy of your data');
    expect(seen).toEqual([]);
  });

  test('the import review reminds users to trust the source', async ({ page }) => {
    await start(page);
    await page.setInputFiles('#import-file-input', {
      name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 'pm-ops-map-state', departments: [] })),
    });
    await expect(page.locator('#import-review-body')).toContainText('Only import files from sources you trust');
  });
});
