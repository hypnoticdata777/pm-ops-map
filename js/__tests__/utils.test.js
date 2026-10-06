
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

  test('escapes single quotes so values are safe in single-quoted attributes too', () => {
    expect(utils.escapeHtml("it's")).toBe('it&#39;s');
  });

  test('escapes & first so entities in the input stay literal text', () => {
    expect(utils.escapeHtml('&quot;')).toBe('&amp;quot;');
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

// The old implementation: JSON.stringify then only swap " for &quot;. It does NOT
// escape "&", so a value containing the text &quot; turns back into a real quote
// after the browser parses the attribute and ends the JS string early.
const legacyJsonAttr = val => JSON.stringify(String(val == null ? '' : val)).replace(/"/g, '&quot;');

// Parses `<button onclick="f(<attr>)">` with the real HTML parser, then evaluates
// the resulting handler source with f stubbed — exactly what a click would run.
function roundTrip(attrFn, value) {
  delete globalThis.__pwn;
  const host = document.createElement('div');
  host.innerHTML = `<button onclick="f(${attrFn(value)})">x</button>`;
  const handlerSource = host.firstChild.getAttribute('onclick');
  const received = [];
  new Function('f', handlerSource)(v => received.push(v));
  return { received, executed: globalThis.__pwn !== undefined };
}

describe('jsonAttr round trip through the HTML parser', () => {
  const values = [
    'plain', '"double"', "it's", 'back\\slash', 'line\nbreak', '<img src=x onerror=1>', '</script>',
    '&amp;', '&quot;', '&#34;', '&lt;b&gt;', '\u2028', 'emoji 🏠',
  ];

  test.each(values)('the handler receives exactly %j', value => {
    const { received, executed } = roundTrip(utils.jsonAttr, value);
    expect(received).toEqual([value]);
    expect(executed).toBe(false);
  });

  test('an entity-encoded breakout payload cannot execute', () => {
    const payload = '&quot;);__pwn=1;//';
    const { received, executed } = roundTrip(utils.jsonAttr, payload);
    expect(executed).toBe(false);
    expect(received).toEqual([payload]);
  });

  test('regression proof: the legacy encoding DID execute that payload', () => {
    const { executed } = roundTrip(legacyJsonAttr, '&quot;);__pwn=1;//');
    expect(executed).toBe(true);
    delete globalThis.__pwn;
  });

  test('output never contains a raw double quote, so it cannot end the attribute', () => {
    expect(utils.jsonAttr('say "hi" & <bye>')).not.toMatch(/["<>]/);
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

describe('isSafeUrl (stricter: parsed, not just prefix-matched)', () => {
  test('rejects other schemes, protocol-relative and malformed URLs', () => {
    ['ftp://example.com/f', 'file:///etc/passwd', 'mailto:a@b.com', '//example.com', 'https://', 'http://exa mple.com',
      'JaVaScRiPt:alert(1)', ' javascript:alert(1)'].forEach(url => {
      expect(utils.isSafeUrl(url), url).toBe(false);
    });
  });

  test('rejects non-strings and over-long values', () => {
    expect(utils.isSafeUrl(42)).toBe(false);
    expect(utils.isSafeUrl({})).toBe(false);
    expect(utils.isSafeUrl(`https://example.com/${'a'.repeat(3000)}`)).toBe(false);
  });

  test('accepts surrounding whitespace and mixed-case schemes', () => {
    expect(utils.isSafeUrl('  HTTPS://Example.com/a  ')).toBe(true);
  });
});

describe('normalizeUrl', () => {
  test('returns the canonical href for valid http(s) URLs', () => {
    expect(utils.normalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(utils.normalizeUrl('  http://Example.com/Lease.pdf  ')).toBe('http://example.com/Lease.pdf');
  });

  test('percent-encodes characters that could break out of an attribute', () => {
    const href = utils.normalizeUrl('https://example.com/a b"c<d>e');
    expect(href).toBe('https://example.com/a%20b%22c%3Cd%3Ee');
    expect(href).not.toMatch(/["<> ]/);
  });

  test('returns an empty string for anything unsafe or unparseable', () => {
    ['javascript:alert(1)', 'data:text/html,x', '/relative', '', '   ', null, undefined, 5].forEach(v => {
      expect(utils.normalizeUrl(v)).toBe('');
    });
  });
});

describe('formatWODate', () => {
  test('formats valid ISO timestamps', () => {
    expect(utils.formatWODate('2026-10-06T12:00:00.000Z')).toMatch(/Oct \d{1,2}, 2026/);
  });

  test('returns an empty string — never the text "Invalid Date"', () => {
    ['', null, undefined, 'garbage', '2026-13-45'].forEach(v => {
      expect(utils.formatWODate(v)).toBe('');
    });
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

describe('csvCell / toCSV — spreadsheet formula injection guard', () => {
  test.each(['=1+1', '+1 555 0100', '-2+3', '@SUM(A1:A2)', '\t=1+1', '\r=1+1', '=HYPERLINK("http://evil.test","click")', "+cmd|' /C calc'!A0"])(
    'text starting with a formula trigger gets a leading apostrophe: %j', value => {
      const cell = utils.csvCell(value);
      expect(cell.startsWith('"\'')).toBe(true);
      expect(cell).not.toMatch(/^"[=+\-@\t\r]/);
    });

  test('ordinary text is only quoted', () => {
    expect(utils.csvCell('Maple Street')).toBe('"Maple Street"');
    expect(utils.csvCell('2026-10-06')).toBe('"2026-10-06"');
    expect(utils.csvCell('Tom - Jerry = friends')).toBe('"Tom - Jerry = friends"');
  });

  test('numbers are never prefixed (they cannot be formulas; negatives stay numeric)', () => {
    expect(utils.csvCell(1450)).toBe('"1450"');
    expect(utils.csvCell(-5)).toBe('"-5"');
    expect(utils.csvCell(0)).toBe('"0"');
  });

  test('null / undefined become empty cells', () => {
    expect(utils.csvCell(null)).toBe('""');
    expect(utils.csvCell(undefined)).toBe('""');
  });

  test('embedded quotes are doubled', () => {
    expect(utils.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(utils.csvCell('=A1&"x"')).toBe('"\'=A1&""x"""');
  });

  test('toCSV joins rows with CRLF and cells with commas', () => {
    expect(utils.toCSV([['a', 'b'], ['=x', 1]])).toBe('"a","b"\r\n"\'=x","1"');
    expect(utils.toCSV([])).toBe('');
  });

  test('no cell of a generated document starts with a trigger once parsed back', () => {
    const rows = [['Name', 'Phone'], ['=1+1', '+1 555'], ['@x', '-1'], ['ok', '\t=1']];
    utils.parseCSV(utils.toCSV(rows)).forEach(row => row.forEach(cell => {
      expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    }));
  });
});

describe('unguardCsvCell and the export -> import round trip', () => {
  test('removes only the guard apostrophe', () => {
    expect(utils.unguardCsvCell("'=1+1")).toBe('=1+1');
    expect(utils.unguardCsvCell("'+1 555")).toBe('+1 555');
    expect(utils.unguardCsvCell("'@x")).toBe('@x');
    expect(utils.unguardCsvCell("'hello")).toBe("'hello");
    expect(utils.unguardCsvCell("''=1+1")).toBe("'=1+1");
    expect(utils.unguardCsvCell("O'Brien")).toBe("O'Brien");
    expect(utils.unguardCsvCell('=1+1')).toBe('=1+1');
    expect(utils.unguardCsvCell('')).toBe('');
  });

  test('every tricky value survives toCSV -> parseCSV -> unguard unchanged', () => {
    const values = [
      '=1+1', '+1 (555) 010-1188', '-dash', '@handle', '=HYPERLINK("http://evil.test","x")', 'plain',
      'with, comma', 'with "quotes"', 'multi\nline', "it's", "'already quoted", '  padded  ',
      "'=literal apostrophe then equals", "''+two apostrophes",
    ];
    const csv = utils.toCSV([['v'], ...values.map(v => [v])]);
    const back = utils.parseCSV(csv).slice(1).map(r => utils.unguardCsvCell(r[0]));
    expect(back).toEqual(values);
  });
});

describe('MAX_IMPORT_BYTES', () => {
  test('is 5 MB — about what localStorage can hold', () => {
    expect(utils.MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
  });
});
