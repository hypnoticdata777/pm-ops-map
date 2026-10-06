import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { buildDemoWorkspace } from '../templates.js';
import {
  LIMITS, cleanText, cleanId, isHexColor, cleanTimestamp, cleanNumber,
  normalizeWorkOrders, normalizePortfolio, normalizeTeam, normalizeEmployee,
  normalizeSavedTask, normalizeBlockedBy, normalizeCustomFields, applySavedTasks,
  normalizeAuditEntry, normalizeAuditLog, normalizeCompany, sanitizeWorkspace,
} from '../normalize.js';

// A payload that breaks out of double quotes, single quotes, text, and (via the
// entity) a JS string inside an attribute.
const EVIL = `"'><img data-pwn=x src=x>&quot;);__pwn=1;//`;

describe('cleanText', () => {
  test('passes ordinary text through, trimmed', () => {
    expect(cleanText('  Maple Street  ', 50)).toBe('Maple Street');
  });

  test('keeps HTML-significant characters — escaping is the view\'s job', () => {
    expect(cleanText('Tom & "Jerry" <LLC>', 50)).toBe('Tom & "Jerry" <LLC>');
  });

  test('strips control characters and line/paragraph separators', () => {
    expect(cleanText('a\u0000b\u0007c\u007fd e f', 50)).toBe('abcdef');
  });

  test('single-line fields collapse newlines and tabs to a space', () => {
    expect(cleanText('line one\r\nline two\tend', 100)).toBe('line one line two end');
  });

  test('multiline fields keep newlines', () => {
    expect(cleanText('a\nb', 100, { multiline: true })).toBe('a\nb');
  });

  test('caps length', () => {
    expect(cleanText('x'.repeat(500), 10)).toHaveLength(10);
  });

  test('numbers become strings; objects, arrays, booleans and null become empty', () => {
    expect(cleanText(42, 10)).toBe('42');
    expect(cleanText({ a: 1 }, 10)).toBe('');
    expect(cleanText(['a'], 10)).toBe('');
    expect(cleanText(true, 10)).toBe('');
    expect(cleanText(null, 10)).toBe('');
    expect(cleanText(NaN, 10)).toBe('');
  });
});

describe('cleanId', () => {
  test('accepts the id shapes the app generates', () => {
    ['wo-1700000000000-1234', 'property-csv-1700000000000-3', 'demo-tenant-1700000000000', 'tenant-example-1', 'a'].forEach(id => {
      expect(cleanId(id)).toBe(id);
    });
  });

  test('rejects anything that could break out of an attribute, selector or JS string', () => {
    [`a'b`, 'a"b', 'a b', 'a<b', 'a>b', 'a&b', 'a;b', 'a(b)', '', '-leading', 'x'.repeat(81), EVIL, '\n'].forEach(id => {
      expect(cleanId(id)).toBeUndefined();
    });
  });

  test('rejects non-strings', () => {
    [1, null, undefined, {}, ['a']].forEach(id => expect(cleanId(id)).toBeUndefined());
  });
});

describe('isHexColor / cleanTimestamp / cleanNumber', () => {
  test('hex colors must be #rrggbb', () => {
    expect(isHexColor('#a1B2c3')).toBe(true);
    ['#fff', 'red', '#12345', '#1234567', 'url(x)', '#12345g', `#000000;" onmouseover="x`, null, 5].forEach(v => {
      expect(isHexColor(v)).toBe(false);
    });
  });

  test('timestamps must be strict ISO-8601, not whatever Date.parse tolerates', () => {
    ['2026-10-06', '2026-10-06T12:30', '2026-10-06T12:30:15Z', '2026-10-06T12:30:15.123Z', '2026-10-06T12:30:15+02:00'].forEach(v => {
      expect(cleanTimestamp(v)).toBe(v);
    });
    ['Tue Oct 06 2026', 'foo 2026', EVIL, '2026-13-45T99:99', '', null, 17].forEach(v => {
      expect(cleanTimestamp(v)).toBeUndefined();
    });
  });

  test('numbers: accepts finite numeric values and numeric strings, rounds to cents', () => {
    expect(cleanNumber(12.345)).toBe(12.35);
    expect(cleanNumber('1450')).toBe(1450);
    expect(cleanNumber(0)).toBe(0);
    expect(cleanNumber(7.9, { integer: true })).toBe(7);
  });

  test('numbers: rejects NaN, Infinity, negatives, oversize values and junk', () => {
    [NaN, Infinity, -1, 1e12, '', '  ', 'abc', EVIL, null, undefined, {}, []].forEach(v => {
      expect(cleanNumber(v)).toBeUndefined();
    });
  });
});

