/** @import { Issue, AuditEntry, OrgData } from './types.js' */
// localStorage persistence, toast notifications, and company profile helpers.
import {
  orgData, teamData, setTeamData, workOrders, setWorkOrders,
  auditLog, setAuditLog, portfolio, setPortfolio,
  ownerColors, defaultAffinities, AUDIT_LABELS,
  STATUS_CYCLE, PRIORITY_CYCLE,
} from './state.js';
import { _isQuotaError, _slugify } from './utils.js';
import { namespacedKey } from './demoMode.js';
import {
  applySavedTasks, normalizeTeam, normalizeWorkOrders, normalizePortfolio,
  normalizeAuditLog, sanitizeWorkspace,
} from './normalize.js';

// ── Storage keys ──────────────────────────────────────────────────────────────
export const STORAGE_KEY     = namespacedKey('pm-ops-data-v1');
export const COMPANY_KEY     = namespacedKey('pm-ops-company-name');
export const OPS_PROFILE_KEY = namespacedKey('pm-ops-profile-v1');
export const NAV_COMPACT_KEY = namespacedKey('pm-ops-nav-compact');
export const TEAM_KEY        = namespacedKey('pm-ops-team-v1');
export const WORKORDERS_KEY  = namespacedKey('pm-ops-workorders-v1');
export const PORTFOLIO_KEY   = namespacedKey('pm-ops-portfolio-v1');
export const AUDIT_KEY       = namespacedKey('pm-ops-audit-v1');
export const GUIDE_KEY       = namespacedKey('pm-ops-guide-dismissed');
export const NOTIF_DATE_KEY  = namespacedKey('pm-ops-notif-date');
export const LAUNCH_CHECKLIST_KEY = namespacedKey('pm-ops-launch-checklist-v1');
export const BACKUP_KEY           = namespacedKey('pm-ops-backups-v1');
export const SYNC_CONFIG_KEY      = namespacedKey('pm-ops-sync-config-v1');
const MAX_BACKUPS = 5;

/**
 * The company profile saved by onboarding (all fields optional: older saves lack some).
 * @typedef {{ company?: string, portfolioSize?: string, focus?: string, configuredAt?: string }} OpsProfile
 */

// ── Repairs made while loading saved data ─────────────────────────────────────
// Everything read back from localStorage goes through normalize.js. When that had to
// reset, clear or drop something, the loader records it here (source + field path +
// sentence) and warns once in the console, so a silent repair can still be diagnosed.
/** @type {{ source: string, path: string, code: string, message: string }[]} */
let loadIssues = [];

export function getLoadIssues() { return loadIssues.map(issue => ({ ...issue })); }
export function clearLoadIssues() { loadIssues = []; }

/** @type {Record<string, string>} */
const LOAD_SOURCE_LABELS = { tasks: 'tasks', team: 'team', workOrders: 'work orders', portfolio: 'portfolio' };

/** @param {string} source @param {Issue[]} errors @param {number} [omitted] */
function recordLoadIssues(source, errors, omitted = 0) {
  loadIssues = loadIssues.filter(issue => issue.source !== source);
  if (!errors.length) return;
  errors.forEach(({ path, code, message }) => loadIssues.push({ source, path, code, message }));
  const total = errors.length + omitted;
  console.warn(
    `PM Ops Map repaired ${total} saved value${total === 1 ? '' : 's'} while loading ${LOAD_SOURCE_LABELS[source]}:\n` +
    errors.slice(0, 20).map(e => `  - ${e.message}`).join('\n') + (total > 20 ? `\n  …and ${total - 20} more.` : ''),
  );
}

// ── Toast notifications ───────────────────────────────────────────────────────
/** @type {ReturnType<typeof setTimeout> | undefined} */
let _toastTimer;

export function showSaveToast(isError = false, isQuota = false) {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  clearTimeout(_toastTimer);

  toast.textContent = isQuota
    ? '⚠ Storage full — export your data now!'
    : isError ? '⚠ Save failed' : '✓ Saved';
  toast.className = 'save-toast' + (isError ? ' save-toast--error' : '');

  void toast.offsetWidth; // force reflow so re-triggering the animation works
  toast.classList.add('visible');

  _toastTimer = setTimeout(() => toast.classList.remove('visible'), isQuota ? 6000 : 2000);
}

