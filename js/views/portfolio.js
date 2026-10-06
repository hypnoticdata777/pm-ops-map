// @ts-nocheck — TODO(types): not converted to checked JSDoc yet. Delete this line and fix what `npm run typecheck` reports.
import { portfolio, setPortfolio, workOrders } from '../state.js';
import { savePortfolio, saveWorkOrders, logAudit, _showActionToast, saveBackupSnapshot } from '../storage.js';
import {
  escapeHtml, shakeInput, isValidISODate, formatCurrency, getLeaseStatus, getDelinquencyStatus, isSafeUrl, normalizeUrl,
  parseCSV, buildCsvHeaderMap, unguardCsvCell, MAX_IMPORT_BYTES,
} from '../utils.js';
import { normalizePortfolio } from '../normalize.js';
import { renderPortfolioPrivacyNotice, TENANT_FORM_HINT } from '../privacy.js';
import { renderLaunchPlan } from '../launchPlan.js';

const editState = {
  propertyId: null,
  tenantId: null,
  vendorId: null,
};

function totalUnits() {
  return portfolio.properties.reduce((sum, property) => sum + Number(property.units || 0), 0);
}

function propertyOptions(selectedId = '') {
  return [
    '<option value="">Select property</option>',
    ...portfolio.properties.map(property => (
      `<option value="${escapeHtml(property.id)}" ${property.id === selectedId ? 'selected' : ''}>${escapeHtml(property.name)}</option>`
    ))
  ].join('');
}

function propertyName(propertyId) {
  return portfolio.properties.find(property => property.id === propertyId)?.name || 'Unassigned property';
}

function tenantStatusOptions(selectedStatus = 'active') {
  return [
    ['active', 'Active'],
    ['applicant', 'Applicant'],
    ['notice', 'On notice'],
    ['past', 'Past tenant'],
  ].map(([value, label]) => (
    `<option value="${value}" ${value === selectedStatus ? 'selected' : ''}>${label}</option>`
  )).join('');
}