describe('normalizeWorkOrders', () => {
  const good = {
    id: 'wo-1', property: 'Maple St', unit: '2B', tenant: 'Maya', title: 'Leaky faucet',
    notes: 'Drip under sink', priority: 'high', status: 'scheduled', assignee: 'Alex',
    vendor: 'Ace', dueDate: '2026-11-01', cost: 120.5,
    createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z',
  };

  test('a well-formed order passes through unchanged with nothing repaired', () => {
    const { items, stats } = normalizeWorkOrders([good]);
    expect(items).toEqual([good]);
    expect(stats).toEqual({ kept: 1, dropped: 0, repaired: 0 });
  });

  test('unknown status/priority fall back to safe defaults and count as repaired', () => {
    const { items, stats } = normalizeWorkOrders([{ ...good, status: EVIL, priority: EVIL }]);
    expect(items[0].status).toBe('submitted');
    expect(items[0].priority).toBe('medium');
    expect(stats.repaired).toBe(1);
  });

  test('hostile ids are replaced with safe generated ones', () => {
    const { items } = normalizeWorkOrders([{ ...good, id: EVIL }]);
    expect(cleanId(items[0].id)).toBe(items[0].id);
    expect(items[0].id).not.toContain('<');
  });

  test('duplicate ids are made unique', () => {
    const { items } = normalizeWorkOrders([good, { ...good, title: 'Second' }]);
    expect(new Set(items.map(i => i.id)).size).toBe(2);
  });

  test('orders without a title are dropped', () => {
    const { items, stats } = normalizeWorkOrders([{ ...good, title: '   ' }, { ...good, id: 'wo-2', title: undefined }, 'junk', null, 7]);
    expect(items).toHaveLength(0);
    expect(stats.dropped).toBe(5);
  });

  test('bad dates, costs and timestamps are reset; unknown fields are stripped', () => {
    const { items } = normalizeWorkOrders([{ ...good, dueDate: EVIL, cost: EVIL, createdAt: EVIL, extra: '<b>', __proto__: { x: 1 } }]);
    expect(items[0].dueDate).toBeNull();
    expect(items[0].cost).toBe(0);
    expect(items[0]).not.toHaveProperty('createdAt');
    expect(items[0]).not.toHaveProperty('extra');
  });

  test('optional timestamps are omitted, not replaced by empty placeholders', () => {
    const { items } = normalizeWorkOrders([{ id: 'wo-9', title: 'No dates' }]);
    expect(items[0]).not.toHaveProperty('createdAt');
    expect(items[0]).not.toHaveProperty('updatedAt');
  });

  test('text fields are length-capped', () => {
    const { items } = normalizeWorkOrders([{ ...good, title: 'x'.repeat(5000), notes: 'y'.repeat(9000) }]);
    expect(items[0].title).toHaveLength(LIMITS.workOrder.title);
    expect(items[0].notes).toHaveLength(LIMITS.workOrder.notes);
  });

  test('non-arrays produce an empty list', () => {
    [null, undefined, {}, 'x', 5].forEach(v => expect(normalizeWorkOrders(v).items).toEqual([]));
  });

  test('enforces the record cap', () => {
    const many = Array.from({ length: LIMITS.records.workOrders + 3 }, (_, i) => ({ ...good, id: `wo-${i}` }));
    const { items, stats } = normalizeWorkOrders(many);
    expect(items).toHaveLength(LIMITS.records.workOrders);
    expect(stats.dropped).toBe(3);
  });
});

