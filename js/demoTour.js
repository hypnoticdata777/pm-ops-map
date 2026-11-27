import { closeDemoDetails, revealDemoElement } from './demoLayout.js';
import { DEMO_MODE } from './demoMode.js';
import { DEMO_SCENARIOS } from './demoScenarios.js';
import { createTourPreferences } from './demoTourPreferences.js';
import { checkMaintenanceCondition, maintenanceTarget, maintenanceSummary, maintenanceIssue } from './maintenanceDemo.js';
import { escapeHtml } from './utils.js';
/** @typedef {import('./demoScenarios.js').DemoScenario} Scenario */
/** A navigation/state adapter keeps this controller independent of app.js and business mutations.
 * @param {{root:HTMLElement, enabled?:boolean, scenarios?:Scenario[], preferences?:ReturnType<typeof createTourPreferences>, navigate:(view:string)=>void, check?:(condition:string)=>boolean, target?:(step:import('./demoScenarios.js').DemoStep)=>Element|null, summary?:()=>string, issue?:(condition:string)=>string}} options
 */
export function createDemoTour({root,enabled=DEMO_MODE,scenarios=DEMO_SCENARIOS,preferences=createTourPreferences(),navigate,check=()=>false,target=step=>step.target?document.getElementById(step.target):null,summary=()=>'',issue=()=>''}) {
  let mode='chooser', paused=false, navigating=false;
  /** @type {Scenario | undefined} */ let active;
  let index=0;
  /** @type {Element | null} */ let highlighted=null;
  const button = (action='',text='',disabled=false) => `<button type="button" class="btn ${action==='next'||action==='resume'||action.startsWith('start:')?'btn-primary':'btn-secondary'}" data-tour="${action}" ${disabled?'disabled':''}>${escapeHtml(text)}</button>`;
  function cleanup() { const hint=document.getElementById('demo-wo-guidance');if(hint){hint.hidden=true;hint.textContent='';} highlighted?.classList.remove('demo-tour-target');highlighted=null; }
  function focusHeading() { root.querySelector('h2')?.focus({preventScroll:true});revealDemoElement(root); }
  function render() {
    if (!enabled) return;
    cleanup();root.hidden=false;
    document.body.classList.toggle('demo-choosing',mode==='chooser');
    document.body.classList.toggle('demo-guided',mode==='tour');
    const prefs=preferences.read();
    const resume=scenarios.find(s=>s.available && s.id===prefs.selected && prefs.checkpoints[s.id]);
    const warning=preferences.volatile?'<p role="status">This browser could not save tour progress. It may not survive a reload.</p>':'';
    if(mode==='chooser') {
      root.innerHTML=`<h2 tabindex="-1">What would you like to try?</h2><p>Choose a goal for this fictional operation. Try the maintenance walkthrough, or explore every existing tool freely. The other guided scenarios are coming next.</p>${warning}${resume?button('resume',`${prefs.completed?.includes(resume.id)?'Review':'Resume'} ${resume.title}`):''}${button('explore','Explore freely')}<div class="demo-scenario-grid">${scenarios.map(s=>`<article><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p>${s.available&&s.steps.length?button(`start:${s.id}`,'Try this demo'):'<p class="demo-coming">Coming next</p>'}</article>`).join('')}</div>`;
      return;
    }
    if(mode==='explore') {
      root.innerHTML=`<h2 tabindex="-1">Explore the fictional operation</h2><p>Your demo edits stay separate from your real workspace. Use Demo choices to return here and choose a goal.</p>${warning}${button('choices','Demo choices')}`;
      return;
    }
    if(mode==='finished') {
      root.innerHTML=`<h2 tabindex="-1">Demo walkthrough complete</h2><p>You reviewed how a named owner and a visible stage help the team follow a repair. This is a learning acknowledgement, not proof that work was performed.</p><p>${escapeHtml(summary())}</p>${warning}${button('choices','Try another demo')}${button('restart','Restart guidance (keep demo edits)')}<a class="btn btn-secondary" href="index.html">Set up my operation</a>${button('explore','Explore freely')}`;
      return;
    }
    const step=active?.steps[index];
    if (!active || !step) {mode='chooser';render();return;}
    const element=target(step);
    const missing=!!step.target&&!element;
    const satisfied=!step.condition||check(step.condition);
    if (!paused && element) {element.classList.add('demo-tour-target');highlighted=element;}
    const hint=document.getElementById('demo-wo-guidance');
    if(!paused && active.id==='maintenance' && step.id==='assign-repair' && element?.id==='wo-assignee' && hint){hint.hidden=false;hint.textContent='Demo: choose a current roster member, then save this repair. Cancel does not save your changes.';}
    const recovery=active.steps.findIndex(s=>s.condition&&!check(s.condition));
    root.innerHTML=`<h2 tabindex="-1">${escapeHtml(active.title)}</h2><p role="status">Step ${index+1} of ${active.steps.length}${paused?' · Paused':''}</p><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.why)}</p><p><strong>Notice:</strong> ${escapeHtml(step.notice)}</p><p><strong>Try:</strong> ${escapeHtml(step.action)}</p>${warning}${index===active.steps.length-1?`<p>${escapeHtml(summary())}</p>`:''}${step.condition&&issue(step.condition)?`<p role="status">${escapeHtml(issue(step.condition))}</p>`:''}${missing?'<p role="status">The example control is unavailable. Return to this step or explore freely. Reset demo restores fictional examples and discards demo edits.</p>':''}${step.condition&&step.condition!=='repair-exists'&&satisfied?'<p role="status">This condition is already satisfied in the current demo.</p>':''}<div class="demo-tour-actions">${button('back','Back',index===0)}${button('next',index===active.steps.length-1?'Finish':'Next',paused||missing||!satisfied)}${paused?button('return','Return to this step'):''}${element&&!paused?button('locate','Show highlighted control'):''}${recovery>=0&&recovery<index?button('recover',`Return to ${active.steps[recovery].title.toLowerCase()}`):''}</div><details class="demo-tour-options"><summary>Details and tour options</summary><p><strong>Expected result:</strong> ${escapeHtml(step.result)}</p><p>${escapeHtml(summary())}</p>${button('explore','Explore freely')}${button('restart','Restart guidance (keep demo edits)')}${button('choices','Demo choices')}<p>Back and Restart guidance do not undo demo edits.</p></details>`;
  }
  function save() {
    if(!active)return;
    const p=preferences.read();p.selected=active.id;p.checkpoints[active.id]=active.steps[index].id;preferences.write(p);
  }
  function enterStep() {
    const step=active?.steps[index];if(!step)return;
    closeDemoDetails();
    mode='tour';paused=false;navigating=true;
    try {navigate(step.view);} finally {navigating=false;}
    save();render();focusHeading();
  }
  /** @param {string} id @param {boolean} [resume] */
  function start(id,resume=false) {
    if(!enabled)return;
    active=scenarios.find(s=>s.available&&s.steps.length&&s.id===id);if(!active)return;
    const checkpoint=preferences.read().checkpoints[id];
    index=resume?Math.max(0,active.steps.findIndex(s=>s.id===checkpoint)):0;enterStep();
  }
  /** @param {Event} event */
  function onClick(event) {
    if (!(event.target instanceof Element))return;
    const b=event.target.closest('button[data-tour]');if(!(b instanceof HTMLButtonElement)||b.disabled)return;
    const action=b.dataset.tour||'';
    if(action.startsWith('start:'))return start(action.slice(6));
    if(action==='resume'){const id=preferences.read().selected;if(id)start(id,true);return;}
    if(action==='locate'){revealDemoElement(highlighted);return;}
    if(action==='return')return enterStep();
    if(action==='recover'&&active){const earliest=active.steps.findIndex(s=>s.condition&&!check(s.condition));if(earliest>=0){index=earliest;enterStep();}return;}
    if(action==='restart'){index=0;return enterStep();}
    if(action==='back'&&index>0){index--;return enterStep();}
    if(action==='next'&&active){
      const step=active.steps[index];
      if(paused||(step.condition&&!check(step.condition))||(step.target&&!target(step)))return;
      if(index<active.steps.length-1){index++;return enterStep();}
      const p=preferences.read();p.completed=[...new Set([...(p.completed||[]),active.id])];preferences.write(p);
      mode='finished';render();focusHeading();return;
    }
    if(action==='explore'||action==='choices'){mode=action==='explore'?'explore':'chooser';paused=true;render();focusHeading();}
  }
  if(enabled){root.addEventListener('click',onClick);render();}
  return {
    start,
    choices(){if(!enabled)return;mode='chooser';paused=true;render();focusHeading();},
    viewChanged(){if(enabled&&mode==='tour'&&!navigating){paused=true;render();}},
    refresh:render,
    replaced(){if(!enabled)return;preferences.clear();active=undefined;mode='chooser';paused=false;render();},
    destroy(){cleanup();root.removeEventListener('click',onClick);document.body.classList.remove('demo-choosing','demo-guided');root.hidden=true;},
  };
}
/** @type {ReturnType<typeof createDemoTour> | undefined} */
let tour;
/** @param {(view:string)=>void} navigate */
export function initDemoTour(navigate) {
  if(!DEMO_MODE)return;
  const root=document.getElementById('demo-tour');if(!root)return;
  tour?.destroy();tour=createDemoTour({root,navigate,check:checkMaintenanceCondition,target:maintenanceTarget,summary:maintenanceSummary,issue:maintenanceIssue});
}
export function demoTourViewChanged(){tour?.viewChanged();}
export function refreshDemoTour(){tour?.refresh();}
export function resetDemoTour(){if(!DEMO_MODE)return;if(tour)tour.replaced();else createTourPreferences().clear();}
export function showDemoChoices(){tour?.choices();}