export function renderPortfolioView() {
  const inner = document.getElementById('portfolio-view-inner');
  if (!inner) return;
  const editingProperty = portfolio.properties.find(property => property.id === editState.propertyId);
  const editingTenant = portfolio.tenants.find(tenant => tenant.id === editState.tenantId);
  const editingVendor = portfolio.vendors.find(vendor => vendor.id === editState.vendorId);

  inner.innerHTML = `
    <div class="portfolio-shell">
      <div class="portfolio-header">
        <div>
          <div class="portfolio-kicker">Portfolio Starter</div>
          <h2>Properties, units, owners, tenants, and vendors.</h2>
          <p>Keep the beginner registry simple: what you manage, who lives there, who owns it, and who you call when something breaks.</p>
        </div>
        <div class="portfolio-summary">
          <div><strong>${portfolio.properties.length}</strong><span>properties</span></div>
          <div><strong>${totalUnits()}</strong><span>units</span></div>
          <div><strong>${portfolio.tenants.length}</strong><span>tenants</span></div>
          <div><strong>${portfolio.vendors.length}</strong><span>vendors</span></div>
        </div>
      </div>

      ${renderPortfolioPrivacyNotice()}
      ${renderStarterExampleStrip()}

      <div class="portfolio-grid">
        <section class="portfolio-panel">
          <div class="portfolio-panel-head">
            <div>
              <h3>${editingProperty ? 'Edit Property' : 'Add Property'}</h3>
              <p>${editingProperty ? 'Update owner/client context, units, or operating notes.' : 'Track the minimum context needed to run early operations.'}</p>
            </div>
            ${!editingProperty ? `
              <label class="btn btn-secondary portfolio-csv-btn" title="Bulk-add properties from a CSV file">
                &#8593; Import CSV
                <input type="file" accept=".csv" style="display:none" onchange="importPropertiesCSV(this)">
              </label>
            ` : ''}
          </div>
          <div class="portfolio-form-grid">
            <label>
              <span>Property name</span>
              <input id="property-name" class="portfolio-input" type="text" placeholder="e.g. Oak Street Duplex" maxlength="80" value="${escapeHtml(editingProperty?.name || '')}">
            </label>
            <label>
              <span>Units</span>
              <input id="property-units" class="portfolio-input" type="number" min="0" step="1" placeholder="2" value="${editingProperty ? Number(editingProperty.units || 0) : ''}">
            </label>
            <label>
              <span>Owner / client</span>
              <input id="property-owner" class="portfolio-input" type="text" placeholder="e.g. Rivera Family LLC" maxlength="80" value="${escapeHtml(editingProperty?.owner || '')}">
            </label>
            <label>
              <span>Notes</span>
              <input id="property-notes" class="portfolio-input" type="text" placeholder="Gate code, special terms, risk notes..." maxlength="140" value="${escapeHtml(editingProperty?.notes || '')}">
            </label>
            <label>
              <span>Document link</span>
              <input id="property-doc-url" class="portfolio-input" type="url" placeholder="Deed, insurance, inspection report..." maxlength="500" value="${escapeHtml(editingProperty?.documentUrl || '')}">
            </label>
          </div>
          <div class="portfolio-form-actions">
            <button class="btn btn-primary portfolio-submit" onclick="commitAddProperty()">${editingProperty ? 'Update Property' : 'Add Property'}</button>
            ${editingProperty ? '<button class="btn btn-secondary portfolio-submit" onclick="cancelPortfolioEdit(\'property\')">Cancel</button>' : ''}
          </div>
        </section>

        <section class="portfolio-panel">
          <div class="portfolio-panel-head">
            <div>
              <h3>${editingTenant ? 'Edit Tenant' : 'Add Tenant'}</h3>
              <p>${editingTenant ? 'Keep resident contact and unit context ready for maintenance and communication.' : 'Know who is connected to each unit before requests and renewals arrive.'}</p>
              <p class="portfolio-sensitive-hint">${escapeHtml(TENANT_FORM_HINT)}</p>
            </div>
            ${!editingTenant ? `
              <label class="btn btn-secondary portfolio-csv-btn" title="Bulk-add tenants from a CSV file">
                &#8593; Import CSV
                <input type="file" accept=".csv" style="display:none" onchange="importTenantsCSV(this)">
              </label>
            ` : ''}
          </div>
          <div class="portfolio-form-grid">
            <label>
              <span>Tenant name</span>
              <input id="tenant-name" class="portfolio-input" type="text" placeholder="e.g. Maya Chen" maxlength="80" value="${escapeHtml(editingTenant?.name || '')}">
            </label>
            <label>
              <span>Property</span>
              <select id="tenant-property" class="portfolio-input">
                ${propertyOptions(editingTenant?.propertyId || '')}
              </select>
            </label>
            <label>
              <span>Unit</span>
              <input id="tenant-unit" class="portfolio-input" type="text" placeholder="2B" maxlength="30" value="${escapeHtml(editingTenant?.unit || '')}">
            </label>
            <label>
              <span>Status</span>
              <select id="tenant-status" class="portfolio-input">
                ${tenantStatusOptions(editingTenant?.status || 'active')}
              </select>
            </label>
            <label>
              <span>Phone</span>
              <input id="tenant-phone" class="portfolio-input" type="tel" placeholder="(555) 000-0000" maxlength="40" value="${escapeHtml(editingTenant?.phone || '')}">
            </label>
            <label>
              <span>Email</span>
              <input id="tenant-email" class="portfolio-input" type="email" placeholder="tenant@example.com" maxlength="90" value="${escapeHtml(editingTenant?.email || '')}">
            </label>
            <label>
              <span>Monthly rent</span>
              <input id="tenant-rent" class="portfolio-input" type="number" min="0" step="1" placeholder="1200" value="${editingTenant?.rent ? Number(editingTenant.rent) : ''}">
            </label>
            <label>
              <span>Lease start</span>
              <input id="tenant-lease-start" class="portfolio-input" type="date" value="${escapeHtml(editingTenant?.leaseStart || '')}">
            </label>
            <label>
              <span>Lease end</span>
              <input id="tenant-lease-end" class="portfolio-input" type="date" value="${escapeHtml(editingTenant?.leaseEnd || '')}">
            </label>
            <label>
              <span>Balance due</span>
              <input id="tenant-balance-due" class="portfolio-input" type="number" min="0" step="1" placeholder="0" value="${editingTenant?.balanceDue ? Number(editingTenant.balanceDue) : ''}">
            </label>
            <label>
              <span>Lease document link</span>
              <input id="tenant-doc-url" class="portfolio-input" type="url" placeholder="Signed lease PDF..." maxlength="500" value="${escapeHtml(editingTenant?.documentUrl || '')}">
            </label>
          </div>
          <div class="portfolio-form-actions">
            <button class="btn btn-primary portfolio-submit" onclick="commitAddTenant()">${editingTenant ? 'Update Tenant' : 'Add Tenant'}</button>
            ${editingTenant ? '<button class="btn btn-secondary portfolio-submit" onclick="cancelPortfolioEdit(\'tenant\')">Cancel</button>' : ''}
          </div>
        </section>

        <section class="portfolio-panel">
          <div class="portfolio-panel-head">
            <div>
              <h3>${editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
              <p>${editingVendor ? 'Keep dispatch information complete before urgent repairs arrive.' : 'Build the emergency bench before the first urgent repair.'}</p>
            </div>
            ${!editingVendor ? `
              <label class="btn btn-secondary portfolio-csv-btn" title="Bulk-add vendors from a CSV file">
                &#8593; Import CSV
                <input type="file" accept=".csv" style="display:none" onchange="importVendorsCSV(this)">
              </label>
            ` : ''}
          </div>
          <div class="portfolio-form-grid">
            <label>
              <span>Vendor name</span>
              <input id="vendor-name" class="portfolio-input" type="text" placeholder="e.g. Ace Plumbing" maxlength="80" value="${escapeHtml(editingVendor?.name || '')}">
            </label>
            <label>
              <span>Trade</span>
              <input id="vendor-trade" class="portfolio-input" type="text" placeholder="Plumbing" maxlength="60" value="${escapeHtml(editingVendor?.trade || '')}">
            </label>
            <label>
              <span>Phone</span>
              <input id="vendor-phone" class="portfolio-input" type="tel" placeholder="(555) 000-0000" maxlength="40" value="${escapeHtml(editingVendor?.phone || '')}">
            </label>
            <label>
              <span>Email</span>
              <input id="vendor-email" class="portfolio-input" type="email" placeholder="dispatch@example.com" maxlength="90" value="${escapeHtml(editingVendor?.email || '')}">
            </label>
            <label>
              <span>W9 / COI link</span>
              <input id="vendor-doc-url" class="portfolio-input" type="url" placeholder="Insurance certificate, W9..." maxlength="500" value="${escapeHtml(editingVendor?.documentUrl || '')}">
            </label>
          </div>
          <div class="portfolio-form-actions">
            <button class="btn btn-primary portfolio-submit" onclick="commitAddVendor()">${editingVendor ? 'Update Vendor' : 'Add Vendor'}</button>
            ${editingVendor ? '<button class="btn btn-secondary portfolio-submit" onclick="cancelPortfolioEdit(\'vendor\')">Cancel</button>' : ''}
          </div>
        </section>
      </div>

      <div class="portfolio-lists">
        <section class="portfolio-list-panel">
          <div class="portfolio-list-head">
            <h3>Managed Properties</h3>
            <span>${portfolio.properties.length} total</span>
          </div>
          ${portfolio.properties.length
            ? `<div class="portfolio-list">${portfolio.properties.map(renderPropertyCard).join('')}</div>`
            : '<div class="portfolio-empty">Add the first property so the launch dashboard knows what this company manages.</div>'
          }
        </section>

        <section class="portfolio-list-panel">
          <div class="portfolio-list-head">
            <h3>Tenant Roster</h3>
            <span>${portfolio.tenants.length} total</span>
          </div>
          ${portfolio.tenants.length
            ? `<div class="portfolio-list">${portfolio.tenants.map(renderTenantCard).join('')}</div>`
            : '<div class="portfolio-empty">Add the first tenant so maintenance and communication have real unit context.</div>'
          }
        </section>

        <section class="portfolio-list-panel">
          <div class="portfolio-list-head">
            <h3>Vendor Bench</h3>
            <span>${portfolio.vendors.length} total</span>
          </div>
          ${portfolio.vendors.length
            ? `<div class="portfolio-list">${portfolio.vendors.map(renderVendorCard).join('')}</div>`
            : '<div class="portfolio-empty">Add at least one vendor for plumbing, HVAC, electrical, or general maintenance.</div>'
          }
        </section>
      </div>
    </div>
  `;

  [
    'property-name', 'property-units', 'property-owner', 'property-notes', 'property-doc-url',
    'tenant-name', 'tenant-property', 'tenant-unit', 'tenant-status', 'tenant-phone', 'tenant-email',
    'tenant-rent', 'tenant-lease-start', 'tenant-lease-end', 'tenant-balance-due', 'tenant-doc-url',
    'vendor-name', 'vendor-trade', 'vendor-phone', 'vendor-email', 'vendor-doc-url'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onkeydown = e => {
      if (e.key === 'Enter') {
        if (id.startsWith('property')) commitAddProperty();
        else if (id.startsWith('tenant')) commitAddTenant();
        else commitAddVendor();
      }
    };
  });
}