describe('normalizePortfolio', () => {
  const property = { id: 'p1', name: 'Oak Duplex', units: 2, owner: 'Rivera LLC', notes: 'n', documentUrl: 'https://example.com/deed.pdf', createdAt: '2026-10-01T00:00:00.000Z' };
  const tenant = { id: 't1', name: 'Maya', propertyId: 'p1', unit: '2B', status: 'active', phone: '555', email: 'm@x.com', rent: 1450, leaseStart: '2026-01-01', leaseEnd: '2026-12-31', balanceDue: 450, documentUrl: 'https://example.com/lease.pdf', createdAt: '2026-10-01T00:00:00.000Z' };
  const vendor = { id: 'v1', name: 'Ace', trade: 'Plumbing', phone: '555', email: 'a@x.com', documentUrl: 'https://example.com/coi.pdf', createdAt: '2026-10-01T00:00:00.000Z' };

  test('well-formed records pass through unchanged', () => {
    const { portfolio, stats } = normalizePortfolio({ properties: [property], tenants: [tenant], vendors: [vendor] });
    expect(portfolio.properties).toEqual([property]);
    expect(portfolio.tenants).toEqual([tenant]);
    expect(portfolio.vendors).toEqual([vendor]);
    expect(stats.properties.repaired + stats.tenants.repaired + stats.vendors.repaired).toBe(0);
  });

  test('a link that only needs canonicalizing is not reported as a repair', () => {
    const { portfolio, stats } = normalizePortfolio({ properties: [{ ...property, documentUrl: 'https://example.com' }] });
    expect(portfolio.properties[0].documentUrl).toBe('https://example.com/');
    expect(stats.properties.repaired).toBe(0);
  });

  test('javascript:, data: and relative links are removed', () => {
    ['javascript:alert(1)', 'data:text/html,<script>1</script>', '/relative', 'ftp://x.test/f', EVIL].forEach(documentUrl => {
      const { portfolio, stats } = normalizePortfolio({ properties: [{ ...property, documentUrl }] });
      expect(portfolio.properties[0].documentUrl).toBe('');
      expect(stats.properties.repaired).toBe(1);
    });
  });

  test('a tenant keeps its propertyId only when that property exists', () => {
    const ok = normalizePortfolio({ properties: [property], tenants: [tenant] });
    expect(ok.portfolio.tenants[0].propertyId).toBe('p1');
    const dangling = normalizePortfolio({ properties: [], tenants: [tenant] });
    expect(dangling.portfolio.tenants[0].propertyId).toBe('');
    expect(dangling.stats.tenants.repaired).toBe(1);
    const hostile = normalizePortfolio({ properties: [property], tenants: [{ ...tenant, propertyId: EVIL }] });
    expect(hostile.portfolio.tenants[0].propertyId).toBe('');
  });

  test('tenant status, dates and money are validated', () => {
    const { portfolio } = normalizePortfolio({
      properties: [property],
      tenants: [{ ...tenant, status: EVIL, leaseStart: EVIL, leaseEnd: '2026-02-30', rent: EVIL, balanceDue: -5 }],
    });
    expect(portfolio.tenants[0]).toMatchObject({ status: 'active', leaseStart: '', leaseEnd: '', rent: 0, balanceDue: 0 });
  });

  test('records need a name', () => {
    const { portfolio, stats } = normalizePortfolio({ properties: [{ ...property, name: '' }], tenants: [{ ...tenant, name: null }], vendors: [{ ...vendor, name: {} }] });
    expect(portfolio.properties).toEqual([]);
    expect(portfolio.tenants).toEqual([]);
    expect(portfolio.vendors).toEqual([]);
    expect(stats.properties.dropped + stats.tenants.dropped + stats.vendors.dropped).toBe(3);
  });

  test('missing or malformed input yields an empty portfolio', () => {
    [null, undefined, 'x', [], 7].forEach(v => {
      expect(normalizePortfolio(v).portfolio).toEqual({ properties: [], tenants: [], vendors: [] });
    });
  });
});

