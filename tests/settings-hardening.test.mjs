/* settings-hardening.test.mjs — a poisoned settings key must not be able to
 * disable the game.
 *
 * `collectiveCodex.settings.v1` used to be spread into the defaults wholesale.
 * A `difficulty` outside the engine's tier list therefore reached
 * `normalizeDifficulty`, which throws, so `createMatch` threw, so `launch()` in
 * app.js caught it and showed a toast — every time, forever, because the value
 * lives in localStorage and survives reload. One malformed key permanently
 * disabled the only interactive feature in the product.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-stub.mjs';

installDom();

function fakeStorage(seed = {}) {
  const data = { ...seed };
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; },
  };
}

const KEY = 'collectiveCodex.settings.v1';

/* core.js reads localStorage once, at module evaluation, so each scenario needs
 * its own module instance. A query string gives us one. */
let instance = 0;
async function loadCore(stored) {
  globalThis.localStorage = fakeStorage(stored === undefined ? {} : { [KEY]: stored });
  return import(`../src/core.js?settings-case=${instance++}`);
}

const { DIFFICULTY_TIERS, DEFAULT_DIFFICULTY } = await import('../match-engine.js');

test('an out-of-range difficulty falls back to the engine default instead of poisoning createMatch', async () => {
  const { settings } = await loadCore(JSON.stringify({ difficulty: 'nightmare' }));
  assert.equal(settings.get('difficulty'), DEFAULT_DIFFICULTY);

  const { cards, cardById } = await import('../card-canon.js');
  const { buildStarterDeck } = await import('../deck-store.js');
  const engine = await import('../match-engine.js');
  const deck = buildStarterDeck(cards).map(id => cardById.get(id));
  // This is the exact call app.js#launch makes.
  const match = engine.createMatch({ playerDeck: deck, rivalDeck: deck, seed: 1, difficulty: settings.get('difficulty') });
  assert.equal(match.difficulty, DEFAULT_DIFFICULTY);
});

test('every legal tier still round-trips', async () => {
  for (const tier of DIFFICULTY_TIERS) {
    const { settings } = await loadCore(JSON.stringify({ difficulty: tier }));
    assert.equal(settings.get('difficulty'), tier);
  }
});

test('unknown keys are dropped and never written back', async () => {
  const { settings } = await loadCore(JSON.stringify({ motion: 'full', wallet: 'drain-me', __proto__: { polluted: true } }));
  assert.equal(settings.get('motion'), 'full');
  assert.equal(settings.get('wallet'), undefined);
  assert.equal({}.polluted, undefined, 'Object.prototype was polluted');
  settings.set('onboarded', true);
  const written = JSON.parse(globalThis.localStorage.getItem(KEY));
  assert.deepEqual(Object.keys(written).sort(), ['difficulty', 'logOpen', 'motion', 'onboarded', 'usedKeyboard']);
  assert.equal('wallet' in written, false, 'the poisoned key survived a write');
});

test('a value of the wrong type falls back rather than reaching the DOM', async () => {
  const { settings } = await loadCore(JSON.stringify({ motion: { toString: 'nope' }, onboarded: 'yes', logOpen: 1 }));
  assert.equal(settings.get('motion'), 'auto');
  assert.equal(settings.get('onboarded'), false);
  assert.equal(settings.get('logOpen'), true);
});

test('garbage, a non-object and a missing key all land on the defaults', async () => {
  for (const stored of [undefined, '', 'not json at all', '[1,2,3]', 'null', '"a string"']) {
    const { settings, sanitizeSettings } = await loadCore(stored);
    assert.deepEqual(settings.all(), sanitizeSettings(null), `stored=${JSON.stringify(stored)}`);
  }
});

test('set() refuses a value the schema rejects instead of half-applying it', async () => {
  const { settings } = await loadCore(JSON.stringify({ difficulty: 'veteran' }));
  settings.set('difficulty', 'nightmare');
  assert.equal(settings.get('difficulty'), 'veteran');
  settings.set('notAKey', 1);
  assert.equal(settings.get('notAKey'), undefined);
  settings.set('difficulty', 'sovereign');
  assert.equal(settings.get('difficulty'), 'sovereign');
});

test('the settings allow-list for difficulty is the engine tier list, not a copy', async () => {
  const { SETTINGS_SCHEMA } = await loadCore(undefined);
  for (const tier of DIFFICULTY_TIERS) assert.ok(SETTINGS_SCHEMA.difficulty.valid(tier), `${tier} rejected`);
  assert.ok(!SETTINGS_SCHEMA.difficulty.valid('nightmare'));
  assert.equal(SETTINGS_SCHEMA.difficulty.value, DEFAULT_DIFFICULTY);
});
