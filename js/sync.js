// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
// Optional team sync: talks to the self-hosted sync server in server/ so a
// small team can share one workspace across browsers without a full backend.
// The app works exactly as before if this is never connected — everything
// here is additive and opt-in.
import { orgData, teamData, workOrders, portfolio } from './state.js';
import {
  getCompanyName, saveBackupSnapshot, logAudit, _showActionToast, RESET_EVENT, SYNC_CONFIG_KEY,
} from './storage.js';
import { buildStatePayload, validateImportedState, formatImportReport } from './stateSchema.js';
import { openImportReview, _applyImportedState, _saveUndoSnapshot } from './io.js';
import { parseVersionedState, parseVersionInfo, parsePushResult } from './syncEnvelope.js';
import { escapeHtml } from './utils.js';
import { DEMO_MODE } from './demoMode.js';

const POLL_INTERVAL_MS = 8000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// Transient (not persisted) sync session state.
const sync = {
  serverUrl: '',
  workspace: '',
  passphrase: '',
  version: 0,
  lastSyncedSnapshot: null,
  lastSyncedAt: null,
  connected: false,
  busy: false,
  timer: null,
  lastError: '',
  lastConflict: null, // { version, localSnapshot } — suppresses repeat prompts for the same conflict
};

function normalizeServerUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

// A plain http:// address to anything other than this machine would send the
// passphrase and the whole workspace across the network unencrypted.
export function isInsecureSyncUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  if (parsed.protocol !== 'http:') return false;
  const host = parsed.hostname;
  return !(host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]');
}

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveSyncConfig() {
  if (!sync.connected) return; // never re-create the saved connection after a reset/disconnect
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({
      serverUrl: sync.serverUrl,
      workspace: sync.workspace,
      passphrase: sync.passphrase,
      version: sync.version,
    }));
  } catch (_) { /* best effort — sync still works this session even if storage is full */ }
}

function clearSyncConfig() {
  try { localStorage.removeItem(SYNC_CONFIG_KEY); } catch (_) {}
}

function currentPayload() {
  // exportedAt is fixed so re-serializing unchanged state produces an
  // identical string — that's how the auto-sync loop detects local edits.
  return buildStatePayload({
    company: getCompanyName(),
    departments: orgData.departments,
    team: teamData,
    workOrders,
    portfolio,
    exportedAt: 'sync',
  });
}

function currentSnapshot() {
  return JSON.stringify(currentPayload());
}

// baseUrl defaults to the committed connection so the background loop always
// targets the live workspace. connectSync()/createWorkspace() pass an explicit
// candidate URL instead, so a reconnect attempt never touches `sync`'s fields
// (and can't race the background loop) until it actually succeeds.
// `parse` checks the shape of a successful reply (see syncEnvelope.js) and throws a
// SyncResponseError for anything else, so callers never touch a malformed response.
async function apiCall(path, body, baseUrl = sync.serverUrl, parse = reply => reply) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON error page */ }
  if (!res.ok) {
    const err = new Error(json?.error || `Sync server returned ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return parse(json);
}

// ── Public: connect / disconnect ──────────────────────────────────────────────

export function initSync() {
  if (DEMO_MODE) return; // the public demo must never be pointed at a sync server
  const saved = loadSyncConfig();
  if (!saved?.serverUrl || !saved?.workspace || !saved?.passphrase) return;
  Object.assign(sync, {
    serverUrl: normalizeServerUrl(saved.serverUrl),
    workspace: saved.workspace,
    passphrase: saved.passphrase,
    version: saved.version || 0,
    connected: true,
  });
  renderSyncStatus();
  startAutoSync();
}

export function openSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (!modal || DEMO_MODE) return;
  document.getElementById('sync-server-url').value = sync.serverUrl || 'http://localhost:4000';
  document.getElementById('sync-workspace').value = sync.workspace || '';
  document.getElementById('sync-passphrase').value = sync.passphrase || '';
  renderSyncModalStatus();
  modal.classList.add('visible');
}

export function closeSyncModal() {
  document.getElementById('sync-modal')?.classList.remove('visible');
}

export async function connectSync() {
  if (DEMO_MODE) return;
  const serverUrl = normalizeServerUrl(document.getElementById('sync-server-url')?.value);
  const workspace = (document.getElementById('sync-workspace')?.value || '').trim().toLowerCase();
  const passphrase = document.getElementById('sync-passphrase')?.value || '';

  if (!serverUrl) return alert('Enter your sync server URL.');
  if (!SLUG_RE.test(workspace)) return alert('Workspace name must be 2-40 lowercase letters, numbers, or hyphens.');
  if (passphrase.length < 4) return alert('Passphrase must be at least 4 characters.');
  if (isInsecureSyncUrl(serverUrl) && !confirm(
    'This server address starts with http://, not https://.\n\n' +
    'Your passphrase and your entire workspace would cross the network unencrypted, where anyone on that network can read them.\n\n' +
    'Connect anyway?',
  )) return;

  // Deliberately not touching `sync` yet: if this device is already connected
  // elsewhere, the background loop keeps syncing that workspace safely while
  // this attempt is in flight, and a failed/declined attempt leaves nothing
  // to roll back.
  setSyncModalBusy(true, 'Connecting…');

  try {
    const remote = await apiCall(`/api/workspaces/${workspace}/pull`, { passphrase }, serverUrl, parseVersionedState);
    setSyncModalBusy(false);
    // Existing workspace — let the user review before it overwrites this device.
    const report = validateImportedState(remote.state, orgData);
    closeSyncModal();
    openImportReview(remote.state, report, 'sync', () => {
      commitConnection({ serverUrl, workspace, passphrase, version: remote.version });
    });
  } catch (err) {
    setSyncModalBusy(false);
    if (err.status === 404) {
      if (!confirm(`No workspace named "${workspace}" exists yet.\n\nCreate it now with this device's current data? Anyone who enters this workspace name and passphrase will be able to read and change it.`)) {
        return;
      }
      await createWorkspace(serverUrl, workspace, passphrase);
      return;
    }
    if (err.status === 403) return alert('Incorrect passphrase for that workspace.');
    alert(`Could not reach sync server: ${err.message}`);
  }
}

