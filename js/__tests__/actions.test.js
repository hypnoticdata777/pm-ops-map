import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerActions, installActionDelegation, resetActionsForTests, hasAction } from '../actions.js';

let errors;
beforeEach(() => {
  document.body.innerHTML = '';
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { resetActionsForTests(); errors.mockRestore(); });

const mount = html => { document.body.innerHTML = html; return document.body; };

describe('registering actions', () => {
  test('a name can only be claimed once', () => {
    registerActions({ ping: () => {} });
    expect(() => registerActions({ ping: () => {} })).toThrow(/registered twice/);
  });
  test('only functions are accepted', () => {
    expect(() => registerActions({ ping: 'nope' })).toThrow(/not a function/);
  });
  test('hasAction reports what is registered', () => {
    registerActions({ ping: () => {} });
    expect(hasAction('ping')).toBe(true);
    expect(hasAction('pong')).toBe(false);
  });
});

describe('delegation', () => {
  test('a click runs the action with the element that carries it and the event', () => {
    const seen = vi.fn();
    registerActions({ ping: seen });
    installActionDelegation();
    const body = mount('<button data-action="ping"><span id="inner">go</span></button>');
    body.querySelector('#inner').click(); // clicking inside the control still reaches it
    expect(seen).toHaveBeenCalledTimes(1);
    const [element, event] = seen.mock.calls[0];
    expect(element).toBe(body.querySelector('button'));
    expect(event.type).toBe('click');
  });

  test('data comes from data-* attributes on the element', () => {
    let got;
    registerActions({ ping: el => { got = { ...el.dataset }; } });
    installActionDelegation();
    mount(`<button data-action="ping" data-dept-id="leasing" data-key='He said "hi"'>x</button>`).querySelector('button').click();
    expect(got).toEqual({ action: 'ping', deptId: 'leasing', key: 'He said "hi"' });
  });

  test('each event type reads its own attribute', () => {
    const calls = [];
    registerActions({ a: () => calls.push('click'), b: () => calls.push('dblclick'), c: () => calls.push('change'), d: () => calls.push('input') });
    installActionDelegation();
    const body = mount('<div data-action="a" data-action-dblclick="b"><select data-action-change="c"></select><input data-action-input="d"></div>');
    const div = body.querySelector('div');
    div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    div.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    body.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
    body.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
    expect(calls).toEqual(['click', 'dblclick', 'change', 'input']);
  });

  test('a click does not trigger the double-click, change or input attributes', () => {
    const seen = vi.fn();
    registerActions({ x: seen });
    installActionDelegation();
    mount('<button data-action-dblclick="x" data-action-change="x" data-action-input="x">x</button>').querySelector('button').click();
    expect(seen).not.toHaveBeenCalled();
  });

  test('ancestors run too, innermost first, like inline handlers bubbling', () => {
    const order = [];
    registerActions({ inner: () => order.push('inner'), outer: () => order.push('outer') });
    installActionDelegation();
    mount('<div data-action="outer"><span data-action="inner" id="s">x</span></div>').querySelector('#s').click();
    expect(order).toEqual(['inner', 'outer']);
  });

  test('stopPropagation in a handler keeps the ancestors from running', () => {
    const order = [];
    registerActions({ inner: (el, e) => { order.push('inner'); e.stopPropagation(); }, outer: () => order.push('outer') });
    installActionDelegation();
    mount('<div data-action="outer"><span data-action="inner" id="s">x</span></div>').querySelector('#s').click();
    expect(order).toEqual(['inner']);
  });

  test('stopImmediatePropagation also keeps later document listeners (such as a click-outside closer) from running', () => {
    const closer = vi.fn();
    registerActions({ pick: (el, e) => e.stopImmediatePropagation() });
    installActionDelegation();
    document.addEventListener('click', closer); // added after, as pickers do
    mount('<input type="checkbox" data-action="pick">').querySelector('input').click();
    expect(closer).not.toHaveBeenCalled();
    document.removeEventListener('click', closer);
  });

  test('the control runs before a click-outside closer added later', () => {
    const order = [];
    registerActions({ open: () => order.push('action') });
    installActionDelegation();
    document.addEventListener('click', () => order.push('closer'), { once: true });
    mount('<button data-action="open">x</button>').querySelector('button').click();
    expect(order).toEqual(['action', 'closer']);
  });

  test('an unknown name is reported, not swallowed', () => {
    installActionDelegation();
    mount('<button data-action="typo">x</button>').querySelector('button').click();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('No action named "typo"'));
  });

  test('elements without an action are ignored', () => {
    installActionDelegation();
    mount('<button>x</button>').querySelector('button').click();
    expect(errors).not.toHaveBeenCalled();
  });

  test('installing twice does not run an action twice', () => {
    const seen = vi.fn();
    registerActions({ ping: seen });
    installActionDelegation();
    installActionDelegation();
    mount('<button data-action="ping">x</button>').querySelector('button').click();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  test('content added after install works without re-binding', () => {
    const seen = vi.fn();
    registerActions({ ping: seen });
    installActionDelegation();
    mount('<div id="host"></div>');
    document.getElementById('host').innerHTML = '<button data-action="ping">late</button>';
    document.querySelector('button').click();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  test('markup from untrusted data cannot run code: a hostile value is only ever data', () => {
    let got;
    registerActions({ ping: el => { got = el.dataset.name; } });
    installActionDelegation();
    const hostile = `x" onclick="window.__pwned=1`;
    const host = mount('<div id="h"></div>');
    const btn = document.createElement('button');
    btn.dataset.action = 'ping';
    btn.dataset.name = hostile;
    host.appendChild(btn);
    btn.click();
    expect(got).toBe(hostile);
    expect(window.__pwned).toBeUndefined();
  });
});