export function addStarterExample() {
  const hasExistingData = portfolio.properties.length || portfolio.tenants.length || portfolio.vendors.length || workOrders.length;
  if (hasExistingData && !confirm('Add one editable starter example to your current setup?\n\nThis creates a property, tenant, vendor, and work order you can change or delete.')) {
    return;
  }

  const stamp = Date.now();
  const propertyId = `property-example-${stamp}`;
  const property = {
    id: propertyId,
    name: 'Oak Street Duplex',
    units: 2,
    owner: 'Rivera Family LLC',
    notes: 'Lockbox on side gate. Owner prefers text before non-urgent repairs.',
    documentUrl: 'https://example.com/documents/oak-street-deed.pdf',
    createdAt: new Date().toISOString(),
  };
  const tenant = {
    id: `tenant-example-${stamp}`,
    name: 'Maya Chen',
    propertyId,
    unit: '2B',
    status: 'active',
    phone: '(555) 010-2040',
    email: 'maya.chen@example.com',
    rent: 1450,
    leaseStart: new Date(stamp - 320 * 86400000).toISOString().slice(0, 10),
    leaseEnd: new Date(stamp + 45 * 86400000).toISOString().slice(0, 10),
    balanceDue: 450,
    documentUrl: 'https://example.com/documents/maya-chen-lease.pdf',
    createdAt: new Date().toISOString(),
  };
  const vendor = {
    id: `vendor-example-${stamp}`,
    name: 'Ace Plumbing',
    trade: 'Plumbing',
    phone: '(555) 010-1188',
    email: 'dispatch@aceplumbing.example',
    documentUrl: 'https://example.com/documents/ace-plumbing-coi.pdf',
    createdAt: new Date().toISOString(),
  };
  const workOrder = {
    id: `wo-example-${stamp}`,
    property: property.name,
    unit: tenant.unit,
    tenant: tenant.name,
    title: 'Kitchen sink leak',
    notes: 'Tenant reports slow drip under sink. Confirm access window before dispatch.',
    priority: 'high',
    status: 'submitted',
    assignee: 'UNASSIGNED',
    vendor: vendor.name,
    dueDate: null,
    cost: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  setPortfolio({
    properties: [property, ...portfolio.properties],
    tenants: [tenant, ...portfolio.tenants],
    vendors: [vendor, ...portfolio.vendors],
  });
  workOrders.unshift(workOrder);
  savePortfolio();
  saveWorkOrders();
  logAudit('starter_example_added', { title: property.name });
  renderPortfolioView();
  renderLaunchPlan();

  const workOrderBeacon = document.getElementById('wo-tab-beacon');
  if (workOrderBeacon) workOrderBeacon.hidden = false;
  _showActionToast('Starter example added', 'save-toast--success');
}

// ── CSV bulk import ────────────────────────────────────────────────────────────
// A company migrating off a spreadsheet almost always already has this data
// in Excel/Sheets — typing it into the form one record at a time is exactly
// the kind of friction this feature removes. Column headers match what
// exportPropertiesCSV/exportTenantsCSV/exportVendorsCSV produce, so
// "export, edit in Excel, re-import" is a real round trip, but headers can
// also be reordered/partial since matching is by name, not position.

function _readCsvFile(inputEl) {
  return new Promise((resolve, reject) => {
    const file = inputEl.files[0];
    if (!file) { resolve(null); return; }
    if (file.size > MAX_IMPORT_BYTES) {
      reject(new Error(`That file is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is ${MAX_IMPORT_BYTES / 1048576} MB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

// Runs the shared read -> parse -> map -> confirm pipeline and returns the
// array of new records to add, or null if the import didn't happen.
async function _importPortfolioCSV(inputEl, { label, pluralLabel = `${label}s`, requiredHeader, mapRow }) {
  let text;
  try {
    text = await _readCsvFile(inputEl);
  } catch (e) {
    alert(e.message);
    inputEl.value = '';
    return null;
  }
  inputEl.value = '';
  if (!text) return null;

  // Undo the apostrophe our own export adds in front of =,+,-,@ cells so
  // export -> edit -> re-import is lossless.
  const allRows = parseCSV(text).map(row => row.map(unguardCsvCell));
  if (allRows.length < 2) {
    alert(`That file doesn't look like a ${label} CSV — no data rows found.`);
    return null;
  }
  const headerMap = buildCsvHeaderMap(allRows[0]);
  if (!(requiredHeader in headerMap)) {
    alert(`That file needs a "${requiredHeader}" column — that's how each row's name is read.`);
    return null;
  }

  const records = [];
  let skipped = 0;
  let warnings = 0;
  allRows.slice(1).forEach((cells, idx) => {
    if (cells.every(c => c.trim() === '')) return;
    const result = mapRow(headerMap, cells, idx);
    if (!result) { skipped++; return; }
    if (result.warning) warnings++;
    records.push(result.record);
  });

  if (records.length === 0) {
    alert(`No usable ${label} rows found in that file — check that the "${requiredHeader}" column has a value on each row.`);
    return null;
  }

  const parts = [`Import ${records.length} ${records.length === 1 ? label : pluralLabel}?`];
  if (skipped) parts.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped (no ${requiredHeader}).`);
  if (warnings) parts.push(`${warnings} row${warnings === 1 ? '' : 's'} had a value that couldn't be used and was left blank.`);
  parts.push("This adds new records — it won't update or remove any existing ones.");
  if (!confirm(parts.join('\n'))) return null;

  return records;
}

function _resolvePropertyIdByName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const match = portfolio.properties.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
  return match ? match.id : '';
}

export async function importPropertiesCSV(inputEl) {
  const records = await _importPortfolioCSV(inputEl, {
    label: 'property',
    pluralLabel: 'properties',
    requiredHeader: 'property',
    mapRow: (h, cells, idx) => {
      const name = (cells[h['property']] || '').trim();
      if (!name) return null;
      const rawUnits = parseInt(cells[h['units']], 10);
      const rawDocUrl = (cells[h['document link']] || '').trim();
      return {
        warning: rawDocUrl && !isSafeUrl(rawDocUrl),
        record: {
          id: `property-csv-${Date.now()}-${idx}`,
          name,
          units: Number.isFinite(rawUnits) && rawUnits >= 0 ? rawUnits : 0,
          owner: (cells[h['owner / client']] || '').trim(),
          notes: (cells[h['notes']] || '').trim(),
          documentUrl: normalizeUrl(rawDocUrl),
          createdAt: new Date().toISOString(),
        },
      };
    },
  });
  if (!records) return;
  const clean = normalizePortfolio({ properties: records }).portfolio.properties;

  saveBackupSnapshot('Before CSV import');
  portfolio.properties.unshift(...clean);
  savePortfolio();
  logAudit('portfolio_property_added', { title: `${clean.length} imported from CSV` });
  renderPortfolioView();
  renderLaunchPlan();
  _showActionToast(`✓ Imported ${clean.length} propert${clean.length === 1 ? 'y' : 'ies'}`, 'save-toast--success');
}

export async function importTenantsCSV(inputEl) {
  const records = await _importPortfolioCSV(inputEl, {
    label: 'tenant',
    requiredHeader: 'tenant',
    mapRow: (h, cells, idx) => {
      const name = (cells[h['tenant']] || '').trim();
      if (!name) return null;
      let warning = false;

      const propertyName = cells[h['property']];
      const propertyId = _resolvePropertyIdByName(propertyName);
      if (propertyName && propertyName.trim() && !propertyId) warning = true;

      const status = (cells[h['status']] || '').trim().toLowerCase();
      const validStatus = ['active', 'applicant', 'notice', 'past'].includes(status) ? status : 'active';

      const rawRent = parseFloat(cells[h['monthly rent']]);
      const rawBalance = parseFloat(cells[h['balance due']]);
      const leaseStart = (cells[h['lease start']] || '').trim();
      const leaseEnd   = (cells[h['lease end']] || '').trim();
      const validStart = isValidISODate(leaseStart) ? leaseStart : '';
      let validEnd = isValidISODate(leaseEnd) ? leaseEnd : '';
      if (validStart && validEnd && validEnd < validStart) { validEnd = ''; warning = true; }

      const rawDocUrl = (cells[h['document link']] || '').trim();
      if (rawDocUrl && !isSafeUrl(rawDocUrl)) warning = true;

      return {
        warning,
        record: {
          id: `tenant-csv-${Date.now()}-${idx}`,
          name,
          propertyId,
          unit: (cells[h['unit']] || '').trim(),
          status: validStatus,
          phone: (cells[h['phone']] || '').trim(),
          email: (cells[h['email']] || '').trim(),
          rent: Number.isFinite(rawRent) && rawRent >= 0 ? rawRent : 0,
          leaseStart: validStart,
          leaseEnd: validEnd,
          balanceDue: Number.isFinite(rawBalance) && rawBalance >= 0 ? rawBalance : 0,
          documentUrl: normalizeUrl(rawDocUrl),
          createdAt: new Date().toISOString(),
        },
      };
    },
  });
  if (!records) return;
  // Existing properties are passed along so a tenant's propertyId survives its cross-reference check.
  const clean = normalizePortfolio({ properties: portfolio.properties, tenants: records }).portfolio.tenants;

  saveBackupSnapshot('Before CSV import');
  portfolio.tenants.unshift(...clean);
  savePortfolio();
  logAudit('portfolio_tenant_added', { title: `${clean.length} imported from CSV` });
  renderPortfolioView();
  renderLaunchPlan();
  _showActionToast(`✓ Imported ${clean.length} tenant${clean.length === 1 ? '' : 's'}`, 'save-toast--success');
}

export async function importVendorsCSV(inputEl) {
  const records = await _importPortfolioCSV(inputEl, {
    label: 'vendor',
    requiredHeader: 'vendor',
    mapRow: (h, cells, idx) => {
      const name = (cells[h['vendor']] || '').trim();
      if (!name) return null;
      const rawDocUrl = (cells[h['document link']] || '').trim();
      return {
        warning: rawDocUrl && !isSafeUrl(rawDocUrl),
        record: {
          id: `vendor-csv-${Date.now()}-${idx}`,
          name,
          trade: (cells[h['trade']] || '').trim(),
          phone: (cells[h['phone']] || '').trim(),
          email: (cells[h['email']] || '').trim(),
          documentUrl: normalizeUrl(rawDocUrl),
          createdAt: new Date().toISOString(),
        },
      };
    },
  });
  if (!records) return;
  const clean = normalizePortfolio({ vendors: records }).portfolio.vendors;

  saveBackupSnapshot('Before CSV import');
  portfolio.vendors.unshift(...clean);
  savePortfolio();
  logAudit('portfolio_vendor_added', { title: `${clean.length} imported from CSV` });
  renderPortfolioView();
  renderLaunchPlan();
  _showActionToast(`✓ Imported ${clean.length} vendor${clean.length === 1 ? '' : 's'}`, 'save-toast--success');
}

export function commitAddProperty() {
  const nameEl = document.getElementById('property-name');
  const name = nameEl?.value.trim();
  if (!name) {
    shakeInput(nameEl);
    nameEl?.focus();
    return;
  }
  const docUrlEl = document.getElementById('property-doc-url');
  const docUrl = docUrlEl?.value.trim() || '';
  if (docUrl && !isSafeUrl(docUrl)) {
    shakeInput(docUrlEl);
    alert('Document link must be a full http:// or https:// URL.');
    return;
  }
  const rawUnits = parseInt(document.getElementById('property-units')?.value, 10);
  const payload = {
    name,
    units: Number.isFinite(rawUnits) && rawUnits >= 0 ? rawUnits : 0,
    owner: document.getElementById('property-owner')?.value.trim() || '',
    notes: document.getElementById('property-notes')?.value.trim() || '',
    documentUrl: normalizeUrl(docUrl),
  };
  const existing = portfolio.properties.find(property => property.id === editState.propertyId);
  if (existing) {
    Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
    editState.propertyId = null;
    logAudit('portfolio_property_updated', { title: name });
  } else {
    portfolio.properties.unshift({
      id: `property-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...payload,
      createdAt: new Date().toISOString(),
    });
    logAudit('portfolio_property_added', { title: name });
  }
  savePortfolio();
  renderPortfolioView();
  renderLaunchPlan();
}

export function commitAddTenant() {
  const nameEl = document.getElementById('tenant-name');
  const name = nameEl?.value.trim();
  if (!name) {
    shakeInput(nameEl);
    nameEl?.focus();
    return;
  }

  const leaseStartEl = document.getElementById('tenant-lease-start');
  const leaseEndEl   = document.getElementById('tenant-lease-end');
  const leaseStart   = leaseStartEl?.value || '';
  const leaseEnd     = leaseEndEl?.value || '';
  if (leaseStart && leaseEnd && isValidISODate(leaseStart) && isValidISODate(leaseEnd) && leaseEnd < leaseStart) {
    shakeInput(leaseEndEl);
    alert('Lease end date must be on or after the lease start date.');
    return;
  }

  const docUrlEl = document.getElementById('tenant-doc-url');
  const docUrl = docUrlEl?.value.trim() || '';
  if (docUrl && !isSafeUrl(docUrl)) {
    shakeInput(docUrlEl);
    alert('Document link must be a full http:// or https:// URL.');
    return;
  }

  const rawRent = parseFloat(document.getElementById('tenant-rent')?.value);
  const rawBalance = parseFloat(document.getElementById('tenant-balance-due')?.value);
  const payload = {
    name,
    propertyId: document.getElementById('tenant-property')?.value || '',
    unit: document.getElementById('tenant-unit')?.value.trim() || '',
    status: document.getElementById('tenant-status')?.value || 'active',
    phone: document.getElementById('tenant-phone')?.value.trim() || '',
    email: document.getElementById('tenant-email')?.value.trim() || '',
    rent: Number.isFinite(rawRent) && rawRent >= 0 ? rawRent : 0,
    leaseStart: isValidISODate(leaseStart) ? leaseStart : '',
    leaseEnd: isValidISODate(leaseEnd) ? leaseEnd : '',
    balanceDue: Number.isFinite(rawBalance) && rawBalance >= 0 ? rawBalance : 0,
    documentUrl: normalizeUrl(docUrl),
  };
  const existing = portfolio.tenants.find(tenant => tenant.id === editState.tenantId);
  if (existing) {
    Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
    editState.tenantId = null;
    logAudit('portfolio_tenant_updated', { title: name });
  } else {
    portfolio.tenants.unshift({
      id: `tenant-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...payload,
      createdAt: new Date().toISOString(),
    });
    logAudit('portfolio_tenant_added', { title: name });
  }
  savePortfolio();
  renderPortfolioView();
  renderLaunchPlan();
}

export function commitAddVendor() {
  const nameEl = document.getElementById('vendor-name');
  const name = nameEl?.value.trim();
  if (!name) {
    shakeInput(nameEl);
    nameEl?.focus();
    return;
  }
  const docUrlEl = document.getElementById('vendor-doc-url');
  const docUrl = docUrlEl?.value.trim() || '';
  if (docUrl && !isSafeUrl(docUrl)) {
    shakeInput(docUrlEl);
    alert('Document link must be a full http:// or https:// URL.');
    return;
  }
  const payload = {
    name,
    trade: document.getElementById('vendor-trade')?.value.trim() || '',
    phone: document.getElementById('vendor-phone')?.value.trim() || '',
    email: document.getElementById('vendor-email')?.value.trim() || '',
    documentUrl: normalizeUrl(docUrl),
  };
  const existing = portfolio.vendors.find(vendor => vendor.id === editState.vendorId);
  if (existing) {
    Object.assign(existing, payload, { updatedAt: new Date().toISOString() });
    editState.vendorId = null;
    logAudit('portfolio_vendor_updated', { title: name });
  } else {
    portfolio.vendors.unshift({
      id: `vendor-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      ...payload,
      createdAt: new Date().toISOString(),
    });
    logAudit('portfolio_vendor_added', { title: name });
  }
  savePortfolio();
  renderPortfolioView();
  renderLaunchPlan();
}

export function deleteProperty(id) {
  const property = portfolio.properties.find(p => p.id === id);
  if (!property) return;
  if (!confirm(`Delete property?\n\n${property.name}`)) return;
  if (editState.propertyId === id) editState.propertyId = null;
  setPortfolio({
    ...portfolio,
    properties: portfolio.properties.filter(p => p.id !== id),
  });
  savePortfolio();
  logAudit('portfolio_property_deleted', { title: property.name });
  renderPortfolioView();
  renderLaunchPlan();
}

export function recordTenantPayment(id) {
  const tenant = portfolio.tenants.find(t => t.id === id);
  if (!tenant) return;
  const currentBalance = Number(tenant.balanceDue || 0);
  const input = prompt(`Record a payment for ${tenant.name}.\n\nCurrent balance due: ${formatCurrency(currentBalance)}\n\nPayment amount:`, currentBalance > 0 ? currentBalance : (tenant.rent || ''));
  if (input === null) return;
  const amount = parseFloat(input);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert('Enter a payment amount greater than 0.');
    return;
  }
  tenant.balanceDue = Math.max(0, currentBalance - amount);
  tenant.lastPaymentDate = new Date().toISOString().slice(0, 10);
  tenant.updatedAt = new Date().toISOString();
  savePortfolio();
  logAudit('portfolio_payment_recorded', { title: tenant.name, from: currentBalance, to: tenant.balanceDue });
  renderPortfolioView();
  renderLaunchPlan();
  _showActionToast(`✓ Payment recorded for ${tenant.name}`, 'save-toast--success');
}

export function deleteTenant(id) {
  const tenant = portfolio.tenants.find(t => t.id === id);
  if (!tenant) return;
  if (!confirm(`Delete tenant?\n\n${tenant.name}`)) return;
  if (editState.tenantId === id) editState.tenantId = null;
  setPortfolio({
    ...portfolio,
    tenants: portfolio.tenants.filter(t => t.id !== id),
  });
  savePortfolio();
  logAudit('portfolio_tenant_deleted', { title: tenant.name });
  renderPortfolioView();
  renderLaunchPlan();
}

export function deleteVendor(id) {
  const vendor = portfolio.vendors.find(v => v.id === id);
  if (!vendor) return;
  if (!confirm(`Delete vendor?\n\n${vendor.name}`)) return;
  if (editState.vendorId === id) editState.vendorId = null;
  setPortfolio({
    ...portfolio,
    vendors: portfolio.vendors.filter(v => v.id !== id),
  });
  savePortfolio();
  logAudit('portfolio_vendor_deleted', { title: vendor.name });
  renderPortfolioView();
  renderLaunchPlan();
}

export function startEditProperty(id) {
  if (!portfolio.properties.some(property => property.id === id)) return;
  editState.propertyId = id;
  renderPortfolioView();
  focusPortfolioInput('property-name');
}

export function startEditTenant(id) {
  if (!portfolio.tenants.some(tenant => tenant.id === id)) return;
  editState.tenantId = id;
  renderPortfolioView();
  focusPortfolioInput('tenant-name');
}

export function startEditVendor(id) {
  if (!portfolio.vendors.some(vendor => vendor.id === id)) return;
  editState.vendorId = id;
  renderPortfolioView();
  focusPortfolioInput('vendor-name');
}

export function cancelPortfolioEdit(type) {
  if (type === 'property') editState.propertyId = null;
  else if (type === 'tenant') editState.tenantId = null;
  else if (type === 'vendor') editState.vendorId = null;
  renderPortfolioView();
}

// Re-validates the scheme at render time too, not just on save — portfolio
// records can also arrive via JSON import or Team Sync, neither of which
// goes through commitAddProperty/Tenant/Vendor's save-time validation.
function renderDocLink(url) {
  const href = normalizeUrl(url);
  if (!href) return '';
  return `<a class="doc-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">&#128196; Document</a>`;
}

function renderPropertyCard(property) {
  return `
    <article class="portfolio-card">
      <div>
        <strong>${escapeHtml(property.name)}</strong>
        <span>${Number(property.units || 0)} unit${Number(property.units || 0) === 1 ? '' : 's'}${property.owner ? ` / ${escapeHtml(property.owner)}` : ''}</span>
        ${property.notes ? `<small>${escapeHtml(property.notes)}</small>` : ''}
        ${renderDocLink(property.documentUrl)}
      </div>
      <div class="portfolio-card-actions">
        <button class="portfolio-edit-btn" data-id="${escapeHtml(property.id)}" onclick="startEditProperty(this.dataset.id)" aria-label="Edit ${escapeHtml(property.name)}">Edit</button>
        <button class="portfolio-delete-btn" data-id="${escapeHtml(property.id)}" onclick="deleteProperty(this.dataset.id)" aria-label="Delete ${escapeHtml(property.name)}">Delete</button>
      </div>
    </article>
  `;
}

function renderVendorCard(vendor) {
  const contact = [vendor.phone, vendor.email].filter(Boolean).join(' / ');
  return `
    <article class="portfolio-card">
      <div>
        <strong>${escapeHtml(vendor.name)}</strong>
        <span>${escapeHtml(vendor.trade || 'General vendor')}</span>
        ${contact ? `<small>${escapeHtml(contact)}</small>` : ''}
        ${renderDocLink(vendor.documentUrl)}
      </div>
      <div class="portfolio-card-actions">
        <button class="portfolio-edit-btn" data-id="${escapeHtml(vendor.id)}" onclick="startEditVendor(this.dataset.id)" aria-label="Edit ${escapeHtml(vendor.name)}">Edit</button>
        <button class="portfolio-delete-btn" data-id="${escapeHtml(vendor.id)}" onclick="deleteVendor(this.dataset.id)" aria-label="Delete ${escapeHtml(vendor.name)}">Delete</button>
      </div>
    </article>
  `;
}

function renderTenantCard(tenant) {
  const contact = [tenant.phone, tenant.email].filter(Boolean).join(' / ');
  const unitLabel = tenant.unit ? `Unit ${tenant.unit}` : 'No unit recorded';
  const leaseStatus = getLeaseStatus(tenant);
  const delinquency = getDelinquencyStatus(tenant);
  return `
    <article class="portfolio-card">
      <div>
        <strong>${escapeHtml(tenant.name)}</strong>
        <span>${escapeHtml(propertyName(tenant.propertyId))} / ${escapeHtml(unitLabel)} / ${escapeHtml(tenant.status || 'active')}</span>
        ${contact ? `<small>${escapeHtml(contact)}</small>` : ''}
        ${tenant.rent > 0 || leaseStatus || delinquency ? `
          <div class="tenant-lease-row">
            ${tenant.rent > 0 ? `<span class="tenant-rent-chip">${escapeHtml(formatCurrency(tenant.rent))}/mo</span>` : ''}
            ${leaseStatus ? `<span class="lease-chip lease-chip--${leaseStatus.tone}">${escapeHtml(leaseStatus.label)}</span>` : ''}
            ${delinquency ? `<span class="lease-chip lease-chip--${delinquency.tone}">${escapeHtml(delinquency.label)}</span>` : ''}
          </div>
        ` : ''}
        ${tenant.lastPaymentDate ? `<small>Last payment: ${escapeHtml(tenant.lastPaymentDate)}</small>` : ''}
        ${renderDocLink(tenant.documentUrl)}
      </div>
      <div class="portfolio-card-actions">
        <button class="portfolio-edit-btn" data-id="${escapeHtml(tenant.id)}" onclick="recordTenantPayment(this.dataset.id)" aria-label="Record payment for ${escapeHtml(tenant.name)}">Payment</button>
        <button class="portfolio-edit-btn" data-id="${escapeHtml(tenant.id)}" onclick="startEditTenant(this.dataset.id)" aria-label="Edit ${escapeHtml(tenant.name)}">Edit</button>
        <button class="portfolio-delete-btn" data-id="${escapeHtml(tenant.id)}" onclick="deleteTenant(this.dataset.id)" aria-label="Delete ${escapeHtml(tenant.name)}">Delete</button>
      </div>
    </article>
  `;
}

function renderStarterExampleStrip() {
  const setupIncomplete = !portfolio.properties.length || !portfolio.tenants.length || !portfolio.vendors.length || !workOrders.length;
  if (!setupIncomplete) return '';

  return `
    <section class="portfolio-example-strip">
      <div>
        <strong>Want a realistic starter setup?</strong>
        <span>Add an editable duplex, tenant, plumbing vendor, and first repair request to see how the pieces connect.</span>
      </div>
      <button class="btn btn-secondary" onclick="addStarterExample()">Add Starter Example</button>
    </section>
  `;
}

function focusPortfolioInput(id) {
  setTimeout(() => {
    const input = document.getElementById(id);
    input?.focus();
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}
