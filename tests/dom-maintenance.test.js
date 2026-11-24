import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractSelectors, inspectSelectors, browserProbe } from '../scripts/dom-audit.mjs';

test('selector inventory records literals and never evaluates dynamic expressions', () => {
  const source = 'document.querySelector("[data-testid=submit]"); root.querySelectorAll(`button`); root.closest(variable); root.matches(`${dangerous()}`);';
  const entries = extractSelectors(source, 'fixture.js');
  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map(entry => entry.dynamic), [false, false, true, true]);
  assert.equal(entries[0].selector, '[data-testid=submit]');
  assert.equal(entries[0].line, 1);
});

test('DOM changes expose a broken attribute selector without clicking or changing fields', () => {
  const dom = new JSDOM('<button data-testid="submit">Submit</button><input value="PRIVATE VALUE">');
  let clicks = 0;
  dom.window.document.querySelector('button').onclick = () => clicks++;
  const entries = extractSelectors('document.querySelector("[data-testid=submit]")', 'fixture.js');
  assert.equal(inspectSelectors(dom.window.document, entries)[0].status, 'matched');
  dom.window.document.querySelector('button').setAttribute('data-testid', 'new-submit');
  assert.equal(inspectSelectors(dom.window.document, entries)[0].status, 'unmatched');
  assert.equal(clicks, 0);
  assert.equal(dom.window.document.querySelector('input').value, 'PRIVATE VALUE');
  assert.equal(JSON.stringify(inspectSelectors(dom.window.document, entries)).includes('PRIVATE VALUE'), false);
  dom.window.close();
});

test('invalid selectors and dynamic calls are reported without aborting the diagnostic', () => {
  const dom = new JSDOM('<button></button>');
  const entries = extractSelectors('root.querySelector("["); root.querySelector(name); root.matches("button");', 'fixture.js');
  assert.deepEqual(inspectSelectors(dom.window.document, entries).map(row => row.status),
    ['invalid-or-unsupported', 'dynamic-not-evaluated', 'matched']);
  dom.window.close();
});

test('browser probe reads selector counts, never submits, and omits page data', () => {
  const dom = new JSDOM('<form><button>Submit</button><input value="PRIVATE"></form>', { runScripts: 'outside-only' });
  let clicks = 0;
  dom.window.document.querySelector('button').onclick = () => clicks++;
  dom.window.console.table = () => {};
  const report = dom.window.eval(browserProbe(extractSelectors('document.querySelector("button")', 'fixture.js')));
  assert.equal(report[0].count, 1);
  assert.equal(clicks, 0);
  assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  dom.window.close();
});
