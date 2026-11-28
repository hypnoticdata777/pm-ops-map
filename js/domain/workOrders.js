/** @typedef {'all'|'open'|'unassigned'|'completed'} WorkOrderFilter */
/** @type {ReadonlyArray<{id:WorkOrderFilter,label:string}>} */
export const WORK_ORDER_FILTERS = Object.freeze([
  {id:'all',label:'All'}, {id:'open',label:'Open'},
  {id:'unassigned',label:'Unassigned'}, {id:'completed',label:'Completed'},
]);
/** @param {unknown} value @returns {WorkOrderFilter} */
export function normalizeWorkOrderFilter(value) {
  return WORK_ORDER_FILTERS.find(filter=>filter.id===value)?.id || 'all';
}
/** @param {{status:string,assignee:string}} order @param {unknown} filter */
export function matchesWorkOrderFilter(order, filter) {
  switch(normalizeWorkOrderFilter(filter)) {
    case 'open': return order.status!=='completed';
    case 'unassigned': return order.status!=='completed' && order.assignee==='UNASSIGNED';
    case 'completed': return order.status==='completed';
    default: return true;
  }
}
/** @template {{status:string,assignee:string}} T @param {readonly T[]} orders @param {unknown} filter @returns {T[]} */
export function filterWorkOrders(orders,filter) {
  return orders.filter(order=>matchesWorkOrderFilter(order,filter));
}
/** Counts overlap: unassigned is a subset of open. @param {readonly {status:string,assignee:string}[]} orders */
export function countWorkOrders(orders) {
  const counts={all:orders.length,open:0,unassigned:0,completed:0};
  for(const order of orders) {
    if(order.status==='completed')counts.completed++;
    else {counts.open++;if(order.assignee==='UNASSIGNED')counts.unassigned++;}
  }
  return counts;
}
