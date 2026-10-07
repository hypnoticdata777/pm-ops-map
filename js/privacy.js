// Plain-language data-handling guidance, shown where it matters (Portfolio,
// exports, imports, Team Sync, first run) instead of only in the README.
//
// The honest picture: everything lives UNENCRYPTED in this browser's
// localStorage, and every export, automatic backup, clipboard copy, and Team Sync
// workspace is another copy of it. This module owns that wording and the small
// amount of behavior around it so the UI, the dialog, and the docs cannot drift.
import { portfolio, workOrders } from './state.js';
import { _showActionToast } from './storage.js';
import { escapeHtml } from './utils.js';

// Three tiers: what is fine, what needs care, what does not belong here at all.
export const DATA_TIERS = [
  {
    id: 'ok',
    icon: '✅',
    title: 'Fine to enter',
    items: [
      'Fictional or demo data while you explore',
      'Process design: departments, responsibilities, owners, backups, SOP notes',
      'Limited operating context: property names, unit counts, vendor trades, work-order titles',
    ],
  },
  {
    id: 'careful',
    icon: '⚠️',
    title: 'Use with care',
    items: [
      'Real tenant names, phone numbers, and emails',
      'Rent, balances, and lease dates',
      'Only on a device you control: screen lock on, disk encryption on, not a shared computer',
    ],
  },
  {
    id: 'never',
    icon: '⛔',
    title: 'Do not enter without extra protection',
    items: [
      'Social Security, passport, or driver’s-license numbers',
      'Bank account, card numbers, or any payment credentials',
      'Credit, background, or screening reports; medical or other regulated records',
      'The documents themselves — paste a link to where they are stored instead',
    ],
  },
];

export const COPIES_YOU_CREATE = [
  ['Exports', 'JSON, CSV, and handbook files are plain, unencrypted copies saved wherever you download them.'],
  ['Automatic backups', 'The last 5 snapshots are kept in this browser. They are full copies of your workspace, tenant records included.'],
  ['Copy State', 'Puts your whole workspace on the clipboard; clipboard managers may keep it.'],
  ['Team Sync (beta)', 'Sends your workspace to the server you connect to, and saves its passphrase unencrypted in this browser.'],
];

/** @param {string[]} items @returns {string} */
const escapedList = items => items.map(item => `<li>${escapeHtml(item)}</li>`).join('');

export function renderPrivacyTiers() {
  return `
    <div class="privacy-tiers">
      ${DATA_TIERS.map(tier => `
        <section class="privacy-tier privacy-tier--${tier.id}">
          <h4><span aria-hidden="true">${tier.icon}</span> ${escapeHtml(tier.title)}</h4>
          <ul>${escapedList(tier.items)}</ul>
        </section>
      `).join('')}
    </div>`;
}

// Always-visible notice at the top of the Portfolio tab (the tab that holds
// tenant contact and balance data). The details fold away; the headline does not.
export function renderPortfolioPrivacyNotice() {
  return `
    <aside class="privacy-notice" aria-label="How your data is stored">
      <div class="privacy-notice-head">
        <strong>&#128274; Saved in this browser only — not encrypted.</strong>
        <span>Tenant details are stored as plain text on this device. Exports, backups, and Team Sync each create another copy.</span>
      </div>
      <details class="privacy-notice-details">
        <summary>What should I enter here?</summary>
        ${renderPrivacyTiers()}
        <button class="btn btn-secondary" onclick="openPrivacyModal()">More about your data</button>
      </details>
    </aside>`;
}

export const TENANT_FORM_HINT = 'Contact details, rent, and balances are saved unencrypted in this browser. Don’t enter ID numbers, bank or card numbers, or screening reports — add a link to the document instead.';

// ── Data & Privacy dialog ─────────────────────────────────────────────────────

export function buildPrivacyModalHTML() {
  return `
    <section class="privacy-section">
      <h3>Where your data lives</h3>
      <p>PM Ops Map has no accounts and no server of its own. Everything you enter is saved in this browser’s <code>localStorage</code> as <strong>plain, unencrypted text</strong>. Anyone who can open this browser profile — or who gets a copy of an exported file — can read it.</p>
    </section>
    <section class="privacy-section">
      <h3>What to put in it</h3>
      ${renderPrivacyTiers()}
    </section>
    <section class="privacy-section">
      <h3>Copies you create</h3>
      <dl class="privacy-copies">
        ${COPIES_YOU_CREATE.map(([name, text]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(text)}</dd></div>`).join('')}
      </dl>
    </section>
    <section class="privacy-section">
      <h3>Removing your data</h3>
      <p><strong>Reset</strong> (stats bar) deletes data from this browser — choose <em>Everything</em> to remove the workspace, automatic backups, and the saved Team Sync connection. It does <strong>not</strong> touch files you already exported or any copy on a Team Sync server; delete those separately.</p>
      <p><a href="https://github.com/hypnoticdata777/pm-ops-map#resetting-and-deleting-your-data" target="_blank" rel="noopener noreferrer">Full details in the README</a></p>
    </section>`;
}

export function openPrivacyModal() {
  const modal = document.getElementById('privacy-modal');
  const body = document.getElementById('privacy-body');
  if (!modal || !body) return;
  body.innerHTML = buildPrivacyModalHTML();
  modal.classList.add('visible');
}

export function closePrivacyModal() {
  document.getElementById('privacy-modal')?.classList.remove('visible');
}

// ── Export awareness ──────────────────────────────────────────────────────────

// True when the workspace holds resident information: tenant records, or work
// orders that name a tenant. Those exports deserve a heads-up.
export function hasSensitiveRecords() {
  return portfolio.tenants.length > 0 || workOrders.some(wo => wo.tenant);
}

// One acknowledgment per page session (deliberately NOT persisted: it should
// reappear next time, and a new storage key would need its own reset handling).
let acknowledged = false;
export function _resetExportAcknowledgment() { acknowledged = false; }

// Asks once per session before an export that includes tenant information.
// Returns false if the user cancels, in which case the caller must not export.
/** @param {string} what @returns {boolean} */
export function confirmSensitiveExport(what) {
  if (!hasSensitiveRecords() || acknowledged) return true;
  const ok = confirm(
    `${what} will include tenant names, contact details, rent, and balances as plain, unencrypted text.\n\n` +
    'Treat the file like any other tenant record: keep it on a device you control, don’t send it unprotected, and delete it when you’re done.\n\n' +
    'Continue?',
  );
  if (ok) acknowledged = true;
  return ok;
}

// Confirms a finished export and says what it is: another unencrypted copy.
/** @param {string} filename */
export function announceExport(filename) {
  const note = hasSensitiveRecords()
    ? 'is an unencrypted copy with tenant data — keep it somewhere you trust'
    : 'is an unencrypted copy of your data';
  _showActionToast(`✓ ${filename} saved — this file ${note}.`, 'save-toast--success', 6000);
}
