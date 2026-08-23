/* boot.test.mjs — the application starts.
 *
 * The lowest bar there is, and the one nothing tested: a throw anywhere in
 * app.js's module body produces a blank page and a console line nobody reads.
 * Every check in this repository passed while that was possible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, boot } from './boot-harness.mjs';

const { dom, storage } = prepare();
const failures = [];
const originalError = console.error;
console.error = (...args) => { failures.push(args); originalError(...args); };
await boot('clean');
console.error = originalError;

test('the shell renders and nothing threw on the way', () => {
  assert.deepEqual(failures, [], 'boot logged an error');
  assert.ok(dom.body.querySelector('.topbar'), 'no top bar');
  assert.ok(dom.body.querySelector('.appMain'), 'no main region');
  assert.ok(dom.body.querySelector('.siteFooter'), 'no footer');
  const nav = dom.body.querySelectorAll('.navLink').map(a => a.getAttribute('href'));
  assert.deepEqual(nav, ['#/', '#/codex', '#/deck', '#/match', '#/rules']);
});

test('a first visit writes no match, and asking for one lands on the deck builder', () => {
  assert.equal([...storage.keys()].some(k => k.includes('activeMatch')), false, 'a match was saved without one being played');
  dom.setHash('#/match');
  dom.fire('hashchange');
  assert.equal(dom.document.body.dataset.view, 'deck', 'the router must not park on a battlefield with no match');
});

test('the balance in force is the shipped one when nothing overrides it', async () => {
  const { CANONICAL_RULES, createRuleset } = await import('../match-engine.js');
  assert.equal(createRuleset().digest, CANONICAL_RULES.digest);
  assert.deepEqual(CANONICAL_RULES.warnings, [], 'the shipped ruleset must not need repairing');
});
