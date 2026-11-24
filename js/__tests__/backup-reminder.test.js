import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { COMPANY_KEY, BACKUP_REMINDER_KEY, SETUP_KEY } from '../storage.js';
import { initBackupReminder, renderBackupReminder, shouldShowBackupReminder, reminderSnoozedUntil, dismissBackupReminder, resetBackupReminder, reportBackupExportRequested, REMINDER_SNOOZE_MS } from '../backupReminder.js';
import { exportJSON } from '../io.js';
import { _resetExportAcknowledgment } from '../privacy.js';
import { load } from './helpers/phase1b-harness.js';
import * as state from '../state.js';
const html=fs.readFileSync('index.html','utf8');
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-24T12:00:00Z'));
  document.body.innerHTML=html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  localStorage.clear();localStorage.setItem(COMPANY_KEY,'Reminder Co');
  initBackupReminder(()=>{});renderBackupReminder();_resetExportAcknowledgment();
});
afterEach(()=>{resetBackupReminder();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const notice=()=>document.getElementById('backup-reminder');
const feedback=()=>document.getElementById('backup-reminder-feedback').textContent;
describe('independent-copy reminder',()=>{
  test('reinitializing the guide never duplicates JSON export requests',()=>{
    const exportRequest=vi.fn();initBackupReminder(exportRequest);initBackupReminder(exportRequest);
    notice().querySelector('[data-backup-export]').click();expect(exportRequest).toHaveBeenCalledTimes(1);
  });
  test('only a configured real workspace is eligible',()=>{
    expect(shouldShowBackupReminder({hasCompany:true,demo:false,until:0,now:1})).toBe(true);
    expect(shouldShowBackupReminder({hasCompany:true,demo:true,until:0,now:1})).toBe(false);
    localStorage.removeItem(COMPANY_KEY);renderBackupReminder();expect(notice().hidden).toBe(true);
  });
  test('dismissal persists for seven days and then expires while the page is open',()=>{
    expect(dismissBackupReminder()).toBe(true);expect(notice().hidden).toBe(true);
    expect(document.activeElement.id).toBe('backups-open');
    expect(reminderSnoozedUntil()).toBe(Date.now()+REMINDER_SNOOZE_MS);
    vi.advanceTimersByTime(REMINDER_SNOOZE_MS+1);expect(notice().hidden).toBe(false);
  });
  test('invalid or implausible stored preferences never hide the reminder',()=>{
    for(const value of ['broken',JSON.stringify({version:2,until:Date.now()+100}),JSON.stringify({version:1,until:Date.now()+10*REMINDER_SNOOZE_MS})]) {
      localStorage.setItem(BACKUP_REMINDER_KEY,value);expect(reminderSnoozedUntil()).toBe(0);
    }
  });
  test('a failed preference write keeps the reminder visible and explains the failure',()=>{
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
    expect(dismissBackupReminder()).toBe(false);expect(notice().hidden).toBe(false);expect(feedback()).toContain('could not save');
  });
  test('download-request feedback is text-safe and never creates backup success or snooze state',()=>{
    reportBackupExportRequested('<img src=x onerror=alert(1)>.json');
    expect(feedback()).toContain('<img');expect(notice().querySelector('img')).toBeNull();
    expect(feedback()).toContain('cannot confirm');expect(notice().hidden).toBe(false);
    expect(localStorage.getItem(BACKUP_REMINDER_KEY)).toBeNull();
  });
  test('exports do not undo an explicit snooze',()=>{
    dismissBackupReminder();const before=localStorage.getItem(BACKUP_REMINDER_KEY);
    reportBackupExportRequested('workspace.json');expect(notice().hidden).toBe(true);
    expect(localStorage.getItem(BACKUP_REMINDER_KEY)).toBe(before);
  });
});
describe('export and workspace boundaries',()=>{
  test('cancelled sensitive export initiates no download or success feedback',()=>{
    load('showcase-partial');localStorage.setItem(COMPANY_KEY,'Reminder Co');renderBackupReminder();
    vi.stubGlobal('confirm',()=>false);
    const create=vi.fn();vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create}));
    exportJSON();expect(create).not.toHaveBeenCalled();expect(feedback()).toBe('');
    expect(localStorage.getItem(BACKUP_REMINDER_KEY)).toBeNull();
  });
  test('a download error reports failure without recording a saved backup',()=>{
    load('template-solo');localStorage.setItem(COMPANY_KEY,'Reminder Co');renderBackupReminder();
    state.setPortfolio({properties:[],tenants:[],vendors:[]});state.setWorkOrders([]);
    vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:()=>{throw Error('blocked');}}));
    exportJSON();expect(document.getElementById('save-toast').textContent).toContain('could not be requested');
    expect(feedback()).toBe('');expect(localStorage.getItem(BACKUP_REMINDER_KEY)).toBeNull();
  });
  test('full imports reset dismissal; normal sync updates preserve it',async()=>{
    load('template-solo');const { _applyImportedState }=await import('../io.js');
    const data={company:'Other Co',departments:structuredClone(state.orgData.departments)};
    localStorage.setItem(BACKUP_REMINDER_KEY,JSON.stringify({version:1,until:Date.now()+1000}));
    _applyImportedState(data,{preserveSetup:true});expect(localStorage.getItem(BACKUP_REMINDER_KEY)).not.toBeNull();
    _applyImportedState(data);expect(localStorage.getItem(BACKUP_REMINDER_KEY)).toBeNull();
  });
});
