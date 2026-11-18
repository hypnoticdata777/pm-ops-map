import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { GLOSSARY_ENTRIES, GLOSSARY_CATEGORIES } from '../glossaryData.js';
import { searchGlossary, glossaryLink } from '../glossary.js';

describe('operator glossary source and generated reference', () => {
  test('approved entries have stable unique IDs and valid categories', () => {
    expect(GLOSSARY_ENTRIES).toHaveLength(40);
    expect(new Set(GLOSSARY_ENTRIES.map(e => e.id)).size).toBe(40);
    for (const entry of GLOSSARY_ENTRIES) {
      expect(entry.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(GLOSSARY_CATEGORIES.some(c => c.id === entry.category)).toBe(true);
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
    }
  });
  test('checked-in Markdown matches the shared definitions exactly', () => {
    expect(() => execFileSync(process.execPath, ['scripts/generate-glossary.mjs', '--check'], {stdio:'pipe'})).not.toThrow();
  });
  test('all six contextual links refer to defined terms and carry no inline handlers', () => {
    for (const id of ['responsibility-owner','department-affinity','auto-assign','coverage','workload','readiness-score']) {
      const root = document.createElement('div'); root.innerHTML = glossaryLink(id);
      expect(root.querySelector('button').dataset.glossary).toBe(id);
      expect(root.querySelector('button').getAttribute('aria-haspopup')).toBe('dialog');
      expect(root.querySelector('[onclick]')).toBeNull();
    }
    expect(() => glossaryLink('not-a-term')).toThrow('Unknown glossary term');
  });
});
describe('search semantics', () => {
  test('names, aliases, definitions, punctuation and category work together', () => {
    expect(searchGlossary('owner')[0].id).toBe('responsibility-owner');
    expect(searchGlossary('tenant').some(e => e.id === 'resident')).toBe(true);
    expect(searchGlossary('affinities').some(e => e.id === 'department-affinity')).toBe(true);
    expect(searchGlossary('AUTO ASSIGN').some(e => e.id === 'auto-assign')).toBe(true);
    expect(searchGlossary('estimated effort').some(e => e.id === 'auto-assign')).toBe(true);
    expect(searchGlossary('', 'portfolio').map(e => e.id)).toEqual(['portfolio','unit','resident']);
    expect(searchGlossary('tenant', 'portfolio').map(e => e.id)).toEqual(['resident']);
    expect(searchGlossary('zzzz-no-match')).toEqual([]);
  });
  test('search is read-only and treats markup as text', () => {
    const before = JSON.stringify(GLOSSARY_ENTRIES);
    expect(searchGlossary('<img src=x onerror=alert(1)>')).toEqual([]);
    expect(JSON.stringify(GLOSSARY_ENTRIES)).toBe(before);
    const root = document.createElement('div'); root.innerHTML = glossaryLink('coverage', '<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img');
  });
});
