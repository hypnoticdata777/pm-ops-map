// A small hand-rolled schema layer (no dependencies, so the client keeps working
// from file://). It turns untrusted data into trusted records AND says exactly what
// it had to change: every validator returns { value, errors[] } where each error
// names the field path ("workOrders[2].priority"), a machine code, and a sentence a
// person can read in the import review.
//
// Pure functions only — no DOM, no shared state. Domain specs (which fields a work
// order has, which values are allowed) live in normalize.js and are built from the
// field helpers below.
import { isValidISODate, normalizeUrl } from './utils.js';

// Letters, digits and . _ : - only — safe in an attribute, a selector, or a URL fragment.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// C0 controls except \t \n \r, DEL, and the Unicode line/paragraph separators.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g;
// Every control character, for turning a hostile value into one safe display line.
const DISPLAY_CONTROL = /[\u0000-\u001F\u007F\u2028\u2029]/g;

export const MAX_ISSUES_PER_COLLECTION = 100;

// ── Primitive cleaners (return undefined when the input is unusable) ──────────

export function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function cleanText(value, max, { multiline = false } = {}) {
  let s = asString(value).replace(CONTROL_CHARS, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.trim().slice(0, max);
}

export function cleanId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : undefined;
}

export function isHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function cleanTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

export function cleanNumber(value, { min = 0, max = 1e9, integer = false } = {}) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return integer ? Math.trunc(n) : Math.round(n * 100) / 100;
}

