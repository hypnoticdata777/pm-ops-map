import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import {
  DATA_TIERS, COPIES_YOU_CREATE, renderPrivacyTiers, renderPortfolioPrivacyNotice, buildPrivacyModalHTML,
  openPrivacyModal, closePrivacyModal, hasSensitiveRecords, confirmSensitiveExport, announceExport,
  _resetExportAcknowledgment, TENANT_FORM_HINT,
} from '../privacy.js';
import {
  exportJSON, exportCSV, exportPropertiesCSV, exportTenantsCSV, exportVendorsCSV, exportWorkOrdersCSV,
  copyStateToClipboard,
} from '../io.js';
import { downloadOperationsHandbook, downloadOperationsHandbookHTML } from '../handbook.js';
import { renderPortfolioView } from '../views/portfolio.js';
import { isInsecureSyncUrl } from '../sync.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const tenant = { id: 't1', name: 'Maya Chen', unit: '2B', phone: '555-0100', rent: 1450, balanceDue: 450 };

let downloads;
let confirmSpy;

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
  const orgData = structuredClone(config.orgData);
  orgData.departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  _resetExportAcknowledgment();

  // jsdom has no Blob download support: count the anchor clicks _downloadBlob performs.
  downloads = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { downloads.push(this.download); });
  confirmSpy = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmSpy);
  vi.stubGlobal('alert', () => {});
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const withTenant = () => state.setPortfolio({ properties: [], tenants: [tenant], vendors: [] });
const toastText = () => document.getElementById('save-toast').textContent;

describe('guidance content', () => {
  test('three tiers: fine, use with care, do not enter', () => {
    expect(DATA_TIERS.map(t => t.id)).toEqual(['ok', 'careful', 'never']);
    const text = DATA_TIERS.flatMap(t => t.items).join(' ');
    expect(text).toMatch(/fictional/i);
    expect(text).toMatch(/tenant names/i);
    expect(text).toMatch(/Social Security/i);
    expect(text).toMatch(/payment credentials/i);
    expect(text).toMatch(/link/i);
  });

  test('the dialog names every copy a user creates and is honest about encryption', () => {
    const body = buildPrivacyModalHTML();
    COPIES_YOU_CREATE.forEach(([name]) => expect(body).toContain(name));
    expect(body).toMatch(/unencrypted/i);
    expect(body).toMatch(/Team Sync/);
    expect(body).toMatch(/does <strong>not<\/strong> touch files you already exported/i);
  });

  test('rendered guidance contains no inline handlers and no raw HTML from data', () => {
    const el = document.createElement('div');
    el.innerHTML = renderPrivacyTiers();
    expect(el.querySelectorAll('.privacy-tier')).toHaveLength(3);
    expect(el.querySelectorAll('[onclick]')).toHaveLength(0);
    expect(el.querySelectorAll('script, img, iframe')).toHaveLength(0);
  });

  test('the Portfolio notice leads with the not-encrypted fact and folds the details', () => {
    const el = document.createElement('div');
    el.innerHTML = renderPortfolioPrivacyNotice();
    expect(el.querySelector('.privacy-notice-head').textContent).toMatch(/not encrypted/i);
    expect(el.querySelector('details > summary').textContent).toMatch(/what should i enter/i);
    expect(el.querySelectorAll('.privacy-tier')).toHaveLength(3);
    expect(el.querySelector('button').getAttribute('onclick')).toBe('openPrivacyModal()');
  });

  test('the Portfolio tab shows the notice and a sensitive-data hint on the tenant form', () => {
    renderPortfolioView();
    const root = document.getElementById('portfolio-view-inner');
    expect(root.querySelector('.privacy-notice')).not.toBeNull();
    expect(root.querySelector('.portfolio-sensitive-hint').textContent).toBe(TENANT_FORM_HINT);
    expect(TENANT_FORM_HINT).toMatch(/bank or card numbers/i);
  });

  test('the dialog opens filled and closes', () => {
    openPrivacyModal();
    const modal = document.getElementById('privacy-modal');
    expect(modal.classList.contains('visible')).toBe(true);
    expect(document.getElementById('privacy-body').textContent).toMatch(/Where your data lives/);
    closePrivacyModal();
    expect(modal.classList.contains('visible')).toBe(false);
  });

  test('the static page wires up the toolbar button, onboarding note and Team Sync beta wording', () => {
    expect(document.querySelector('button[onclick="openPrivacyModal()"]')).not.toBeNull();
    expect(document.querySelector('.onboarding-privacy').textContent).toMatch(/stays in this browser, unencrypted/i);
    expect(document.getElementById('sync-modal').textContent).toMatch(/beta/i);
    expect(document.getElementById('sync-modal').textContent).toMatch(/not enterprise collaboration/i);
    expect(document.getElementById('sync-modal').textContent).toMatch(/No individual accounts/i);
    expect(document.getElementById('sync-status-pill').textContent).toMatch(/beta/i);
  });
});

