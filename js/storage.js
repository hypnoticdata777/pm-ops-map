// localStorage persistence, toast notifications, and company profile helpers.
import {
  orgData, teamData, setTeamData, workOrders, setWorkOrders,
  auditLog, setAuditLog, portfolio, setPortfolio,
  ownerColors, defaultAffinities, AUDIT_LABELS,
  STATUS_CYCLE, PRIORITY_CYCLE,
} from './state.js';
import { _isQuotaError, _slugify } from './utils.js';

// ── Storage keys ──────────────────────────────────────────────────────────────
export const STORAGE_KEY     = 'pm-ops-data-v1';
export const COMPANY_KEY     = 'pm-ops-company-name';
export const OPS_PROFILE_KEY = 'pm-ops-profile-v1';
export const NAV_COMPACT_KEY = 'pm-ops-nav-compact';
export const TEAM_KEY        = 'pm-ops-team-v1';
export const WORKORDERS_KEY  = 'pm-ops-workorders-v1';
export const PORTFOLIO_KEY   = 'pm-ops-portfolio-v1';
export const AUDIT_KEY       = 'pm-ops-audit-v1';
export const GUIDE_KEY       = 'pm-ops-guide-dismissed';
export const NOTIF_DATE_KEY  = 'pm-ops-notif-date';
export const LAUNCH_CHECKLIST_KEY = 'pm-ops-launch-checklist-v1';
export const BACKUP_KEY           = 'pm-ops-backups-v1';
export const SYNC_CONFIG_KEY      = 'pm-ops-sync-config-v1'; // must match js/sync.js's SYNC_CONFIG_KEY
const MAX_BACKUPS = 5;

