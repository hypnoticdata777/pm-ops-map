import { beforeEach, describe, expect, test, vi } from 'vitest';
import config from '../../config.json';
import { deriveSetup, rosterSignature, STARTER_TASK_IDS } from '../setupModel.js';
import { readSetupPreferences, writeSetupPreferences, resetSetupPreferences } from '../setupPreferences.js';
import { SETUP_KEY } from '../storage.js';
const facts = () => ({ company:'Example Co', profile:{focus:'stability'}, properties:[{id:'p1'},{id:'p2'}],
  tenants:[{propertyId:'p1'}], vendors:[{id:'v'}], employees:[{name:'Solo'}],
  tasks:STARTER_TASK_IDS.map(id=>({id,name:id,owner:'Solo'})),
});
const state = (m,id) => m.steps.find(s=>s.id===id).status;
beforeEach(()=>{ localStorage.clear(); resetSetupPreferences(); });
describe('operation setup rules',()=>{
  test('all twelve starter IDs exist in the shipped catalog',()=>{
    const ids = config.orgData.departments.flatMap(d=>d.tasks.map(t=>t.id));
    expect(STARTER_TASK_IDS).toHaveLength(12);
    STARTER_TASK_IDS.forEach(id=>expect(ids).toContain(id));
  });
  test('a populated workspace still needs personal review, not fabricated readiness',()=>{
    const m=deriveSetup(facts());
    expect(state(m,'property')).toBe('complete');
    expect(state(m,'responsibilities')).toBe('incomplete');
    expect(state(deriveSetup(facts(),{roster:rosterSignature(facts().employees)}),'responsibilities')).toBe('complete');
    expect(state(m,'people')).toBe('incomplete');
    expect(state(m,'maintenance')).toBe('incomplete');
    expect(state(m,'review')).toBe('incomplete');
  });
  test('solo roster confirmation is invalidated by membership changes',()=>{
    const f=facts();const prefs={roster:rosterSignature(f.employees)};
    expect(state(deriveSetup(f,prefs),'people')).toBe('complete');
    f.employees.push({name:'New person'});
    expect(state(deriveSetup(f,prefs),'people')).toBe('incomplete');
  });
  test('unknown owners and missing starter tasks remain gaps',()=>{
    const f=facts(); f.tasks[0].owner='Former employee'; f.tasks.pop();
    expect(deriveSetup(f).starter.filter(t=>!t.covered)).toHaveLength(2);
  });
  test('vacancy is scoped to the selected property and still needs a vendor',()=>{
    const f=facts();const prefs={propertyId:'p2',vacantPropertyId:'p2'};
    expect(state(deriveSetup(f,prefs),'contacts')).toBe('complete');
    f.vendors=[];
    expect(state(deriveSetup(f,prefs),'contacts')).toBe('incomplete');
    expect(deriveSetup(f,{...prefs,propertyId:'p1'}).vacant).toBe(false);
  });
  test('a resident on another property cannot complete contacts',()=>{
    expect(state(deriveSetup(facts(),{propertyId:'p2'}),'contacts')).toBe('incomplete');
  });
  test('review acknowledgement does not complete deferred work',()=>{
    const f=facts();f.vendors=[];
    const m=deriveSetup(f,{reviewSaved:true,deferred:['contacts']});
    expect(state(m,'contacts')).toBe('deferred');
    expect(state(m,'review')).toBe('complete');
    expect(m.deferredCount).toBe(1);
  });
  test('removed business evidence becomes a gap while review remains historical',()=>{
    const f=facts();f.properties=[];
    expect(state(deriveSetup(f,{reviewSaved:true}),'property')).toBe('incomplete');
  });
});
describe('local walkthrough preferences',()=>{
  test('survive readback and reset without touching business storage',()=>{
    localStorage.setItem('pm-ops-company-name','My business');
    writeSetupPreferences({active:true,step:'contacts',deferred:['people']});
    expect(readSetupPreferences()).toMatchObject({active:true,step:'contacts',deferred:['people']});
    resetSetupPreferences();
    expect(readSetupPreferences().active).toBe(false);
    expect(localStorage.getItem('pm-ops-company-name')).toBe('My business');
  });
  test('corrupt and future preference formats fall back safely',()=>{
    localStorage.setItem(SETUP_KEY,'{broken');
    expect(readSetupPreferences().active).toBe(false);
    localStorage.setItem(SETUP_KEY,JSON.stringify({version:100,active:true}));
    expect(readSetupPreferences().active).toBe(false);
  });
  test('storage failure keeps choices in memory without promising persistence',()=>{
    const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('disabled');});
    const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('disabled');});
    try {
      expect(writeSetupPreferences({active:true})).toBe(false);
      expect(readSetupPreferences().active).toBe(true);
    } finally { get.mockRestore(); set.mockRestore(); }
  });
});

describe('workspace replacement boundaries',()=>{
  test('import resets personal setup; ordinary sync updates preserve it',async()=>{
    const {load}=await import('./helpers/phase1b-harness.js');
    const {_applyImportedState}=await import('../io.js');
    load('template-solo');
    const replacement={company:'Imported Co',departments:structuredClone(config.orgData.departments),team:{employees:[{name:'New Owner',hex:'#1976d2',affinities:[]}]}};
    writeSetupPreferences({active:true,reviewSaved:true,maintenanceReviewed:true,propertyId:'old-property'});
    _applyImportedState(replacement,{preserveSetup:true});
    expect(readSetupPreferences().reviewSaved).toBe(true);
    _applyImportedState(replacement);
    expect(readSetupPreferences().active).toBe(false);
    expect(readSetupPreferences().reviewSaved).toBeFalsy();
    expect(readSetupPreferences().propertyId).toBeUndefined();
  });
  test('denied storage has an honest in-memory fallback',()=>{
    const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
    const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
    expect(writeSetupPreferences({active:true,maintenanceReviewed:true})).toBe(false);
    expect(readSetupPreferences().maintenanceReviewed).toBe(true);
    get.mockRestore();set.mockRestore();
  });
});
