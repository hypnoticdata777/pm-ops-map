import { describe, test, expect, vi } from 'vitest';
import {
  createCommit, whenViewIs, commit, PERSIST_TARGETS, REFRESH_STEPS,
  REFRESH_AFTER_TASK_CHANGE, REFRESH_AFTER_IMPORT, REFRESH_AFTER_ROSTER_CHANGE, REFRESH_AFTER_TEMPLATE, REFRESH_AFTER_DEMO_COMPANY,
} from '../commit.js';

function harness() {
  const calls = [];
  const spy = name => vi.fn(() => { calls.push(name); });
  const savers = { tasks: spy('save:tasks'), team: spy('save:team'), workOrders: spy('save:workOrders'), portfolio: spy('save:portfolio') };
  const refreshers = { tracking: spy('tracking'), stats: spy('stats'), legend: spy('legend') };
  return { calls, savers, refreshers, commit: createCommit({ savers, refreshers }) };
}

describe('createCommit', () => {
  test('saves first, then refreshes, each in exactly the order given', () => {
    const h = harness();
    h.commit({ persist: ['team', 'tasks'], refresh: ['legend', 'tracking', 'stats'] });
    expect(h.calls).toEqual(['save:team', 'save:tasks', 'legend', 'tracking', 'stats']);
  });

  test('a step listed once runs once', () => {
    const h = harness();
    h.commit({ persist: ['tasks'], refresh: ['stats'] });
    Object.values({ ...h.savers, ...h.refreshers }).forEach(fn => expect(fn.mock.calls.length).toBeLessThanOrEqual(1));
  });

  test('persist-only and refresh-only commits are fine, and so is an empty one', () => {
    const h = harness();
    h.commit({ persist: ['tasks'] });
    h.commit({ refresh: ['stats'] });
    h.commit();
    h.commit({});
    expect(h.calls).toEqual(['save:tasks', 'stats']);
  });

  test('an unknown step is rejected BEFORE anything runs, naming the typo and the valid choices', () => {
    const h = harness();
    expect(() => h.commit({ persist: ['tasks'], refresh: ['trackng'] })).toThrow(/unknown refresh step "trackng".*tracking/s);
    expect(() => h.commit({ persist: ['taks'], refresh: ['stats'] })).toThrow(/unknown persist target "taks".*tasks/s);
    expect(h.calls).toEqual([]);
  });

  test('a failing step stops the rest (and what already ran stays run)', () => {
    const h = harness();
    h.refreshers.stats.mockImplementation(() => { throw new Error('boom'); });
    expect(() => h.commit({ persist: ['tasks'], refresh: ['stats', 'legend'] })).toThrow('boom');
    expect(h.calls).toEqual(['save:tasks']);
  });
});

describe('whenViewIs', () => {
  test('runs the step only while the user is on that view, checked at call time', () => {
    let view = 'tracking';
    const step = vi.fn();
    const guarded = whenViewIs(() => view, 'map', step);
    guarded();
    expect(step).not.toHaveBeenCalled();
    view = 'map';
    guarded();
    expect(step).toHaveBeenCalledTimes(1);
  });
});

describe('the real wiring', () => {
  test('persist targets are the four things the app saves', () => {
    expect([...PERSIST_TARGETS].sort()).toEqual(['portfolio', 'tasks', 'team', 'workOrders']);
  });

  test('every refresh step the shared presets use exists', () => {
    [REFRESH_AFTER_TASK_CHANGE, REFRESH_AFTER_IMPORT, REFRESH_AFTER_ROSTER_CHANGE, REFRESH_AFTER_TEMPLATE, REFRESH_AFTER_DEMO_COMPANY]
      .flat().forEach(step => expect(REFRESH_STEPS, step).toContain(step));
  });

  test('the presets are the lists the old copy-pasted blocks used, in the same order', () => {
    expect(REFRESH_AFTER_TASK_CHANGE).toEqual(['tracking', 'stats', 'ownerFilter', 'legend', 'mapIfCurrent', 'teamIfCurrent']);
    expect(REFRESH_AFTER_IMPORT).toEqual(['tracking', 'stats', 'expandDepartments', 'ownerFilter', 'legend', 'portfolio']);
    expect(REFRESH_AFTER_ROSTER_CHANGE).toEqual(['team', 'tracking', 'stats', 'legend', 'ownerFilter', 'workOrdersIfCurrent', 'workOrderBeacon', 'mapIfCurrent']);
    expect(REFRESH_AFTER_TEMPLATE).toEqual(['team', 'tracking', 'stats', 'legend', 'ownerFilter', 'workOrderBeacon']);
    expect(REFRESH_AFTER_DEMO_COMPANY).toEqual(['launchPlan', 'tracking', 'ownerFilter', 'legend', 'stats']);
  });

  test('the shared commit rejects a typo too', () => {
    expect(() => commit({ refresh: ['nope'] })).toThrow(/unknown refresh step/);
  });
});
