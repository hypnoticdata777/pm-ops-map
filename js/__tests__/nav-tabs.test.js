// Tests find nav tabs by `data-view`, not by their visible label, so renaming a tab (copy changes
// are normal as the product's wording evolves) can never break the suite again. This pins the
// contract: every tab names the view it opens, and that view exists.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeAll } from 'vitest';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
let tabs;

beforeAll(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  tabs = [...document.querySelectorAll('#nav-tabs .nav-tab')];
});

describe('nav tabs', () => {
  test('there are five, and each one carries a data-view', () => {
    expect(tabs).toHaveLength(5);
    tabs.forEach(tab => expect(tab.dataset.view, tab.textContent.trim()).toBeTruthy());
  });

  test('data-view values are unique', () => {
    const views = tabs.map(t => t.dataset.view);
    expect(new Set(views).size).toBe(views.length);
  });

  test('data-view matches the view the tab switches to', () => {
    tabs.forEach(tab => {
      const target = /switchView\('([a-z]+)'/.exec(tab.getAttribute('onclick') || '')?.[1];
      expect(tab.dataset.view, tab.textContent.trim()).toBe(target);
    });
  });

  test('every data-view has a matching view container', () => {
    tabs.forEach(tab => expect(document.getElementById(`${tab.dataset.view}-view`), tab.dataset.view).not.toBeNull());
  });

  test('the first tab is the active one on load', () => {
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(tabs.slice(1).some(t => t.classList.contains('active'))).toBe(false);
  });
});
