// Team Sync must refuse a malformed server reply with a clear message, not a TypeError.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';
import * as state from '../state.js';
import { connectSync } from '../sync.js';
import { stampTaskIdentity } from '../taskIdentity.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

function serverReplies(status, body) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })));
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
  const orgData = structuredClone(config.orgData);
  stampTaskIdentity(orgData.departments);
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setTeamData({ employees: [] });
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  document.getElementById('sync-server-url').value = 'http://localhost:4000';
  document.getElementById('sync-workspace').value = 'acme-pm';
  document.getElementById('sync-passphrase').value = 'secret1';
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('connecting to a server that sends a malformed reply', () => {
  const connectAndGetAlert = async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    await connectSync();
    return alert.mock.calls.map(c => String(c[0])).join('\n');
  };

  test('a 200 reply with no JSON body is reported as an unexpected response', async () => {
    serverReplies(200, null);
    const shown = await connectAndGetAlert();
    expect(shown).toMatch(/unexpected response/);
    expect(shown).toMatch(/not a JSON object/);
    expect(shown).not.toMatch(/Cannot read properties|undefined|null\b.*of/);
  });

  test('a reply with a missing version never reaches the import review', async () => {
    serverReplies(200, { state: { departments: [] } });
    const shown = await connectAndGetAlert();
    expect(shown).toMatch(/"version" must be a whole number/);
    expect(document.getElementById('import-review-modal').classList.contains('visible')).toBe(false);
  });

  test('a well-formed reply still opens the import review, with field-level repairs listed', async () => {
    const name = config.orgData.departments[0].tasks[0].name;
    serverReplies(200, {
      version: 4, updatedAt: '2026-01-02T03:04:05.000Z',
      state: {
        schema: 'pm-ops-map-state', schemaVersion: 4, company: 'Co',
        departments: [{ id: 'leasing', tasks: [{ id: 'leasing-001', _configName: name, name, owner: 'Maria', status: 'on fire' }] }],
      },
    });
    const shown = await connectAndGetAlert();
    expect(shown).toBe('');
    const review = document.getElementById('import-review-body').textContent;
    expect(document.getElementById('import-review-modal').classList.contains('visible')).toBe(true);
    expect(review).toMatch(/What will be repaired/);
    expect(review).toMatch(/status: "on fire" is not allowed/);
  });
});
