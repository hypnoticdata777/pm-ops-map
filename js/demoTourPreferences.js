import { DEMO_MODE } from './demoMode.js';
import { DEMO_TOUR_KEY } from './storage.js';
import { DEMO_SCENARIOS } from './demoScenarios.js';
/** @typedef {{version:1, selected?:string, checkpoints:Record<string,string>, completed?:string[]}} TourPreferences */
/** @returns {TourPreferences} */
const blank = () => ({version:1,checkpoints:{}});
/** @param {unknown} value @param {import('./demoScenarios.js').DemoScenario[]} scenarios @returns {TourPreferences} */
export function sanitizeTourPreferences(value, scenarios = DEMO_SCENARIOS) {
  const out = blank();
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return out;
  const raw = /** @type {{selected?:unknown,checkpoints?:unknown,completed?:unknown}} */ (value);
  for (const scenario of scenarios.filter(s=>s.available && s.steps.length)) {
    if (Array.isArray(raw.completed) && raw.completed.includes(scenario.id)) (out.completed ||= []).push(scenario.id);
    if (raw.selected === scenario.id) out.selected = scenario.id;
    if (raw.checkpoints && typeof raw.checkpoints === 'object' && Object.hasOwn(raw.checkpoints,scenario.id)) {
      const step = /** @type {Record<string,unknown>} */ (raw.checkpoints)[scenario.id];
      if (scenario.steps.some(s=>s.id===step)) out.checkpoints[scenario.id] = /** @type {string} */ (step);
    }
  }
  return out;
}
/** Dependencies are injected for isolated lifecycle tests. No real-mode read or write is allowed.
 * @param {{enabled?:boolean, storage?:Storage, scenarios?:import('./demoScenarios.js').DemoScenario[]}} [options]
 */
export function createTourPreferences({enabled=DEMO_MODE,storage,scenarios=DEMO_SCENARIOS}={}) {
  let memory = blank(), failed = false;
  return {
    read() {
      if (!enabled) return blank();
      if (failed) return memory;
      let raw;
      try { raw = (storage || window.localStorage).getItem(DEMO_TOUR_KEY); }
      catch { failed = true; return memory; }
      try { memory = sanitizeTourPreferences(JSON.parse(raw || 'null'),scenarios); }
      catch { memory = blank(); }
      return memory;
    },
    /** @param {TourPreferences} value */
    write(value) {
      if (!enabled) return false;
      memory = sanitizeTourPreferences(value,scenarios);
      try { (storage || window.localStorage).setItem(DEMO_TOUR_KEY,JSON.stringify(memory)); failed=false; return true; }
      catch { failed=true; return false; }
    },
    clear() {
      memory=blank();
      if (!enabled) return;
      try { (storage || window.localStorage).removeItem(DEMO_TOUR_KEY); failed=false; } catch { failed=true; }
    },
    get volatile() { return failed; },
  };
}