/** @param {string} msg @param {string} cls @param {number} [duration] */
export function _showActionToast(msg, cls, duration = 3000) {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = 'save-toast ' + cls;
  void toast.offsetWidth;
  toast.classList.add('visible');
  _toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

// ── Task data persistence ─────────────────────────────────────────────────────
export function saveToStorage() {
  try {
    const payload = liveDepartments().map(dept => ({
      id: dept.id,
      tasks: dept.tasks.map(t => ({
        id:           t.id,
        _configName:  t._configName || t.name,
        name:         t.name,
        owner:        t.owner,
        status:       t.status   || 'todo',
        priority:     t.priority || 'medium',
        dueDate:      t.dueDate  || null,
        blockedBy:    t.blockedBy || null,
        notes:        t.notes    || null,
        customFields: t.customFields || null,
      }))
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    showSaveToast();
  } catch (e) {
    showSaveToast(true, _isQuotaError(e));
  }
}

export function loadFromStorage() {
  // PROJECT BEACON: Reconcile saved edits onto current config by permanent task id
  // (falling back to _configName); visible task names are user-editable and are not durable identity keys.
  // Field-level validation lives in normalize.js (applySavedTasks).
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    /** @type {Issue[]} */
    const issues = [];
    applySavedTasks(liveDepartments(), saved, { issues });
    recordLoadIssues('tasks', issues);
  } catch (e) {
    console.error('Failed to parse saved task data — data preserved in storage:', e);
    _showActionToast('⚠ Could not load saved data — try exporting a backup', 'save-toast--error', 6000);
  }
}

export function resetStorage() {
  const modal = document.getElementById('reset-modal');
  if (modal) {
    modal.classList.add('visible');
    return;
  }
  const choice = prompt('Reset options:\n\n1 = Tasks only\n2 = Operating workspace\n3 = Company setup and preferences only\n4 = Everything on this device\n\nType 1, 2, 3, or 4.');
  if (choice) confirmResetStorage(choice);
}

export function closeResetModal() {
  document.getElementById('reset-modal')?.classList.remove('visible');
}

// Full-page reloads go through this object so tests can observe them (jsdom
// cannot navigate, and window.location.reload is not mockable).
export const pageControl = { reload: () => location.reload() };

// Fired just before a local reset so other modules (Team Sync) stop writing to
// localStorage while keys are being removed.
export const RESET_EVENT = 'pm-ops-reset';

// Every localStorage key the app writes. The "Everything" reset is derived from
// this list, and a unit test checks that every exported *_KEY constant is in it,
// so a newly added key cannot be forgotten and silently survive a reset.
/** @type {string[]} */
export const ALL_STORAGE_KEYS = [
  STORAGE_KEY, COMPANY_KEY, OPS_PROFILE_KEY, NAV_COMPACT_KEY, TEAM_KEY, WORKORDERS_KEY,
  PORTFOLIO_KEY, AUDIT_KEY, GUIDE_KEY, NOTIF_DATE_KEY, LAUNCH_CHECKLIST_KEY, BACKUP_KEY,
  SYNC_CONFIG_KEY,
];

// Automatic backups are full copies of the workspace (tenant records included),
// so any reset that claims to remove the workspace must remove them too.
/** @type {Record<string, { label: string, keys: string[] }>} */
export const RESET_GROUPS = {
  '1': {
    label: 'task names, owners, statuses, due dates, dependencies, notes, and custom fields (automatic backups are kept)',
    keys: [STORAGE_KEY],
  },
  '2': {
    label: 'operating workspace data, including automatic backups',
    keys: [STORAGE_KEY, TEAM_KEY, WORKORDERS_KEY, PORTFOLIO_KEY, AUDIT_KEY, LAUNCH_CHECKLIST_KEY, BACKUP_KEY],
  },
  '3': {
    label: 'company setup and preferences, including the saved Team Sync connection',
    keys: [COMPANY_KEY, OPS_PROFILE_KEY, NAV_COMPACT_KEY, GUIDE_KEY, NOTIF_DATE_KEY, SYNC_CONFIG_KEY],
  },
  '4': {
    label: 'all PM Ops Map data on this device, including automatic backups and the saved Team Sync connection',
    keys: ALL_STORAGE_KEYS,
  },
};

/** @param {unknown} choice */
export function confirmResetStorage(choice) {
  const selected = RESET_GROUPS[String(choice).trim()];
  if (!selected) {
    alert('Reset canceled. Please choose 1, 2, 3, or 4.');
    return;
  }
  if (!confirm(`Reset ${selected.label}?\n\nThis only affects data stored in this browser. Files you exported earlier, and any copy on a Team Sync server, are not touched.`)) return;
  closeResetModal();
  window.dispatchEvent(new Event(RESET_EVENT));
  selected.keys.forEach(key => localStorage.removeItem(key));
  pageControl.reload();
}

// ── Team data persistence ─────────────────────────────────────────────────────
const knownDeptIds = () => orgData?.departments?.map(d => d.id);

// Config is loaded at boot, before anything saves or restores, so these never run without it.
const liveDepartments = () => /** @type {OrgData} */ (orgData).departments;

export function seedDefaultTeam() {
  const colors = /** @type {NonNullable<typeof ownerColors>} */ (ownerColors);
  const affinities = /** @type {NonNullable<typeof defaultAffinities>} */ (defaultAffinities);
  teamData.employees = Object.entries(colors)
    .filter(([name]) => name !== 'UNOWNED')
    .map(([name, info]) => ({
      name,
      hex: info.hex,
      affinities: affinities[name] ? [...affinities[name]] : []
    }));
}

export function saveTeamData() {
  try {
    localStorage.setItem(TEAM_KEY, JSON.stringify(teamData));
  } catch (e) {
    if (_isQuotaError(e)) showSaveToast(true, true);
  }
}

export function loadTeamData() {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (!raw) {
      seedDefaultTeam();
      saveTeamData();
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.employees)) {
      const result = normalizeTeam(parsed, { knownDeptIds: knownDeptIds() });
      setTeamData(result.team);
      recordLoadIssues('team', result.errors);
    } else {
      seedDefaultTeam();
    }
  } catch (e) {
    seedDefaultTeam();
  }
}

// ── Work order persistence ────────────────────────────────────────────────────
export function saveWorkOrders() {
  try {
    localStorage.setItem(WORKORDERS_KEY, JSON.stringify(workOrders));
  } catch (e) {
    if (_isQuotaError(e)) showSaveToast(true, true);
  }
}

export function loadWorkOrders() {
  try {
    const raw = localStorage.getItem(WORKORDERS_KEY);
    if (raw) {
      const result = normalizeWorkOrders(JSON.parse(raw));
      setWorkOrders(result.items);
      recordLoadIssues('workOrders', result.errors, result.omitted);
    }
  } catch (e) {
    setWorkOrders([]);
  }
}

// Portfolio persistence: starter property/vendor registry for beginner PMs.
export function savePortfolio() {
  try {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
  } catch (e) {
    if (_isQuotaError(e)) showSaveToast(true, true);
  }
}

export function loadPortfolio() {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return;
    const result = normalizePortfolio(JSON.parse(raw));
    setPortfolio(result.portfolio);
    recordLoadIssues('portfolio', result.errors, result.omitted);
  } catch (e) {
    setPortfolio({ properties: [], vendors: [], tenants: [] });
  }
}

