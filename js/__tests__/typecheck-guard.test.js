// `npm run typecheck` (tsc, JSDoc types) is the real check. This test only keeps the converted
// part of the codebase from quietly shrinking: a converted file may not regain `@ts-nocheck`,
// and a new file is checked by default (it must not be added to the unconverted list casually).
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';

const JS_DIR = path.join(process.cwd(), 'js');
const files = fs.readdirSync(JS_DIR, { recursive: true })
  .map(String)
  .filter(f => f.endsWith('.js') && !f.includes('__tests__'))
  .map(f => f.split(path.sep).join('/'));
const isUnchecked = file => fs.readFileSync(path.join(JS_DIR, file), 'utf8').startsWith('// @ts-nocheck');

// Still to convert (delete a name from this list when you delete its `// @ts-nocheck` line).
const NOT_CONVERTED_YET = [
  'app.js', 'handbook.js', 'io.js', 'launchPlan.js', 'sync.js', 'ui.js',
  'views/map.js', 'views/portfolio.js', 'views/recurring.js', 'views/team.js', 'views/tracking.js', 'views/workorders.js',
];

describe('typed JSDoc coverage', () => {
  test('the strict set stays strict', () => {
    const strict = [
      'normalize.js', 'state.js', 'stateSchema.js', 'storage.js', 'privacy.js', 'showcase.js', 'demo.js', 'demoMode.js',
      'schema.js', 'taskIdentity.js', 'syncEnvelope.js', 'utils.js', 'templates.js', 'types.js',
    ];
    strict.forEach(file => {
      expect(files, file).toContain(file);
      expect(isUnchecked(file), `${file} must not start with // @ts-nocheck`).toBe(false);
    });
  });

  test('only the known unconverted files opt out of checking', () => {
    const optedOut = files.filter(isUnchecked).sort();
    expect(optedOut).toEqual([...NOT_CONVERTED_YET].sort());
  });

  test('every unconverted file says what to do about it', () => {
    NOT_CONVERTED_YET.forEach(file => {
      expect(fs.readFileSync(path.join(JS_DIR, file), 'utf8').split('\n')[0], file).toMatch(/TODO\(types\)/);
    });
  });

  test('tsconfig checks JavaScript strictly without emitting', () => {
    const raw = fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const { compilerOptions } = JSON.parse(raw);
    expect(compilerOptions).toMatchObject({ allowJs: true, checkJs: true, noEmit: true, strict: true });
  });
});
