/** Guided UI. Business progress is calculated by setupModel.js. */
/** @typedef {{switchView:(view:string, tab:Element|null)=>void, showOnboardingModal:()=>void, showNewWorkOrderModal:()=>void, downloadOperationsHandbook:()=>void, refreshAfterSetupAssignment:()=>void}} SetupBindings */
const appWindow = /** @type {Window & SetupBindings} */ (/** @type {unknown} */ (window));
import { orgData, teamData, portfolio, workOrders } from './state.js';
import { getCompanyName, getOpsProfile, saveToStorage, logAudit, _showActionToast } from './storage.js';
import { deriveSetup, SETUP_STEPS, rosterSignature } from './setupModel.js';
import { readSetupPreferences, writeSetupPreferences, resetSetupPreferences } from './setupPreferences.js';
import { escapeHtml } from './utils.js';
import { DEMO_MODE } from './demoMode.js';

/** @type {HTMLElement | null} */
let bound = null;
let storageWarning = false;
function snapshot() {
  const company = getCompanyName();
  const profile = getOpsProfile();
  return deriveSetup({ company, profile: profile.company === company ? profile : {},
    properties: portfolio.properties, tenants: portfolio.tenants, vendors: portfolio.vendors,
    employees: teamData.employees, tasks: (orgData?.departments || []).flatMap(d => d.tasks),
  }, readSetupPreferences());
}
/** @param {string} action @param {string} text @param {string} extra */
function button(action, text, extra = '') {
  const primary = ['resume', 'company', 'property-form', 'confirm-maintenance', 'finish'].includes(action)
    || (action === 'people-form' && !teamData.employees.length)
    || (action === 'confirm-roster' && teamData.employees.length > 0);
  return `<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" data-setup="${action}" ${extra}>${text}</button>`;
}
/** @param {Partial<import('./setupPreferences.js').SetupPreferences>} patch */
function save(patch) {
  storageWarning = !writeSetupPreferences(patch);
  renderSetupGuide();
}
/** @param {string} view @param {string} [input] */
function navigate(view, input) {
  if (!document.getElementById(`${view}-view`)?.classList.contains('active')) appWindow.switchView(view, document.querySelector(`.nav-tab[data-view="${view}"]`));
  if (input) {
    const field = document.getElementById(input);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
/** @param {ReturnType<typeof deriveSetup>} model */
function propertySelect(model) {
  return `<label>Starter property <select data-setup="property" aria-label="Starter property"><option value="">Choose a property</option>${portfolio.properties.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === model.property?.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>`;
}
/** @param {string} id @param {ReturnType<typeof deriveSetup>} model */
function stepBody(id, model) {
  switch (id) {
    case 'company': return `<p>Tell us your company name, portfolio size, and operating focus. You can update them later.</p>${button('company', 'Edit company details')}`;
    case 'property': return `<p>Start with one property; add the rest later. Selecting it anchors contact guidance, not company-wide task ownership.</p>${portfolio.properties.length ? propertySelect(model) : ''}${button('property-form', 'Add a property')}`;
    case 'contacts': return `<p>Add resident context for ${escapeHtml(model.property?.name || 'your starter property')} and a repair vendor. Vendor records are company-wide; their existence does not prove emergency availability.</p>${propertySelect(model)}<p>Resident: ${model.resident ? 'recorded' : model.vacant ? 'not applicable — starter property is vacant' : 'not recorded'} · Vendor: ${portfolio.vendors.length ? 'recorded' : 'not recorded'}</p>${button('resident-form', 'Add resident', !model.property ? 'disabled' : '')}${button('vendor-form', 'Add vendor')}${model.property ? button('vacant', model.vacant ? 'Resident entry applies again' : 'Starter property is vacant') : ''}`;
    case 'people': return `<p>A solo operator is a valid team. Add yourself or your teammates, choose their department coverage, then confirm the roster below.</p><p>${teamData.employees.map(e => escapeHtml(e.name)).join(', ') || 'No people recorded yet.'}</p>${button('people-form', 'I run it myself / Add people')}${button('confirm-roster', 'Confirm this roster', !teamData.employees.length ? 'disabled' : '')}`;
    case 'responsibilities': return `<p>Assign these 12 starter responsibilities to people on your confirmed roster. This is company-wide ownership; the full map remains available below.</p>${model.steps.find(s=>s.id==='people')?.status !== 'complete' ? '<p>Confirm your current roster in Your people to complete this step.</p>' : ''}<ul class="setup-task-list">${model.starter.map(({id,task,covered}) => `<li><label><span>${escapeHtml(task?.name || `Missing starter task: ${id}`)} <small>${covered ? 'Owner recorded' : 'Needs a roster owner'}</small></span><select aria-label="Owner for ${escapeHtml(task?.name || id)}" data-setup="owner" data-task="${id}" ${!task ? 'disabled' : ''}><option value="UNOWNED">Choose owner</option>${teamData.employees.map(e => `<option value="${escapeHtml(e.name)}" ${task?.owner === e.name ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}</select></label></li>`).join('')}</ul><p>Named ownership does not establish effort, availability, or qualifications. Auto-Assign remains in the full map and balances task counts, not capacity.</p>${button('full-map', 'Open full responsibility map')}`;
    case 'maintenance': return `<p><strong>Submitted → Scheduled → In Progress → Completed</strong></p><p>Agree who monitors intake, prioritizes repairs, assigns people and vendors, coordinates access, follows up, and verifies closeout. Keep real repair status accurate; creating or closing a repair is optional for setup.</p>${button('workorder-form', 'Create a real work order')}${demoLink()}${button('confirm-maintenance', 'I have reviewed this workflow')}`;
    case 'review': {
      const gaps = model.steps.filter(s => s.id !== 'review' && s.status !== 'complete');
      const unowned = (orgData?.departments || []).flatMap(d => d.tasks).filter(t => t.owner === 'UNOWNED').length;
      return `<p>Review your starting operation. Setup review is not certification of readiness or compliance.</p><ul>${model.steps.filter(s=>s.id !== 'review').map(s=>`<li>${s.title}: ${statusLabel(s.status)}</li>`).join('')}</ul><p>${model.starter.filter(t=>!t.covered).length} starter ownership gaps · ${unowned} unowned responsibilities across the full map.</p>${model.vacant ? '<p>Resident entry: not applicable for the selected vacant starter property. Revisit when it becomes occupied.</p>' : ''}<p>${gaps.length ? `${gaps.length} setup items remain to revisit.` : 'The starting setup checks are complete. Keep reviewing wider coverage and real work.'}</p>${button('handbook', 'Download handbook')}${button('finish', 'Finish setup review')}`;
    }
  }
}
/** @param {string} status */
function statusLabel(status) { return (/** @type {Record<string,string>} */ ({complete:'Complete',deferred:'Deferred',incomplete:'To do'}))[status]; }
function demoLink() {
  // Separate tab: the real workspace stays open, and no practice progress is transferred.
  return '<a class="btn btn-secondary" href="?demo=1" target="_blank" rel="noopener">Practice in isolated demo ↗</a>';
}
export function renderSetupGuide() {
  const el = document.getElementById('operation-setup');
  if (!el || !orgData) return;
  if (bound !== el) {
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    bound = el;
  }
  const prefs = readSetupPreferences();
  const model = snapshot();
  const focus = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusAction = focus?.dataset.setup;
  const focusTask = focus?.dataset.task;
  const focusStep = focus?.dataset.step;
  const expanded = el.querySelector('details')?.open;
  if (!prefs.active) {
    const outstanding = model.steps.filter(s => s.id !== 'review' && s.status !== 'complete').length;
    const tasks = (orgData?.departments || []).flatMap(d => d.tasks);
    const blocked = tasks.filter(t=>t.status==='blocked').length;
    const overdue = tasks.filter(t=>t.dueDate && t.dueDate < new Date().toISOString().slice(0,10) && t.status!=='done').length;
    el.innerHTML = `<div class="setup-heading"><div><h2>${prefs.reviewSaved ? 'What needs attention?' : 'Set up your operation'}</h2><p>${prefs.reviewSaved ? `${blocked} blocked responsibilities · ${overdue} overdue · ${tasks.filter(t=>t.owner==='UNOWNED').length} unowned · ${workOrders.filter(w=>w.status!=='completed').length} active repairs (${workOrders.filter(w=>w.status!=='completed' && w.assignee==='UNASSIGNED').length} unassigned). ${outstanding} setup items remain to revisit.` : 'Start with one property, connect your people, and understand the operating loop. Existing work and every tool remain available.'}</p></div>${button('resume', prefs.reviewSaved ? 'Resume setup review' : 'Open setup guide')}</div>${DEMO_MODE ? '<p>Fictional demo workspace. Guide choices stay separate from your real workspace.</p>' : ''}`;
    return;
  }
  const step = model.steps.find(s => s.id === prefs.step) || model.next;
  el.innerHTML = `<div class="setup-heading"><div><span class="launch-kicker">One property. One operating loop.</span><h2>Set up your operation</h2><p role="status" aria-live="polite">${model.completeCount} of 7 steps complete · ${model.deferredCount} deferred${model.vacant ? ' · resident entry not applicable for the vacant starter property' : ''}</p></div>${button('hide','Return to work')}</div>
    ${DEMO_MODE ? '<p>Fictional demo only. Return to your original tab to continue real setup; practice does not mark it complete.</p>' : ''}
    ${storageWarning ? '<p role="alert">Browser storage is unavailable. Guide choices may not survive reload; export your workspace to keep a copy.</p>' : ''}
    <details ${expanded ? 'open' : ''}><summary>View all seven steps</summary><ol class="setup-steps">${model.steps.map(s=>`<li>${button('step', `${s.title} — ${statusLabel(s.status)}`, `data-step="${s.id}" ${s.id===step.id ? 'aria-current="step"' : ''}`)}</li>`).join('')}</ol></details>
    <div class="setup-current"><h3 tabindex="-1" id="setup-current-title">${model.steps.indexOf(step)+1}. ${step.title} <small>${statusLabel(step.status)}</small></h3>${stepBody(step.id,model)}</div>
    <div class="setup-navigation">${button('back','Back', model.steps.indexOf(step)===0 ? 'disabled' : '')}${button('continue','Continue', step.id==='review' ? 'disabled' : '')}${step.status!=='complete' && step.id!=='review' ? button('defer',step.status==='deferred' ? 'Revisit this step' : 'Do this later') : ''}${button('restart','Restart walkthrough')}</div><p class="setup-note">Guide choices are local to this browser. Operational facts update from your workspace. Full navigation and detailed launch resources remain available.</p>`;
  if (focusAction) [.../** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-setup]'))].find(n=>n.dataset.setup===focusAction && n.dataset.task===focusTask && n.dataset.step===focusStep)?.focus({preventScroll:true});
}
/** @param {MouseEvent} event */
function onClick(event) {
  const b = /** @type {HTMLButtonElement | null} */ (event.target instanceof Element ? event.target.closest('button[data-setup]') : null);
  if (!b || b.disabled) return;
  const action = b.dataset.setup;
  const prefs = readSetupPreferences();
  const model = snapshot();
  const step = model.steps.find(s=>s.id===prefs.step) || model.next;
  if (action === 'resume') return save({ active:true, step:model.next.id });
  if (action === 'hide') return save({ active:false });
  if (action === 'step') { save({step:b.dataset.step}); return focusHeading(); }
  if (action === 'back' || action === 'continue' || action === 'defer') {
    const index = model.steps.indexOf(step);
    /** @type {Partial<import('./setupPreferences.js').SetupPreferences>} */
    const patch = {step:model.steps[Math.max(0,Math.min(6,index+(action==='back'?-1:1)))].id};
    if (action==='defer') patch.deferred = step.status==='deferred' ? prefs.deferred.filter(id=>id!==step.id) : [...new Set([...prefs.deferred,step.id])];
    save(patch); return focusHeading();
  }
  if (action === 'restart') {
    if (confirm('Restart only the walkthrough? Your properties, people, responsibilities, repairs, and history will be kept.')) { resetSetupPreferences(); save({active:true,step:'company'}); }
    return;
  }
  if (action === 'company') return appWindow.showOnboardingModal();
  if (action === 'property-form') return navigate('portfolio','property-name');
  if (action === 'resident-form') {
    navigate('portfolio','tenant-name');
    const field = /** @type {HTMLSelectElement | null} */ (document.getElementById('tenant-property'));
    if (field && model.property) field.value = model.property?.id || '';
    return;
  }
  if (action === 'vendor-form') return navigate('portfolio','vendor-name');
  if (action === 'people-form') return navigate('team','new-emp-name');
  if (action === 'confirm-roster') return save({roster:rosterSignature(teamData.employees)});
  if (action === 'vacant') return save({vacantPropertyId:model.vacant ? '' : model.property?.id || ''});
  if (action === 'confirm-maintenance') return save({maintenanceReviewed:true});
  if (action === 'full-map') { navigate('tracking'); document.getElementById('departments')?.scrollIntoView({behavior:'smooth'}); return; }
  if (action === 'workorder-form') { navigate('workorders'); return appWindow.showNewWorkOrderModal(); }
  if (action === 'handbook') return appWindow.downloadOperationsHandbook();
  if (action === 'finish') { save({reviewSaved:true,active:false}); _showActionToast('Setup review saved. Remaining gaps are still available to revisit.','save-toast--success'); }
}
function focusHeading() { document.getElementById('setup-current-title')?.focus({preventScroll:true}); }
/** @param {Event} event */
function onChange(event) {
  const el = /** @type {HTMLSelectElement} */ (event.target);
  if (el.dataset.setup === 'property') return save({propertyId:el.value});
  if (el.dataset.setup !== 'owner') return;
  const task = (orgData?.departments || []).flatMap(d=>d.tasks).find(t=>t.id===el.dataset.task);
  if (!task || !snapshot().starter.some(t=>t.id===task.id)) return;
  if (el.value !== 'UNOWNED' && !teamData.employees.some(e=>e.name===el.value)) return;
  const from = task.owner;
  task.owner = el.value;
  saveToStorage();
  logAudit('owner_changed', {task:task.name, from, to:el.value});
  appWindow.refreshAfterSetupAssignment();
}
