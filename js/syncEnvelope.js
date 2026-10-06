// Validates what the Team Sync server sends back before the client acts on it.
// The workspace *contents* are checked field by field by validateImportedState();
// this only checks the envelope around them ({ state, version, updatedAt }), so a
// misbehaving or misconfigured server (an HTML error page served with status 200,
// a missing version, a state that isn't an object) fails with a clear message
// instead of a TypeError deep inside the sync loop. Pure; no DOM, no shared state.
import { cleanTimestamp } from './schema.js';

export class SyncResponseError extends Error {
  constructor(message) {
    super(`The sync server sent an unexpected response: ${message}`);
    this.name = 'SyncResponseError';
  }
}

const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function requireObject(body) {
  if (!isObject(body)) throw new SyncResponseError('the reply was not a JSON object.');
  return body;
}

function requireVersion(body) {
  const v = body.version;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new SyncResponseError('"version" must be a whole number of 0 or more.');
  }
  return v;
}

const stampOrEmpty = value => cleanTimestamp(value) || '';

// A pull response, or the `current` workspace attached to a 409 conflict.
export function parseVersionedState(body) {
  requireObject(body);
  if (!isObject(body.state)) throw new SyncResponseError('"state" must be an object.');
  return { state: body.state, version: requireVersion(body), updatedAt: stampOrEmpty(body.updatedAt) };
}

export function parseVersionInfo(body) {
  requireObject(body);
  return { version: requireVersion(body), updatedAt: stampOrEmpty(body.updatedAt) };
}

export function parsePushResult(body) {
  requireObject(body);
  return { version: requireVersion(body), updatedAt: stampOrEmpty(body.updatedAt), created: body.created === true };
}