describe('normalizeTeam / normalizeEmployee', () => {
  test('keeps valid employees as-is', () => {
    const emp = { name: 'Maria', hex: '#336699', affinities: ['leasing', 'maintenance'] };
    const { team, stats } = normalizeTeam({ employees: [emp] });
    expect(team.employees).toEqual([emp]);
    expect(stats).toEqual({ kept: 1, dropped: 0, repaired: 0 });
  });

  test('reserved names are rejected case-insensitively', () => {
    ['UNOWNED', 'unowned', 'Unassigned', ' UNOWNED '].forEach(name => {
      expect(normalizeEmployee({ name, hex: '#000000', affinities: [] })).toBeNull();
    });
  });

  test('duplicate names (case-insensitive) keep only the first', () => {
    const { team, stats } = normalizeTeam({ employees: [{ name: 'Maria' }, { name: 'maria' }, { name: 'MARIA ' }] });
    expect(team.employees.map(e => e.name)).toEqual(['Maria']);
    expect(stats.dropped).toBe(2);
  });

  test('invalid colors fall back to a safe gray and count as repaired', () => {
    const { team, stats } = normalizeTeam({ employees: [{ name: 'A', hex: EVIL, affinities: [] }] });
    expect(team.employees[0].hex).toBe('#607d8b');
    expect(stats.repaired).toBe(1);
  });

  test('affinities are filtered to well-formed, known, unique department ids', () => {
    const emp = normalizeEmployee(
      { name: 'A', hex: '#000000', affinities: ['leasing', 'leasing', EVIL, 'Not Valid', 7, 'unknown-dept', 'maintenance'] },
      { knownDeptIds: ['leasing', 'maintenance'] },
    );
    expect(emp.affinities).toEqual(['leasing', 'maintenance']);
  });

  test('names are capped at 60 characters', () => {
    expect(normalizeEmployee({ name: 'x'.repeat(200) }).name).toHaveLength(LIMITS.employeeName);
  });

  test('enforces the roster cap and ignores junk', () => {
    const many = Array.from({ length: LIMITS.records.employees + 5 }, (_, i) => ({ name: `Emp ${i}` }));
    expect(normalizeTeam({ employees: many }).team.employees).toHaveLength(LIMITS.records.employees);
    expect(normalizeTeam({ employees: [null, 5, 'x', []] }).team.employees).toEqual([]);
    expect(normalizeTeam(null).team.employees).toEqual([]);
  });
});

describe('normalizeSavedTask', () => {
  const base = { name: 'Follow up on listings', owner: 'Maria' };

  test('requires a name and an owner', () => {
    [null, undefined, 'x', [], {}, { name: 'a' }, { owner: 'b' }, { name: '  ', owner: 'b' }, { name: 'a', owner: '' }].forEach(v => {
      expect(normalizeSavedTask(v)).toBeNull();
    });
  });

  test('only valid enum values are applied; missing fields are left out', () => {
    expect(normalizeSavedTask({ ...base, status: 'done', priority: 'low' })).toMatchObject({ status: 'done', priority: 'low' });
    const patch = normalizeSavedTask({ ...base, status: EVIL, priority: EVIL });
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('priority');
  });

  test('fill mode resets absent/invalid fields to defaults (backup restore)', () => {
    expect(normalizeSavedTask({ ...base, status: EVIL }, { fill: true })).toMatchObject({
      status: 'todo', priority: 'medium', dueDate: null, blockedBy: null, notes: null, customFields: null,
    });
  });

  test('due dates must be real ISO dates', () => {
    expect(normalizeSavedTask({ ...base, dueDate: '2026-11-05' }).dueDate).toBe('2026-11-05');
    expect(normalizeSavedTask({ ...base, dueDate: '2026-02-30' }).dueDate).toBeNull();
    expect(normalizeSavedTask({ ...base, dueDate: EVIL }).dueDate).toBeNull();
  });

  test('notes are capped and cleaned; custom fields are shape-checked', () => {
    expect(normalizeSavedTask({ ...base, notes: 'n'.repeat(5000) }).notes).toHaveLength(LIMITS.taskNotes);
    const patch = normalizeSavedTask({ ...base, customFields: { 'PO #': '123', bad: 5, [EVIL.slice(0, 10)]: 'x' } });
    expect(patch.customFields).toMatchObject({ 'PO #': '123' });
    expect(patch.customFields).not.toHaveProperty('bad');
  });
});

