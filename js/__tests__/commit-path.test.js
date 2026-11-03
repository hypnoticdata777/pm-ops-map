// "Save it, then bring the page up to date" used to be copy-pasted in several places, each slightly
// different. js/commit.js is now the only place that does it. This keeps the copy-paste from creeping back:
// a hand-written block of consecutive saves or renders anywhere else fails here, with the file named.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';

const JS_DIR = path.join(process.cwd(), 'js');
const files = fs.readdirSync(JS_DIR, { recursive: true })
  .map(String)
  .filter(f => f.endsWith('.js') && !f.includes('__tests__') && f !== 'commit.js')
  .map(f => f.split(path.sep).join('/'));

// Two calls in a row that commit() exists to sequence: a save followed by a re-render, or two saves,
// or the render pair that always travels together.
const HAND_WRITTEN = [
  [/saveToStorage\(\);\s*renderTrackingView\(\);/, 'saveToStorage(); renderTrackingView();'],
  [/renderTrackingView\(\);\s*updateStats\(\);/, 'renderTrackingView(); updateStats();'],
  [/saveTeamData\(\);\s*saveToStorage\(\);/, 'saveTeamData(); saveToStorage();'],
];

describe('one commit path', () => {
  test('there are source files to check', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  test.each(files)('%s has no hand-written save-and-refresh block (use commit())', file => {
    const text = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    HAND_WRITTEN.forEach(([pattern, label]) => expect(text, `${file}: "${label}" belongs in commit()`).not.toMatch(pattern));
  });

  test('the sites that used to carry the block now call commit()', () => {
    const uses = f => fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    const calls = f => (uses(f).match(/\bcommit\(/g) || []).length;
    expect(calls('views/team.js')).toBeGreaterThanOrEqual(3);    // auto-assign, remove employee, role template
    expect(calls('io.js')).toBeGreaterThanOrEqual(2);            // undo, import
    expect(calls('launchPlan.js')).toBeGreaterThanOrEqual(1);    // demo company
  });
});
