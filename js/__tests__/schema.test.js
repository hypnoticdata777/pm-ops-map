import { describe, test, expect } from 'vitest';
import {
  line, text, choice, date, optionalDate, stamp, url, money, count,
  validateRecord, validateCollection, shorten,
} from '../schema.js';

const SPEC = {
  title: { ...line(20), required: true },
  priority: choice(['low', 'medium', 'high'], 'medium'),
  dueDate: date(null),
  cost: money(0),
  link: url(),
  seen: stamp(),
};
const EVIL = '"><img src=x onerror=alert(1)>';

describe('validateRecord', () => {
  test('a clean record has no errors and is not "repaired"', () => {
    const r = validateRecord({ title: 'Fix sink', priority: 'high', dueDate: '2026-01-02', cost: 12.5, link: 'https://example.com' }, SPEC, { path: 'workOrders[0]' });
    expect(r.errors).toEqual([]);
    expect(r.repaired).toBe(false);
    expect(r.value).toMatchObject({ title: 'Fix sink', priority: 'high', dueDate: '2026-01-02', cost: 12.5 });
  });

  test('an unusable value falls back and the error names the exact field path', () => {
    const r = validateRecord({ title: 'Fix sink', priority: 'urgent!!', cost: 'lots' }, SPEC, { path: 'workOrders[2]', label: 'Work order 3 ("Fix sink")' });
    expect(r.value.priority).toBe('medium');
    expect(r.value.cost).toBe(0);
    expect(r.repaired).toBe(true);
    expect(r.errors.map(e => e.path)).toEqual(['workOrders[2].priority', 'workOrders[2].cost']);
    expect(r.errors[0]).toMatchObject({ code: 'invalid_value', field: 'priority' });
    expect(r.errors[0].message).toBe('Work order 3 ("Fix sink") — priority: "urgent!!" is not allowed; reset to "medium".');
  });

  test('absent optional fields are not errors; absent defaulted fields are not errors either', () => {
    const r = validateRecord({ title: 'x' }, SPEC, { path: 'p' });
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ priority: 'medium', dueDate: null, cost: 0, link: '' });
    expect(r.value).not.toHaveProperty('seen');
  });

  test('text that had to be cleaned or shortened is reported as adjusted, not invalid', () => {
    const r = validateRecord({ title: 'x'.repeat(50) }, SPEC, { path: 'p', label: 'Thing' });
    expect(r.value.title).toHaveLength(20);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ code: 'adjusted', field: 'title' });
    expect(r.errors[0].message).toMatch(/^Thing — title: /);
  });

  test('plain trimming and URL canonicalisation are not reported', () => {
    expect(validateRecord({ title: '  padded  ', link: 'https://example.com' }, SPEC, { path: 'p' }).errors).toEqual([]);
  });

  test('a missing required field drops the record and says which field', () => {
    const r = validateRecord({ priority: 'low' }, SPEC, { path: 'workOrders[4]', label: 'Work order 5' });
    expect(r.value).toBeNull();
    expect(r.errors).toEqual([expect.objectContaining({ path: 'workOrders[4].title', code: 'missing_required' })]);
    expect(r.errors[0].message).toBe('Work order 5 — title: required, so the record is skipped.');
  });

  test('non-objects are rejected with the record path', () => {
    [null, 5, 'x', [], undefined].forEach(bad => {
      const r = validateRecord(bad, SPEC, { path: 'workOrders[1]', label: 'Work order 2' });
      expect(r.value).toBeNull();
      expect(r.errors[0]).toMatchObject({ path: 'workOrders[1]', code: 'not_an_object' });
    });
  });

  test('hostile input is shortened, never executed or interpolated raw into a path', () => {
    const r = validateRecord({ title: 'ok', priority: EVIL.repeat(10) }, SPEC, { path: 'p' });
    expect(r.errors[0].message.length).toBeLessThan(160);
    expect(r.errors[0].path).toBe('p.priority');
  });
});

describe('shorten', () => {
  test('quotes strings, strips control characters, caps length', () => {
    expect(shorten('abc')).toBe('"abc"');
    expect(shorten('a\nb\u0000c')).toBe('"a b c"');
    expect(shorten('x'.repeat(100))).toBe(`"${'x'.repeat(40)}…"`);
    expect(shorten(42)).toBe('42');
    expect(shorten({ a: 1 })).toBe('an object');
    expect(shorten([1])).toBe('a list');
    expect(shorten(true)).toBe('true');
  });
});

describe('validateCollection', () => {
  const run = (list, extra = {}) => validateCollection(list, SPEC, { path: 'workOrders', noun: 'Work order', idPrefix: 'wo', max: 3, titleKey: 'title', ...extra });

  test('keeps good records, drops bad ones, and reports every problem by path', () => {
    const r = run([{ id: 'a', title: 'A' }, { id: 'b', priority: 'x' }, { id: 'c', title: 'C', priority: 'nope' }]);
    expect(r.items.map(i => i.title)).toEqual(['A', 'C']);
    expect(r.stats).toEqual({ kept: 2, dropped: 1, repaired: 1 });
    expect(r.errors.map(e => e.path)).toEqual(['workOrders[1].title', 'workOrders[2].priority']);
    expect(r.errors[1].message).toBe('Work order 3 ("C") — priority: "nope" is not allowed; reset to "medium".');
  });

  test('missing and duplicate ids are replaced and reported', () => {
    const r = run([{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }, { id: EVIL, title: 'C' }]);
    expect(new Set(r.items.map(i => i.id)).size).toBe(3);
    expect(r.errors.map(e => [e.path, e.code])).toEqual([['workOrders[1].id', 'duplicate_id'], ['workOrders[2].id', 'bad_id']]);
    expect(r.stats.repaired).toBe(2);
  });

  test('records past the limit are dropped and reported once per record', () => {
    const r = run([1, 2, 3, 4].map(n => ({ id: `t${n}`, title: `T${n}` })));
    expect(r.items).toHaveLength(3);
    expect(r.errors).toEqual([expect.objectContaining({ path: 'workOrders[3]', code: 'over_limit' })]);
  });

  test('the error list is capped but the omitted count is kept', () => {
    const r = validateCollection(Array.from({ length: 300 }, () => ({})), SPEC, { path: 'w', noun: 'W', idPrefix: 'w', max: 1000, titleKey: 'title' });
    expect(r.stats.dropped).toBe(300);
    expect(r.errors).toHaveLength(100);
    expect(r.omitted).toBe(200);
  });

  test('finish() can add its own errors', () => {
    const r = run([{ id: 'a', title: 'A' }], { finish: (rec, raw, ctx) => ({ value: rec, repaired: true, errors: [{ path: `${ctx.path}.x`, field: 'x', code: 'unknown_reference', message: 'custom' }] }) });
    expect(r.errors.map(e => e.message)).toEqual(['custom']);
    expect(r.stats.repaired).toBe(1);
  });

  test('a non-array input is an empty collection', () => {
    expect(run(undefined).items).toEqual([]);
    expect(run('x').errors).toEqual([]);
  });
});

describe('field builders', () => {
  test('count, text, optionalDate and stamp clean as before', () => {
    expect(count().clean('7')).toBe(7);
    expect(count().clean(-1)).toBeUndefined();
    expect(text(5).clean('abcdefgh\n')).toBe('abcde');
    expect(optionalDate().clean('2026-02-30')).toBeUndefined();
    expect(stamp().clean('not a time')).toBeUndefined();
  });
});
