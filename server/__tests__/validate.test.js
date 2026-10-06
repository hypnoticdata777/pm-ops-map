const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { validateState, validatePassphrase, validateExpectedVersion } = require('../src/validate');

const app = () => createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ops-sync-validate-')), allowedOrigins: ['*'] });
const push = (a, state, extra = {}) => request(a).post('/api/workspaces/acme-pm/push').send({ passphrase: 'secret1', state, expectedVersion: 0, ...extra });

describe('validateState', () => {
  test('accepts a realistic client payload and the tiny payloads other tests use', () => {
    expect(validateState({
      schema: 'pm-ops-map-state', schemaVersion: 4, app: 'PM Ops Map', company: 'Acme',
      departments: [{ id: 'leasing', name: 'Leasing', tasks: [{ id: 'leasing-001', name: 'List', owner: 'Maria' }] }],
      team: { employees: [{ name: 'Maria', hex: '#336699', affinities: ['leasing'] }] },
      workOrders: [{ id: 'w1', title: 'Fix' }],
      portfolio: { properties: [], tenants: [], vendors: [] },
    })).toEqual([]);
    expect(validateState({ company: 'Acme' })).toEqual([]);
    expect(validateState({ a: 1 })).toEqual([]);
    expect(validateState({})).toEqual([]);
  });

  test('rejects anything that is not a plain object', () => {
    [null, undefined, [], 'x', 5, true].forEach(v => expect(validateState(v)[0]).toMatch(/must be a JSON object/));
  });

  test('rejects an unexpected schema name or a bad schemaVersion', () => {
    expect(validateState({ schema: 'something-else' })[0]).toMatch(/schema/);
    ['4', 0, -1, 1.5, 1001].forEach(v => expect(validateState({ schemaVersion: v })[0]).toMatch(/schemaVersion/));
  });

  test('rejects wrong types for the known sections and says which', () => {
    expect(validateState({ departments: {} })[0]).toMatch(/departments must be a list/);
    expect(validateState({ departments: [{ id: 'a', tasks: 'x' }] })[0]).toMatch(/departments\[0\]\.tasks must be a list/);
    expect(validateState({ departments: [5] })[0]).toMatch(/departments\[0\] must be an object/);
    expect(validateState({ team: [] })[0]).toMatch(/team must be an object/);
    expect(validateState({ team: { employees: 'x' } })[0]).toMatch(/team\.employees must be a list/);
    expect(validateState({ workOrders: {} })[0]).toMatch(/workOrders must be a list/);
    expect(validateState({ portfolio: { tenants: 7 } })[0]).toMatch(/portfolio\.tenants must be a list/);
    expect(validateState({ company: { a: 1 } })[0]).toMatch(/company must be text/);
  });

  test('enforces list-size limits', () => {
    expect(validateState({ departments: Array.from({ length: 101 }, () => ({ id: 'a', tasks: [] })) })[0]).toMatch(/departments has too many/);
    expect(validateState({ workOrders: Array.from({ length: 10001 }, () => ({})) })[0]).toMatch(/workOrders has too many/);
    expect(validateState({ departments: [{ id: 'a', tasks: Array.from({ length: 2001 }, () => ({})) }] })[0]).toMatch(/tasks has too many/);
  });

  test('rejects prototype-pollution keys and excessive nesting anywhere', () => {
    expect(validateState(JSON.parse('{"a":{"__proto__":{"x":1}}}'))[0]).toMatch(/__proto__/);
    let deep = {};
    const root = deep;
    for (let i = 0; i < 40; i++) { deep.n = {}; deep = deep.n; }
    expect(validateState(root)[0]).toMatch(/nested too deeply/);
  });

  test('reports at most a handful of problems', () => {
    const errors = validateState({ departments: 1, team: 1, workOrders: 1, portfolio: 1, company: 1, schema: 1 });
    expect(errors.length).toBeGreaterThan(1);
    expect(errors.length).toBeLessThanOrEqual(5);
  });
});

describe('request fields', () => {
  test('passphrase length cap and expectedVersion type', () => {
    expect(validatePassphrase('x'.repeat(201))).toMatch(/too long/);
    expect(validatePassphrase('x'.repeat(200))).toBeNull();
    expect(validateExpectedVersion(undefined)).toBeNull();
    expect(validateExpectedVersion(0)).toBeNull();
    ['1', -1, 1.5, null, {}].forEach(v => expect(validateExpectedVersion(v)).toMatch(/expectedVersion/));
  });
});

describe('HTTP behaviour', () => {
  test('a well-formed workspace still pushes and pulls', async () => {
    const a = app();
    const state = { schema: 'pm-ops-map-state', schemaVersion: 4, departments: [{ id: 'leasing', tasks: [] }], workOrders: [] };
    expect((await push(a, state)).status).toBe(200);
    const pull = await request(a).post('/api/workspaces/acme-pm/pull').send({ passphrase: 'secret1' });
    expect(pull.body.state).toEqual(state);
  });

  test('a malformed state is a 400 that names the problem, and nothing is stored', async () => {
    const a = app();
    const res = await push(a, { departments: { not: 'a list' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid workspace data: departments must be a list/);
    expect((await request(a).post('/api/workspaces/acme-pm/pull').send({ passphrase: 'secret1' })).status).toBe(404);
  });

  test('an array, string or missing state is a 400', async () => {
    const a = app();
    for (const state of [[], 'x', null]) expect((await push(a, state)).status).toBe(400);
  });

  test('an invalid expectedVersion is a 400, not a confusing conflict', async () => {
    const a = app();
    await push(a, { a: 1 });
    const res = await push(a, { a: 2 }, { expectedVersion: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expectedVersion/);
  });

  test('an enormous passphrase is rejected before any hashing', async () => {
    const a = app();
    const res = await request(a).post('/api/workspaces/acme-pm/pull').send({ passphrase: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/);
  });

  test('a push of the wrong schema name is refused', async () => {
    const res = await push(app(), { schema: 'some-other-app', departments: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schema/);
  });
});
