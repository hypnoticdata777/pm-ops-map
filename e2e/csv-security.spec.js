// CSV safety, end to end: nothing exported can run as a spreadsheet formula,
// nothing imported can become markup, and oversized files are refused.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { config, prepare, importWorkspace, scan, call, writeTemp } from './helpers/security.js';

// Deliberately NOT the app's own parser, so a bug in parseCSV can't hide a bug in export.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* CRLF */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const TRIGGERS = /^[=+\-@\t\r]/;
const FORMULAS = [
  '=HYPERLINK("http://evil.test","click")',
  '+SUM(1+1)',
  '-2+3',
  '@SUM(A1)',
  "=cmd|' /C calc'!A0",
];

const dept = config.orgData.departments[0];

function formulaWorkspace() {
  return {
    schema: 'pm-ops-map-state', schemaVersion: 2, app: 'PM Ops Map', company: 'CSV Test Co',
    departments: [{ id: dept.id, tasks: [{ _configName: dept.tasks[0].name, name: FORMULAS[0], owner: FORMULAS[1], status: 'todo', priority: 'medium' }] }],
    team: { employees: [{ name: FORMULAS[1], hex: '#336699', affinities: [dept.id] }] },
    workOrders: [{ id: 'wo-csv-1', property: FORMULAS[0], unit: FORMULAS[2], tenant: FORMULAS[3], title: FORMULAS[4], notes: FORMULAS[0], vendor: FORMULAS[1], status: 'submitted', priority: 'low', assignee: FORMULAS[1] }],
    portfolio: {
      properties: [{ id: 'p-csv-1', name: FORMULAS[0], units: 3, owner: FORMULAS[1], notes: FORMULAS[2] }],
      tenants: [{ id: 't-csv-1', name: FORMULAS[3], propertyId: 'p-csv-1', unit: FORMULAS[4], phone: '+1 (555) 010-1188', email: FORMULAS[0], rent: 1200 }],
      vendors: [{ id: 'v-csv-1', name: FORMULAS[4], trade: FORMULAS[0], phone: '+1 555 0100', email: FORMULAS[2] }],
    },
  };
}

async function start(page, testInfo, workspace = formulaWorkspace()) {
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  page.on('dialog', d => d.accept());
  await prepare(page);
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
  await importWorkspace(page, workspace);
}

async function exportCsv(page, fn) {
  const [download] = await Promise.all([page.waitForEvent('download'), call(page, fn)]);
  return fs.readFileSync(await download.path(), 'utf8');
}

const EXPORTS = [
  ['exportCSV', 'tasks'],
  ['exportPropertiesCSV', 'properties'],
  ['exportTenantsCSV', 'tenants'],
  ['exportVendorsCSV', 'vendors'],
  ['exportWorkOrdersCSV', 'work orders'],
];

test.describe('exported CSV cannot run as a spreadsheet formula', () => {
  for (const [fn, label] of EXPORTS) {
    test(`${label} export`, async ({ page }, testInfo) => {
      await start(page, testInfo);
      const rows = parseCsv(await exportCsv(page, fn));
      expect(rows.length).toBeGreaterThan(1);
      const dangerous = [];
      rows.forEach((row, r) => row.forEach((cell, c) => {
        if (TRIGGERS.test(cell)) dangerous.push(`row ${r} col ${c}: ${JSON.stringify(cell)}`);
      }));
      expect(dangerous, dangerous.join('\n')).toEqual([]);
      // ...and the guarded values are still there, just inert (shown as text by Excel/Sheets).
      const all = rows.flat();
      expect(all.some(cell => cell.startsWith("'=") || cell.startsWith("'+") || cell.startsWith("'-") || cell.startsWith("'@"))).toBe(true);
    });
  }

  test('every row of every export has the same number of columns as its header', async ({ page }, testInfo) => {
    await start(page, testInfo);
    for (const [fn, label] of EXPORTS) {
      const rows = parseCsv(await exportCsv(page, fn));
      rows.forEach(row => expect(row.length, `${label}: ${row}`).toBe(rows[0].length));
    }
  });
});

test.describe('CSV round trip is lossless', () => {
  test('export -> import returns the original values (guard removed)', async ({ page }, testInfo) => {
    await start(page, testInfo);
    const csv = await exportCsv(page, 'exportPropertiesCSV');
    const file = writeTemp('properties.csv', csv);

    await page.locator('#portfolio-tab').click();
    await page.locator('input[type=file][onchange*="importPropertiesCSV"]').setInputFiles(file);
    // Importing adds new records, so the same property now appears twice with identical text.
    await expect(page.locator('.portfolio-card strong', { hasText: 'HYPERLINK' })).toHaveCount(2);
    const names = await page.locator('.portfolio-card strong', { hasText: 'HYPERLINK' }).allInnerTexts();
    expect(names).toEqual([FORMULAS[0], FORMULAS[0]]);
  });

  test('a phone number that starts with + survives export and re-import', async ({ page }, testInfo) => {
    await start(page, testInfo);
    const csv = await exportCsv(page, 'exportVendorsCSV');
    expect(csv).toContain("\"'+1 555 0100\"");
    const file = writeTemp('vendors.csv', csv);
    await page.locator('#portfolio-tab').click();
    await page.locator('input[type=file][onchange*="importVendorsCSV"]').setInputFiles(file);
    await expect(page.locator('.portfolio-card small', { hasText: '+1 555 0100' })).toHaveCount(2);
    expect(await page.locator('.portfolio-card small', { hasText: "'+1" }).count()).toBe(0);
  });
});

