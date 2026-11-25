import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { createDemoTour } from '../demoTour.js';
import { createTourPreferences, sanitizeTourPreferences } from '../demoTourPreferences.js';
import { DEMO_SCENARIOS } from '../demoScenarios.js';
import { DEMO_TOUR_KEY } from '../storage.js';
const scenarios=[{id:'fixture',title:'Test example',description:'Test-only scenario',available:true,steps:[
  {id:'intro',title:'Notice it',why:'Why',notice:'A control',action:'Read',result:'Understanding',view:'workorders',target:'example'},
  {id:'assign',title:'Assign it',why:'Why',notice:'Owner',action:'Save',result:'Assigned',view:'workorders',target:'example',condition:'assigned'},
]}];
let tour,root,navigate,prefs,assigned;
const click=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text)?.click();
beforeEach(()=>{
  localStorage.clear();document.body.innerHTML='<section id="tour"></section><div id="example"></div>';
  root=document.getElementById('tour');navigate=vi.fn();assigned=false;
  prefs=createTourPreferences({enabled:true,storage:localStorage,scenarios});
  tour=createDemoTour({root,enabled:true,scenarios,preferences:prefs,navigate,check:()=>assigned});
});
afterEach(()=>{tour.destroy();vi.restoreAllMocks();});
test('production catalogue never advertises unfinished playable steps',()=>{
  expect(DEMO_SCENARIOS).toHaveLength(5);expect(DEMO_SCENARIOS.filter(s=>s.available).map(s=>s.id)).toEqual(['maintenance']);expect(DEMO_SCENARIOS.find(s=>s.id==='maintenance').steps).toHaveLength(5);
});
test('read and action steps use explicit Next and actual state; restarting keeps edits',()=>{
  click('Try this demo');expect(navigate).toHaveBeenCalledWith('workorders');
  expect(document.getElementById('example').classList.contains('demo-tour-target')).toBe(true);
  click('Next');expect(root.textContent).toContain('Step 2 of 2');
  expect(root.querySelector('[data-tour="next"]').disabled).toBe(true);
  assigned=true;tour.refresh();expect(root.textContent).toContain('already satisfied');
  click('Restart guidance (keep demo edits)');expect(assigned).toBe(true);expect(root.textContent).toContain('Step 1 of 2');
  click('Next');click('Finish');expect(root.textContent).toContain('Demo walkthrough complete');expect(prefs.read().completed).toContain('fixture');
});
test('manual navigation pauses, return restores and Explore freely removes highlights',()=>{
  tour.start('fixture');tour.viewChanged();expect(root.textContent).toContain('Paused');
  expect(document.querySelector('.demo-tour-target')).toBeNull();
  click('Return to this step');expect(document.querySelector('.demo-tour-target')).not.toBeNull();
  click('Explore freely');expect(document.querySelector('.demo-tour-target')).toBeNull();
  expect(document.body.classList.contains('demo-choosing')).toBe(false);
});
test('reload starts at chooser with explicit resume; backwards navigation does not mutate state',()=>{
  tour.start('fixture');click('Next');tour.destroy();
  tour=createDemoTour({root,enabled:true,scenarios,preferences:prefs,navigate,check:()=>assigned});
  expect(root.textContent).toContain('What would you like to try?');click('Resume Test example');
  expect(root.textContent).toContain('Step 2 of 2');click('Back');expect(root.textContent).toContain('Step 1 of 2');
});
test('a missing target blocks progress with a recovery explanation; refresh reacquires rendered targets',()=>{
  tour.start('fixture');document.getElementById('example').remove();tour.refresh();
  expect(root.textContent).toContain('unavailable');expect(root.querySelector('[data-tour="next"]').disabled).toBe(true);
  document.body.insertAdjacentHTML('beforeend','<div id="example"></div>');tour.refresh();
  expect(document.querySelector('.demo-tour-target').id).toBe('example');
});
test('workspace replacement clears checkpoints and returns to chooser without modifying real keys',()=>{
  localStorage.setItem('real-workspace','unchanged');tour.start('fixture');tour.replaced();
  expect(localStorage.getItem(DEMO_TOUR_KEY)).toBeNull();expect(localStorage.getItem('real-workspace')).toBe('unchanged');
  expect(root.textContent).toContain('What would you like to try?');
});
test('invalid versions, scenario IDs and step IDs are discarded',()=>{
  expect(sanitizeTourPreferences({version:2,selected:'fixture'},scenarios)).toEqual({version:1,checkpoints:{}});
  expect(sanitizeTourPreferences({version:1,selected:'unknown',checkpoints:{fixture:'bad',unknown:'intro'}},scenarios)).toEqual({version:1,checkpoints:{}});
});
test('storage failure keeps checkpoints in memory and reports reload limitations',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
  tour.start('fixture');expect(prefs.read().checkpoints.fixture).toBe('intro');
  expect(root.textContent).toContain('may not survive a reload');
});
test('real mode does not read storage, render or navigate even when called directly',()=>{
  const backing={getItem:vi.fn(),setItem:vi.fn(),removeItem:vi.fn()};
  const realPrefs=createTourPreferences({enabled:false,storage:backing,scenarios});
  expect(realPrefs.read()).toEqual({version:1,checkpoints:{}});realPrefs.write({version:1,selected:'fixture',checkpoints:{fixture:'intro'}});realPrefs.clear();
  expect(backing.getItem).not.toHaveBeenCalled();expect(backing.setItem).not.toHaveBeenCalled();expect(backing.removeItem).not.toHaveBeenCalled();
  tour.destroy();root.innerHTML='Original';navigate.mockClear();
  tour=createDemoTour({root,enabled:false,scenarios,preferences:realPrefs,navigate});tour.start('fixture');tour.choices();
  expect(root.textContent).toBe('Original');expect(navigate).not.toHaveBeenCalled();
});
test('scenario text is escaped instead of becoming executable markup',()=>{
  tour.destroy();tour=createDemoTour({root,enabled:true,scenarios:[{...scenarios[0],title:'<img src=x onerror=alert(1)>'}],preferences:prefs,navigate});
  expect(root.querySelector('img')).toBeNull();expect(root.textContent).toContain('<img');
});

test('a condition reversed after render cannot be completed using a stale enabled button',()=>{
  tour.start('fixture');click('Next');assigned=true;tour.refresh();assigned=false;click('Finish');
  expect(root.textContent).toContain('Step 2 of 2');
});
test('switching scenarios preserves both checkpoints and operational edits',()=>{
  tour.destroy();const all=[...scenarios,{...scenarios[0],id:'second',title:'Second example'}];
  prefs=createTourPreferences({enabled:true,storage:localStorage,scenarios:all});
  tour=createDemoTour({root,enabled:true,scenarios:all,preferences:prefs,navigate,check:()=>assigned});
  tour.start('fixture');click('Next');assigned=true;tour.start('second');
  expect(prefs.read().checkpoints).toEqual({fixture:'assign',second:'intro'});expect(assigned).toBe(true);
  tour.start('fixture',true);expect(root.textContent).toContain('Step 2 of 2');
});

test('malformed stored JSON is ignored without claiming browser storage failed',()=>{
  localStorage.setItem(DEMO_TOUR_KEY,'{broken');expect(prefs.read()).toEqual({version:1,checkpoints:{}});
  expect(prefs.volatile).toBe(false);
});