async function createWorkspace(serverUrl, workspace, passphrase) {
  setSyncModalBusy(true, 'Creating workspace…');
  try {
    const result = await apiCall(`/api/workspaces/${workspace}/push`, {
      passphrase,
      state: currentPayload(),
      expectedVersion: 0,
    }, serverUrl, parsePushResult);
    setSyncModalBusy(false);
    closeSyncModal();
    commitConnection({ serverUrl, workspace, passphrase, version: result.version });
  } catch (err) {
    setSyncModalBusy(false);
    if (err.status === 409) {
      alert('Someone else just created a workspace with that name. Reopen Team Sync and connect again to join it.');
      return;
    }
    alert(`Could not create workspace: ${err.message}`);
  }
}

// Only point where a connection attempt actually takes effect — restarts the
// auto-sync loop cleanly even if it was already running against a different
// workspace (startAutoSync() stops any prior timer first).
function commitConnection({ serverUrl, workspace, passphrase, version }) {
  Object.assign(sync, { serverUrl, workspace, passphrase, version, connected: true });
  sync.lastSyncedSnapshot = currentSnapshot();
  sync.lastSyncedAt = Date.now();
  saveSyncConfig();
  logAudit('sync_connected', { title: sync.workspace });
  _showActionToast(`✓ Connected to team sync: ${sync.workspace}`, 'save-toast--success');
  renderSyncStatus();
  startAutoSync();
}

export function disconnectSync() {
  if (!confirm('Disconnect from team sync?\n\nThis device keeps its current data, but will stop sending or receiving updates.')) return;
  stopAutoSync();
  logAudit('sync_disconnected', { title: sync.workspace });
  Object.assign(sync, {
    connected: false, serverUrl: '', workspace: '', passphrase: '',
    version: 0, lastSyncedSnapshot: null, lastSyncedAt: null, lastConflict: null,
  });
  clearSyncConfig();
  renderSyncStatus();
  closeSyncModal();
  _showActionToast('Disconnected from team sync', 'save-toast--warn');
}

export async function syncNow() {
  if (!sync.connected) return openSyncModal();
  sync.lastConflict = null; // manual sync always gets a fresh attempt
  await runSyncTick(true);
}

// ── Auto-sync loop ────────────────────────────────────────────────────────────

function startAutoSync() {
  stopAutoSync();
  sync.timer = setInterval(() => runSyncTick(false), POLL_INTERVAL_MS);
}

function stopAutoSync() {
  if (sync.timer) clearInterval(sync.timer);
  sync.timer = null;
}

// A local reset removes the saved connection (including the passphrase). Stop
// syncing first so an in-flight tick cannot write it back before the reload.
window.addEventListener(RESET_EVENT, () => {
  stopAutoSync();
  Object.assign(sync, { connected: false, passphrase: '' });
});

async function runSyncTick(manual) {
  // PROJECT BEACON: This comparison is the sync decision point—dirty clients
  // push with an expected version; clean clients only check/pull newer state.
  if (!sync.connected || sync.busy) return;
  sync.busy = true;
  try {
    const snapshot = currentSnapshot();
    const dirty = snapshot !== sync.lastSyncedSnapshot;

    if (dirty) {
      await pushTick(snapshot, manual);
    } else {
      await pullIfNewerTick(manual);
    }
  } catch (err) {
    sync.lastError = err.message;
    if (manual) alert(`Sync failed: ${err.message}`);
  } finally {
    sync.busy = false;
    renderSyncStatus();
  }
}

