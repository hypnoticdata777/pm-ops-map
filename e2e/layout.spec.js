// Layout regression: nothing inside a task row may overlap anything else, at any
// width. The populated demo is the stress case — rows with a due date, a dependency
// chip, notes and custom-field buttons, a status pill, and an owner badge all at once.
import { test, expect } from '@playwright/test';

const WIDTHS = [1440, 1280, 1024, 820, 600, 390];

async function overlaps(page) {
  return page.evaluate(() => {
    const found = [];
    const rects = el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
    };
    const intersect = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5;

    document.querySelectorAll('.department .task-item').forEach((row, index) => {
      const row_ = rects(row);
      // Elements that must each have their own space: every direct child of the left and right groups.
      const parts = [...row.querySelectorAll('.task-left > *, .task-right > *')]
        .filter(el => el.getClientRects().length)
        .map(el => ({ el, r: rects(el) }))
        .filter(({ r }) => r.w > 0 && r.h > 0);
      for (let i = 0; i < parts.length; i++) {
        // Nothing may poke out of the row.
        if (parts[i].r.right > row_.right + 1 || parts[i].r.left < row_.left - 1) {
          found.push(`row ${index}: ${parts[i].el.className || parts[i].el.tagName} sticks out of the row`);
        }
        for (let j = i + 1; j < parts.length; j++) {
          if (intersect(parts[i].r, parts[j].r)) {
            found.push(`row ${index} ("${row.querySelector('.task-name')?.textContent.slice(0, 30)}"): ${parts[i].el.className || parts[i].el.tagName} overlaps ${parts[j].el.className || parts[j].el.tagName}`);
          }
        }
      }
    });
    return found;
  });
}

for (const width of WIDTHS) {
  test(`no overlapping or overflowing task-row content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('index.html?demo=1');
    await page.waitForSelector('#departments .department');
    await page.evaluate(() => window.toggleExpandAllDepartments());
    await page.waitForTimeout(100);
    const problems = await overlaps(page);
    expect(problems.slice(0, 12), `${problems.length} layout problems`).toEqual([]);
  });
}

test('rows with every kind of chip stay readable: the task name keeps a usable width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('index.html?demo=1');
  await page.waitForSelector('#departments .department');
  await page.evaluate(() => window.toggleExpandAllDepartments());
  const narrow = await page.evaluate(() => [...document.querySelectorAll('.department .task-name')]
    .filter(el => el.getClientRects().length && el.getBoundingClientRect().width < 100)
    .map(el => `${Math.round(el.getBoundingClientRect().width)}px: ${el.textContent.slice(0, 40)}`));
  expect(narrow.slice(0, 8), `${narrow.length} task names squeezed under 100px`).toEqual([]);
});
