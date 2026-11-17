import { SETUP_KEY } from './storage.js';
/** @typedef {{version:1, active:boolean, step?:string, propertyId?:string, vacantPropertyId?:string, roster?:string, maintenanceReviewed?:boolean, reviewSaved?:boolean, deferred:string[]}} SetupPreferences */
/** @type {SetupPreferences | undefined} */
let memory;
/** Storage failure keeps the guide usable for this page; it does not promise persistence. */
export function readSetupPreferences() {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p?.version === 1) return sanitize(p);
    return blank();
  } catch { return memory || blank(); }
}
/** @returns {SetupPreferences} */
function blank() { return { version: 1, active: false, deferred: [] }; }
/** @param {any} p @returns {SetupPreferences} */
function sanitize(p) {
  const result = blank();
  result.active = p.active === true;
  result.deferred = Array.isArray(p.deferred) ? p.deferred.filter(/** @param {unknown} v */ (v) => typeof v === 'string').slice(0, 7) : [];
  for (const key of /** @type {const} */ (['step','propertyId','vacantPropertyId','roster'])) if (typeof p[key] === 'string') result[key] = p[key];
  result.maintenanceReviewed = p.maintenanceReviewed === true;
  result.reviewSaved = p.reviewSaved === true;
  return result;
}
/** @param {Partial<SetupPreferences>} patch */
export function writeSetupPreferences(patch) {
  memory = sanitize({ ...readSetupPreferences(), ...patch, version: 1 });
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(memory)); return true; } catch { return false; }
}
export function resetSetupPreferences() {
  memory = undefined;
  try { localStorage.removeItem(SETUP_KEY); } catch { memory = blank(); }
}
