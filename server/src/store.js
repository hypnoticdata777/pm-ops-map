// File-backed workspace store: one JSON file per workspace on disk.
// A workspace is "claimed" by whoever pushes to it first, which sets the
// passphrase every future push/pull must present. There are no user accounts —
// knowing the workspace name and passphrase is the entire access model.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_STATE_BYTES = 2 * 1024 * 1024; // 2MB — generous for this app's JSON state, cheap to enforce.
const MIN_PASSPHRASE_LENGTH = 4;

class HttpError extends Error {
  constructor(message, status = 400, extra = undefined) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function hashPassphrase(passphrase, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(passphrase, salt, 64);
  return { salt: salt.toString('hex'), hash: derived.toString('hex') };
}

function verifyPassphrase(passphrase, salt, hash) {
  const derived = crypto.scryptSync(passphrase, Buffer.from(salt, 'hex'), 64);
  const a = derived;
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class WorkspaceStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this._locks = new Map(); // slug -> tail promise, serializes writes per workspace
  }

  _filePath(slug) {
    return path.join(this.dataDir, `${slug}.json`);
  }

  _readRaw(slug) {
    const file = this._filePath(slug);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  // Runs fn exclusively per-slug so two concurrent requests for the same
  // workspace can't interleave a read-modify-write and drop an update.
  _withLock(slug, fn) {
    // PROJECT BEACON: File writes are serialized per workspace in this process;
    // this is not a cross-process/distributed lock.
    const tail = (this._locks.get(slug) || Promise.resolve()).then(fn, fn);
    this._locks.set(slug, tail.catch(() => {}));
    return tail;
  }

  async pull(slug, passphrase) {
    if (!isValidSlug(slug)) throw new HttpError('Invalid workspace name.', 400);
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new HttpError('Passphrase is required.', 400);
    }
    const existing = this._readRaw(slug);
    if (!existing) throw new HttpError('No workspace with that name exists yet.', 404);
    if (!verifyPassphrase(passphrase, existing.salt, existing.hash)) {
      throw new HttpError('Incorrect passphrase for this workspace.', 403);
    }
    return { state: existing.state, version: existing.version, updatedAt: existing.updatedAt };
  }

  async peekVersion(slug, passphrase) {
    const result = await this.pull(slug, passphrase);
    return { version: result.version, updatedAt: result.updatedAt };
  }

  async push(slug, { passphrase, state, expectedVersion }) {
    if (!isValidSlug(slug)) {
      throw new HttpError('Workspace name must be 2-40 lowercase letters, numbers, or hyphens.', 400);
    }
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new HttpError(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`, 400);
    }
    if (state === undefined || state === null || typeof state !== 'object') {
      throw new HttpError('State payload must be a JSON object.', 400);
    }
    const size = Buffer.byteLength(JSON.stringify(state));
    if (size > MAX_STATE_BYTES) {
      throw new HttpError('Workspace payload is too large.', 413);
    }

    return this._withLock(slug, () => {
      const existing = this._readRaw(slug);

      if (!existing) {
        const { salt, hash } = hashPassphrase(passphrase);
        const record = { salt, hash, state, version: 1, updatedAt: new Date().toISOString() };
        fs.writeFileSync(this._filePath(slug), JSON.stringify(record));
        return { version: record.version, updatedAt: record.updatedAt, created: true };
      }

      if (!verifyPassphrase(passphrase, existing.salt, existing.hash)) {
        throw new HttpError('Incorrect passphrase for this workspace.', 403);
      }
      if (typeof expectedVersion !== 'number' || expectedVersion !== existing.version) {
        throw new HttpError('Workspace has changed since your last sync.', 409, {
          state: existing.state,
          version: existing.version,
          updatedAt: existing.updatedAt,
        });
      }

      const record = {
        ...existing,
        state,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this._filePath(slug), JSON.stringify(record));
      return { version: record.version, updatedAt: record.updatedAt, created: false };
    });
  }
}

module.exports = { WorkspaceStore, HttpError, isValidSlug, MAX_STATE_BYTES, MIN_PASSPHRASE_LENGTH };
