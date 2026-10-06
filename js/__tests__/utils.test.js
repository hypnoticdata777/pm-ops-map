
import { describe, test, expect } from 'vitest';
import * as utils from '../utils.js';

describe('isValidISODate', () => {
  test('valid date returns true', () => {
    expect(utils.isValidISODate('2026-05-08')).toBe(true);
  });

  test('impossible date Feb 30 returns false', () => {
    expect(utils.isValidISODate('2026-02-30')).toBe(false);
  });

  test('out-of-range month 13 returns false', () => {
    expect(utils.isValidISODate('2026-13-01')).toBe(false);
  });

  test('past date with valid format returns true', () => {
    expect(utils.isValidISODate('2020-01-01')).toBe(true);
  });

  test('null input returns false', () => {
    expect(utils.isValidISODate(null)).toBe(false);
  });

  test('empty string returns false', () => {
    expect(utils.isValidISODate('')).toBe(false);
  });

  test('wrong format MM/DD/YYYY returns false', () => {
    expect(utils.isValidISODate('05/08/2026')).toBe(false);
  });

  test('partial string YYYY-MM returns false', () => {
    expect(utils.isValidISODate('2026-05')).toBe(false);
  });
});

describe('escapeHtml', () => {
  test('escapes < and > in script tag', () => {
    expect(utils.escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quotes', () => {
    expect(utils.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('escapes ampersand', () => {
    expect(utils.escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes > alone', () => {
    expect(utils.escapeHtml('>')).toBe('&gt;');
  });

  test('null input returns empty string', () => {
    expect(utils.escapeHtml(null)).toBe('');
  });

  test('undefined returns empty string', () => {
    expect(utils.escapeHtml(undefined)).toBe('');
  });

  test('safe text passes through unchanged', () => {
    expect(utils.escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('formatDueChip', () => {
  test('formats Dec 25 correctly', () => {
    expect(utils.formatDueChip('2026-12-25')).toBe('Dec 25');
  });

  test('formats Jan 1 correctly', () => {
    expect(utils.formatDueChip('2026-01-01')).toBe('Jan 1');
  });

  test('formats Jun 30 correctly', () => {
    expect(utils.formatDueChip('2026-06-30')).toBe('Jun 30');
  });

  test('empty string returns empty string', () => {
    expect(utils.formatDueChip('')).toBe('');
  });

  test('null returns empty string', () => {
    expect(utils.formatDueChip(null)).toBe('');
  });
});

describe('buildDeptCompletionText', () => {
  test('(0, 0) returns empty string', () => {
    expect(utils.buildDeptCompletionText(0, 0)).toBe('');
  });

  test('(3, 0) contains "3 done"', () => {
    expect(utils.buildDeptCompletionText(3, 0)).toContain('3 done');
  });

  test('(0, 2) contains "2 blocked"', () => {
    expect(utils.buildDeptCompletionText(0, 2)).toContain('2 blocked');
  });

  test('(3, 2) contains both "3 done" and "2 blocked"', () => {
    const result = utils.buildDeptCompletionText(3, 2);
    expect(result).toContain('3 done');
    expect(result).toContain('2 blocked');
  });
});

describe('getTodayISO', () => {
  test('returns a YYYY-MM-DD formatted string', () => {
    expect(utils.getTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('matches today\'s local date', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const dd   = String(today.getDate()).padStart(2, '0');
    const expected = `${yyyy}-${mm}-${dd}`;
    expect(utils.getTodayISO()).toBe(expected);
  });
});

describe('_slugify', () => {
  test('slugifies company name', () => {
    expect(utils._slugify('My Company Inc.')).toBe('my-company-inc');
  });

  test('replaces spaces with hyphens', () => {
    expect(utils._slugify('hello world')).toBe('hello-world');
  });

  test('empty string returns "pm-ops"', () => {
    expect(utils._slugify('')).toBe('pm-ops');
  });

  test('null returns "pm-ops"', () => {
    expect(utils._slugify(null)).toBe('pm-ops');
  });

  test('collapses double hyphens', () => {
    expect(utils._slugify('ABC--DEF')).toBe('abc-def');
  });
});

describe('jsonAttr', () => {
  test('plain string is JSON-stringified with outer quotes HTML-encoded', () => {
    // jsonAttr encodes ALL double-quotes (including surrounding ones) for safe HTML attr embedding
    expect(utils.jsonAttr('hello')).toBe('&quot;hello&quot;');
  });

  test('double quotes in value are HTML-encoded', () => {
    const result = utils.jsonAttr('say "hi"');
    expect(result).toContain('&quot;');
    expect(result).not.toContain('"');
  });
});

describe('formatCurrency', () => {
  test('formats a whole number with two decimals and thousands separator', () => {
    expect(utils.formatCurrency(1200)).toBe('$1,200.00');
  });

  test('formats a decimal amount', () => {
    expect(utils.formatCurrency(45.5)).toBe('$45.50');
  });

  test('null/undefined defaults to $0.00', () => {
    expect(utils.formatCurrency(null)).toBe('$0.00');
    expect(utils.formatCurrency(undefined)).toBe('$0.00');
  });
});

describe('getLeaseStatus', () => {
  test('tenant with no leaseEnd returns null', () => {
    expect(utils.getLeaseStatus({ name: 'Maya' })).toBeNull();
  });

  test('invalid leaseEnd format returns null', () => {
    expect(utils.getLeaseStatus({ leaseEnd: '13/40/2026' })).toBeNull();
  });

  test('leaseEnd in the past is tone danger / expired', () => {
    const status = utils.getLeaseStatus({ leaseEnd: '2020-01-01' }, '2026-01-01');
    expect(status.tone).toBe('danger');
    expect(status.label).toBe('Lease expired');
  });

  test('leaseEnd today is tone warn / ends today', () => {
    const status = utils.getLeaseStatus({ leaseEnd: '2026-01-01' }, '2026-01-01');
    expect(status.tone).toBe('warn');
    expect(status.label).toBe('Lease ends today');
    expect(status.days).toBe(0);
  });

  test('leaseEnd 30 days out is tone warn with day count', () => {
    const status = utils.getLeaseStatus({ leaseEnd: '2026-01-31' }, '2026-01-01');
    expect(status.tone).toBe('warn');
    expect(status.label).toBe('Lease ends in 30d');
  });

  test('leaseEnd far in the future is tone neutral', () => {
    const status = utils.getLeaseStatus({ leaseEnd: '2099-06-15' }, '2026-01-01');
    expect(status.tone).toBe('neutral');
    expect(status.label).toBe('Lease ends Jun 15');
  });
});

describe('getDelinquencyStatus', () => {
  test('tenant with no balance due returns null', () => {
    expect(utils.getDelinquencyStatus({ rent: 1200 })).toBeNull();
  });

  test('zero or negative balance returns null', () => {
    expect(utils.getDelinquencyStatus({ rent: 1200, balanceDue: 0 })).toBeNull();
    expect(utils.getDelinquencyStatus({ rent: 1200, balanceDue: -50 })).toBeNull();
  });

  test('balance less than a full month rent is tone warn', () => {
    const status = utils.getDelinquencyStatus({ rent: 1200, balanceDue: 400 });
    expect(status.tone).toBe('warn');
    expect(status.label).toBe('$400.00 past due');
  });

  test('balance at or above a full month rent is tone danger', () => {
    const status = utils.getDelinquencyStatus({ rent: 1200, balanceDue: 1200 });
    expect(status.tone).toBe('danger');
    const status2 = utils.getDelinquencyStatus({ rent: 1200, balanceDue: 2500 });
    expect(status2.tone).toBe('danger');
  });

  test('balance due with no rent on file is still tone warn (no month to compare against)', () => {
    const status = utils.getDelinquencyStatus({ balanceDue: 5000 });
    expect(status.tone).toBe('warn');
  });
});

describe('isSafeUrl', () => {
  test('accepts http and https URLs', () => {
    expect(utils.isSafeUrl('https://example.com/lease.pdf')).toBe(true);
    expect(utils.isSafeUrl('http://example.com')).toBe(true);
  });

  test('rejects javascript: URLs', () => {
    expect(utils.isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  test('rejects data: URLs', () => {
    expect(utils.isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  test('rejects relative paths and empty values', () => {
    expect(utils.isSafeUrl('/some/path')).toBe(false);
    expect(utils.isSafeUrl('')).toBe(false);
    expect(utils.isSafeUrl(null)).toBe(false);
    expect(utils.isSafeUrl(undefined)).toBe(false);
  });
});

describe('parseCSV', () => {
  test('parses simple unquoted rows', () => {
    expect(utils.parseCSV('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  test('handles CRLF line endings', () => {
    expect(utils.parseCSV('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  test('does not produce a phantom row for a trailing newline', () => {
    expect(utils.parseCSV('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  test('handles quoted fields containing commas', () => {
    expect(utils.parseCSV('name,notes\n"Oak St","Gate code, ask owner"')).toEqual([
      ['name', 'notes'],
      ['Oak St', 'Gate code, ask owner'],
    ]);
  });

  test('handles escaped double quotes inside a quoted field', () => {
    expect(utils.parseCSV('name\n"Bob ""The Landlord"" Smith"')).toEqual([
      ['name'],
      ['Bob "The Landlord" Smith'],
    ]);
  });

  test('handles embedded newlines inside a quoted field', () => {
    expect(utils.parseCSV('name,notes\nOak,"Line one\nLine two"')).toEqual([
      ['name', 'notes'],
      ['Oak', 'Line one\nLine two'],
    ]);
  });

  test('handles empty fields', () => {
    expect(utils.parseCSV('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  test('empty string returns no rows', () => {
    expect(utils.parseCSV('')).toEqual([]);
  });

  test('single row with no trailing newline', () => {
    expect(utils.parseCSV('a,b,c')).toEqual([['a', 'b', 'c']]);
  });
});

describe('buildCsvHeaderMap', () => {
  test('maps header names to indexes, case-insensitively and trimmed', () => {
    expect(utils.buildCsvHeaderMap(['Property', ' Units ', 'Owner / Client'])).toEqual({
      'property': 0,
      'units': 1,
      'owner / client': 2,
    });
  });

  test('skips blank header cells', () => {
    expect(utils.buildCsvHeaderMap(['Name', '', 'Email'])).toEqual({ name: 0, email: 2 });
  });

  test('empty/undefined header row returns empty map', () => {
    expect(utils.buildCsvHeaderMap([])).toEqual({});
    expect(utils.buildCsvHeaderMap(undefined)).toEqual({});
  });
});

describe('isTaskOverdue (integration)', () => {
  test('past dueDate with todo status is overdue', () => {
    const task = { dueDate: '2020-01-01', status: 'todo' };
    expect(utils.isTaskOverdue(task)).toBe(true);
  });

  test('past dueDate with done status is NOT overdue', () => {
    const task = { dueDate: '2020-01-01', status: 'done' };
    expect(utils.isTaskOverdue(task)).toBe(false);
  });

  test('task with no dueDate is not overdue', () => {
    const task = { status: 'todo' };
    expect(utils.isTaskOverdue(task)).toBe(false);
  });

  test('future dueDate is not overdue', () => {
    const task = { dueDate: '9999-12-31', status: 'todo' };
    expect(utils.isTaskOverdue(task)).toBe(false);
  });
});
