// Copy fixes spotted on the live demo: grammar of the coverage risk, and the
// team card must not call the demo's fictional staff "real people".
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import config from '../../config.json';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

async function load(search = '') {
  history.pushState({}, '', `/${search}`);
  vi.resetModules();
  const [state, launchPlan] = await Promise.all([import('../state.js'), import('../launchPlan.js')]);
  const orgData = structuredClone(config.orgData);
  orgData.departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  state.setWorkOrders([]);
  state.setPortfolio({ properties: [], tenants: [], vendors: [] });
  state.setTeamData({ employees: [{ name: 'Dana Whitfield', hex: '#1976d2', affinities: ['leasing'] }] });
  return { state, launchPlan };
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();
});

describe('coverageRiskDetail', () => {
  test('one weak lane takes a singular verb', async () => {
    const { launchPlan } = await load();
    expect(launchPlan.coverageRiskDetail([{ label: 'Compliance' }])).toBe('Compliance needs clearer ownership.');
  });
  test('several weak lanes take a plural verb and are capped at three names', async () => {
    const { launchPlan } = await load();
    expect(launchPlan.coverageRiskDetail([{ label: 'A' }, { label: 'B' }])).toBe('A, B need clearer ownership.');
    expect(launchPlan.coverageRiskDetail(['A', 'B', 'C', 'D'].map(label => ({ label })))).toBe('A, B, C need clearer ownership.');
  });
});

describe('team roster card', () => {
  const rosterNote = () => [...document.querySelectorAll('.launch-metric, .launch-metrics-grid > *')]
    .find(el => /Team roster/i.test(el.textContent))?.textContent.replace(/\s+/g, ' ');

  test('a real workspace with its own team says "real people"', async () => {
    const { launchPlan } = await load();
    launchPlan.renderLaunchPlan();
    expect(rosterNote()).toMatch(/real people/);
  });

  test('the hosted demo says "fictional people" instead', async () => {
    const { launchPlan } = await load('?demo=1');
    launchPlan.renderLaunchPlan();
    expect(rosterNote()).toMatch(/fictional people/);
    expect(rosterNote()).not.toMatch(/real people/);
  });
});
