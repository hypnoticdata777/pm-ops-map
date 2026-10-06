// Browser-level XSS regression suite.
//
// Every free-form field a hostile import file / Team Sync server / clipboard can
// set carries a tagged canary (see helpers/security.js). Each test imports that
// workspace through the real UI, renders one surface, and asserts the canary
// never becomes markup, never breaks out of an inline handler, and never runs.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  buildEvilWorkspace, evil, prepare, importWorkspace, scan, call, poke, writeTemp,
} from './helpers/security.js';

async function loadEvilApp(page, testInfo) {
  page.on('dialog', d => d.dismiss());
  await prepare(page);
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
  await importWorkspace(page, buildEvilWorkspace());
}

const expectClean = async (page, where) => {
  const findings = await scan(page, where);
  expect(findings, findings.join('\n')).toEqual([]);
};

test.beforeEach(async ({}, testInfo) => {
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
});

test.describe('hostile import is inert', () => {
  test('import review modal', async ({ page }, testInfo) => {
    page.on('dialog', d => d.dismiss());
    await prepare(page);
    await page.goto('/index.html');
    await page.waitForSelector('#departments .department');
    const file = writeTemp('evil.json', JSON.stringify(buildEvilWorkspace()));
    await page.setInputFiles('#import-file-input', file);
    await page.waitForSelector('#import-review-modal.visible');
    await expectClean(page, 'import review');
  });

  test('tracking view, pickers and modals', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await call(page, 'toggleExpandAllDepartments');
    await expectClean(page, 'tracking (expanded)');

    const leasing = '.department[data-id="leasing"]';
    await poke(page, `${leasing} .task-owner`);
    await expectClean(page, 'tracking owner picker');
    await poke(page, `${leasing} .dep-add-btn, ${leasing} .dep-chip`);
    await expectClean(page, 'tracking dependency picker');
    await poke(page, `${leasing} .task-notes-btn, ${leasing} .task-fields-btn, ${leasing} .due-date-chip`);
    await expectClean(page, 'tracking notes/custom/due');
    await call(page, 'toggleBulkMode');
    await expectClean(page, 'tracking bulk mode');
  });

  test('launch plan dashboard', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await expectClean(page, 'launch plan');
    await poke(page, '#launch-plan button');
    await expectClean(page, 'launch plan after clicking every action');
  });

  test('map view, tooltips and department panel', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await page.locator('.nav-tab').nth(1).click();
    await page.waitForSelector('#map-view.active svg');
    await expectClean(page, 'map');
    await poke(page, '#map-view svg *');
    await expectClean(page, 'map hover/click on every svg node');
    await poke(page, '#map-view [onclick], #map-view .map-panel-owner-badge');
    await expectClean(page, 'map after opening panels');
  });

  test('team view, playbooks, role templates and audit log', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await page.locator('#team-tab').click();
    await expectClean(page, 'team view');

    const count = await page.locator('.emp-playbook-btn').count();
    for (let i = 0; i < count; i++) {
      await page.locator('.emp-playbook-btn').nth(i).dispatchEvent('click');
      await expectClean(page, `playbook #${i}`);
      await call(page, 'closeRolePlaybook');
    }
    await poke(page, '.affinity-tag');
    await poke(page, '.role-template-btn');
    await expectClean(page, 'role template preview');
    await call(page, 'closeRoleTemplatePreview');
    await call(page, 'openAuditLog');
    await expectClean(page, 'audit log');
  });

  test('work orders board and edit modal', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await page.locator('#wo-tab').click();
    await expectClean(page, 'work orders board');
    await poke(page, '.wo-edit-btn', ['mouseover', 'mouseenter', 'focus', 'click']);
    await expectClean(page, 'work order edit modal');
    await poke(page, '.wo-advance-btn, .wo-delete-btn, .wo-card');
    await expectClean(page, 'work order actions');
  });

  test('portfolio lists and edit forms', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await page.locator('#portfolio-tab').click();
    await expectClean(page, 'portfolio lists');
    for (const sel of ['.portfolio-edit-btn']) {
      const n = await page.locator(sel).count();
      for (let i = 0; i < n; i++) {
        await page.locator(sel).nth(i).dispatchEvent('click');
        await expectClean(page, `portfolio edit form #${i}`);
      }
    }
    await poke(page, '.portfolio-delete-btn, .doc-link');
    await expectClean(page, 'portfolio links and delete buttons');
  });

  test('backups modal', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await call(page, 'openBackupsModal');
    await expectClean(page, 'backups modal');
  });

  test('exported handbook HTML', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      call(page, 'downloadOperationsHandbookHTML'),
    ]);
    const html = fs.readFileSync(await download.path(), 'utf8');
    // The exported file is opened by owners/clients, so it must be inert on its own.
    const viewer = await page.context().newPage();
    await viewer.setContent(html);
    await expectClean(viewer, 'exported handbook');
    expect(html).not.toMatch(/<img[^>]*data-pwn/i);
  });
});