export function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// A short, single-line, quoted rendering of an untrusted value for error messages.
// (Still escaped by the view that displays it — this only keeps messages readable.)
export function shorten(value) {
  if (typeof value === 'string') {
    const flat = value.replace(DISPLAY_CONTROL, ' ');
    return `"${flat.length > 40 ? `${flat.slice(0, 40)}…` : flat}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return 'a list';
  if (value && typeof value === 'object') return 'an object';
  return 'nothing';
}

// ── Field helpers ─────────────────────────────────────────────────────────────
// Each field: { clean(input) -> value | undefined, fallback, required?, optional?, numeric?, sameAs? }

export const line = (max, fallback = '') => ({ clean: v => cleanText(v, max), fallback });
export const text = (max, fallback = '') => ({ clean: v => cleanText(v, max, { multiline: true }), fallback });
export const choice = (list, fallback) => ({ clean: v => (list.includes(v) ? v : undefined), fallback });
export const date = (fallback = null) => ({ clean: v => (isValidISODate(v) ? v : undefined), fallback });
// Optional fields stay absent when the input is absent or unusable (no empty-string placeholders).
export const stamp = () => ({ clean: cleanTimestamp, optional: true });
export const optionalDate = () => ({ clean: v => (isValidISODate(v) ? v : undefined), optional: true });
// A valid link counts as unchanged even when the parser canonicalizes it
// (https://example.com -> https://example.com/); only invalid links are "repairs".
export const url = (fallback = '') => ({ clean: v => normalizeUrl(v) || undefined, fallback, sameAs: () => true });
export const money = (fallback = 0) => ({ clean: v => cleanNumber(v), fallback, numeric: true });
export const count = (fallback = 0) => ({ clean: v => cleanNumber(v, { max: 1e6, integer: true }), fallback, numeric: true });

export function wasProvided(input) {
  return !(input === undefined || input === null || input === '');
}

function unchanged(input, cleaned, field) {
  if (field.sameAs) return field.sameAs(input, cleaned);
  if (field.numeric) return Number(input) === cleaned;
  return typeof input === 'string' ? input.trim() === cleaned : input === cleaned;
}

function describeFallback(field) {
  if (field.optional) return 'cleared';
  const f = field.fallback;
  return f === '' || f === null || f === undefined ? 'cleared' : `reset to ${shorten(f)}`;
}

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

// ── Records ───────────────────────────────────────────────────────────────────

// Builds an error. `label` names the record in the sentence ("Work order 3 (\"Fix sink\")");
// without one the path is used.
export function makeIssue({ path, label, field, code, detail }) {
  const who = label || path;
  return { path, field, code, message: field ? `${who} — ${field}: ${detail}` : `${who} — ${detail}` };
}

// Applies a spec to one raw record. Returns { value, errors, repaired }; `value` is
// null when the record is unusable (not an object, or a required field is unusable).
export function validateRecord(raw, spec, { path = '', label = '' } = {}) {
  if (!isPlainObject(raw)) {
    return { value: null, repaired: false, errors: [makeIssue({ path, label, code: 'not_an_object', detail: 'is not an object, so it is skipped.' })] };
  }
  const value = {};
  const errors = [];
  for (const [key, field] of Object.entries(spec)) {
    const input = raw[key];
    const fieldPath = path ? `${path}.${key}` : key;
    const cleaned = field.clean(input);
    if (cleaned === undefined || (field.required && cleaned === '')) {
      if (field.required) {
        return { value: null, repaired: false, errors: [makeIssue({ path: fieldPath, label, field: key, code: 'missing_required', detail: 'required, so the record is skipped.' })] };
      }
      if (wasProvided(input)) {
        errors.push(makeIssue({ path: fieldPath, label, field: key, code: 'invalid_value', detail: `${shorten(input)} is not allowed; ${describeFallback(field)}.` }));
      }
      if (!field.optional) value[key] = field.fallback;
    } else {
      value[key] = cleaned;
      if (wasProvided(input) && !unchanged(input, cleaned, field)) {
        errors.push(makeIssue({ path: fieldPath, label, field: key, code: 'adjusted', detail: 'was cleaned up (unsupported characters removed or shortened to the length limit).' }));
      }
    }
  }
  return { value, errors, repaired: errors.length > 0 };
}

// ── Collections ───────────────────────────────────────────────────────────────

// Validates a list of records, assigning safe unique ids. `finish(record, raw, ctx)`
// runs cross-reference checks and returns { value, repaired, errors? } (or null to
// drop). Returns { items, stats: { kept, dropped, repaired }, errors, omitted };
// `errors` is capped so a hostile file can't build a giant list (`omitted` counts the rest).
export function validateCollection(rawList, spec, { path = '', noun = 'Record', idPrefix = 'item', max = Infinity, titleKey, finish } = {}) {
  const stats = { kept: 0, dropped: 0, repaired: 0 };
  const items = [];
  const errors = [];
  let omitted = 0;
  const report = list => list.forEach(e => { if (errors.length < MAX_ISSUES_PER_COLLECTION) errors.push(e); else omitted++; });
  if (!Array.isArray(rawList)) return { items, stats, errors, omitted };

  const seen = new Set();
  rawList.forEach((raw, index) => {
    const recordPath = `${path}[${index}]`;
    const title = titleKey && isPlainObject(raw) && typeof raw[titleKey] === 'string' && raw[titleKey].trim() ? ` (${shorten(raw[titleKey])})` : '';
    const label = `${noun} ${index + 1}${title}`;

    if (items.length >= max) {
      stats.dropped++;
      report([makeIssue({ path: recordPath, label, code: 'over_limit', detail: `over the limit of ${max} records, so it is skipped.` })]);
      return;
    }
    const result = validateRecord(raw, spec, { path: recordPath, label });
    if (!result.value) { stats.dropped++; report(result.errors); return; }

    let { value, repaired } = result;
    const recordErrors = [...result.errors];
    let id = cleanId(raw.id);
    if (!id || seen.has(id)) {
      recordErrors.push(makeIssue({
        path: `${recordPath}.id`, label, field: 'id',
        code: id ? 'duplicate_id' : 'bad_id',
        detail: id ? 'repeats an earlier record, so a new id was generated.' : 'is missing or unsafe, so a new id was generated.',
      }));
      id = generateId(`${idPrefix}-${index}`);
      repaired = true;
    }
    seen.add(id);
    value = { id, ...value };
    if (finish) {
      const finished = finish(value, raw, { path: recordPath, label, index });
      if (!finished) { stats.dropped++; report(recordErrors); return; }
      value = finished.value;
      repaired = repaired || !!finished.repaired;
      if (finished.errors) recordErrors.push(...finished.errors);
    }
    report(recordErrors);
    if (repaired) stats.repaired++;
    stats.kept++;
    items.push(value);
  });
  return { items, stats, errors, omitted };
}
