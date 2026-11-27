import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { demoBannerClearance, updateDemoClearance, closeDemoDetails, revealDemoElement, initDemoLayout, disposeDemoLayout } from '../demoLayout.js';
let height, callback, disconnect;
beforeEach(()=>{
 document.body.innerHTML='<div id="demo-banner"><details id="demo-details"><summary>Demo details</summary><button id="demo-choices">Choices</button></details></div><section id="demo-tour"><h2 tabindex="-1">Step</h2></section><div aria-modal="true"><input id="field"></div>';
 height=52;vi.spyOn(document.getElementById('demo-banner'),'getBoundingClientRect').mockImplementation(()=>({height}));
 disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(cb){callback=cb;}observe(){}disconnect(){disconnect();}});
});
afterEach(()=>{disposeDemoLayout();vi.restoreAllMocks();vi.unstubAllGlobals();});
test('measures current banner height including expanded and hidden states',()=>{
 expect(demoBannerClearance()).toBe(64);height=230;expect(updateDemoClearance()).toBe(242);
 expect(document.body.style.getPropertyValue('--demo-banner-clearance')).toBe('242px');
 document.getElementById('demo-banner').hidden=true;expect(demoBannerClearance()).toBe(12);
});
test('starts collapsed, updates for toggle/resize, and does not touch storage',()=>{
 const write=vi.spyOn(Storage.prototype,'setItem');const details=document.getElementById('demo-details');details.open=true;
 initDemoLayout();expect(details.open).toBe(false);details.open=true;height=200;details.dispatchEvent(new Event('toggle'));
 expect(document.body.style.getPropertyValue('--demo-banner-clearance')).toBe('212px');
 height=180;window.dispatchEvent(new Event('resize'));expect(demoBannerClearance()).toBe(192);
 expect(write).not.toHaveBeenCalled();
});
test('reinitialization disconnects observers and capture closes choices before its handler runs',()=>{
 initDemoLayout();initDemoLayout();expect(disconnect).toHaveBeenCalledTimes(1);
 const details=document.getElementById('demo-details');details.open=true;
 let wasOpen;document.getElementById('demo-choices').addEventListener('click',()=>{wasOpen=details.open;});
 document.getElementById('demo-choices').click();expect(wasOpen).toBe(false);
});
test('explicit reveal uses live clearance and keeps modal fields out of page scrolling',()=>{
 const root=document.getElementById('demo-tour');root.scrollIntoView=vi.fn();height=210;revealDemoElement(root);
 expect(root.scrollIntoView).toHaveBeenCalledWith({block:'start',behavior:'instant'});
 expect(root.style.scrollMarginTop).toContain('--demo-banner-clearance');
 const field=document.getElementById('field');field.scrollIntoView=vi.fn();revealDemoElement(field);expect(field.scrollIntoView).not.toHaveBeenCalled();
 closeDemoDetails();expect(document.getElementById('demo-details').open).toBe(false);
});
test('resize corrects a covered heading without moving focus from a form or summary',()=>{
 initDemoLayout();const heading=document.querySelector('h2');heading.scrollIntoView=vi.fn();heading.focus();
 vi.spyOn(heading,'getBoundingClientRect').mockReturnValue({top:30,bottom:60});height=180;callback();
 expect(heading.scrollIntoView).toHaveBeenCalled();heading.scrollIntoView.mockClear();
 document.querySelector('summary').focus();callback();expect(heading.scrollIntoView).not.toHaveBeenCalled();
 document.getElementById('field').focus();callback();expect(document.activeElement.id).toBe('field');
});