// ── Audit log persistence ─────────────────────────────────────────────────────
export function loadAuditLog() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (raw) setAuditLog(normalizeAuditLog(JSON.parse(raw)));
  } catch (_) {
    setAuditLog([]);
  }
}

export function saveAuditLog() {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
  } catch (_) { /* silent fail */ }
}

/** @param {string} action @param {Partial<Omit<AuditEntry, 'ts' | 'action'>>} [details] */
export function logAudit(action, details = {}) {
  auditLog.unshift({ ts: new Date().toISOString(), action, ...details });
  if (auditLog.length > 500) auditLog.length = 500;
  saveAuditLog();
}

// ── Company profile helpers ───────────────────────────────────────────────────
export function getCompanyName() {
  return localStorage.getItem(COMPANY_KEY) || 'Your Company';
}

/** @returns {OpsProfile} */
export function getOpsProfile() {
  try {
    return JSON.parse(localStorage.getItem(OPS_PROFILE_KEY) ?? 'null') || {};
  } catch (_) {
    return {};
  }
}

/** @param {string} name */
export function applyCompanyName(name) {
  const heading = document.getElementById('company-heading');
  if (heading) heading.textContent = name.toUpperCase();
}

export function applyOpsProfile(profile = getOpsProfile()) {
  document.body.dataset.opsFocus      = profile.focus         || 'stability';
  document.body.dataset.portfolioSize = profile.portfolioSize || 'mid';
}

