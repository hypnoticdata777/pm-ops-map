import { describe, test, expect } from 'vitest';
import config from '../../config.json';

const { orgData, ownerColors, defaultAffinities } = config;

describe('orgData', () => {
  test('has a departments array with entries', () => {
    expect(Array.isArray(orgData.departments)).toBe(true);
    expect(orgData.departments.length).toBeGreaterThan(0);
  });

  test('every department has required fields', () => {
    orgData.departments.forEach((dept) => {
      expect(typeof dept.id).toBe('string');
      expect(typeof dept.name).toBe('string');
      expect(typeof dept.color).toBe('string');
      expect(Array.isArray(dept.tasks)).toBe(true);
    });
  });

  test('every task has a name and owner', () => {
    orgData.departments.forEach((dept) => {
      dept.tasks.forEach((task) => {
        expect(typeof task.name).toBe('string');
        expect(task.name.length).toBeGreaterThan(0);
        expect(typeof task.owner).toBe('string');
        expect(task.owner.length).toBeGreaterThan(0);
      });
    });
  });

  test('department ids are unique', () => {
    const ids = orgData.departments.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every task ships UNOWNED — the starter config carries no real names', () => {
    orgData.departments.forEach((dept) => {
      dept.tasks.forEach((task) => {
        expect(task.owner).toBe('UNOWNED');
      });
    });
  });
});

describe('ownerColors', () => {
  test('is a non-empty object', () => {
    expect(typeof ownerColors).toBe('object');
    expect(Object.keys(ownerColors).length).toBeGreaterThan(0);
  });

  test('every entry has a class and hex value', () => {
    Object.entries(ownerColors).forEach(([owner, value]) => {
      expect(typeof value.class).toBe('string');
      expect(value.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  test('includes UNOWNED entry', () => {
    expect(ownerColors).toHaveProperty('UNOWNED');
  });
});

describe('defaultAffinities', () => {
  test('is an object', () => {
    // Ships empty by default — the starter config has no pre-assigned team,
    // so there are no sample owners to attach affinities to.
    expect(typeof defaultAffinities).toBe('object');
    expect(defaultAffinities).not.toBeNull();
  });

  test('every affinity value is an array of department id strings', () => {
    const deptIds = new Set(orgData.departments.map(d => d.id));
    Object.entries(defaultAffinities).forEach(([owner, ids]) => {
      expect(Array.isArray(ids)).toBe(true);
      ids.forEach(id => {
        expect(typeof id).toBe('string');
        expect(deptIds.has(id)).toBe(true);
      });
    });
  });

  test('affinity owners exist in ownerColors', () => {
    Object.keys(defaultAffinities).forEach(owner => {
      expect(ownerColors).toHaveProperty(owner);
    });
  });
});
