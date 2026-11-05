// Golden files for browser tests: record what the app does BEFORE a refactor, then prove the refactor
// reproduces it exactly. One file per scenario, so parallel workers never write the same file.
//   UPDATE_GOLDEN=1 npx playwright test e2e/<spec>   rewrites the files. Do that only on pre-refactor code, or
//   for a reviewed, intended behavior change; otherwise the files stay untouched.
import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';

export function checkGolden(group, name, actual) {
  const file = path.join(process.cwd(), 'e2e/golden', group, `${name}.json`);
  const normalized = JSON.parse(JSON.stringify(actual));
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }
  expect(fs.existsSync(file), `missing golden file ${file}; record it on the pre-refactor code`).toBe(true);
  expect(normalized).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
}
