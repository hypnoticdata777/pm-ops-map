// Characterization of the Map & Review (tracking) screen, recorded BEFORE its inline handlers were replaced
// by data-action delegation (Phase 1C). Every step is a real click, double-click or keystroke on a visible
// control, and the snapshot reads the page and storage afterwards. Nothing here mentions onclick, data-action
// or window functions, so the same file must pass unchanged before and after the conversion.
import { test } from '@playwright/test';
import { prepare } from './helpers/security.js';
import { checkGolden } from './helpers/golden.js';

const FIXED_NOW = new Date('2026-10-06T12:00:00.000Z');
const TEAM = { employees: [
  { name: 'Maria', hex: '#336699', affinities: ['leasing'] },
  { name: 'Joe', hex: '#996633', affinities: ['maintenance'] },
] };

const row = (page, dept, idx) => page.locator(`.department[data-id="${dept}"] .task-item[data-task-idx="${idx}"]`);
const header = (page, dept) => page.locator(`.department[data-id="${dept}"] .department-header`);
async function open(page, dept) {
  if (!(await page.locator(`.department[data-id="${dept}"].expanded`).count())) await header(page, dept).click();
}

// What a person can see and what was saved. Deliberately blind to how the page is wired.
async function snap(page, label) {
  return { label, ...(await page.evaluate(() => {
    const text = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const hidden = el => (el?.style.display === 'none');
    const rowInfo = el => ({
      classes: [...el.classList].sort(),
      hidden: hidden(el),
      name: text(el.querySelector('.task-name')),
      nameEditing: Boolean(el.querySelector('.task-name-input')),
      priority: [...el.querySelector('.priority-dot').classList].find(c => c.startsWith('priority-') && c !== 'priority-dot'),
      priorityTitle: el.querySelector('.priority-dot').title,
      due: text(el.querySelector('.due-date-chip, .due-date-empty')),
      dueClass: el.querySelector('.due-date-chip, .due-date-empty').className,
      dep: text(el.querySelector('.dep-chip, .dep-add-btn')),
      depClass: el.querySelector('.dep-chip, .dep-add-btn').className,
      notesClass: el.querySelector('.task-notes-btn').className,
      notesTitle: el.querySelector('.task-notes-btn').title,
      fieldsClass: el.querySelector('.task-fields-btn').className,
      status: text(el.querySelector('.status-pill')),
      statusClass: el.querySelector('.status-pill').className,
      owner: text(el.querySelector('.task-owner')),
      checkbox: el.querySelector('.task-bulk-check') ? el.querySelector('.task-bulk-check').checked : null,
    });
    const tasks = [...document.querySelectorAll('.task-item')];
    const tally = key => tasks.reduce((acc, t) => { const v = t.dataset[key]; acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const stored = JSON.parse(localStorage.getItem('pm-ops-data-v1') || '[]');
    const keep = t => ({ name: t.name, owner: t.owner, status: t.status, priority: t.priority, dueDate: t.dueDate, blockedBy: t.blockedBy ? t.blockedBy.name : null, notes: t.notes, customFields: t.customFields });
    const bar = document.getElementById('bulk-action-bar');
    return {
      rows: ['leasing:0', 'leasing:1', 'maintenance:0'].map(k => { const [d, i] = k.split(':'); const el = document.querySelector(`.department[data-id="${d}"] .task-item[data-task-idx="${i}"]`); return [k, el ? rowInfo(el) : null]; }),
      // Only what differs from a freshly loaded screen, so the recording stays small enough to read.
      departments: (() => {
        const all = [...document.querySelectorAll('.department')];
        const pick = (keep, value) => Object.fromEntries(all.filter(keep).map(d => [d.dataset.id, value(d)]));
        return {
          total: all.length,
          expanded: all.filter(d => d.classList.contains('expanded')).map(d => d.dataset.id),
          hidden: all.filter(hidden).map(d => d.dataset.id),
          counts: pick(d => text(d.querySelector('.dept-task-count')) !== String(d.querySelectorAll('.task-item').length), d => text(d.querySelector('.dept-task-count'))),
          completion: pick(d => text(d.querySelector('.dept-completion')) !== '', d => text(d.querySelector('.dept-completion'))),
          progress: pick(d => d.querySelector('.dept-progress-fill')?.style.width !== '0%', d => d.querySelector('.dept-progress-fill')?.style.width),
        };
      })(),
      visibleTasks: tasks.filter(t => !hidden(t)).length,
      byStatus: tally('status'), byOwner: tally('owner'), byPriority: tally('priority'),
      filters: { search: document.getElementById('search-input').value, owner: document.getElementById('owner-filter').value, status: document.getElementById('status-filter').value, priority: document.getElementById('priority-filter').value, count: text(document.getElementById('filter-count')), countShown: !hidden(document.getElementById('filter-count')) && document.getElementById('filter-count').style.display !== '', noResults: document.getElementById('no-results').style.display },
      ownerFilterOptions: [...document.querySelectorAll('#owner-filter option')].map(o => o.value),
      buttons: { expandAll: text(document.getElementById('expand-all-btn')), bulk: text(document.getElementById('bulk-toggle-btn')), bulkClass: document.getElementById('bulk-toggle-btn').className },
      bulkBar: { visible: bar?.classList.contains('visible') ?? false, text: bar?.classList.contains('visible') ? text(bar) : '' },
      stats: Object.fromEntries(['total', 'assigned', 'done', 'unowned', 'blocked'].map(id => [id, text(document.getElementById(`stat-${id}`))])),
      toast: text(document.getElementById('save-toast')),
      pickers: { owner: [...document.querySelectorAll('#owner-picker button')].map(text), dep: document.querySelectorAll('#dep-picker .dep-picker-item').length, depClear: Boolean(document.querySelector('#dep-picker .dep-picker-clear')), due: Boolean(document.getElementById('_due-date-picker')) },
      notesModal: { visible: document.getElementById('task-notes-modal')?.classList.contains('visible'), title: text(document.getElementById('task-notes-title')), value: document.getElementById('task-notes-textarea')?.value },
      fieldsModal: { visible: document.getElementById('custom-fields-modal')?.classList.contains('visible'), title: text(document.getElementById('custom-fields-title')), rows: [...document.querySelectorAll('#custom-fields-body .custom-field-row')].map(text) },
      stored: { leasing: stored.find(d => d.id === 'leasing')?.tasks.slice(0, 3).map(keep), maintenance: stored.find(d => d.id === 'maintenance')?.tasks.slice(0, 1).map(keep), changedTasks: stored.reduce((n, d) => n + d.tasks.length, 0) },
    };
  })) };
}

let dialogs;
test.beforeEach(async ({ page }) => {
  dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await prepare(page);
  await page.addInitScript(team => { localStorage.setItem('pm-ops-team-v1', JSON.stringify(team)); }, TEAM);
  await page.clock.install({ time: FIXED_NOW });
  await page.goto('/index.html');
  await page.waitForSelector('#departments .department');
});

// What a step changed, compared with the step before: whole values for top-level fields, and for the task rows
// only the rows that differ. An empty object means the step changed nothing a person could see or that was saved.
function delta(prev, cur) {
  const out = {};
  for (const key of Object.keys(cur)) {
    if (key === 'label') continue;
    if (key === 'rows') {
      const rows = {};
      cur.rows.forEach(([name, value], i) => { if (JSON.stringify(value) !== JSON.stringify(prev.rows[i][1])) rows[name] = value; });
      if (Object.keys(rows).length) out.rows = rows;
    } else if (JSON.stringify(cur[key]) !== JSON.stringify(prev[key])) {
      out[key] = cur[key];
    }
  }
  return out;
}

// Runs the steps in order. The recording is the starting state in full, then what each step changed, so the
// golden file reads as a story and a reviewer can follow it.
async function scenario(page, name, steps) {
  let previous = await snap(page, 'start');
  const story = [previous];
  for (const [label, act] of steps) {
    await act();
    await page.waitForTimeout(40);
    const current = await snap(page, label);
    story.push({ label, changed: delta(previous, current) });
    previous = current;
  }
  story.push({ dialogs });
  checkGolden('tracking', name, story);
}

test('departments open and close, and Expand All flips', async ({ page }) => {
  await scenario(page, 'departments', [
    ['open leasing', () => header(page, 'leasing').click()],
    ['close leasing', () => header(page, 'leasing').click()],
    ['expand all', () => page.locator('#expand-all-btn').click()],
    ['collapse all', () => page.locator('#expand-all-btn').click()],
    ['open one then expand all', async () => { await header(page, 'leasing').click(); await page.locator('#expand-all-btn').click(); }],
  ]);
});

test('priority and status cycle on click', async ({ page }) => {
  await open(page, 'leasing');
  await scenario(page, 'priority-status', [
    ['priority 1', () => row(page, 'leasing', 0).locator('.priority-dot').click()],
    ['priority 2', () => row(page, 'leasing', 0).locator('.priority-dot').click()],
    ['priority 3', () => row(page, 'leasing', 0).locator('.priority-dot').click()],
    ['status 1', () => row(page, 'leasing', 1).locator('.status-pill').click()],
    ['status 2', () => row(page, 'leasing', 1).locator('.status-pill').click()],
    ['status 3', () => row(page, 'leasing', 1).locator('.status-pill').click()],
    ['status 4', () => row(page, 'leasing', 1).locator('.status-pill').click()],
  ]);
});

test('due dates: set, overdue, change, clear', async ({ page }) => {
  await open(page, 'leasing');
  const picker = page.locator('#_due-date-picker');
  await scenario(page, 'due-dates', [
    ['open picker', () => row(page, 'leasing', 0).locator('.due-date-empty').click()],
    ['pick a future date', () => picker.fill('2026-10-20')],
    ['open picker on the chip', () => row(page, 'leasing', 0).locator('.due-date-chip').click()],
    ['pick a past date', () => picker.fill('2026-09-01')],
    ['open again and clear', () => row(page, 'leasing', 0).locator('.due-date-chip').click()],
    ['cleared', () => picker.fill('')],
    ['priority still works after the row was rebuilt', () => row(page, 'leasing', 0).locator('.priority-dot').click()],
    ['rename still works after the row was rebuilt', () => row(page, 'leasing', 0).locator('.task-name').dblclick()],
  ]);
});

test('dependencies: pick, change, clear', async ({ page }) => {
  await open(page, 'leasing');
  const item = page.locator('#dep-picker .dep-picker-item');
  await scenario(page, 'dependencies', [
    ['open picker', () => row(page, 'leasing', 0).locator('.dep-add-btn').click()],
    ['search', () => page.locator('#dep-picker .dep-picker-search').fill('lease')],
    ['choose the first match', () => item.first().click()],
    ['reopen on the chip', () => row(page, 'leasing', 0).locator('.dep-chip').click()],
    ['clear it', () => page.locator('#dep-picker .dep-picker-clear').click()],
    ['reopen on another row', () => row(page, 'leasing', 1).locator('.dep-add-btn').click()],
    ['click away closes it', () => page.locator('#stat-total').click()],
  ]);
});

test('renaming a task: save, cancel', async ({ page }) => {
  await open(page, 'leasing');
  const input = () => row(page, 'leasing', 0).locator('.task-name-input');
  const clickAway = () => page.locator('#stat-total').click();
  await scenario(page, 'rename', [
    ['start editing', () => row(page, 'leasing', 0).locator('.task-name').dblclick()],
    ['type and click away: saved', async () => { await input().fill('Renamed by hand'); await clickAway(); }],
    ['start again', () => row(page, 'leasing', 0).locator('.task-name').dblclick()],
    ['type and press Escape: cancelled', async () => { await input().fill('Never saved'); await input().press('Escape'); }],
    ['edit once more after cancelling', () => row(page, 'leasing', 0).locator('.task-name').dblclick()],
    ['an empty name is refused', async () => { await input().fill('   '); await clickAway(); }],
    ['edit a second task', () => row(page, 'leasing', 1).locator('.task-name').dblclick()],
    ['type and press Enter: saved', async () => { await row(page, 'leasing', 1).locator('.task-name-input').fill('Second rename'); await row(page, 'leasing', 1).locator('.task-name-input').press('Enter'); }],
    ['clicking away afterwards changes nothing more', clickAway],
  ]);
});

test('owner picker assigns, unassigns, and closes on an outside click', async ({ page }) => {
  await open(page, 'leasing');
  await scenario(page, 'owner-picker', [
    ['open picker', () => row(page, 'leasing', 0).locator('.task-owner').click()],
    ['choose Joe', () => page.locator('#owner-picker button', { hasText: 'Joe' }).click()],
    ['open on another row', () => row(page, 'leasing', 1).locator('.task-owner').click()],
    ['choose UNOWNED', () => page.locator('#owner-picker button', { hasText: 'UNOWNED' }).click()],
    ['open again', () => row(page, 'leasing', 0).locator('.task-owner').click()],
    ['click away closes it', () => page.locator('#stat-total').click()],
    ['open two pickers in a row', async () => { await row(page, 'leasing', 0).locator('.task-owner').click(); await row(page, 'leasing', 1).locator('.task-owner').click(); }],
  ]);
});

test('notes and custom fields', async ({ page }) => {
  await open(page, 'leasing');
  await scenario(page, 'notes-fields', [
    ['open notes', () => row(page, 'leasing', 0).locator('.task-notes-btn').click()],
    ['write and save', async () => { await page.locator('#task-notes-textarea').fill('Call the owner first'); await page.locator('#task-notes-save-btn').click(); }],
    ['reopen shows the note', () => row(page, 'leasing', 0).locator('.task-notes-btn').click()],
    ['clear the note and save', async () => { await page.locator('#task-notes-textarea').fill(''); await page.locator('#task-notes-save-btn').click(); }],
    ['open fields', () => row(page, 'leasing', 0).locator('.task-fields-btn').click()],
    ['add a field with the button', async () => { await page.locator('#cf-key-input').fill('Billing Code'); await page.locator('#cf-val-input').fill('BC-001'); await page.locator('#custom-fields-body .custom-field-add button').click(); }],
    ['add a field with Enter', async () => { await page.locator('#cf-key-input').fill('Vendor'); await page.locator('#cf-val-input').fill('Acme'); await page.locator('#cf-val-input').press('Enter'); }],
    ['a name with quotes survives', async () => { await page.locator('#cf-key-input').fill('He said "hi"'); await page.locator('#cf-val-input').fill('x'); await page.locator('#custom-fields-body .custom-field-add button').click(); }],
    ['delete the quoted one', () => page.locator('#custom-fields-body .custom-field-row', { hasText: 'He said' }).locator('.custom-field-delete').click()],
    ['delete the first', () => page.locator('#custom-fields-body .custom-field-delete').first().click()],
  ]);
});

test('search and filters', async ({ page }) => {
  await scenario(page, 'filters', [
    ['search', async () => { await page.locator('#search-input').fill('lease'); await page.waitForTimeout(400); }],
    ['search finds nothing', async () => { await page.locator('#search-input').fill('zzzz-nothing'); await page.waitForTimeout(400); }],
    ['empty-state Clear filters link', () => page.locator('#no-results .btn-link').click()],
    ['status filter', () => page.locator('#status-filter').selectOption('todo')],
    ['priority filter', () => page.locator('#priority-filter').selectOption('high')],
    ['overdue filter', () => page.locator('#status-filter').selectOption('overdue')],
    ['owner filter', async () => { await page.locator('#status-filter').selectOption(''); await page.locator('#priority-filter').selectOption(''); await page.locator('#owner-filter').selectOption('UNOWNED'); }],
    ['Clear button', () => page.getByRole('button', { name: 'Clear', exact: true }).click()],
  ]);
});

test('bulk select and apply', async ({ page }) => {
   test.slow();
  await scenario(page, 'bulk', [
    ['turn on bulk mode', () => page.locator('#bulk-toggle-btn').click()],
    ['check two tasks', async () => { await row(page, 'leasing', 0).locator('.task-bulk-check').click(); await row(page, 'leasing', 1).locator('.task-bulk-check').click(); }],
    ['uncheck one', () => row(page, 'leasing', 1).locator('.task-bulk-check').click()],
    ['apply with nothing chosen', () => page.locator('#bulk-action-bar button', { hasText: 'Apply' }).click()],
    ['select all', () => page.locator('#bulk-action-bar button', { hasText: 'Select All' }).click()],
    ['cancel from the bar', () => page.locator('#bulk-action-bar button', { hasText: 'Cancel' }).click()],
    ['turn on again and pick two', async () => { await page.locator('#bulk-toggle-btn').click(); await row(page, 'leasing', 0).locator('.task-bulk-check').click(); await row(page, 'leasing', 1).locator('.task-bulk-check').click(); }],
    ['apply owner and status', async () => { await page.locator('#bulk-owner-select').selectOption('Maria'); await page.locator('#bulk-status-select').selectOption('done'); await page.locator('#bulk-action-bar button', { hasText: 'Apply' }).click(); }],
    ['turn on with the toolbar button', () => page.locator('#bulk-toggle-btn').click()],
    ['turn off with the toolbar button', () => page.locator('#bulk-toggle-btn').click()],
    ['turn on again', () => page.locator('#bulk-toggle-btn').click()],
    ['open an owner picker', () => row(page, 'leasing', 2).locator('.task-owner').click()],
    ['ticking a checkbox leaves the picker open', () => row(page, 'leasing', 0).locator('.task-bulk-check').click()],
    ['clicking a department header does close it', () => header(page, 'leasing').click()],
  ]);
});
