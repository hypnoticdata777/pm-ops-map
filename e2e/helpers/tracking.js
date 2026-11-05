// Drives the Map & Review screen the way a person does: by clicking. Tests used to call the app's functions
// straight off `window`; once controls are wired with data-action there are no such globals, and clicking
// also proves the control is actually connected.
const dept = (page, id) => page.locator(`.department[data-id="${id}"]`);
const task = (page, id, idx) => dept(page, id).locator(`.task-item[data-task-idx="${idx}"]`);

/** Opens a department if it is collapsed (its tasks are not clickable otherwise). */
export async function openDepartment(page, id) {
  if (!(await page.locator(`.department[data-id="${id}"].expanded`).count())) {
    await dept(page, id).locator('.department-header').click();
  }
}

export const clickExpandAll = page => page.locator('#expand-all-btn').click();
export const clickBulkToggle = page => page.locator('#bulk-toggle-btn').click();

async function inTask(page, id, idx, selector) {
  await openDepartment(page, id);
  await task(page, id, idx).locator(selector).click();
}
export const clickStatus = (page, id, idx) => inTask(page, id, idx, '.status-pill');
export const clickPriority = (page, id, idx) => inTask(page, id, idx, '.priority-dot');
export const clickNotes = (page, id, idx) => inTask(page, id, idx, '.task-notes-btn');
export const clickCustomFields = (page, id, idx) => inTask(page, id, idx, '.task-fields-btn');

export async function chooseOwner(page, id, idx, owner) {
  await inTask(page, id, idx, '.task-owner');
  await page.locator('#owner-picker').getByRole('button', { name: owner, exact: true }).click();
}

/** Adds the custom field currently typed into the open "custom fields" box. */
export const clickAddCustomField = page => page.locator('#custom-fields-body .custom-field-add button').click();

/** Closes any dialog left open, the way a person would: with its close button. */
export async function closeOpenDialogs(page) {
  const open = page.locator('.playbook-overlay.visible .playbook-close-btn');
  for (let i = 0; i < 5 && (await open.count()); i++) await open.last().click(); // the topmost dialog is the last one in the page
}
