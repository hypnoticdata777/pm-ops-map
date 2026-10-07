// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
// Global UI helpers: stats bar, beacons, onboarding, welcome guide, notifications.
import {
  orgData, teamData, workOrders, countUnowned,
} from './state.js';
import {
  COMPANY_KEY, OPS_PROFILE_KEY, GUIDE_KEY, NOTIF_DATE_KEY,
  getCompanyName, applyCompanyName, applyOpsProfile,
  showSaveToast, _showActionToast,
} from './storage.js';
import { isTaskOverdue, getTodayISO, shakeInput } from './utils.js';
import { renderLaunchPlan } from './launchPlan.js';

// ── Stats bar ─────────────────────────────────────────────────────────────────
export function updateStats() {
  let total = 0, assigned = 0, unowned = 0, done = 0, inProgress = 0, blocked = 0, overdue = 0;

  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      total++;
      if (task.owner === 'UNOWNED') unowned++;
      else assigned++;
      const s = task.status || 'todo';
      if (s === 'done')             done++;
      else if (s === 'in-progress') inProgress++;
      else if (s === 'blocked')     blocked++;
      if (isTaskOverdue(task)) overdue++;
    });
  });

  document.getElementById('stat-total').textContent       = total;
  document.getElementById('stat-done').textContent        = done;
  document.getElementById('stat-in-progress').textContent = inProgress;
  document.getElementById('stat-blocked').textContent     = blocked;
  document.getElementById('stat-assigned').textContent    = assigned;
  document.getElementById('stat-unowned').textContent     = unowned;
  document.getElementById('stat-departments').textContent = orgData.departments.length;
  const overdueEl = document.getElementById('stat-overdue');
  if (overdueEl) overdueEl.textContent = overdue;

  updateBeacons();
  renderLaunchPlan();
}

// ── Beacon updater ────────────────────────────────────────────────────────────
export function updateBeacons() {
  const count = countUnowned();

  const tabBeacon = document.getElementById('tab-beacon');
  if (tabBeacon) tabBeacon.hidden = (count === 0);

  const badge = document.getElementById('auto-assign-badge');
  if (badge) {
    badge.textContent   = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  const btn = document.getElementById('auto-assign-btn');
  if (btn) {
    btn.disabled = (count === 0);
    btn.title = count > 0
      ? `Auto-assign ${count} unowned task${count !== 1 ? 's' : ''} based on department affinities`
      : 'All tasks are assigned — nothing to auto-assign!';
  }

  updateWorkOrderBeacon();
}

export function updateWorkOrderBeacon() {
  const unassignedOpen = workOrders.filter(
    w => w.assignee === 'UNASSIGNED' && w.status !== 'completed'
  ).length;
  const beacon = document.getElementById('wo-tab-beacon');
  if (beacon) beacon.hidden = (unassignedOpen === 0);
}

// ── Onboarding modal ──────────────────────────────────────────────────────────
export function showOnboardingModal() {
  const modal = document.getElementById('onboarding-modal');
  modal.classList.add('visible');
  const input = document.getElementById('company-input');
  setTimeout(() => input.focus(), 50);
  input.onkeydown = e => { if (e.key === 'Enter') submitCompanyName(); };
}

export function submitCompanyName() {
  const input = document.getElementById('company-input');
  const name  = input.value.trim();
  if (!name) {
    shakeInput(input);
    return;
  }
  const profile = {
    company:        name,
    portfolioSize:  document.getElementById('portfolio-size-input')?.value || 'mid',
    focus:          document.getElementById('ops-focus-input')?.value      || 'stability',
    configuredAt:   new Date().toISOString()
  };
  try {
    localStorage.setItem(COMPANY_KEY, name);
    localStorage.setItem(OPS_PROFILE_KEY, JSON.stringify(profile));
  } catch (_) { /* ignore */ }
  applyCompanyName(name);
  applyOpsProfile(profile);
  document.getElementById('onboarding-modal').classList.remove('visible');
  renderLaunchPlan();
}

// ── Welcome guide ─────────────────────────────────────────────────────────────
export function initWelcomeGuide() {
  const guide = document.getElementById('welcome-guide');
  if (!guide) return;
  if (!localStorage.getItem(GUIDE_KEY)) {
    guide.hidden = false;
  }
}

export function dismissWelcomeGuide() {
  const guide = document.getElementById('welcome-guide');
  if (!guide) return;
  guide.style.transition = 'opacity 0.35s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
  guide.style.opacity    = '0';
  guide.style.maxHeight  = '0';
  guide.style.margin     = '0';
  guide.style.padding    = '0';
  guide.style.overflow   = 'hidden';
  setTimeout(() => { guide.hidden = true; }, 420);
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch (_) {}
}

// ── Browser notifications ─────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Your browser does not support notifications.');
    return;
  }
  if (Notification.permission === 'granted') {
    _showActionToast('✓ Notifications already enabled', 'save-toast--success');
    return;
  }
  const result = await Notification.requestPermission();
  const btn = document.getElementById('notif-btn');
  if (result === 'granted') {
    if (btn) btn.hidden = true;
    _showActionToast('✓ Notifications enabled', 'save-toast--success');
    checkOverdueNotifications(true);
    setInterval(checkOverdueNotifications, 60 * 60 * 1000);
  } else {
    if (btn) btn.hidden = true;
    _showActionToast('⚠ Notification permission denied', 'save-toast--error');
  }
}

export function checkOverdueNotifications(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = getTodayISO();
  if (!force) {
    try { if (localStorage.getItem(NOTIF_DATE_KEY) === today) return; } catch (_) {}
  }

  const overdue = [];
  orgData.departments.forEach(dept => {
    dept.tasks.forEach(task => {
      if (isTaskOverdue(task)) overdue.push(`${dept.name}: ${task.name}`);
    });
  });

  if (overdue.length > 0) {
    const body = overdue.slice(0, 4).join('\n') + (overdue.length > 4 ? `\n+${overdue.length - 4} more` : '');
    new Notification(`PM Ops Map — ${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}`, {
      body,
      icon: 'icon.png'
    });
  }

  try { localStorage.setItem(NOTIF_DATE_KEY, today); } catch (_) {}
}

export function initNotifications() {
  if (!('Notification' in window)) return;
  const btn = document.getElementById('notif-btn');
  if (Notification.permission === 'default') {
    if (btn) btn.hidden = false;
  } else if (Notification.permission === 'granted') {
    if (btn) btn.hidden = true;
    checkOverdueNotifications();
    setInterval(checkOverdueNotifications, 60 * 60 * 1000);
  } else {
    if (btn) btn.hidden = true;
  }
}
