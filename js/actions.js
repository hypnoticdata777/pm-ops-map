// Event delegation: the one place where clicks, double-clicks and field changes turn into function calls.
//
// History: until Phase 1C every control carried its own inline handler (onclick="cycleTaskStatus('leasing', 3)"),
// which needed each function to be a global on `window`, built JavaScript source out of data inside HTML
// attributes (the root of the stored-XSS bug fixed in Phase 0), and made the page impossible to protect with
// a Content-Security-Policy. Controls now say WHAT they do (data-action="cycle-status") and the data they
// need travels in data-* attributes; one listener per event type, installed once, looks the name up here.
//
// The attributes, by event:
//   data-action="name"          click
//   data-action-dblclick="name" double-click
//   data-action-change="name"   change (select, checkbox, file input)
//   data-action-input="name"    input (typing)
//
// A handler is called as handler(element, event): `element` is the control that carries the attribute
// (what `this` used to be in an inline handler). Handlers read their data from element.dataset or from an
// ancestor, never from the attribute value, so there is nothing to escape into JavaScript.
//
// Tradeoffs:
// - Matches the old bubbling behavior: every ancestor with an action runs, innermost first, until a handler
//   calls event.stopPropagation(). Nothing relied on the outer ones so far, but keeping the rule the same made
//   the conversion mechanical.
// - An unknown name is reported with console.error instead of failing silently, so a typo shows up in the
//   browser test that clicks the control.
// - The listeners live on `document` (not per view) because modals and the bulk bar are created outside any
//   view. Per-view tables still keep each view's actions next to its code; they are merged by registerActions.

/** @typedef {(element: HTMLElement, event: Event) => void} ActionHandler */

const EVENT_ATTRIBUTES = /** @type {const} */ ({
  click: 'data-action',
  dblclick: 'data-action-dblclick',
  change: 'data-action-change',
  input: 'data-action-input',
});

/** @type {Map<string, ActionHandler>} */
const registry = new Map();

/**
 * Adds a view's actions. A name can only be registered once: two views claiming the same name is a bug.
 * @param {Record<string, ActionHandler>} table
 */
export function registerActions(table) {
  for (const [name, handler] of Object.entries(table)) {
    if (registry.has(name)) throw new Error(`Action "${name}" is registered twice`);
    if (typeof handler !== 'function') throw new TypeError(`Action "${name}" is not a function`);
    registry.set(name, handler);
  }
}

/** @param {string} name */
export const hasAction = name => registry.has(name);

/** @param {Event} event */
function dispatchAction(event) {
  const attribute = EVENT_ATTRIBUTES[/** @type {keyof typeof EVENT_ATTRIBUTES} */ (event.type)];
  if (!attribute || !(event.target instanceof Element)) return;

  /** @type {Element | null} */
  let element = event.target;
  while (element && !event.cancelBubble) {
    const name = element.getAttribute(attribute);
    if (name) {
      const handler = registry.get(name);
      if (handler) handler(/** @type {HTMLElement} */ (element), event);
      else console.error(`No action named "${name}" (on a <${element.localName}> with ${attribute})`);
    }
    element = element.parentElement;
  }
}

let installedOn = /** @type {Document | null} */ (null);

/**
 * Starts listening. Safe to call more than once; it installs a single set of listeners per document.
 * Call it before anything adds its own document-level click listener so the order of events stays the
 * same as it was with inline handlers (the control's own handler runs before "click outside" closers).
 * @param {Document} [doc]
 */
export function installActionDelegation(doc = document) {
  if (installedOn === doc) return;
  installedOn = doc;
  for (const type of Object.keys(EVENT_ATTRIBUTES)) doc.addEventListener(type, dispatchAction);
}

/** For tests: forget every registered action and remove the listeners. */
export function resetActionsForTests() {
  registry.clear();
  if (installedOn) for (const type of Object.keys(EVENT_ATTRIBUTES)) installedOn.removeEventListener(type, dispatchAction);
  installedOn = null;
}