// Guards against a vacuous pass: the suite above is only meaningful if the hostile
// text actually reached the screen. Here it must appear verbatim — as TEXT.
test.describe('hostile text is displayed, not executed', () => {
  test('free-text fields render literally and enums/ids/colors are repaired', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await call(page, 'toggleExpandAllDepartments');

    // Tracking: task name + owner come through as literal text.
    await expect(page.locator('.department[data-id="leasing"] .task-name').first()).toHaveText(evil('task.name'));
    await expect(page.locator('.department[data-id="leasing"] .task-owner').first()).toHaveText(evil('emp.name'));
    // Invalid enums were reset instead of reaching class names / data attributes.
    const first = page.locator('.department[data-id="leasing"] .task-item').first();
    await expect(first).toHaveAttribute('data-status', 'todo');
    await expect(first).toHaveAttribute('data-priority', 'medium');

    // Team: employee name is literal text, color fell back to a safe hex.
    await page.locator('#team-tab').click();
    await expect(page.locator('.emp-name').first()).toHaveText(evil('emp.name'));
    expect(await page.locator('.emp-color-dot').first().getAttribute('style')).toMatch(/^background:#[0-9a-f]{6};?$/i);

    // Work orders: hostile title shown literally; bad status landed in "Submitted".
    await page.locator('#wo-tab').click();
    await expect(page.locator('.wo-card-title', { hasText: 'data-pwn=wo.title' })).toHaveText(evil('wo.title'));
    await expect(page.locator('.wo-column').first().locator('.wo-card-title', { hasText: 'data-pwn=wo.title' })).toHaveCount(1);
    expect(await page.locator('.wo-edit-btn').first().getAttribute('data-id')).toMatch(/^[A-Za-z0-9._:-]+$/);

    // Portfolio: names literal, ids regenerated into the safe alphabet, unsafe doc links removed.
    await page.locator('#portfolio-tab').click();
    await expect(page.locator('.portfolio-card strong', { hasText: 'data-pwn=prop.name' })).toHaveText(evil('prop.name'));
    for (const id of await page.locator('.portfolio-edit-btn').evaluateAll(els => els.map(e => e.dataset.id))) {
      expect(id).toMatch(/^[A-Za-z0-9._:-]+$/);
    }
    await expect(page.locator('a.doc-link[href^="javascript"]')).toHaveCount(0);
  });

  test('import review tells the user how much was cleaned', async ({ page }, testInfo) => {
    page.on('dialog', d => d.dismiss());
    await prepare(page);
    await page.goto('/index.html');
    await page.waitForSelector('#departments .department');
    const file = writeTemp('evil.json', JSON.stringify(buildEvilWorkspace()));
    await page.setInputFiles('#import-file-input', file);
    await page.waitForSelector('#import-review-modal.visible');
    const body = await page.locator('#import-review-body').innerText();
    expect(body).toMatch(/invalid fields that will be reset/i);
    expect(body).toMatch(/not allowed/i); // the warning explaining unknown status/priority/color
  });
});

// The exact exploit shapes that were demonstrated, driven with REAL user gestures.
test.describe('historical exploits stay dead', () => {
  test('work order id attribute breakout does not run on hover/click', async ({ page }, testInfo) => {
    // The original proof of concept: an id that closes the onclick attribute and
    // adds a live onmouseover handler of its own.
    page.on('dialog', d => d.dismiss());
    await prepare(page);
    await page.goto('/index.html');
    await page.waitForSelector('#departments .department');
    const ws = buildEvilWorkspace();
    ws.workOrders = [{
      id: '" onmouseover="__pwn=1" onfocus="__pwn=1" x="', property: 'Maple', title: 'Leaky faucet',
      status: 'submitted', priority: 'medium', assignee: 'UNASSIGNED',
    }];
    await importWorkspace(page, ws);
    await page.locator('#wo-tab').click();
    const btn = page.locator('.wo-edit-btn').first();
    await btn.hover();
    await btn.focus();
    await btn.click({ force: true });
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  });

  test('employee name entity bypass (jsonAttr) does not run on click', async ({ page }, testInfo) => {
    await loadEvilApp(page, testInfo);
    await page.locator('#team-tab').click();
    // The playbook / remove / affinity buttons all embed the employee name in a handler.
    await page.locator('.emp-playbook-btn').first().click({ force: true });
    await call(page, 'closeRolePlaybook');
    await page.locator('.affinity-tag').first().click({ force: true });
    await page.locator('.emp-remove-btn').first().click({ force: true }); // confirm() is auto-dismissed
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  });

  test('canary helper itself is hostile (sanity check of the harness)', async () => {
    expect(evil('x')).toContain('data-pwn=x');
    expect(evil('x').length).toBeLessThan(60);
  });
});