test.describe('hostile CSV files are inert', () => {
  const evil = tag => `"'><img data-pwn=${tag} src=x>&quot;);__pwn=1;//`;
  const q = v => `"${String(v).replace(/"/g, '""')}"`;

  test('canary payloads in every column become literal text, not markup', async ({ page }, testInfo) => {
    await start(page, testInfo);
    await page.locator('#portfolio-tab').click();

    const propertyCsv = [
      ['Property', 'Units', 'Owner / Client', 'Notes', 'Document Link'].map(q).join(','),
      [evil('p.name'), 'many', evil('p.owner'), evil('p.notes'), `http://example.com/${evil('p.url')}`].map(q).join(','),
    ].join('\r\n');
    const tenantCsv = [
      ['Tenant', 'Property', 'Unit', 'Status', 'Phone', 'Email', 'Monthly Rent', 'Lease Start', 'Lease End', 'Balance Due', 'Document Link'].map(q).join(','),
      [evil('t.name'), evil('t.prop'), evil('t.unit'), evil('t.status'), evil('t.phone'), evil('t.email'), evil('t.rent'), evil('t.ls'), evil('t.le'), evil('t.bal'), `javascript:${evil('t.url')}`].map(q).join(','),
    ].join('\r\n');
    const vendorCsv = [
      ['Vendor', 'Trade', 'Phone', 'Email', 'Document Link'].map(q).join(','),
      [evil('v.name'), evil('v.trade'), evil('v.phone'), evil('v.email'), evil('v.url')].map(q).join(','),
    ].join('\r\n');

    for (const [name, csv, handler] of [['p', propertyCsv, 'importPropertiesCSV'], ['t', tenantCsv, 'importTenantsCSV'], ['v', vendorCsv, 'importVendorsCSV']]) {
      const file = writeTemp(`${name}.csv`, csv);
      await page.locator(`input[type=file][onchange*="${handler}"]`).setInputFiles(file);
      await page.waitForTimeout(150);
    }

    // Records landed (so this is not a vacuous pass) and the text is shown literally.
    await expect(page.locator('.portfolio-card strong', { hasText: 'data-pwn=p.name' })).toHaveText(evil('p.name'));
    await expect(page.locator('.portfolio-card strong', { hasText: 'data-pwn=t.name' })).toHaveText(evil('t.name'));
    await expect(page.locator('.portfolio-card strong', { hasText: 'data-pwn=v.name' })).toHaveText(evil('v.name'));

    expect(await scan(page, 'after hostile CSV import')).toEqual([]);
    for (const id of await page.locator('.portfolio-edit-btn').evaluateAll(els => els.map(e => e.dataset.id))) {
      expect(id).toMatch(/^[A-Za-z0-9._:-]+$/);
    }
  });

  test('a million-character cell is truncated to the field limit', async ({ page }, testInfo) => {
    await start(page, testInfo);
    await page.locator('#portfolio-tab').click();
    const file = writeTemp('huge.csv', `"Property","Units"\r\n"${'A'.repeat(1_000_000)}","2"\r\n`);
    await page.locator('input[type=file][onchange*="importPropertiesCSV"]').setInputFiles(file);
    const huge = page.locator('.portfolio-card strong', { hasText: /^A{50}/ });
    await expect(huge).toHaveCount(1);
    expect((await huge.innerText()).length).toBeLessThanOrEqual(200);
  });
});

test.describe('oversized import files are refused', () => {
  test('CSV over 5 MB', async ({ page }, testInfo) => {
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    const alerts = [];
    page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
    await prepare(page);
    await page.goto('/index.html');
    await page.waitForSelector('#departments .department');
    await page.locator('#portfolio-tab').click();
    const file = writeTemp('too-big.csv', `"Property"\r\n${'x'.repeat(6 * 1024 * 1024)}\r\n`);
    await page.locator('input[type=file][onchange*="importPropertiesCSV"]').setInputFiles(file);
    await expect.poll(() => alerts.join(' ')).toMatch(/too large/i);
  });

  test('JSON over 5 MB', async ({ page }, testInfo) => {
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    const alerts = [];
    page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
    await prepare(page);
    await page.goto('/index.html');
    await page.waitForSelector('#departments .department');
    const file = writeTemp('too-big.json', JSON.stringify({ schema: 'pm-ops-map-state', departments: [], pad: 'x'.repeat(6 * 1024 * 1024) }));
    await page.setInputFiles('#import-file-input', file);
    await expect.poll(() => alerts.join(' ')).toMatch(/too large/i);
    await expect(page.locator('#import-review-modal.visible')).toHaveCount(0);
  });
});