async function pushTick(snapshot, manual) {
  try {
    const result = await apiCall(`/api/workspaces/${sync.workspace}/push`, {
      passphrase: sync.passphrase,
      state: JSON.parse(snapshot),
      expectedVersion: sync.version,
    }, undefined, parsePushResult);
    sync.version = result.version;
    sync.lastSyncedSnapshot = snapshot;
    sync.lastSyncedAt = Date.now();
    sync.lastConflict = null;
    saveSyncConfig();
    if (manual) _showActionToast('✓ Synced to team server', 'save-toast--success');
  } catch (err) {
    if (err.status === 409) {
      handlePushConflict(err.body?.current, snapshot, manual);
      return;
    }
    if (err.status === 403) {
      disconnectOnAuthFailure();
      return;
    }
    throw err;
  }
}

function handlePushConflict(rawCurrent, localSnapshot, manual) {
  if (!rawCurrent) return;
  let current;
  try {
    current = parseVersionedState(rawCurrent);
  } catch (err) {
    sync.lastError = err.message;
    if (manual) alert(`Sync conflict could not be shown: ${err.message}`);
    return;
  }
  const alreadySeen = sync.lastConflict
    && sync.lastConflict.version === current.version
    && sync.lastConflict.localSnapshot === localSnapshot;
  if (alreadySeen && !manual) return; // don't re-prompt every tick for the same unresolved conflict

  sync.lastConflict = { version: current.version, localSnapshot };
  saveBackupSnapshot('Before team sync merge');
  const report = validateImportedState(current.state, orgData);
  openImportReview(current.state, report, 'sync', () => {
    sync.version = current.version;
    sync.lastSyncedSnapshot = currentSnapshot();
    sync.lastSyncedAt = Date.now();
    sync.lastConflict = null;
    saveSyncConfig();
    renderSyncStatus();
  });
}

async function pullIfNewerTick(manual) {
  const versionInfo = await apiCall(`/api/workspaces/${sync.workspace}/version`, { passphrase: sync.passphrase }, undefined, parseVersionInfo)
    .catch(err => {
      if (err.status === 403) { disconnectOnAuthFailure(); return null; }
      throw err;
    });
  if (!versionInfo) return;

  if (versionInfo.version === sync.version) {
    sync.lastSyncedAt = Date.now();
    if (manual) _showActionToast('Already up to date', 'save-toast--success');
    return;
  }

  const remote = await apiCall(`/api/workspaces/${sync.workspace}/pull`, { passphrase: sync.passphrase }, undefined, parseVersionedState);

  // The version check and this pull were two separate round trips. If the
  // user edited local state while either was in flight, applying the remote
  // snapshot now would silently discard that edit with no trace left for the
  // next tick to catch — so bail and let the next tick push it instead.
  if (currentSnapshot() !== sync.lastSyncedSnapshot) return;

  // Never apply unvalidated data, even on the "safe" auto-pull path — a
  // malformed or incompatible remote payload should fail loudly, not throw
  // inside _applyImportedState and wedge the loop silently.
  const report = validateImportedState(remote.state, orgData);
  if (!report.ok) {
    sync.lastError = formatImportReport(report);
    if (manual) alert(`Sync failed: incoming workspace data is incompatible.\n\n${formatImportReport(report)}`);
    return;
  }

  // Remote moved ahead and we have no local edits in flight — safe to apply
  // automatically, with a backup snapshot and an undo entry as the way back.
  saveBackupSnapshot('Before sync update');
  _saveUndoSnapshot();
  _applyImportedState(remote.state);
  logAudit('import_sync', { title: sync.workspace });
  sync.version = remote.version;
  sync.lastSyncedSnapshot = currentSnapshot();
  sync.lastSyncedAt = Date.now();
  saveSyncConfig();
  _showActionToast('Synced latest changes from your team', 'save-toast--success');
}

function disconnectOnAuthFailure() {
  stopAutoSync();
  Object.assign(sync, { connected: false });
  clearSyncConfig();
  renderSyncStatus();
  alert('Team sync disconnected: the passphrase was rejected by the server. Reconnect with the current passphrase.');
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderSyncStatus() {
  const pill = document.getElementById('sync-status-pill');
  if (!pill) return;
  if (!sync.connected) {
    pill.innerHTML = '&#8635; Team Sync <small>beta</small>';
    pill.className = 'btn btn-secondary';
    return;
  }
  const when = sync.lastSyncedAt ? timeAgo(sync.lastSyncedAt) : 'connecting…';
  pill.innerHTML = `&#8635; ${escapeHtml(sync.workspace)} <small>${escapeHtml(when)}</small>`;
  pill.className = 'btn btn-secondary sync-btn--active';
}

function renderSyncModalStatus() {
  const status = document.getElementById('sync-modal-status');
  if (!status) return;
  if (sync.connected) {
    status.innerHTML = `Connected to <strong>${escapeHtml(sync.workspace)}</strong> · last synced ${escapeHtml(sync.lastSyncedAt ? timeAgo(sync.lastSyncedAt) : 'never')}`;
  } else {
    status.textContent = 'Not connected — this device is working offline.';
  }
}

function setSyncModalBusy(busy, label = '') {
  const btn = document.getElementById('sync-connect-btn');
  const status = document.getElementById('sync-modal-status');
  if (btn) btn.disabled = busy;
  if (busy && status) status.textContent = label;
}

function timeAgo(ts) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