export function applyNavCompactState() {
  const isCompact = localStorage.getItem(NAV_COMPACT_KEY) === 'true';
  const nav = document.getElementById('nav-tabs');
  const btn = document.getElementById('nav-toggle-btn');
  if (nav) nav.classList.toggle('nav-tabs--compact', isCompact);
  if (btn) {
    btn.textContent = isCompact ? 'Show nav' : 'Hide nav';
    btn.setAttribute('aria-pressed', String(isCompact));
  }
}

export function toggleNavCompact() {
  const next = localStorage.getItem(NAV_COMPACT_KEY) !== 'true';
  try { localStorage.setItem(NAV_COMPACT_KEY, String(next)); } catch (_) {}
  applyNavCompactState();
}

export function _fileSlug() {
  return _slugify(getCompanyName());
}

// ── Auto-backup snapshots ─────────────────────────────────────────────────────
export function saveBackupSnapshot(label = 'Auto-save') {
  try {
    const snapshot = {
      ts: new Date().toISOString(),
      label,
      company: getCompanyName(),
      state: JSON.stringify({
        departments: liveDepartments(),
        team: teamData,
        workOrders,
        portfolio,
      }),
    };
    const backups = loadBackupSnapshots();
    backups.unshift(snapshot);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
  } catch (_) { /* non-critical — backup storage silently no-ops if full */ }
}

export function loadBackupSnapshots() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

export function openBackupsModal() {
  const modal = document.getElementById('backups-modal');
  const body  = document.getElementById('backups-body');
  if (!modal || !body) return;
  const backups = loadBackupSnapshots();
  if (backups.length === 0) {
    body.innerHTML = '<p class="audit-empty">No backups yet. Backups are saved automatically after imports and auto-assign runs.</p>';
  } else {
    body.innerHTML = backups.map((b, i) => `
      <div class="backup-row">
        <div class="backup-meta">
          <strong>${escapeBackup(b.label)}</strong>
          <span>${escapeBackup(b.company || '')} &mdash; ${escapeBackup(new Date(b.ts).toLocaleString())}</span>
        </div>
        <button class="btn btn-secondary" onclick="restoreBackupSnapshot(${i})">Restore</button>
      </div>
    `).join('');
  }
  modal.classList.add('visible');
}

export function closeBackupsModal() {
  document.getElementById('backups-modal')?.classList.remove('visible');
}

/** @param {number} index */
export function restoreBackupSnapshot(index) {
  const backups = loadBackupSnapshots();
  const backup  = backups[index];
  if (!backup) return;
  if (!confirm(`Restore backup from ${new Date(backup.ts).toLocaleString()}?\n\nThis will replace all current task, team, work order, and portfolio data.`)) return;

  try {
    const { departments, team, workOrders: wos, portfolio: port } = JSON.parse(backup.state);

    // Restore replaces state, so absent task fields reset to defaults (fill) and
    // notes/customFields come back with everything else.
    applySavedTasks(liveDepartments(), departments, { fill: true });

    const clean = sanitizeWorkspace(
      { team, workOrders: wos, portfolio: port },
      { knownDeptIds: knownDeptIds() },
    );
    if (clean.team) {
      setTeamData(clean.team);
      saveTeamData();
    }
    if (clean.workOrders) {
      setWorkOrders(clean.workOrders);
      saveWorkOrders();
    }
    if (clean.portfolio) {
      setPortfolio(clean.portfolio);
      savePortfolio();
    }

    saveToStorage();
    closeBackupsModal();
    _showActionToast('✓ Backup restored', 'save-toast--success');

    // Trigger a full UI refresh via page reload so all views sync cleanly
    setTimeout(() => pageControl.reload(), 800);
  } catch (e) {
    alert('Could not restore this backup — the data may be corrupted.');
  }
}

/** @param {unknown} str @returns {string} */
function escapeBackup(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
