// Validates what the Team Sync server sends back before the client acts on it.
// The workspace *contents* are checked field by field by validateImportedState();
// this only checks the envelope around them ({ state, version, updatedAt }), so a
// misbehaving or misconfigured server (an HTML error page served with status 200,
// a missing version, a state that isn't an object) fails with a clear message
// instead of a TypeError deep inside the sync loop. Pure; no DOM, no shared state.
import { cleanTimestamp } from './schema.js';

export class SyncResponseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(`The sync server sent an unexpected response: ${message}`);
    this.name = 'SyncResponseError';
  }
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} body @returns {Record<string, unknown>} */
function requireObject(body) {
  if (!isObject(body)) throw new SyncResponseError('the reply was not a JSON object.');
  return body;
}

/** @param {Record<string, unknown>} body @returns {number} */
function requireVersion(body) {
  const v = body.version;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new SyncResponseError('"version" must be a whole number of 0 or more.');
  }
  return v;
}

/** @param {unknown} value @returns {string} */
const stampOrEmpty = value => cleanTimestamp(value) || '';

// A pull response, or the `current` workspace attached to a 409 conflict.
/** A pull response, or the `current` workspace of a 409. @param {unknown} body @returns {{ state: Record<string, unknown>, version: number, updatedAt: string }} */
export function parseVersionedState(body) {
  const obj = requireObject(body);
  if (!isObject(obj.state)) throw new SyncResponseError('"state" must be an object.');
  return { state: obj.state, version: requireVersion(obj), updatedAt: stampOrEmpty(obj.updatedAt) };
}

/** @param {unknown} body @returns {{ version: number, updatedAt: string }} */
export function parseVersionInfo(body) {
  const obj = requireObject(body);
  return { version: requireVersion(obj), updatedAt: stampOrEmpty(obj.updatedAt) };
}

/** @param {unknown} body @returns {{ version: number, updatedAt: string, created: boolean }} */
export function parsePushResult(body) {
  const obj = requireObject(body);
  return { version: requireVersion(obj), updatedAt: stampOrEmpty(obj.updatedAt), created: obj.created === true };
}
