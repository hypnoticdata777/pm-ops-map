import { describe, test, expect } from 'vitest';
import config from '../../config.json';
import { CRITICAL_COVERAGE_AREAS, WEAK_COVERAGE_PCT, summarizeCoverage } from '../domain/coverage.js';

const dept = (id, owners, name = id.toUpperCase()) => ({ id, name, color: '#000000', tasks: owners.map((owner, i) => ({ id: `${id}-${i}`, name: `t${i}`, owner })) });
const area = (departments, extra = {}) => ({ id: 'x', label: 'X', detail: 'd', departments, ...extra });

describe('the critical coverage areas', () => {
  test('there are seven, with unique ids and labels, each naming at least one department', () => {
    expect(CRITICAL_COVERAGE_AREAS).toHaveLength(7);
    expect(new Set(CRITICAL_COVERAGE_AREAS.map(a => a.id)).size).toBe(7);
    expect(new Set(CRITICAL_COVERAGE_AREAS.map(a => a.label)).size).toBe(7);
    CRITICAL_COVERAGE_AREAS.forEach(a => {
      expect(a.departments.length, a.id).toBeGreaterThan(0);
      expect(a.detail, a.id).toBeTruthy();
    });
  });

  test('every department an area names exists in config.json (a typo would silently drop it)', () => {
    const known = new Set(config.orgData.departments.map(d => d.id));
    CRITICAL_COVERAGE_AREAS.forEach(a => a.departments.forEach(id => expect(known.has(id), `${a.id} -> ${id}`).toBe(true)));
  });

  test('the threshold below which an area counts as weak is 70%', () => {
    expect(WEAK_COVERAGE_PCT).toBe(70);
  });
});

describe('summarizeCoverage', () => {
  test('counts tasks and unowned tasks across the departments an area names', () => {
    const [r] = summarizeCoverage([dept('a', ['Ann', 'UNOWNED']), dept('b', ['UNOWNED', 'UNOWNED', 'Bob'])], [area(['a', 'b'])]);
    expect(r).toMatchObject({ taskCount: 5, unownedCount: 3, coveragePct: 40 });
  });

  test('"covered" means "not UNOWNED", and the percentage is rounded', () => {
    const [r] = summarizeCoverage([dept('a', ['Ann', 'Ann', 'UNOWNED'])], [area(['a'])]);
    expect(r.coveragePct).toBe(67); // 2 of 3
  });

  test('an area with no tasks is 0% covered with no named owner (not NaN)', () => {
    const [r] = summarizeCoverage([dept('a', [])], [area(['a'])]);
    expect(r).toMatchObject({ taskCount: 0, unownedCount: 0, coveragePct: 0, primaryOwners: 'No named owner' });
  });

  test('departments the area names but the workspace lacks are skipped, not an error', () => {
    const [r] = summarizeCoverage([dept('a', ['Ann'])], [area(['a', 'ghost'])]);
    expect(r).toMatchObject({ taskCount: 1, departmentNames: ['A'] });
  });

  test('primary owners: the three busiest, busiest first, ties in order of first appearance', () => {
    const owners = [...'AAAA', ...'BBB', ...'CC', ...'D', ...'E'].map(c => `P${c}`);
    const [r] = summarizeCoverage([dept('a', owners)], [area(['a'])]);
    expect(r.primaryOwners).toBe('PA, PB, PC');
    const [tie] = summarizeCoverage([dept('a', ['Zed', 'Amy', 'Mia'])], [area(['a'])]);
    expect(tie.primaryOwners).toBe('Zed, Amy, Mia');
  });

  test('all UNOWNED means no named owner', () => {
    expect(summarizeCoverage([dept('a', ['UNOWNED'])], [area(['a'])])[0].primaryOwners).toBe('No named owner');
  });

  test('keeps the area fields and adds the department names, in the order the area lists them', () => {
    const [r] = summarizeCoverage([dept('a', ['Ann'], 'Alpha'), dept('b', ['Bob'], 'Beta')], [area(['b', 'a'], { id: 'k', label: 'K', detail: 'why' })]);
    expect(r).toMatchObject({ id: 'k', label: 'K', detail: 'why', departments: ['b', 'a'], departmentNames: ['Beta', 'Alpha'] });
  });

  test('an owner in two of an area\'s departments is counted once per task, across both', () => {
    const [r] = summarizeCoverage([dept('a', ['Ann', 'Bob']), dept('b', ['Ann'])], [area(['a', 'b'])]);
    expect(r.primaryOwners).toBe('Ann, Bob');
  });

  test('uses the seven critical areas by default', () => {
    const rows = summarizeCoverage(config.orgData.departments.map(d => ({ ...d, tasks: d.tasks.map(t => ({ ...t, owner: 'UNOWNED' })) })));
    expect(rows.map(r => r.id)).toEqual(CRITICAL_COVERAGE_AREAS.map(a => a.id));
    rows.forEach(r => expect(r.coveragePct, r.id).toBe(0));
  });

  test('does not modify its inputs', () => {
    const departments = [dept('a', ['Ann', 'UNOWNED'])];
    const areas = [area(['a'])];
    const before = JSON.stringify({ departments, areas });
    summarizeCoverage(departments, areas);
    expect(JSON.stringify({ departments, areas })).toBe(before);
  });
});