describe('normalizeBlockedBy / normalizeCustomFields', () => {
  test('blockedBy needs a well-formed department id and task key', () => {
    expect(normalizeBlockedBy({ deptId: 'leasing', configName: 'Task A', name: 'Task A' })).toEqual({ deptId: 'leasing', configName: 'Task A', name: 'Task A' });
    expect(normalizeBlockedBy({ deptId: EVIL, configName: 'x', name: 'y' })).toBeNull();
    expect(normalizeBlockedBy({ deptId: 'leasing', configName: '', name: 'y' })).toBeNull();
    expect(normalizeBlockedBy('leasing')).toBeNull();
    expect(normalizeBlockedBy(null)).toBeNull();
  });

  test('custom fields: max 10 entries, capped keys/values, prototype keys rejected', () => {
    const raw = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, 'v'.repeat(500)]));
    const cleaned = normalizeCustomFields(raw);
    expect(Object.keys(cleaned)).toHaveLength(LIMITS.customFieldCount);
    expect(Object.values(cleaned)[0]).toHaveLength(LIMITS.customFieldValue);
    const proto = normalizeCustomFields(JSON.parse('{"__proto__":"x","constructor":"y","ok":"z"}'));
    expect(proto).toEqual({ ok: 'z' });
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
  });

  test('empty or invalid custom fields become null', () => {
    [null, undefined, [], 'x', {}, { a: 1 }].forEach(v => expect(normalizeCustomFields(v)).toBeNull());
  });
});

describe('applySavedTasks', () => {
  const makeDepts = () => [
    { id: 'leasing', tasks: [{ _configName: 'List units', name: 'List units', owner: 'UNOWNED' }, { _configName: 'Show units', name: 'Show units', owner: 'UNOWNED', notes: 'old', customFields: { a: 'b' } }] },
  ];

  test('merges by _configName, even after the visible name was edited', () => {
    const depts = makeDepts();
    const result = applySavedTasks(depts, [{ id: 'leasing', tasks: [{ _configName: 'List units', name: 'Renamed', owner: 'Maria', status: 'done' }] }]);
    expect(depts[0].tasks[0]).toMatchObject({ name: 'Renamed', owner: 'Maria', status: 'done', _configName: 'List units' });
    expect(result).toEqual({ matched: 1, skipped: 0 });
  });

  test('applies notes and custom fields', () => {
    const depts = makeDepts();
    applySavedTasks(depts, [{ id: 'leasing', tasks: [{ _configName: 'List units', name: 'List units', owner: 'Maria', notes: 'call owner', customFields: { PO: '9' } }] }]);
    expect(depts[0].tasks[0]).toMatchObject({ notes: 'call owner', customFields: { PO: '9' } });
  });

  test('fill mode clears notes/customFields that the snapshot did not have', () => {
    const depts = makeDepts();
    applySavedTasks(depts, [{ id: 'leasing', tasks: [{ _configName: 'Show units', name: 'Show units', owner: 'Maria' }] }], { fill: true });
    expect(depts[0].tasks[1].notes).toBeNull();
    expect(depts[0].tasks[1].customFields).toBeNull();
  });

  test('counts unmatched and unusable rows as skipped; never throws on junk', () => {
    const depts = makeDepts();
    const result = applySavedTasks(depts, [
      { id: 'leasing', tasks: [{ _configName: 'Nope', name: 'x', owner: 'y' }, { name: '', owner: '' }, null] },
      { id: 'missing-dept', tasks: [] },
      null,
      { id: 5 },
    ]);
    expect(result.matched).toBe(0);
    expect(result.skipped).toBe(3);
    expect(applySavedTasks(depts, 'not-an-array')).toEqual({ matched: 0, skipped: 0 });
  });

  test('hostile field values never reach the task', () => {
    const depts = makeDepts();
    applySavedTasks(depts, [{ id: 'leasing', tasks: [{ _configName: 'List units', name: 'x', owner: 'y', status: EVIL, priority: EVIL, dueDate: EVIL, blockedBy: { deptId: EVIL, configName: EVIL } }] }]);
    const task = depts[0].tasks[0];
    expect(task.status).toBeUndefined();
    expect(task.priority).toBeUndefined();
    expect(task.dueDate).toBeNull();
    expect(task.blockedBy).toBeNull();
  });
});

