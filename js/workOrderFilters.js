import { normalizeWorkOrderFilter } from './domain/workOrders.js';
/** Temporary screen state only: shared by the view and readonly tour adapter. */
/** @type {import('./domain/workOrders.js').WorkOrderFilter} */
let selected='all';
export const getWorkOrderFilter=()=>selected;
/** @param {unknown} value */
export function setWorkOrderFilter(value) { selected=normalizeWorkOrderFilter(value); }
