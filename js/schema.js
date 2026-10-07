/** @import { Issue, CollectionStats } from './types.js' */
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

/**
 * One field of a record: how to clean it and what to use when it can't be.
 * @typedef {object} Field
 * @property {(input: unknown) => unknown} clean  The cleaned value, or `undefined` when the input is unusable.
 * @property {unknown} [fallback]                  Used when `clean` returns undefined (unless `optional`).
 * @property {boolean} [required]                  An unusable value drops the whole record.
 * @property {boolean} [optional]                  An unusable value leaves the field absent.
 * @property {boolean} [numeric]                   Compare input and cleaned value as numbers.
 * @property {(input: unknown, cleaned: unknown) => boolean} [sameAs]  Custom "nothing was changed" test.
 */

/** @typedef {Record<string, Field>} Spec */

/**
 * @typedef {(record: Record<string, unknown>, raw: Record<string, unknown>, ctx: { path: string, label: string, index: number }) =>
 *   { value: Record<string, unknown>, repaired?: boolean, errors?: Issue[] } | null} FinishFn
 */

/**
 * @template T
 * @typedef {object} CollectionResult
 * @property {T[]} items
 * @property {CollectionStats} stats
 * @property {Issue[]} errors     Capped at MAX_ISSUES_PER_COLLECTION.
 * @property {number} omitted     How many further errors were not kept.
 */

// ── Primitive cleaners (return undefined when the input is unusable) ──────────

/** @param {unknown} value @returns {string} */
export function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * @param {unknown} value
 * @param {number} max
 * @param {{ multiline?: boolean }} [options]
 * @returns {string}
 */
export function cleanText(value, max, { multiline = false } = {}) {
  let s = asString(value).replace(CONTROL_CHARS, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.trim().slice(0, max);
}

/** @param {unknown} value @returns {string | undefined} */
export function cleanId(value) {
  return typeof value === 'string' && ID_RE.test(value) ? value : undefined;
}

/** @param {unknown} value @returns {value is string} */
export function isHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** @param {unknown} value @returns {string | undefined} */
export function cleanTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

/**
 * @param {unknown} value
 * @param {{ min?: number, max?: number, integer?: boolean }} [options]
 * @returns {number | undefined}
 */
export function cleanNumber(value, { min = 0, max = 1e9, integer = false } = {}) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return integer ? Math.trunc(n) : Math.round(n * 100) / 100;
}

/** @param {string} prefix @returns {string} */
export function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// A short, single-line, quoted rendering of an untrusted value for error messages.
// (Still escaped by the view that displays it — this only keeps messages readable.)
/** @param {unknown} value @returns {string} */
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

/** @param {number} max @param {string} [fallback] @returns {Field} */
export const line = (max, fallback = '') => ({ clean: v => cleanText(v, max), fallback });
/** @param {number} max @param {string} [fallback] @returns {Field} */
export const text = (max, fallback = '') => ({ clean: v => cleanText(v, max, { multiline: true }), fallback });
/** @param {ReadonlyArray<unknown>} list @param {unknown} fallback @returns {Field} */
export const choice = (list, fallback) => ({ clean: v => (list.includes(v) ? v : undefined), fallback });
/** @param {string | null} [fallback] @returns {Field} */
export const date = (fallback = null) => ({ clean: v => (isValidISODate(v) ? v : undefined), fallback });
// Optional fields stay absent when the input is absent or unusable (no empty-string placeholders).
/** @returns {Field} */
export const stamp = () => ({ clean: cleanTimestamp, optional: true });
/** @returns {Field} */
export const optionalDate = () => ({ clean: v => (isValidISODate(v) ? v : undefined), optional: true });
// A valid link counts as unchanged even when the parser canonicalizes it
// (https://example.com -> https://example.com/); only invalid links are "repairs".
/** @param {string} [fallback] @returns {Field} */
export const url = (fallback = '') => ({ clean: v => normalizeUrl(v) || undefined, fallback, sameAs: () => true });
/** @param {number} [fallback] @returns {Field} */
export const money = (fallback = 0) => ({ clean: v => cleanNumber(v), fallback, numeric: true });
/** @param {number} [fallback] @returns {Field} */
export const count = (fallback = 0) => ({ clean: v => cleanNumber(v, { max: 1e6, integer: true }), fallback, numeric: true });

/** True when `value` is one of `list` (a type guard, so callers can narrow an untrusted value). @param {ReadonlyArray<string>} list @param {unknown} value @returns {value is string} */
export function isOneOf(list, value) {
  return list.includes(/** @type {string} */ (value));
}

/** @param {unknown} input @returns {boolean} */
export function wasProvided(input) {
  return !(input === undefined || input === null || input === '');
}

/** @param {unknown} input @param {unknown} cleaned @param {Field} field @returns {boolean} */
function unchanged(input, cleaned, field) {
  if (field.sameAs) return field.sameAs(input, cleaned);
  if (field.numeric) return Number(input) === cleaned;
  return typeof input === 'string' ? input.trim() === cleaned : input === cleaned;
}

/** @param {Field} field @returns {string} */
function describeFallback(field) {
  if (field.optional) return 'cleared';
  const f = field.fallback;
  return f === '' || f === null || f === undefined ? 'cleared' : `reset to ${shorten(f)}`;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
export const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

// ── Records ───────────────────────────────────────────────────────────────────

// Builds an error. `label` names the record in the sentence ("Work order 3 (\"Fix sink\")");
// without one the path is used.
/** @param {{ path: string, label?: string, field?: string, code: string, detail: string }} parts @returns {Issue} */
export function makeIssue({ path, label, field, code, detail }) {
  const who = label || path;
  return { path, field, code, message: field ? `${who} — ${field}: ${detail}` : `${who} — ${detail}` };
}

// Applies a spec to one raw record. Returns { value, errors, repaired }; `value` is
// null when the record is unusable (not an object, or a required field is unusable).
/**
 * @param {unknown} raw
 * @param {Spec} spec
 * @param {{ path?: string, label?: string }} [where]
 * @returns {{ value: Record<string, unknown> | null, errors: Issue[], repaired: boolean }}
 */
export function validateRecord(raw, spec, { path = '', label = '' } = {}) {
  if (!isPlainObject(raw)) {
    return { value: null, repaired: false, errors: [makeIssue({ path, label, code: 'not_an_object', detail: 'is not an object, so it is skipped.' })] };
  }
  /** @type {Record<string, unknown>} */
  const value = {};
  /** @type {Issue[]} */
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
/**
 * @param {unknown} rawList
 * @param {Spec} spec
 * @param {{ path?: string, noun?: string, idPrefix?: string, max?: number, titleKey?: string, finish?: FinishFn }} [options]
 * @returns {CollectionResult<Record<string, unknown>>}
 */
export function validateCollection(rawList, spec, { path = '', noun = 'Record', idPrefix = 'item', max = Infinity, titleKey, finish } = {}) {
  const stats = { kept: 0, dropped: 0, repaired: 0 };
  /** @type {Record<string, unknown>[]} */
  const items = [];
  /** @type {Issue[]} */
  const errors = [];
  let omitted = 0;
  /** @param {Issue[]} list */
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
