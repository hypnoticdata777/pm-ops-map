// js/domain/ is the part of the app that decides things (who is covered, who is busy, who should own what).
// It must stay pure so it can be tested without a browser, reused by reports and previews, and never
// drift into reading the page or shared state. This is checked statically, on the source text.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';

const DIR = path.join(process.cwd(), 'js/domain');
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.js')) : [];
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
// Drop comments so a mention of "document" in prose is not a violation.
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');

describe('js/domain is pure', () => {
  test('the domain modules exist', () => {
    expect(files.sort()).toEqual(expect.arrayContaining(['workload.js']));
  });

  test.each(files)('%s imports only other domain modules', file => {
    const imports = [...code(file).matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
    imports.forEach(spec => expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[a-z-]+\.js$/));
  });

  test.each(files)('%s does not touch the DOM, storage, the clock or randomness', file => {
    const text = code(file);
    const forbidden = [
      /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bnavigator\b/, /\blocation\b/,
      /\bfetch\s*\(/, /\bsetTimeout\b/, /\bconsole\./, /\bDate\.now\b/, /\bnew Date\b/, /\bMath\.random\b/,
    ];
    forbidden.forEach(pattern => expect(text, `${file} must not use ${pattern}`).not.toMatch(pattern));
  });

  test.each(files)('%s has no module-level mutable state', file => {
    expect(code(file), file).not.toMatch(/^\s*(let|var)\s/m);
  });
});
