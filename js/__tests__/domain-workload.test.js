import { describe, test, expect } from 'vitest';
import { UNOWNED, isUnowned, buildWorkloadMap, countUnowned } from '../domain/workload.js';

const dept = (id, owners) => ({ id, name: id, color: '#000000', tasks: owners.map((owner, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, owner })) });
const people = (...names) => names.map(name => ({ name, hex: '#336699', affinities: [] }));

describe('isUnowned', () => {
  test('only the literal UNOWNED marker means unowned', () => {
    expect(UNOWNED).toBe('UNOWNED');
    expect(isUnowned({ owner: 'UNOWNED' })).toBe(true);
    ['Maria', '', 'unowned', 'UNASSIGNED'].forEach(owner => expect(isUnowned({ owner }), owner).toBe(false));
  });
});

describe('buildWorkloadMap', () => {
  test('everyone on the roster starts at 0, even with no tasks', () => {
    expect([...buildWorkloadMap([], people('Ann', 'Bob')).entries()]).toEqual([['Ann', 0], ['Bob', 0]]);
  });

  test('counts owned tasks per owner across departments and ignores UNOWNED', () => {
    const map = buildWorkloadMap([dept('a', ['Ann', 'UNOWNED', 'Ann']), dept('b', ['Bob', 'Ann'])], people('Ann', 'Bob'));
    expect(Object.fromEntries(map)).toEqual({ Ann: 3, Bob: 1 });
  });

  test('an owner who is not on the roster is still counted (their work is real)', () => {
    const map = buildWorkloadMap([dept('a', ['Ghost', 'Ann'])], people('Ann'));
    expect(Object.fromEntries(map)).toEqual({ Ann: 1, Ghost: 1 });
  });

  test('iteration order is roster order, then first appearance: the team view sorts ties by it', () => {
    const map = buildWorkloadMap([dept('a', ['Zed', 'Ghost', 'Amy'])], people('Mia', 'Amy', 'Zed'));
    expect([...map.keys()]).toEqual(['Mia', 'Amy', 'Zed', 'Ghost']);
  });

  test('does not modify its inputs', () => {
    const departments = [dept('a', ['Ann', 'UNOWNED'])];
    const employees = people('Ann');
    const before = JSON.stringify({ departments, employees });
    buildWorkloadMap(departments, employees);
    expect(JSON.stringify({ departments, employees })).toBe(before);
  });
});

describe('countUnowned', () => {
  test('counts UNOWNED tasks across all departments', () => {
    expect(countUnowned([dept('a', ['UNOWNED', 'Ann']), dept('b', ['UNOWNED', 'UNOWNED'])])).toBe(3);
  });
  test('is 0 for no departments or nothing unowned', () => {
    expect(countUnowned([])).toBe(0);
    expect(countUnowned([dept('a', ['Ann'])])).toBe(0);
  });
});
