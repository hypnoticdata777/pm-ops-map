import { describe, test, expect } from 'vitest';
import { parseVersionedState, parseVersionInfo, parsePushResult, SyncResponseError } from '../syncEnvelope.js';

const bad = (fn, pattern) => {
  let err;
  try { fn(); } catch (e) { err = e; }
  expect(err, 'should have thrown').toBeInstanceOf(SyncResponseError);
  expect(err.message).toMatch(pattern);
};

describe('parseVersionedState (pull responses and 409 "current" payloads)', () => {
  test('accepts a well-formed response and returns only the fields the client uses', () => {
    const r = parseVersionedState({ state: { company: 'Acme' }, version: 3, updatedAt: '2026-01-02T03:04:05.000Z', extra: 'ignored' });
    expect(r).toEqual({ state: { company: 'Acme' }, version: 3, updatedAt: '2026-01-02T03:04:05.000Z' });
  });

  test('a missing or unparsable updatedAt becomes an empty string, never a crash', () => {
    expect(parseVersionedState({ state: {}, version: 1 }).updatedAt).toBe('');
    expect(parseVersionedState({ state: {}, version: 1, updatedAt: '<img src=x>' }).updatedAt).toBe('');
  });

  test('rejects non-objects (a 200 with an HTML or empty body parses to null)', () => {
    [null, undefined, 'ok', 5, [], true].forEach(body => bad(() => parseVersionedState(body), /not a JSON object/));
  });

  test('rejects a state that is not an object', () => {
    [undefined, null, 'x', 4, [], [{}]].forEach(state => bad(() => parseVersionedState({ state, version: 1 }), /"state" must be an object/));
  });

  test('rejects versions that are not non-negative whole numbers', () => {
    [undefined, '3', -1, 1.5, NaN, Infinity, null, 2 ** 60].forEach(version => bad(() => parseVersionedState({ state: {}, version }), /"version" must be a whole number/));
  });
});

describe('parseVersionInfo and parsePushResult', () => {
  test('version info needs just a version', () => {
    expect(parseVersionInfo({ version: 7, updatedAt: '2026-01-02T03:04:05Z' })).toEqual({ version: 7, updatedAt: '2026-01-02T03:04:05Z' });
    bad(() => parseVersionInfo({}), /"version" must be a whole number/);
    bad(() => parseVersionInfo(null), /not a JSON object/);
  });

  test('push result needs a version and reports whether the workspace was created', () => {
    expect(parsePushResult({ version: 1, updatedAt: '2026-01-02T03:04:05Z', created: true })).toEqual({ version: 1, updatedAt: '2026-01-02T03:04:05Z', created: true });
    expect(parsePushResult({ version: 2 }).created).toBe(false);
    bad(() => parsePushResult({ version: 'two' }), /"version" must be a whole number/);
  });
});