describe('hasSensitiveRecords', () => {
  test('false for an empty workspace and for work orders without a tenant', () => {
    expect(hasSensitiveRecords()).toBe(false);
    state.setWorkOrders([{ id: 'w', title: 'Leak', property: 'P', tenant: '' }]);
    expect(hasSensitiveRecords()).toBe(false);
  });

  test('true with a tenant record, or a work order that names a tenant', () => {
    withTenant();
    expect(hasSensitiveRecords()).toBe(true);
    state.setPortfolio({ properties: [], tenants: [], vendors: [] });
    state.setWorkOrders([{ id: 'w', title: 'Leak', property: 'P', tenant: 'Maya' }]);
    expect(hasSensitiveRecords()).toBe(true);
  });
});

describe('confirmSensitiveExport', () => {
  test('does not ask when there is nothing sensitive', () => {
    expect(confirmSensitiveExport('This export')).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test('asks once per session, naming what is exported and why it matters', () => {
    withTenant();
    expect(confirmSensitiveExport('This JSON export')).toBe(true);
    const message = confirmSpy.mock.calls[0][0];
    expect(message).toMatch(/This JSON export/);
    expect(message).toMatch(/tenant names, contact details, rent, and balances/);
    expect(message).toMatch(/unencrypted/);
    expect(message).toMatch(/delete it/i);
    expect(confirmSensitiveExport('Another export')).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  test('a declined confirmation is not remembered — it asks again next time', () => {
    withTenant();
    confirmSpy.mockReturnValueOnce(false);
    expect(confirmSensitiveExport('This export')).toBe(false);
    expect(confirmSensitiveExport('This export')).toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });
});

describe('announceExport', () => {
  test('says the file is an unencrypted copy', () => {
    announceExport('pm-ops-acme.csv');
    expect(toastText()).toMatch(/pm-ops-acme\.csv saved/);
    expect(toastText()).toMatch(/unencrypted copy of your data/);
  });

  test('mentions tenant data when the workspace has any', () => {
    withTenant();
    announceExport('pm-ops-acme.json');
    expect(toastText()).toMatch(/unencrypted copy with tenant data/);
  });
});

describe('exports that include resident information are gated', () => {
  beforeEach(withTenant);

  const gated = [
    ['JSON export', exportJSON],
    ['tenants CSV', exportTenantsCSV],
    ['work orders CSV', exportWorkOrdersCSV],
    ['handbook (.md)', downloadOperationsHandbook],
    ['handbook (.html)', downloadOperationsHandbookHTML],
  ];

  test.each(gated)('%s: cancelling the confirmation downloads nothing', (_label, run) => {
    confirmSpy.mockReturnValue(false);
    run();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual([]);
  });

  test.each(gated)('%s: confirming downloads exactly one file and announces it', (_label, run) => {
    run();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(1);
    expect(toastText()).toMatch(/unencrypted/);
  });

  test('after one acknowledgment, later sensitive exports in the session do not nag', () => {
    exportJSON();
    exportTenantsCSV();
    downloadOperationsHandbook();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(3);
  });

  test('Copy State is gated too, and its toast warns about clipboard history', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    confirmSpy.mockReturnValueOnce(false);
    copyStateToClipboard();
    expect(writeText).not.toHaveBeenCalled();

    copyStateToClipboard();
    expect(writeText).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(toastText()).toMatch(/clipboard history/i);
  });

  test('exports without resident data never prompt, but are still announced', () => {
    exportCSV();
    exportPropertiesCSV();
    exportVendorsCSV();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(3);
    expect(toastText()).toMatch(/unencrypted/);
  });
});

describe('exports with nothing sensitive never prompt', () => {
  test('JSON, tenants CSV and handbook on an empty workspace', () => {
    exportJSON();
    exportTenantsCSV();
    downloadOperationsHandbook();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(3);
  });
});

describe('isInsecureSyncUrl', () => {
  test.each([
    'https://sync.example.com', 'http://localhost:4000', 'http://127.0.0.1:4000', 'http://[::1]:4000',
    'http://team.localhost:4000', 'not a url', '', 'ftp://example.com',
  ])('%j is not flagged', url => expect(isInsecureSyncUrl(url)).toBe(false));

  test.each([
    'http://sync.example.com', 'http://192.168.1.20:4000', 'http://10.0.0.5', 'http://myserver:4000', 'HTTP://Sync.Example.com/path',
  ])('%j is flagged as sending credentials unencrypted', url => expect(isInsecureSyncUrl(url)).toBe(true));
});