// ── Toast notifications ───────────────────────────────────────────────────────
let _toastTimer = null;

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
    const payload = orgData.departments.map(dept => ({
      id: dept.id,
      tasks: dept.tasks.map(t => ({
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
  // PROJECT BEACON: Reconcile saved edits onto current config by _configName;
  // visible task names are user-editable and are not durable identity keys.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach(savedDept => {
      if (!savedDept || typeof savedDept.id !== 'string') return;
      const dept = orgData.departments.find(d => d.id === savedDept.id);
      if (!dept || !Array.isArray(savedDept.tasks)) return;
      savedDept.tasks.forEach((savedTask) => {
        if (!savedTask || typeof savedTask.name !== 'string' || !savedTask.name.trim()) return;
        if (typeof savedTask.owner !== 'string') return;
        const key  = savedTask._configName || savedTask.name;
        const task = dept.tasks.find(t => t._configName === key);
        if (!task) return;
        task.name  = savedTask.name.slice(0, 200);
        task.owner = savedTask.owner;
        if (savedTask.status   && STATUS_CYCLE.includes(savedTask.status))     task.status   = savedTask.status;
        if (savedTask.priority && PRIORITY_CYCLE.includes(savedTask.priority)) task.priority = savedTask.priority;
        if (savedTask.dueDate !== undefined) task.dueDate = savedTask.dueDate;
        if (savedTask.blockedBy !== undefined) task.blockedBy = savedTask.blockedBy || null;
        if (typeof savedTask.notes === 'string') task.notes = savedTask.notes.slice(0, 1000);
        if (savedTask.customFields && typeof savedTask.customFields === 'object' && !Array.isArray(savedTask.customFields)) {
          task.customFields = Object.fromEntries(
            Object.entries(savedTask.customFields)
              .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
              .slice(0, 10)
              .map(([k, v]) => [k.slice(0, 40), v.slice(0, 200)])
          );
        }
      });
    });
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

export function confirmResetStorage(choice) {
  const resetGroups = {
    '1': {
      label: 'task names, owners, statuses, due dates, and dependencies',
      keys: [STORAGE_KEY],
    },
    '2': {
      label: 'operating workspace data',
      keys: [STORAGE_KEY, TEAM_KEY, WORKORDERS_KEY, PORTFOLIO_KEY, AUDIT_KEY, LAUNCH_CHECKLIST_KEY],
    },
    '3': {
      label: 'company setup and preferences',
      keys: [COMPANY_KEY, OPS_PROFILE_KEY, NAV_COMPACT_KEY, GUIDE_KEY, NOTIF_DATE_KEY, SYNC_CONFIG_KEY],
    },
    '4': {
      label: 'all PM Ops Map data on this device',
      keys: [
        STORAGE_KEY,
        COMPANY_KEY,
        OPS_PROFILE_KEY,
        NAV_COMPACT_KEY,
        TEAM_KEY,
        WORKORDERS_KEY,
        PORTFOLIO_KEY,
        AUDIT_KEY,
        GUIDE_KEY,
        NOTIF_DATE_KEY,
        LAUNCH_CHECKLIST_KEY,
        SYNC_CONFIG_KEY,
      ],
    },
  };

  const selected = resetGroups[choice.trim()];
  if (!selected) {
    alert('Reset canceled. Please choose 1, 2, 3, or 4.');
    return;
  }
  if (!confirm(`Reset ${selected.label}?\n\nThis only affects local data stored in this browser.`)) return;
  closeResetModal();
  selected.keys.forEach(key => localStorage.removeItem(key));
  location.reload();
}

// ── Team data persistence ─────────────────────────────────────────────────────
export function seedDefaultTeam() {
  teamData.employees = Object.entries(ownerColors)
    .filter(([name]) => name !== 'UNOWNED')
    .map(([name, info]) => ({
      name,
      hex: info.hex,
      affinities: defaultAffinities[name] ? [...defaultAffinities[name]] : []
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
      setTeamData(parsed);
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
    if (raw) setWorkOrders(JSON.parse(raw) || []);
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
    const parsed = JSON.parse(raw);
    setPortfolio({
      properties: Array.isArray(parsed?.properties) ? parsed.properties : [],
      vendors:    Array.isArray(parsed?.vendors)    ? parsed.vendors    : [],
      tenants:    Array.isArray(parsed?.tenants)    ? parsed.tenants    : [],
    });
  } catch (e) {
    setPortfolio({ properties: [], vendors: [], tenants: [] });
  }
}

// ── Audit log persistence ─────────────────────────────────────────────────────
export function loadAuditLog() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (raw) setAuditLog(JSON.parse(raw) || []);
  } catch (_) {
    setAuditLog([]);
  }
}

export function saveAuditLog() {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
  } catch (_) { /* silent fail */ }
}

export function logAudit(action, details = {}) {
  auditLog.unshift({ ts: new Date().toISOString(), action, ...details });
  if (auditLog.length > 500) auditLog.length = 500;
  saveAuditLog();
}

// ── Company profile helpers ───────────────────────────────────────────────────
export function getCompanyName() {
  return localStorage.getItem(COMPANY_KEY) || 'Your Company';
}

export function getOpsProfile() {
  try {
    return JSON.parse(localStorage.getItem(OPS_PROFILE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

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
        departments: orgData.departments,
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

export function restoreBackupSnapshot(index) {
  const backups = loadBackupSnapshots();
  const backup  = backups[index];
  if (!backup) return;
  if (!confirm(`Restore backup from ${new Date(backup.ts).toLocaleString()}?\n\nThis will replace all current task, team, work order, and portfolio data.`)) return;

  try {
    const { departments, team, workOrders: wos, portfolio: port } = JSON.parse(backup.state);

    if (Array.isArray(departments)) {
      departments.forEach(savedDept => {
        if (!savedDept || typeof savedDept.id !== 'string') return;
        const dept = orgData.departments.find(d => d.id === savedDept.id);
        if (!dept || !Array.isArray(savedDept.tasks)) return;
        savedDept.tasks.forEach(savedTask => {
          if (!savedTask || typeof savedTask.name !== 'string' || !savedTask.name.trim()) return;
          if (typeof savedTask.owner !== 'string') return;
          const key  = savedTask._configName || savedTask.name;
          const task = dept.tasks.find(t => t._configName === key);
          if (!task) return;
          task.name     = savedTask.name.slice(0, 200);
          task.owner    = savedTask.owner;
          task.status   = STATUS_CYCLE.includes(savedTask.status)   ? savedTask.status   : 'todo';
          task.priority = PRIORITY_CYCLE.includes(savedTask.priority) ? savedTask.priority : 'medium';
          task.dueDate  = savedTask.dueDate  || null;
          task.blockedBy = savedTask.blockedBy || null;
        });
      });
    }

    if (team && Array.isArray(team.employees)) {
      setTeamData(team);
      saveTeamData();
    }

    if (Array.isArray(wos)) {
      setWorkOrders(wos);
      saveWorkOrders();
    }

    if (port) {
      setPortfolio({
        properties: Array.isArray(port.properties) ? port.properties : [],
        vendors:    Array.isArray(port.vendors)    ? port.vendors    : [],
        tenants:    Array.isArray(port.tenants)    ? port.tenants    : [],
      });
      savePortfolio();
    }

    saveToStorage();
    closeBackupsModal();
    _showActionToast('✓ Backup restored', 'save-toast--success');

    // Trigger a full UI refresh via page reload so all views sync cleanly
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    alert('Could not restore this backup — the data may be corrupted.');
  }
}

function escapeBackup(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
