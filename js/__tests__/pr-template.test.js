// The PR template is how the project's history keeps its shape (milestone, evolution, why, tradeoffs). If someone
// trims it, the next PR quietly loses a section, so the headings are pinned and the style guide must still exist.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';

const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('PR template', () => {
  const template = read('.github/pull_request_template.md');

  test('asks the five history questions, in order', () => {
    const headings = [...template.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    expect(headings).toEqual(['Milestone', 'Evolution', 'Why', 'Tradeoffs', 'Verification', 'Follow-ups']);
  });

  test('tells the author to write in the project voice', () => {
    expect(template).toMatch(/no "I", no "you"/);
  });

  test('CONTRIBUTING explains the same sections', () => {
    const guide = read('CONTRIBUTING.md');
    expect(guide).toMatch(/## Writing the history/);
    ['Milestone', 'Evolution', 'Why', 'Tradeoffs', 'Verification'].forEach(word => expect(guide).toContain(`**${word}:**`));
  });
});
