/** @import { OrgData } from './types.js' */
// Runtime for hosted-demo mode (see demoMode.js): seeds the fictional workspace on
// first visit, shows the permanent "fictional data" banner, and resets the demo.
//
// Nothing here runs unless the page was opened with ?demo=1.
import { DEMO_MODE } from './demoMode.js';
import { orgData, setTeamData, setPortfolio, setWorkOrders } from './state.js';
import {
  COMPANY_KEY, OPS_PROFILE_KEY, ALL_STORAGE_KEYS, pageControl, saveTeamData, savePortfolio,
  saveWorkOrders, saveToStorage, applyCompanyName, applyOpsProfile,
} from './storage.js';
import { buildShowcase, applyShowcaseTasks } from './showcase.js';

const DEMO_KEY_PREFIX = 'pm-ops-demo-';

// Loads the fictional workspace into shared state and persists it. Rendering is
// the caller's job (app.js seeds before the first render).
export function seedShowcaseWorkspace(now = new Date()) {
  const showcase = buildShowcase(now);
  setTeamData(showcase.team);
  setPortfolio(showcase.portfolio);
  setWorkOrders(showcase.workOrders);
  applyShowcaseTasks(/** @type {OrgData} */ (orgData).departments, showcase.team.employees, now);

  try {
    localStorage.setItem(COMPANY_KEY, showcase.company);
    localStorage.setItem(OPS_PROFILE_KEY, JSON.stringify(showcase.profile));
  } catch (_) { /* storage unavailable: the demo still works for this page view */ }
  applyCompanyName(showcase.company);
  applyOpsProfile(showcase.profile);
  saveTeamData();
  savePortfolio();
  saveWorkOrders();
  saveToStorage();
}

// Marks the page as the demo: permanent banner, title, and no Team Sync (a demo
// must never be pointed at a real server).
export function initDemoMode() {
  if (!DEMO_MODE) return;
  document.body.classList.add('demo-mode');
  document.title = 'PM Ops Map — Demo';
  const banner = document.getElementById('demo-banner');
  if (banner) banner.hidden = false;
  const syncButton = document.getElementById('sync-status-pill');
  if (syncButton) syncButton.hidden = true;
}

// Removes the demo's own keys (never a real workspace's) and reloads, which
// re-seeds the pristine showcase.
export function resetDemo() {
  if (!DEMO_MODE) return;
  if (!confirm('Reset the demo?\n\nYour edits to the demo workspace will be discarded and the original fictional data restored.')) return;
  ALL_STORAGE_KEYS
    .filter(key => key.startsWith(DEMO_KEY_PREFIX)) // belt and braces: only ever demo keys
    .forEach(key => localStorage.removeItem(key));
  pageControl.reload();
}
