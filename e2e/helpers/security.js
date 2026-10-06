// Shared helpers for the browser security regression suite.
//
// Strategy: put a uniquely-tagged canary payload into EVERY field a hostile
// import file, Team Sync server, or pasted clipboard can set, render every view,
// and then look for the three ways a payload can win:
//   1. injected markup      -> an element carrying the canary's data-pwn attribute
//   2. a broken-out handler -> an inline on* attribute that no longer parses as the
//                              plain call the template intended, or that mentions
//                              the canary's assignment
//   3. executed script      -> window.__pwn was set
// The tag in each payload tells us exactly which field/sink failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizer, parse } from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

// Breaks out of a double-quoted attribute, a single-quoted attribute, plain
// text, and (via the HTML entity) a JS string inside an attribute.
// Kept under 60 chars so length caps (employee names) don't strip the tail.
export const evil = tag => `"'><img data-pwn=${tag} src=x>&quot;);__pwn=1;//`;

const dept = id => config.orgData.departments.find(d => d.id === id);
const task = (deptId, i) => dept(deptId).tasks[i];

/** A schema-valid export in which every free-form field is hostile. */
export function buildEvilWorkspace() {
  const t0 = task('leasing', 0);
  const t1 = task('leasing', 1);
  const t2 = task('maintenance', 0);
  const t3 = task('accounting', 0);
  return {
    schema: 'pm-ops-map-state',
    schemaVersion: 2,
    app: 'PM Ops Map',
    company: evil('company'),
    exported: new Date().toISOString(),
    departments: [
      {
        id: 'leasing',
        name: 'Leasing',
        tasks: [
          {
            _configName: t0.name, name: evil('task.name'), owner: evil('emp.name'),
            status: evil('task.status'), priority: evil('task.priority'),
            dueDate: evil('task.due'),
            blockedBy: { deptId: evil('dep.dept'), configName: evil('dep.cfg'), name: evil('dep.name') },
          },
          {
            _configName: t1.name, name: t1.name, owner: evil('emp.name'),
            status: 'blocked', priority: 'high', dueDate: '2020-01-01',
            blockedBy: { deptId: 'leasing', configName: t0.name, name: evil('dep.ok.name') },
          },
        ],
      },
      { id: 'maintenance', name: 'Maintenance', tasks: [{ _configName: t2.name, name: t2.name, owner: 'Plain Person', status: 'todo', priority: 'medium' }] },
      { id: 'accounting', name: 'Accounting', tasks: [{ _configName: t3.name, name: t3.name, owner: 'UNOWNED', status: 'todo', priority: 'low' }] },
    ],
    team: {
      employees: [
        { name: evil('emp.name'), hex: evil('emp.hex'), affinities: [evil('emp.aff'), 'leasing'] },
        { name: 'Plain Person', hex: '#336699', affinities: ['maintenance'] },
      ],
    },
    workOrders: [
      {
        id: evil('wo.id'), property: evil('wo.property'), unit: evil('wo.unit'), tenant: evil('wo.tenant'),
        title: evil('wo.title'), notes: evil('wo.notes'), status: evil('wo.status'), priority: evil('wo.priority'),
        assignee: evil('wo.assignee'), vendor: evil('wo.vendor'), dueDate: evil('wo.due'),
        cost: evil('wo.cost'), createdAt: evil('wo.created'), updatedAt: evil('wo.updated'),
      },
      // A second, well-formed order so board columns/summary also render normally.
      { id: 'wo-good-1', property: 'Maple St', unit: '2', title: 'Leaky faucet', status: 'scheduled', priority: 'high', assignee: 'Plain Person', createdAt: new Date().toISOString() },
    ],
    portfolio: {
      properties: [
        { id: evil('prop.id'), name: evil('prop.name'), units: evil('prop.units'), owner: evil('prop.owner'), notes: evil('prop.notes'), documentUrl: evil('prop.url'), createdAt: evil('prop.created') },
      ],
      tenants: [
        {
          id: evil('ten.id'), name: evil('ten.name'), propertyId: evil('ten.prop'), unit: evil('ten.unit'),
          status: evil('ten.status'), phone: evil('ten.phone'), email: evil('ten.email'), rent: evil('ten.rent'),
          leaseStart: evil('ten.ls'), leaseEnd: evil('ten.le'), balanceDue: evil('ten.bal'),
          documentUrl: `javascript:__pwn=1//${evil('ten.url')}`, createdAt: evil('ten.created'),
        },
      ],
      vendors: [
        { id: evil('ven.id'), name: evil('ven.name'), trade: evil('ven.trade'), phone: evil('ven.phone'), email: evil('ven.email'), documentUrl: `http://example.com/${evil('ven.url')}`, createdAt: evil('ven.created') },
      ],
    },
  };
}

/** Skip first-run UI and make window.__pwn observable before app code runs. */
export async function prepare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pm-ops-company-name', 'Security Test Co');
      localStorage.setItem('pm-ops-guide-dismissed', '1');
    } catch (_) { /* storage unavailable */ }
  });
}

/** Import a workspace through the real "Import JSON" UI path, confirming the review modal. */
export async function importWorkspace(page, workspace, tmpDir) {
  const file = path.join(tmpDir, `evil-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(workspace));
  await page.setInputFiles('#import-file-input', file);
  await page.waitForSelector('#import-review-modal.visible');
  await page.click('#import-confirm-btn');
  await page.waitForSelector('#import-review-modal.visible', { state: 'hidden' });
}

/** Scan the live DOM. Returns a list of human-readable findings (empty = clean). */
export async function scan(page, where) {
  const dom = await page.evaluate(() => {
    const injected = [...document.querySelectorAll('[data-pwn]')].map(el => `${el.tagName.toLowerCase()}[data-pwn=${el.getAttribute('data-pwn')}]`);
    const handlers = [];
    document.querySelectorAll('*').forEach(el => {
      for (const attr of el.attributes) {
        if (/^on/i.test(attr.name)) handlers.push({ tag: el.tagName.toLowerCase(), name: attr.name, value: attr.value });
      }
    });
    return { executed: window.__pwn !== undefined, injected, handlers };
  });

  const findings = [];
  if (dom.executed) findings.push(`${where}: payload EXECUTED (window.__pwn set)`);
  dom.injected.forEach(i => findings.push(`${where}: injected markup ${i}`));

  for (const h of dom.handlers) {
    let broken = null;
    try {
      parse(h.value, { ecmaVersion: 2022 });
      for (const tok of tokenizer(h.value, { ecmaVersion: 2022 })) {
        if (tok.type.label === 'name' && tok.value === '__pwn') { broken = 'contains canary assignment'; break; }
      }
    } catch (e) {
      broken = `does not parse (${e.message})`;
    }
    if (broken) findings.push(`${where}: <${h.tag} ${h.name}="${h.value.slice(0, 90)}"> ${broken}`);
  }
  return findings;
}

/** Evaluate a window function by name (the app exposes its handlers globally). */
export const call = (page, fn, ...args) => page.evaluate(([name, a]) => window[name](...a), [fn, args]);

/** Fire hover/click style events on every element matching a selector. */
export async function poke(page, selector, events = ['mouseover', 'mouseenter', 'mousemove', 'click', 'focus']) {
  await page.evaluate(([sel, evs]) => {
    document.querySelectorAll(sel).forEach(el => {
      evs.forEach(type => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, shiftKey: false })));
    });
  }, [selector, events]);
}
