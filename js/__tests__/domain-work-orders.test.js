import { test,expect } from 'vitest';
import { countWorkOrders, filterWorkOrders, normalizeWorkOrderFilter } from '../domain/workOrders.js';
const orders=Object.freeze([
 Object.freeze({id:'a',status:'submitted',assignee:'UNASSIGNED'}),
 Object.freeze({id:'b',status:'scheduled',assignee:'Person'}),
 Object.freeze({id:'c',status:'in-progress',assignee:'Person'}),
 Object.freeze({id:'d',status:'completed',assignee:'UNASSIGNED'}),
 Object.freeze({id:'e',status:'submitted',assignee:'Unknown former owner'}),
]);
test('totals overlap correctly; completed unassigned records are not outstanding ownership gaps',()=>{
 expect(countWorkOrders(orders)).toEqual({all:5,open:4,unassigned:1,completed:1});
 expect(filterWorkOrders(orders,'unassigned').map(w=>w.id)).toEqual(['a']);
 expect(filterWorkOrders(orders,'open').map(w=>w.id)).toEqual(['a','b','c','e']);
 expect(filterWorkOrders(orders,'completed').map(w=>w.id)).toEqual(['d']);
});
test('filtering never mutates the source and preserves record order and identity',()=>{
 const copy=filterWorkOrders(orders,'all');expect(copy).not.toBe(orders);expect(copy).toEqual(orders);expect(copy[0]).toBe(orders[0]);
});
test('empty data and unknown filter values have a predictable All fallback',()=>{
 expect(countWorkOrders([])).toEqual({all:0,open:0,unassigned:0,completed:0});
 expect(filterWorkOrders([],'open')).toEqual([]);expect(normalizeWorkOrderFilter('<script>')).toBe('all');
 expect(filterWorkOrders(orders,'unknown')).toEqual(orders);
});
