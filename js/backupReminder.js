import { BACKUP_REMINDER_KEY, COMPANY_KEY } from './storage.js';
import { DEMO_MODE } from './demoMode.js';
export const REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
/** @type {HTMLElement | null} */
let bound = null;
let listenersInstalled = false;
/** @type {() => void} */
let requestExport = () => {};

/** Invalid/old formats never imply a backup exists. @param {number} [now] */
export function reminderSnoozedUntil(now = Date.now()) {
  try {
    const value = JSON.parse(localStorage.getItem(BACKUP_REMINDER_KEY) || 'null');
    return value?.version === 1 && Number.isFinite(value.until) && value.until > now && value.until <= now + REMINDER_SNOOZE_MS ? value.until : 0;
  } catch { return 0; }
}
/** @param {{hasCompany:boolean, demo:boolean, until:number, now:number}} state */
export function shouldShowBackupReminder({hasCompany,demo,until,now}) { return hasCompany && !demo && until <= now; }
export function renderBackupReminder() {
  const node = document.getElementById('backup-reminder');
  if (!node) return;
  clearTimeout(timer);
  let hasCompany = false;
  try { hasCompany = !!localStorage.getItem(COMPANY_KEY)?.trim(); } catch { /* no saved company evidence */ }
  const now = Date.now(), until = reminderSnoozedUntil(now);
  node.hidden = !shouldShowBackupReminder({hasCompany,demo:DEMO_MODE,until,now});
  if (hasCompany && !DEMO_MODE && until > now) timer = setTimeout(renderBackupReminder, until - now + 1);
}
export function dismissBackupReminder() {
  try {
    localStorage.setItem(BACKUP_REMINDER_KEY, JSON.stringify({version:1,until:Date.now()+REMINDER_SNOOZE_MS}));
  } catch {
    const feedback = document.getElementById('backup-reminder-feedback');
    if (feedback) feedback.textContent = 'This browser could not save the reminder setting. The reminder will stay visible.';
    return false;
  }
  const feedback = document.getElementById('backup-reminder-feedback');
  if (feedback) feedback.textContent = '';
  renderBackupReminder();
  document.getElementById('backups-open')?.focus({preventScroll:true});
  return true;
}
export function resetBackupReminder() {
  clearTimeout(timer);
  try { localStorage.removeItem(BACKUP_REMINDER_KEY); } catch { /* no persistence available */ }
}
/** Call only after the download request succeeds; never dismiss or record a saved backup. @param {string} filename */
export function reportBackupExportRequested(filename) {
  const text = `Download requested: ${filename}. Find the JSON file in Files or Downloads, keep it somewhere you trust, and verify it through import review. The app cannot confirm that a usable backup was saved.`;
  const reminder = document.getElementById('backup-reminder');
  if (reminder && !reminder.hidden) {
    const feedback = document.getElementById('backup-reminder-feedback');
    if (feedback) feedback.textContent = text;
  }
  if (document.getElementById('backups-modal')?.classList.contains('visible')) {
    const feedback = document.getElementById('backup-modal-export-feedback');
    if (feedback) feedback.textContent = text;
  }
}
/** Reuses the existing JSON export and sensitive-data confirmation. @param {() => void} exporter */
export function initBackupReminder(exporter) {
  requestExport = exporter;
  const node = document.getElementById('backup-reminder');
  if (!node || node === bound) return;
  bound = node;
  document.getElementById('backup-reminder-dismiss')?.addEventListener('click',dismissBackupReminder);
  if (listenersInstalled) return;
  listenersInstalled = true;
  document.addEventListener('click',event => {
    if (event.target instanceof Element && event.target.closest('button[data-backup-export]')) requestExport();
  });
  window.addEventListener('storage',event => {
    if (event.key === BACKUP_REMINDER_KEY || event.key === COMPANY_KEY || event.key === null) renderBackupReminder();
  });
}