describe('audit log', () => {
  const entry = { ts: '2026-10-06T10:00:00.000Z', action: 'owner_changed', dept: 'Leasing', task: 'List units', from: 'UNOWNED', to: 'Maria' };

  test('valid entries pass through', () => {
    expect(normalizeAuditEntry(entry)).toEqual(entry);
    expect(normalizeAuditEntry({ ts: entry.ts, action: 'auto_assign', count: 12 })).toEqual({ ts: entry.ts, action: 'auto_assign', count: 12 });
  });

  test('entries need a real timestamp and a plain action id', () => {
    [null, 'x', {}, { ...entry, ts: EVIL }, { ...entry, action: EVIL }, { ...entry, action: '' }].forEach(v => {
      expect(normalizeAuditEntry(v)).toBeNull();
    });
  });

  test('a non-numeric count is dropped so it can never be rendered as markup', () => {
    expect(normalizeAuditEntry({ ts: entry.ts, action: 'auto_assign', count: EVIL })).not.toHaveProperty('count');
  });

  test('log is filtered and capped', () => {
    expect(normalizeAuditLog([entry, null, 'x', entry], 1)).toHaveLength(1);
    expect(normalizeAuditLog('nope')).toEqual([]);
  });
});

describe('sanitizeWorkspace', () => {
  test('absent sections come back null so callers leave them alone', () => {
    const result = sanitizeWorkspace({ company: 'Acme' });
    expect(result).toMatchObject({ company: 'Acme', team: null, workOrders: null, portfolio: null });
  });

  test('company name is cleaned and capped', () => {
    expect(normalizeCompany('x'.repeat(200))).toHaveLength(LIMITS.company);
    expect(normalizeCompany(null)).toBe('');
    expect(normalizeCompany('a\u0000b')).toBe('ab');
  });

  test('reports aggregate stats per section', () => {
    const result = sanitizeWorkspace({
      team: { employees: [{ name: 'A', hex: EVIL }, { name: 'UNOWNED' }] },
      workOrders: [{ title: 'ok' }, { title: '' }],
      portfolio: { properties: [{ name: 'P', documentUrl: 'javascript:1' }] },
    });
    expect(result.stats.employees).toMatchObject({ kept: 1, dropped: 1, repaired: 1 });
    expect(result.stats.workOrders).toMatchObject({ kept: 1, dropped: 1 });
    expect(result.stats.properties).toMatchObject({ kept: 1, repaired: 1 });
  });

  test('null / garbage input does not throw', () => {
    [null, undefined, 5, 'x', []].forEach(v => expect(() => sanitizeWorkspace(v)).not.toThrow());
  });
});

describe('legitimate data is never altered', () => {
  test('the demo workspace passes through with nothing repaired or dropped', () => {
    const demo = buildDemoWorkspace(new Date('2026-10-06T12:00:00.000Z'));
    const clean = sanitizeWorkspace(demo, { knownDeptIds: config.orgData.departments.map(d => d.id) });
    Object.entries(clean.stats).forEach(([section, stat]) => {
      expect(stat, section).toMatchObject({ dropped: 0, repaired: 0 });
    });
    expect(clean.portfolio.properties[0]).toMatchObject(demo.portfolio.properties[0]);
    expect(clean.portfolio.tenants[0]).toMatchObject(demo.portfolio.tenants[0]);
    expect(clean.portfolio.vendors[0]).toMatchObject(demo.portfolio.vendors[0]);
    expect(clean.workOrders[0]).toEqual(demo.workOrders[0]);
  });

  test('every role template roster survives intact', async () => {
    const { ROLE_TEMPLATES } = await import('../templates.js');
    const knownDeptIds = config.orgData.departments.map(d => d.id);
    Object.entries(ROLE_TEMPLATES).forEach(([id, template]) => {
      const { team, stats } = normalizeTeam({ employees: template.employees }, { knownDeptIds });
      expect(team.employees, id).toEqual(template.employees);
      expect(stats, id).toMatchObject({ dropped: 0, repaired: 0 });
    });
  });
});
